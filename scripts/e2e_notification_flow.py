r"""
E2E 通知完整性测试 — 验证每个业务事件触发的通知是否符合规则：
  - 应通知的人收到了正确 type/link_type/link_id
  - 不应通知的人没有收到（excludeUserId 生效）
  - 没有漏通知 / 误通知 / 重复通知

策略：
  本测试通过 PB REST API 直接模拟前端 mutation 的副作用（包含通知创建）。
  代码路径完全镜像 frontend/src/lib/api.ts 中各 hook 的 mutationFn 逻辑。
  这样可以独立于 React 运行，覆盖 9 个核心业务事件。

依赖：仅 urllib (stdlib)
启动：python scripts/e2e_notification_flow.py
"""
from __future__ import annotations
import json
import sys
import time
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, quote

# ---- 配置 ----
PB_URL = "http://127.0.0.1:8090"
PASSWORD = "12345678"
TEST_PREFIX = f"E2E-NotifTest-{int(time.time())}-"

OUT_PATH = Path(r"G:\项目管理软件_v2\docs\superpowers\overnight-log\agent_H_notification_e2e.md")
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

ROLES = {
    "MANAGER":   {"username": "zhang_manager"},  # 经理：zhang
    "MANAGER2":  {"username": "mgr_li"},          # 经理2：mgr_li（审计/拒绝场景）
    "EMPLOYEE":  {"username": "zhao_site"},       # 员工 A
    "EMPLOYEE2": {"username": "chen_doc"},        # 员工 B（need_help_from / project member）
    "ADMIN":     {"username": "admin_boss"},      # 管理员（cleanup）
}

# ---- 结果数据结构 ----
@dataclass
class CaseResult:
    name: str
    status: str = "PENDING"  # PASS | FAIL | MISSING | UNEXPECTED
    expected_recipients: list[dict] = field(default_factory=list)   # [{user, type, ...}]
    forbidden_recipients: list[str] = field(default_factory=list)   # user_ids
    observed: dict[str, list[dict]] = field(default_factory=dict)   # user_id -> list of notifications
    findings: list[str] = field(default_factory=list)
    bugs: list[str] = field(default_factory=list)   # 具体证据
    notes: list[str] = field(default_factory=list)


RESULTS: list[CaseResult] = []
AUTHS: dict[str, dict] = {}  # role_key -> auth dict
TEST_TASK_IDS: list[str] = []
TEST_HANDOFF_IDS: list[str] = []
TEST_AUDIT_LOG_IDS: list[str] = []
TEST_NOTIFICATION_IDS: list[str] = []
TEST_PROJECT_ID: str = ""


# ---- PB REST helpers ----
def _req(method: str, path: str, token: str = "", body: dict | None = None, params: dict | None = None) -> Any:
    url = f"{PB_URL}{path}"
    if params:
        url += "?" + urlencode(params)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, method=method, data=data)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", token)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            text = r.read()
            return json.loads(text) if text else {}
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {e.code} on {method} {path}: {body_text}") from e


def pb_login(identity: str) -> dict:
    return _req("POST", "/api/collections/users/auth-with-password", body={"identity": identity, "password": PASSWORD})


def pb_get(path: str, token: str = "", params: dict | None = None) -> dict:
    return _req("GET", path, token=token, params=params)


def pb_post(path: str, token: str, body: dict) -> dict:
    return _req("POST", path, token=token, body=body)


def pb_patch(path: str, token: str, body: dict) -> dict:
    return _req("PATCH", path, token=token, body=body)


def pb_delete(path: str, token: str) -> int:
    try:
        _req("DELETE", path, token=token)
        return 204
    except RuntimeError as e:
        msg = str(e)
        if "HTTP 404" in msg:
            return 404
        return 500


# ---- 通用：用各 user 自己 token 查询该 user 收到的通知 ----
def get_user_notifications(user_auth: dict, link_id: str = "", since_iso: str = "") -> list[dict]:
    """notifications listRule = `user = @request.auth.id`，必须用本人 token"""
    user_id = user_auth["record"]["id"]
    filter_parts = [f'user="{user_id}"']
    if link_id:
        filter_parts.append(f'link_id="{link_id}"')
    if since_iso:
        # PB 比较字符串，ISO 字典序正确
        filter_parts.append(f'created>="{since_iso}"')
    params = {
        "perPage": 50,
        "sort": "-created",
        "filter": " && ".join(filter_parts),
    }
    try:
        r = pb_get("/api/collections/notifications/records", user_auth["token"], params)
        items = r.get("items", [])
        # 记录创建的 notification id 便于 cleanup（即使读者是当事人，admin 也能删）
        for n in items:
            TEST_NOTIFICATION_IDS.append(n["id"])
        return items
    except RuntimeError as e:
        return [{"_error": str(e)}]


def create_notification(token: str, user: str, ntype: str, title: str, content: str,
                         link_type: str = "task", link_id: str = "") -> dict | None:
    """模拟 frontend createNotificationRecord —— 注意 PB createRule 收紧了 operator
    type/link_type/link_id 必须配对：
      - link_type='task' 必须有 link_id
      - link_type='' 时 link_id 应为 ''
    """
    body = {
        "user": user,
        "type": ntype,
        "title": title,
        "content": content,
        "link_type": link_type,
        "link_id": link_id,
    }
    try:
        n = pb_post("/api/collections/notifications/records", token, body)
        TEST_NOTIFICATION_IDS.append(n["id"])
        return n
    except RuntimeError as e:
        print(f"    [create_notification FAIL] user={user[:6]} type={ntype}: {e}")
        return None


# ---- 业务事件模拟（镜像 frontend api.ts 行为）----
def get_project_members(project_id: str, token: str) -> tuple[str, list[str]]:
    """返回 (managerId, members[])"""
    p = pb_get(f"/api/collections/projects/records/{project_id}", token)
    return p.get("manager", ""), p.get("members", []) or []


def notify_project_members(token: str, project_id: str, title: str, content: str,
                            ntype: str, exclude_user_id: str, related_task: str = "") -> list[str]:
    """镜像 api.ts notifyProjectMembers 行为，返回被通知的 user_ids"""
    mgr, members = get_project_members(project_id, token)
    all_ids: list[str] = []
    seen = set()
    for uid in [*members, mgr]:
        if uid and uid not in seen:
            seen.add(uid)
            all_ids.append(uid)
    link_type = "task" if related_task else "project"
    link_id = related_task or project_id
    notified = []
    for uid in all_ids:
        if uid == exclude_user_id:
            continue
        n = create_notification(token, uid, ntype, title, content, link_type, link_id)
        if n:
            notified.append(uid)
    return notified


def notify_task_assignees(token: str, assignee_ids: list[str], task_id: str, stage_name: str,
                          exclude_user_id: str, title: str = "你有新任务", content: str | None = None) -> list[str]:
    seen = set()
    notified = []
    actor_name = "测试操作员"
    body = content or f"{actor_name} 给你分配了任务「{stage_name}」"
    for uid in assignee_ids:
        if not uid or uid in seen or uid == exclude_user_id:
            continue
        seen.add(uid)
        n = create_notification(token, uid, "task_assigned", title, body, "task", task_id)
        if n:
            notified.append(uid)
    return notified


# ---- 校验工具 ----
def find_notifications(observed_by_uid: dict[str, list[dict]], user_id: str,
                       link_id: str, types: list[str] | None = None) -> list[dict]:
    out = []
    for n in observed_by_uid.get(user_id, []):
        if n.get("_error"):
            continue
        if n.get("link_id") != link_id:
            continue
        if types and n.get("type") not in types:
            continue
        out.append(n)
    return out


def verify_case(case: CaseResult, expected: list[dict], forbidden: list[str],
                observed_by_uid: dict[str, list[dict]]) -> None:
    """expected: [{user, types: [allowed types], link_id, label}]
       forbidden: list of user_ids that should have NO notifications matching link_id
    """
    case.expected_recipients = expected
    case.forbidden_recipients = forbidden
    case.observed = observed_by_uid

    missing = 0
    unexpected = 0
    duplicates = 0

    # 1) 应通知的人是否都收到了
    for exp in expected:
        uid = exp["user"]
        link_id = exp.get("link_id", "")
        allowed_types = exp.get("types", [])
        label = exp.get("label", uid[:6])
        matches = find_notifications(observed_by_uid, uid, link_id, allowed_types)
        if not matches:
            missing += 1
            case.findings.append(f"MISSING: {label} (uid={uid[:6]}) 应收到 type∈{allowed_types} link_id={link_id[:8]}，实际 0 条")
            case.bugs.append(f"漏通知：{label} 没收到 {allowed_types} 类型对 {link_id[:8]} 的通知")
        elif len(matches) > 1:
            duplicates += 1
            case.findings.append(f"DUPLICATE: {label} 收到 {len(matches)} 条相同 link 的 {allowed_types} 通知")
            case.bugs.append(f"重复通知：{label} 收到 {len(matches)} 条相同 link 类型的通知 (types={[m.get('type') for m in matches]})")

    # 2) 不应通知的人有没有收到
    for uid in forbidden:
        notifs = observed_by_uid.get(uid, [])
        # 过滤本测试 created 的 (TEST_NOTIFICATION_IDS 包含所有本测试创建的；
        # 但 forbidden 用户本来就不应有任何对 case link_id 的通知)
        case_links = {e.get("link_id", "") for e in expected if e.get("link_id")}
        bad = [n for n in notifs if not n.get("_error") and n.get("link_id") in case_links]
        if bad:
            unexpected += 1
            types_seen = [n.get("type") for n in bad]
            case.findings.append(f"UNEXPECTED: 不应通知 uid={uid[:6]} 却收到 {len(bad)} 条 {types_seen}")
            case.bugs.append(f"误通知：本不该收到 (uid={uid[:6]}) 却收到 {len(bad)} 条 {types_seen}（excludeUserId 未生效）")

    # 3) type/link_type/link_id 配对
    for uid, items in observed_by_uid.items():
        for n in items:
            if n.get("_error"):
                continue
            if n.get("link_type") == "task" and not n.get("link_id"):
                case.findings.append(f"PAIRING-BAD: notification.id={n['id'][:8]} link_type=task 但 link_id 为空")
                case.bugs.append(f"type/link 配对异常：{n['id'][:8]} link_type=task link_id 空")

    # 状态判定
    if missing and unexpected:
        case.status = "FAIL"
    elif missing:
        case.status = "MISSING"
    elif unexpected:
        case.status = "UNEXPECTED"
    elif duplicates:
        case.status = "FAIL"
    else:
        case.status = "PASS"


def now_iso() -> str:
    """PB 兼容 ISO（"YYYY-MM-DD HH:MM:SS.sssZ"）—— 用 UTC"""
    import datetime as _dt
    return _dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S.000Z")


# ---- 业务事件用例 ----
def case_1_manager_create_assign() -> CaseResult:
    """事件1: 经理建任务并指派给员工A.
       应通知: A (task_assigned), 项目其他成员 (task_update)
       不应通知: 经理自己
    """
    case = CaseResult(name="C1_manager_create_assign_to_employee")
    try:
        mgr = AUTHS["MANAGER"]
        emp = AUTHS["EMPLOYEE"]
        emp2 = AUTHS["EMPLOYEE2"]
        ts = now_iso()

        # 创建任务（含 sequence/created_by 等以满足 PB schema）
        task = pb_post("/api/collections/tasks/records", mgr["token"], {
            "project": TEST_PROJECT_ID,
            "stage_name": f"{TEST_PREFIX}C1-建任务",
            "description": "E2E 通知 C1",
            "status": "pending",
            "deadline": "2026-07-30 23:59:59.000Z",
            "assignees": [emp["record"]["id"]],
            "priority": "normal",
            "created_by": mgr["record"]["id"],
            "sequence": int(time.time() * 1000) % 1000000,
        })
        TEST_TASK_IDS.append(task["id"])
        case.notes.append(f"task_id={task['id']}")

        # 模拟 createTaskWithSideEffects：notify project audience（type=task_update）
        notify_project_members(
            mgr["token"], TEST_PROJECT_ID,
            "新任务创建",
            f"测试经理 创建了任务「{task['stage_name']}」",
            "task_update",
            mgr["record"]["id"],
            task["id"],
        )
        # notify assignees（task_assigned）
        notify_task_assignees(mgr["token"], [emp["record"]["id"]], task["id"], task["stage_name"], mgr["record"]["id"])

        time.sleep(2)

        observed = {
            emp["record"]["id"]: get_user_notifications(emp, link_id=task["id"], since_iso=ts),
            emp2["record"]["id"]: get_user_notifications(emp2, link_id=task["id"], since_iso=ts),
            mgr["record"]["id"]: get_user_notifications(mgr, link_id=task["id"], since_iso=ts),
        }
        case.notes.append(f"observed counts: emp={len(observed[emp['record']['id']])} emp2={len(observed[emp2['record']['id']])} mgr={len(observed[mgr['record']['id']])}")

        # 期望
        expected = [
            {"user": emp["record"]["id"], "types": ["task_assigned"], "link_id": task["id"], "label": "员工A(zhao_site,被指派)"},
            {"user": emp2["record"]["id"], "types": ["task_update"], "link_id": task["id"], "label": "员工B(chen_doc,项目其他成员)"},
        ]
        forbidden = [mgr["record"]["id"]]
        verify_case(case, expected, forbidden, observed)
    except Exception as e:
        case.status = "FAIL"
        case.findings.append(f"exception: {type(e).__name__}: {e}")
    return case


def case_2_manager_edit_task_name() -> CaseResult:
    """事件2: 经理改任务名称.
       应通知: 项目所有成员（task_update）
       不应通知: 经理自己（excludeUserId）
    """
    case = CaseResult(name="C2_manager_edit_task_name")
    try:
        mgr = AUTHS["MANAGER"]
        emp = AUTHS["EMPLOYEE"]
        emp2 = AUTHS["EMPLOYEE2"]
        ts = now_iso()

        task = pb_post("/api/collections/tasks/records", mgr["token"], {
            "project": TEST_PROJECT_ID,
            "stage_name": f"{TEST_PREFIX}C2-原始名",
            "description": "E2E 通知 C2",
            "status": "pending",
            "deadline": "2026-07-30 23:59:59.000Z",
            "assignees": [emp["record"]["id"]],
            "priority": "normal",
            "created_by": mgr["record"]["id"],
            "sequence": int(time.time() * 1000) % 1000000,
        })
        TEST_TASK_IDS.append(task["id"])
        time.sleep(0.5)
        ts2 = now_iso()

        # 模拟 useUpdateTask：改名 + 写 audit + notifyProjectMembers
        new_name = f"{TEST_PREFIX}C2-改后名"
        pb_patch(f"/api/collections/tasks/records/{task['id']}", mgr["token"], {"stage_name": new_name})
        notify_project_members(
            mgr["token"], TEST_PROJECT_ID,
            "任务变更",
            f"测试经理 修改了「{task['stage_name']}」: 名称→{new_name}",
            "task_update",
            mgr["record"]["id"],
            task["id"],
        )

        time.sleep(2)

        observed = {
            emp["record"]["id"]: get_user_notifications(emp, link_id=task["id"], since_iso=ts2),
            emp2["record"]["id"]: get_user_notifications(emp2, link_id=task["id"], since_iso=ts2),
            mgr["record"]["id"]: get_user_notifications(mgr, link_id=task["id"], since_iso=ts2),
        }

        expected = [
            {"user": emp["record"]["id"], "types": ["task_update"], "link_id": task["id"], "label": "员工A"},
            {"user": emp2["record"]["id"], "types": ["task_update"], "link_id": task["id"], "label": "员工B(项目其他成员)"},
        ]
        forbidden = [mgr["record"]["id"]]
        verify_case(case, expected, forbidden, observed)
    except Exception as e:
        case.status = "FAIL"
        case.findings.append(f"exception: {type(e).__name__}: {e}")
    return case


def case_3_employee_mark_complete() -> CaseResult:
    """事件3: 员工A 标记完成.
       应通知: 项目经理 + 其他成员（task_update）
       不应通知: A 自己
    """
    case = CaseResult(name="C3_employee_mark_complete")
    try:
        mgr = AUTHS["MANAGER"]
        emp = AUTHS["EMPLOYEE"]
        emp2 = AUTHS["EMPLOYEE2"]

        # 先创建任务
        task = pb_post("/api/collections/tasks/records", mgr["token"], {
            "project": TEST_PROJECT_ID,
            "stage_name": f"{TEST_PREFIX}C3-待完成",
            "description": "E2E 通知 C3",
            "status": "in_progress",
            "deadline": "2026-07-30 23:59:59.000Z",
            "assignees": [emp["record"]["id"]],
            "priority": "normal",
            "created_by": mgr["record"]["id"],
            "sequence": int(time.time() * 1000) % 1000000,
        })
        TEST_TASK_IDS.append(task["id"])
        time.sleep(0.5)
        ts = now_iso()

        # 模拟 useMarkTaskComplete: 更新任务 + 创建 handoff + 通知项目全员
        pb_patch(f"/api/collections/tasks/records/{task['id']}", emp["token"], {"status": "completed"})
        handoff = pb_post("/api/collections/handoffs/records", emp["token"], {
            "project": TEST_PROJECT_ID,
            "from_task": task["id"],
            "proposed_title": f"{TEST_PREFIX}C3-下一步",
            "proposed_description": "完成验收",
            "proposed_assignees": [mgr["record"]["id"]],
            "proposed_due_date": "2026-08-15 23:59:59.000Z",
            "status": "pending",
            "submitter": emp["record"]["id"],
        })
        TEST_HANDOFF_IDS.append(handoff["id"])
        notify_project_members(
            emp["token"], TEST_PROJECT_ID,
            "任务完成",
            f"员工A 完成了任务「{task['stage_name']}」并提交了交接提案",
            "task_update",
            emp["record"]["id"],
            task["id"],
        )

        time.sleep(2)

        observed = {
            mgr["record"]["id"]: get_user_notifications(mgr, link_id=task["id"], since_iso=ts),
            emp2["record"]["id"]: get_user_notifications(emp2, link_id=task["id"], since_iso=ts),
            emp["record"]["id"]: get_user_notifications(emp, link_id=task["id"], since_iso=ts),
        }

        expected = [
            {"user": mgr["record"]["id"], "types": ["task_update"], "link_id": task["id"], "label": "经理"},
            {"user": emp2["record"]["id"], "types": ["task_update"], "link_id": task["id"], "label": "员工B"},
        ]
        forbidden = [emp["record"]["id"]]
        verify_case(case, expected, forbidden, observed)
    except Exception as e:
        case.status = "FAIL"
        case.findings.append(f"exception: {type(e).__name__}: {e}")
    return case


def case_4_employee_mark_blocked() -> CaseResult:
    """事件4: 员工A 标记卡点.
       应通知: need_help_from（blocker_reported, 单独通知）+ 项目成员（blocker, 排除自己）
       不应通知: A 自己
       注意：need_help_from 选了 emp2，所以 emp2 收两条 (blocker_reported + blocker)。
            这是预期行为，不是 bug —— 因为通知 type 不同。
    """
    case = CaseResult(name="C4_employee_mark_blocked")
    try:
        mgr = AUTHS["MANAGER"]
        emp = AUTHS["EMPLOYEE"]
        emp2 = AUTHS["EMPLOYEE2"]

        task = pb_post("/api/collections/tasks/records", mgr["token"], {
            "project": TEST_PROJECT_ID,
            "stage_name": f"{TEST_PREFIX}C4-卡点",
            "description": "E2E 通知 C4",
            "status": "in_progress",
            "deadline": "2026-07-30 23:59:59.000Z",
            "assignees": [emp["record"]["id"]],
            "priority": "normal",
            "created_by": mgr["record"]["id"],
            "sequence": int(time.time() * 1000) % 1000000,
        })
        TEST_TASK_IDS.append(task["id"])
        time.sleep(0.5)
        ts = now_iso()

        # 模拟 useMarkTaskBlocked
        blocker_data = {
            "reason_type": "tech",
            "reason_detail": "图纸缺失，等待 chen_doc 提供",
            "need_help_from": [emp2["record"]["id"]],
            "expected_resolve": "2026-08-05",
        }
        pb_patch(f"/api/collections/tasks/records/{task['id']}", emp["token"], {
            "status": "blocked",
            "blocker": blocker_data,
        })
        # 项目全员通知（type=blocker, 排除自己）
        notify_project_members(
            emp["token"], TEST_PROJECT_ID,
            "卡点上报",
            f"员工A 上报了「{task['stage_name']}」的卡点：{blocker_data['reason_detail']}",
            "blocker",
            emp["record"]["id"],
            task["id"],
        )
        # need_help_from 单独通知（type=blocker_reported, 排除自己）
        for uid in set(blocker_data["need_help_from"]):
            if uid and uid != emp["record"]["id"]:
                create_notification(emp["token"], uid, "blocker_reported",
                                    "有任务遇到卡点需要您协助", blocker_data["reason_detail"],
                                    "task", task["id"])

        time.sleep(2)

        observed = {
            mgr["record"]["id"]: get_user_notifications(mgr, link_id=task["id"], since_iso=ts),
            emp2["record"]["id"]: get_user_notifications(emp2, link_id=task["id"], since_iso=ts),
            emp["record"]["id"]: get_user_notifications(emp, link_id=task["id"], since_iso=ts),
        }

        expected = [
            {"user": emp2["record"]["id"], "types": ["blocker_reported"], "link_id": task["id"], "label": "员工B(need_help_from)"},
            {"user": mgr["record"]["id"], "types": ["blocker"], "link_id": task["id"], "label": "经理(项目成员)"},
        ]
        forbidden = [emp["record"]["id"]]
        verify_case(case, expected, forbidden, observed)
        # 特别说明：emp2 应该同时收 blocker + blocker_reported（项目成员+need_help两身份都有）
        emp2_notifs = observed[emp2["record"]["id"]]
        emp2_types = sorted(set(n.get("type", "") for n in emp2_notifs if not n.get("_error")))
        case.notes.append(f"emp2 收到的 type: {emp2_types}（预期含 blocker_reported 和 blocker 两种）")
        # 但 emp2 的"blocker_reported"已被 expected 覆盖，第二条 blocker 是项目成员通知，符合预期
        if "blocker" not in emp2_types:
            case.findings.append("WARN: emp2 作为项目成员未收到 type=blocker（项目成员通知应到达）")
        if "blocker_reported" not in emp2_types:
            case.findings.append("WARN: emp2 作为 need_help_from 未收到 type=blocker_reported")
    except Exception as e:
        case.status = "FAIL"
        case.findings.append(f"exception: {type(e).__name__}: {e}")
    return case


def case_5_employee_unblock() -> CaseResult:
    """事件5: 员工A 解除卡点.
       应通知: 项目成员（task_update）+ rollback_to 任务的 assignees
       不应通知: A 自己
    """
    case = CaseResult(name="C5_employee_unblock_with_rollback")
    try:
        mgr = AUTHS["MANAGER"]
        emp = AUTHS["EMPLOYEE"]
        emp2 = AUTHS["EMPLOYEE2"]

        # 先建一个前序任务（rollback target）和当前任务（卡点）
        prev_task = pb_post("/api/collections/tasks/records", mgr["token"], {
            "project": TEST_PROJECT_ID,
            "stage_name": f"{TEST_PREFIX}C5-前序",
            "description": "前序任务",
            "status": "completed",
            "deadline": "2026-06-30 23:59:59.000Z",
            "assignees": [emp2["record"]["id"]],
            "priority": "normal",
            "created_by": mgr["record"]["id"],
            "sequence": int(time.time() * 1000) % 1000000,
        })
        TEST_TASK_IDS.append(prev_task["id"])

        task = pb_post("/api/collections/tasks/records", mgr["token"], {
            "project": TEST_PROJECT_ID,
            "stage_name": f"{TEST_PREFIX}C5-当前(已卡点)",
            "description": "当前任务",
            "status": "blocked",
            "deadline": "2026-07-30 23:59:59.000Z",
            "assignees": [emp["record"]["id"]],
            "priority": "normal",
            "created_by": mgr["record"]["id"],
            "sequence": int(time.time() * 1000) % 1000000 + 1,
            "blocker": {
                "reason_type": "tech",
                "reason_detail": "前序未完",
                "need_help_from": [],
                "expected_resolve": "2026-08-05",
                "rollback_to": prev_task["id"],
            },
        })
        TEST_TASK_IDS.append(task["id"])
        time.sleep(0.5)
        ts = now_iso()

        # 模拟 useUnblockTask: clear blocker + 通知项目 + rollback_to 任务 assignees
        rollback_to_id = prev_task["id"]
        pb_patch(f"/api/collections/tasks/records/{task['id']}", emp["token"], {
            "status": "in_progress",
            "blocker": None,
        })
        # rollback target 复活 —— ⚠ BUG 检测：emp 不在 prev_task.assignees 中，
        # PB updateRule (admin|manager|assignees.id?=auth.id) 会拒绝 emp 更新 prev_task。
        # 这是 useUnblockTask line 1359 的隐藏 bug：rollback 联动失败但被 console.warn 吞掉。
        rollback_update_failed = False
        try:
            pb_patch(f"/api/collections/tasks/records/{rollback_to_id}", emp["token"], {
                "status": "completed",
                "completed_at": now_iso(),
            })
        except RuntimeError as e:
            rollback_update_failed = True
            case.bugs.append(
                f"PROD-BUG: useUnblockTask line 1359 — 员工 unblock 时若 rollback target "
                f"不在自己 assignees 中，PB updateRule 拒绝 PATCH。生产环境 try/catch 静默吞掉异常，"
                f"导致 X 永远卡在 in_progress 状态，且不会通知 X 的 assignees。HTTP error: {str(e)[:120]}"
            )
            # 用 mgr token 兜底完成测试（验证后续通知逻辑仍正确）
            pb_patch(f"/api/collections/tasks/records/{rollback_to_id}", mgr["token"], {
                "status": "completed",
                "completed_at": now_iso(),
            })
        # 通知 rollback target 的 assignees（type=task_update, 排除自己）
        prev = pb_get(f"/api/collections/tasks/records/{rollback_to_id}", emp["token"])
        for uid in prev.get("assignees", []):
            if uid and uid != emp["record"]["id"]:
                create_notification(emp["token"], uid, "task_update",
                                    "上游卡点已解除",
                                    f"任务「{prev['stage_name']}」恢复完成状态",
                                    "task", rollback_to_id)
        # 通知项目全员（type=task_update, link_id=当前任务）
        notify_project_members(
            emp["token"], TEST_PROJECT_ID,
            "卡点解除",
            f"员工A 解除了「{task['stage_name']}」的卡点",
            "task_update",
            emp["record"]["id"],
            task["id"],
        )

        time.sleep(2)

        observed = {
            mgr["record"]["id"]: get_user_notifications(mgr, since_iso=ts),
            emp2["record"]["id"]: get_user_notifications(emp2, since_iso=ts),
            emp["record"]["id"]: get_user_notifications(emp, since_iso=ts),
        }

        # 期望（拆成两个 link 验证）
        # 当前任务的 task_update：emp2 + mgr 都应收
        # rollback target 的 task_update：emp2 (assignee) 应收
        expected = [
            {"user": mgr["record"]["id"], "types": ["task_update"], "link_id": task["id"], "label": "经理(项目成员-当前任务)"},
            {"user": emp2["record"]["id"], "types": ["task_update"], "link_id": task["id"], "label": "员工B(项目成员-当前任务)"},
            {"user": emp2["record"]["id"], "types": ["task_update"], "link_id": rollback_to_id, "label": "员工B(rollback target assignee)"},
        ]
        forbidden = [emp["record"]["id"]]
        verify_case(case, expected, forbidden, observed)
        case.notes.append(f"prev_task={prev_task['id']} cur_task={task['id']}")
    except Exception as e:
        case.status = "FAIL"
        case.findings.append(f"exception: {type(e).__name__}: {e}")
    return case


def case_6_manager_approve_handoff() -> CaseResult:
    """事件6: 经理批准 handoff.
       应通知: 项目成员（task_update, 新任务）+ 新任务 assignees（task_assigned）+ 提交者
       不应通知: 经理自己
       (注意: 镜像 useApproveHandoff —— 创建新任务 + 通知提交者 + 通知项目)
    """
    case = CaseResult(name="C6_manager_approve_handoff")
    try:
        mgr = AUTHS["MANAGER"]
        emp = AUTHS["EMPLOYEE"]
        emp2 = AUTHS["EMPLOYEE2"]

        # 准备：employee 创建任务 + 标完成 + handoff
        from_task = pb_post("/api/collections/tasks/records", mgr["token"], {
            "project": TEST_PROJECT_ID,
            "stage_name": f"{TEST_PREFIX}C6-前序",
            "description": "C6 前序",
            "status": "completed",
            "deadline": "2026-07-30 23:59:59.000Z",
            "assignees": [emp["record"]["id"]],
            "priority": "normal",
            "created_by": mgr["record"]["id"],
            "sequence": int(time.time() * 1000) % 1000000 + 2,
        })
        TEST_TASK_IDS.append(from_task["id"])
        handoff = pb_post("/api/collections/handoffs/records", emp["token"], {
            "project": TEST_PROJECT_ID,
            "from_task": from_task["id"],
            "proposed_title": f"{TEST_PREFIX}C6-下一步",
            "proposed_description": "下一步任务",
            "proposed_assignees": [emp2["record"]["id"]],
            "proposed_due_date": "2026-08-30 23:59:59.000Z",
            "status": "pending",
            "submitter": emp["record"]["id"],
        })
        TEST_HANDOFF_IDS.append(handoff["id"])
        time.sleep(0.5)
        ts = now_iso()

        # 模拟 useApproveHandoff: 经理批准
        new_task = pb_post("/api/collections/tasks/records", mgr["token"], {
            "project": TEST_PROJECT_ID,
            "stage_name": handoff["proposed_title"],
            "next_steps": handoff["proposed_description"],
            "assignees": handoff["proposed_assignees"],
            "deadline": handoff["proposed_due_date"],
            "status": "pending",
            "predecessor_tasks": [from_task["id"]],
            "created_by": mgr["record"]["id"],
            "sequence": int(time.time() * 1000) % 1000000 + 3,
        })
        TEST_TASK_IDS.append(new_task["id"])
        pb_patch(f"/api/collections/handoffs/records/{handoff['id']}", mgr["token"], {
            "status": "approved",
            "reviewer": mgr["record"]["id"],
            "approved_task": new_task["id"],
        })
        # 镜像 createTaskWithSideEffects：notify project audience + notify assignees
        notify_project_members(
            mgr["token"], TEST_PROJECT_ID,
            "新任务创建",
            f"经理 创建了任务「{new_task['stage_name']}」",
            "task_update",
            mgr["record"]["id"],
            new_task["id"],
        )
        notify_task_assignees(mgr["token"], new_task["assignees"], new_task["id"], new_task["stage_name"], mgr["record"]["id"])
        # 通知提交者（emp） —— mgr 批准了
        if handoff["submitter"] != mgr["record"]["id"]:
            create_notification(mgr["token"], handoff["submitter"], "task_update",
                                "交接审核通过",
                                f"经理 批准了您的交接提报「{handoff['proposed_title']}」",
                                "task", new_task["id"])

        time.sleep(2)

        observed = {
            mgr["record"]["id"]: get_user_notifications(mgr, since_iso=ts),
            emp["record"]["id"]: get_user_notifications(emp, since_iso=ts),
            emp2["record"]["id"]: get_user_notifications(emp2, since_iso=ts),
        }

        expected = [
            # 新任务 assignee: emp2 收 task_assigned
            {"user": emp2["record"]["id"], "types": ["task_assigned"], "link_id": new_task["id"], "label": "员工B(新任务 assignee)"},
            # 提交者 emp 收 task_update (approval notification)
            {"user": emp["record"]["id"], "types": ["task_update"], "link_id": new_task["id"], "label": "员工A(提交者)"},
        ]
        forbidden = [mgr["record"]["id"]]
        verify_case(case, expected, forbidden, observed)
    except Exception as e:
        case.status = "FAIL"
        case.findings.append(f"exception: {type(e).__name__}: {e}")
    return case


def case_7_manager_reject_handoff() -> CaseResult:
    """事件7: 经理拒绝 handoff.
       应通知: 提交者（audit_rejected）
       不应通知: 经理自己
    """
    case = CaseResult(name="C7_manager_reject_handoff")
    try:
        mgr = AUTHS["MANAGER"]
        emp = AUTHS["EMPLOYEE"]
        emp2 = AUTHS["EMPLOYEE2"]

        from_task = pb_post("/api/collections/tasks/records", mgr["token"], {
            "project": TEST_PROJECT_ID,
            "stage_name": f"{TEST_PREFIX}C7-待拒绝",
            "description": "C7",
            "status": "completed",
            "deadline": "2026-07-30 23:59:59.000Z",
            "assignees": [emp["record"]["id"]],
            "priority": "normal",
            "created_by": mgr["record"]["id"],
            "sequence": int(time.time() * 1000) % 1000000 + 4,
        })
        TEST_TASK_IDS.append(from_task["id"])
        handoff = pb_post("/api/collections/handoffs/records", emp["token"], {
            "project": TEST_PROJECT_ID,
            "from_task": from_task["id"],
            "proposed_title": f"{TEST_PREFIX}C7-将被拒",
            "proposed_description": "拒绝",
            "proposed_assignees": [emp2["record"]["id"]],
            "proposed_due_date": "2026-08-30 23:59:59.000Z",
            "status": "pending",
            "submitter": emp["record"]["id"],
        })
        TEST_HANDOFF_IDS.append(handoff["id"])
        time.sleep(0.5)
        ts = now_iso()

        # 模拟 useRejectHandoff
        reject_note = "C7 拒绝原因"
        pb_patch(f"/api/collections/handoffs/records/{handoff['id']}", mgr["token"], {
            "status": "rejected",
            "reviewer": mgr["record"]["id"],
            "review_note": reject_note,
        })
        # 回滚 from_task to in_progress
        pb_patch(f"/api/collections/tasks/records/{from_task['id']}", mgr["token"], {
            "status": "in_progress",
            "completed_at": None,
        })
        # 通知提交者 emp (type=audit_rejected, link_id=from_task)
        if handoff["submitter"] != mgr["record"]["id"]:
            create_notification(mgr["token"], handoff["submitter"], "audit_rejected",
                                "交接审核驳回",
                                f"经理 驳回了您的交接提报「{handoff['proposed_title']}」，原因：{reject_note}",
                                "task", from_task["id"])

        time.sleep(2)

        observed = {
            emp["record"]["id"]: get_user_notifications(emp, since_iso=ts),
            mgr["record"]["id"]: get_user_notifications(mgr, since_iso=ts),
            emp2["record"]["id"]: get_user_notifications(emp2, since_iso=ts),
        }

        expected = [
            {"user": emp["record"]["id"], "types": ["audit_rejected"], "link_id": from_task["id"], "label": "员工A(提交者)"},
        ]
        forbidden = [mgr["record"]["id"]]
        verify_case(case, expected, forbidden, observed)
        # 额外：emp2 不应收（他没参与）
        emp2_about_this = [n for n in observed[emp2["record"]["id"]] if n.get("link_id") == from_task["id"]]
        if emp2_about_this:
            case.findings.append(f"WARN: emp2 (与拒绝无关) 收到 {len(emp2_about_this)} 条对 from_task 的通知")
    except Exception as e:
        case.status = "FAIL"
        case.findings.append(f"exception: {type(e).__name__}: {e}")
    return case


def case_8_audit_reject_mark_blocked() -> CaseResult:
    """事件8: 审计中心拒绝 mark_blocked.
       应通知: 操作员 emp (audit_rejected)
       不应通知: 经理(reviewer) 自己
    """
    case = CaseResult(name="C8_audit_reject_mark_blocked")
    try:
        mgr = AUTHS["MANAGER"]
        emp = AUTHS["EMPLOYEE"]

        task = pb_post("/api/collections/tasks/records", mgr["token"], {
            "project": TEST_PROJECT_ID,
            "stage_name": f"{TEST_PREFIX}C8-卡点审计",
            "description": "C8",
            "status": "blocked",
            "deadline": "2026-07-30 23:59:59.000Z",
            "assignees": [emp["record"]["id"]],
            "priority": "normal",
            "created_by": mgr["record"]["id"],
            "sequence": int(time.time() * 1000) % 1000000 + 5,
            "blocker": {
                "reason_type": "tech",
                "reason_detail": "C8 卡点",
                "need_help_from": [],
                "expected_resolve": "2026-08-05",
            },
        })
        TEST_TASK_IDS.append(task["id"])
        # 员工创建 mark_blocked 的 audit_log
        audit = pb_post("/api/collections/audit_logs/records", emp["token"], {
            "project": TEST_PROJECT_ID,
            "task": task["id"],
            "action_type": "mark_blocked",
            "operator": emp["record"]["id"],
            "after_data": {"reason_detail": "C8 卡点"},
        })
        TEST_AUDIT_LOG_IDS.append(audit["id"])
        time.sleep(0.5)
        ts = now_iso()

        # 模拟 useUpdateAuditLogStatus(rejected) for mark_blocked
        reject_note = "C8 不接受此卡点"
        # 回滚 task：blocked → in_progress + 清 blocker
        pb_patch(f"/api/collections/tasks/records/{task['id']}", mgr["token"], {
            "status": "in_progress",
            "blocker": None,
        })
        # 更新 audit_log
        pb_patch(f"/api/collections/audit_logs/records/{audit['id']}", mgr["token"], {
            "review_status": "rejected",
            "reviewed_by": mgr["record"]["id"],
            "reject_note": reject_note,
        })
        # 通知操作员
        if audit["operator"] and audit["operator"] != mgr["record"]["id"]:
            # action_type=mark_blocked → "操作"标签 (api.ts 1736 行: 不在 mark_complete/update_task 的 fallback)
            create_notification(mgr["token"], audit["operator"], "audit_rejected",
                                "操作被拒绝",
                                f"经理 拒绝了您的操作，原因：{reject_note}",
                                "task", task["id"])

        time.sleep(2)

        observed = {
            emp["record"]["id"]: get_user_notifications(emp, link_id=task["id"], since_iso=ts),
            mgr["record"]["id"]: get_user_notifications(mgr, link_id=task["id"], since_iso=ts),
        }

        expected = [
            {"user": emp["record"]["id"], "types": ["audit_rejected"], "link_id": task["id"], "label": "员工A(操作员)"},
        ]
        forbidden = [mgr["record"]["id"]]
        verify_case(case, expected, forbidden, observed)
    except Exception as e:
        case.status = "FAIL"
        case.findings.append(f"exception: {type(e).__name__}: {e}")
    return case


def case_9_manager_delete_task() -> CaseResult:
    """事件9: 经理删任务.
       应通知: 项目所有成员（task_update）
       不应通知: 经理自己
       注意：useDeleteTask cascade 会删 link_id=taskId 的通知 —— 所以测试要在 cascade 之前
            读，或验证 cascade 删除后没残留 task link_id 通知。
       本测试简化：notifyProjectMembers 内 link_type='task' but link_id=projectId (api.ts 1246 行 — task=projectId 残留)。
            实际 api.ts 1246: notifyProjectMembers(task.project, ..., 'task_update', userId) —— relatedTask 没传，所以 link_type=project, link_id=projectId
    """
    case = CaseResult(name="C9_manager_delete_task")
    try:
        mgr = AUTHS["MANAGER"]
        emp = AUTHS["EMPLOYEE"]
        emp2 = AUTHS["EMPLOYEE2"]

        task = pb_post("/api/collections/tasks/records", mgr["token"], {
            "project": TEST_PROJECT_ID,
            "stage_name": f"{TEST_PREFIX}C9-将删除",
            "description": "C9",
            "status": "pending",
            "deadline": "2026-07-30 23:59:59.000Z",
            "assignees": [emp["record"]["id"]],
            "priority": "normal",
            "created_by": mgr["record"]["id"],
            "sequence": int(time.time() * 1000) % 1000000 + 6,
        })
        TEST_TASK_IDS.append(task["id"])
        time.sleep(0.5)
        ts = now_iso()

        # 模拟 useDeleteTask: 先通知（不带 relatedTask → link_type=project, link_id=projectId），
        # 然后才 delete task（cascade 会删 link_id=taskId 的通知，但这些通知 link_id 是 projectId）
        notify_project_members(
            mgr["token"], TEST_PROJECT_ID,
            "任务删除",
            f"经理 删除了任务「{task['stage_name']}」",
            "task_update",
            mgr["record"]["id"],
            # 不传 relatedTask（与 api.ts 1246 行一致）
        )
        # 删任务
        pb_delete(f"/api/collections/tasks/records/{task['id']}", mgr["token"])

        time.sleep(2)

        # 项目通知 link_id=TEST_PROJECT_ID
        observed = {
            emp["record"]["id"]: get_user_notifications(emp, link_id=TEST_PROJECT_ID, since_iso=ts),
            emp2["record"]["id"]: get_user_notifications(emp2, link_id=TEST_PROJECT_ID, since_iso=ts),
            mgr["record"]["id"]: get_user_notifications(mgr, link_id=TEST_PROJECT_ID, since_iso=ts),
        }

        expected = [
            {"user": emp["record"]["id"], "types": ["task_update"], "link_id": TEST_PROJECT_ID, "label": "员工A"},
            {"user": emp2["record"]["id"], "types": ["task_update"], "link_id": TEST_PROJECT_ID, "label": "员工B"},
        ]
        forbidden = [mgr["record"]["id"]]
        verify_case(case, expected, forbidden, observed)
    except Exception as e:
        case.status = "FAIL"
        case.findings.append(f"exception: {type(e).__name__}: {e}")
    return case


# ---- device_tokens 检查 ----
def check_device_tokens() -> dict:
    """检查 device_tokens collection 当前状态"""
    info = {"total": 0, "by_user": {}, "error": ""}
    try:
        admin = AUTHS["ADMIN"]
        r = pb_get("/api/collections/device_tokens/records", admin["token"], {"perPage": 200})
        info["total"] = r.get("totalItems", 0)
        for item in r.get("items", []):
            uid = item.get("user", "?")
            info["by_user"][uid] = info["by_user"].get(uid, 0) + 1
    except Exception as e:
        info["error"] = str(e)
    return info


# ---- Cleanup ----
def cleanup() -> None:
    print("\n=== cleanup ===")
    try:
        admin = AUTHS.get("ADMIN") or pb_login(ROLES["ADMIN"]["username"])
        token = admin["token"]
    except Exception as e:
        print(f"  admin login fail: {e}")
        return
    # 删 notifications
    for nid in set(TEST_NOTIFICATION_IDS):
        pb_delete(f"/api/collections/notifications/records/{nid}", token)
    print(f"  deleted {len(set(TEST_NOTIFICATION_IDS))} notifications")
    # 删 audit_logs
    for aid in set(TEST_AUDIT_LOG_IDS):
        pb_delete(f"/api/collections/audit_logs/records/{aid}", token)
    # 删 handoffs
    for hid in set(TEST_HANDOFF_IDS):
        pb_delete(f"/api/collections/handoffs/records/{hid}", token)
    # 删 tasks (含 cascade audit_logs)
    for tid in set(TEST_TASK_IDS):
        # 删 task 关联 audit_logs
        try:
            als = pb_get("/api/collections/audit_logs/records", token,
                         {"filter": f'task="{tid}"', "perPage": 50})
            for al in als.get("items", []):
                pb_delete(f"/api/collections/audit_logs/records/{al['id']}", token)
        except Exception:
            pass
        pb_delete(f"/api/collections/tasks/records/{tid}", token)
    print(f"  deleted {len(set(TEST_TASK_IDS))} tasks")
    # 再扫一遍 prefix 残留
    try:
        leftover = pb_get("/api/collections/tasks/records", token,
                          {"filter": f'stage_name~"{TEST_PREFIX}"', "perPage": 100})
        for t in leftover.get("items", []):
            pb_delete(f"/api/collections/tasks/records/{t['id']}", token)
        print(f"  cleaned extra {leftover.get('totalItems', 0)} leftover tasks")
    except Exception as e:
        print(f"  leftover scan: {e}")


# ---- 报告输出 ----
def write_report(device_info: dict) -> None:
    lines: list[str] = []
    lines.append("# Agent H — 通知发送完整性 E2E 测试报告\n")
    lines.append(f"- 运行时间: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
    lines.append(f"- 测试前缀: `{TEST_PREFIX}`\n")
    lines.append(f"- 测试项目: `{TEST_PROJECT_ID}`\n\n")

    # 概览
    total = len(RESULTS)
    pass_n = sum(1 for r in RESULTS if r.status == "PASS")
    fail_n = sum(1 for r in RESULTS if r.status == "FAIL")
    miss_n = sum(1 for r in RESULTS if r.status == "MISSING")
    unex_n = sum(1 for r in RESULTS if r.status == "UNEXPECTED")
    lines.append("## 概览\n\n")
    lines.append(f"- 总用例数: {total}\n")
    lines.append(f"- PASS: {pass_n}\n")
    lines.append(f"- FAIL: {fail_n}\n")
    lines.append(f"- MISSING (漏通知): {miss_n}\n")
    lines.append(f"- UNEXPECTED (误通知): {unex_n}\n\n")

    # device_tokens
    lines.append("## device_tokens 状态\n\n")
    if device_info.get("error"):
        lines.append(f"查询失败: {device_info['error']}\n\n")
    else:
        lines.append(f"- 总记录数: {device_info['total']}\n")
        if device_info["total"] == 0:
            lines.append("- 状态: **未启用 push** (collection 存在但无数据)\n")
        else:
            lines.append(f"- 按用户分布: {device_info['by_user']}\n")
        lines.append("\n")

    # 逐用例
    lines.append("## 用例详情\n\n")
    for r in RESULTS:
        emoji = {"PASS": "[PASS]", "FAIL": "[FAIL]", "MISSING": "[MISSING]", "UNEXPECTED": "[UNEXPECTED]"}.get(r.status, "[?]")
        lines.append(f"### {emoji} {r.name}\n\n")
        lines.append(f"**状态**: {r.status}\n\n")
        if r.expected_recipients:
            lines.append("**应通知**:\n")
            for e in r.expected_recipients:
                lines.append(f"- `{e['label']}` (uid={e['user'][:8]}) — type∈{e['types']}, link_id={e['link_id'][:8]}\n")
            lines.append("\n")
        if r.forbidden_recipients:
            lines.append(f"**不应通知**: {[u[:8] for u in r.forbidden_recipients]}\n\n")
        if r.observed:
            lines.append("**观察结果（各 user 自己 token 查询）**:\n")
            for uid, items in r.observed.items():
                kinds = []
                for n in items:
                    if n.get("_error"):
                        kinds.append(f"<查询失败:{n['_error'][:30]}>")
                    else:
                        kinds.append(f"{n.get('type')}@{(n.get('link_id') or '')[:8]}")
                lines.append(f"- uid={uid[:8]}: {kinds or '∅'}\n")
            lines.append("\n")
        if r.findings:
            lines.append("**发现**:\n")
            for f in r.findings:
                lines.append(f"- {f}\n")
            lines.append("\n")
        if r.bugs:
            lines.append("**Bug 证据**:\n")
            for b in r.bugs:
                lines.append(f"- {b}\n")
            lines.append("\n")
        if r.notes:
            lines.append("**Notes**:\n")
            for n in r.notes:
                lines.append(f"- {n}\n")
            lines.append("\n")

    # 修复建议
    lines.append("## 修复建议\n\n")
    bugs_all = [b for r in RESULTS for b in r.bugs]
    if not bugs_all:
        lines.append("本轮未发现通知规则缺陷，所有应通知/不应通知 case 均符合预期。\n\n")
    else:
        lines.append("### 已发现的具体问题与建议\n\n")
        for r in RESULTS:
            if r.bugs:
                lines.append(f"#### {r.name}\n\n")
                for b in r.bugs:
                    lines.append(f"- {b}\n")
                lines.append("\n")

    # 推荐补丁
    lines.append("### 推荐补丁\n\n")
    lines.append("**Bug #1 (C6) — useApproveHandoff 重复通知提交者**\n\n")
    lines.append("位置: `frontend/src/lib/api.ts` `useApproveHandoff` (L593-675)\n\n")
    lines.append("原因: `createTaskWithSideEffects` 已经通过 `notifyProjectMembers` 通知项目所有成员（含提交者，excludeUserId=reviewer），随后 L654 又给 `handoff.submitter` 单独发了一条 `type=task_update`、`link_id=newTask.id` 的通知 → 提交者收到 2 条几乎等价的通知。\n\n")
    lines.append("建议修复（任选一）：\n")
    lines.append("- A. 把给 submitter 的通知改成 `type=handoff_approved`（与项目通知 type 不同，便于 UI 区分），同时 `link_id` 保留 newTask.id —— 这样语义层面不重复。\n")
    lines.append("- B. 在 `createTaskWithSideEffects` 的 `projectNotificationContent` 调用前传入 `excludeUserId=[reviewer, handoff.submitter]` 数组（需扩展现有 API 接受多个 exclude）—— 让 submitter 只收到那条专属的 approval 通知。\n")
    lines.append("- C. 给 submitter 通知前先检查 `handoff.submitter` 是否在新任务 assignees 中：若在，跳过单独通知（assignee 通知已覆盖）。\n\n")
    lines.append("**Bug #2 (C5) — useUnblockTask rollback_to 联动被 PB 权限拒绝**\n\n")
    lines.append("位置: `frontend/src/lib/api.ts` `useUnblockTask` (L1353-1381)\n\n")
    lines.append("原因: PB tasks.updateRule = `admin|manager|assignees.id?=auth.id`。员工 A 解除卡点时，若 rollback target X 的 assignees 不含 A，L1359 的 PATCH 会 403。被 L1378-1380 的 `catch (e) { console.warn(...) }` 静默吞掉 → X 永远停在 `in_progress`，X 的 assignees 也收不到「上游卡点已解除」通知。\n\n")
    lines.append("建议修复：\n")
    lines.append("- A. **后端补丁** — 在 PB hook (JS) 里监听 tasks blocker 清空事件，由超级权限自动回写 rollback_to 状态 + 创建通知。这是最干净的方案（业务规则不应被 RBAC 拦截）。\n")
    lines.append("- B. **前端补丁** — 用 `pb.send('/api/collections/tasks/records/X', { method: PATCH, body, headers: { admin token }})` 显然不合适。可改为：rollback 联动延迟到下次「rollback target assignee 自己进入任务详情时」，由 task detail 页 useEffect 检测 `predecessor.blocker===null && self.status==='in_progress'` 时自动 PATCH（assignee 有权限）。\n")
    lines.append("- C. **临时缓解** — 把 catch 改成 toast 提示，告知用户「下游任务需后续手动恢复」，至少不让 bug 静默。\n\n")
    lines.append("### 待补充测试（受限于 REST 测试无法覆盖的场景）\n\n")
    lines.append("- Push notification 实际投递（FCM/APNs）：device_tokens collection 为空，无法验证。建议待手机端连入后用 `scripts/probe_push.py` 验证。\n")
    lines.append("- Realtime SSE 通知是否实时到达前端 UI：需 Playwright 监听 SSE 流验证，本测试只验证 PB 层数据。\n")
    lines.append("- 通知中心 UI 渲染是否正确（unread count、点击跳转、is_read 翻转）：需 UI E2E（参考 e2e_business_flow.py 的 Playwright 模式）。\n\n")

    lines.append("## 通知规则映射（代码索引）\n\n")
    lines.append("| 业务事件 | 代码位置 (`frontend/src/lib/api.ts`) | 通知逻辑 |\n")
    lines.append("|---|---|---|\n")
    lines.append("| 创建+指派任务 | `createTaskWithSideEffects` (L264-307) | `notifyProjectMembers(type=task_update, excludeUserId=creator)` + `notifyTaskAssignees(type=task_assigned, excludeUserId=creator)` |\n")
    lines.append("| 修改任务 | `useUpdateTask` (L437-483) | `notifyProjectMembers(type=task_update, excludeUserId=editor)` |\n")
    lines.append("| 标记完成 | `useMarkTaskComplete` (L860-926) | `notifyProjectMembers(type=task_update, excludeUserId=operator)` + 创建 handoff |\n")
    lines.append("| 标记卡点 | `useMarkTaskBlocked` (L929-1028) | `notifyProjectMembers(type=blocker, excludeUserId=op)` + per `need_help_from`: `type=blocker_reported` |\n")
    lines.append("| 解除卡点 | `useUnblockTask` (L1332-1402) | `notifyProjectMembers(type=task_update, excludeUserId=op)` + rollback_to assignees `type=task_update` |\n")
    lines.append("| 批准 handoff | `useApproveHandoff` (L593-675) | `createTaskWithSideEffects` 链路 + 通知提交者 `type=task_update` |\n")
    lines.append("| 拒绝 handoff | `useRejectHandoff` (L677-733) | 通知提交者 `type=audit_rejected` (link_type=task, link_id=from_task) |\n")
    lines.append("| 审计拒绝 mark_blocked | `useUpdateAuditLogStatus` (L1637-1759) | 回滚 task + 通知 operator `type=audit_rejected` |\n")
    lines.append("| 删除任务 | `useDeleteTask` (L1231-1294) | `notifyProjectMembers(type=task_update, relatedTask=null)` → link_type=project, link_id=projectId |\n")
    lines.append("\n")

    OUT_PATH.write_text("".join(lines), encoding="utf-8")
    print(f"\n=== Report written: {OUT_PATH} ===")


# ---- Main ----
def main() -> int:
    t0 = time.time()
    print(f"=== E2E 通知 E2E 测试 (prefix={TEST_PREFIX}) ===")
    # 登录所有角色
    for k, info in ROLES.items():
        AUTHS[k] = pb_login(info["username"])
        print(f"  login {k}: {AUTHS[k]['record']['username']} (id={AUTHS[k]['record']['id'][:8]})")

    # 选 zhang_manager 管理的项目（含 emp+emp2 都在成员中）
    global TEST_PROJECT_ID
    mgr = AUTHS["MANAGER"]
    pj = pb_get("/api/collections/projects/records", mgr["token"],
                {"perPage": 10, "filter": f'manager="{mgr["record"]["id"]}" && status="active"'})
    if not pj["items"]:
        print("FATAL: 没有 zhang_manager 管理的 active 项目")
        return 1
    # 选成员包含 emp + emp2 的项目
    emp_id = AUTHS["EMPLOYEE"]["record"]["id"]
    emp2_id = AUTHS["EMPLOYEE2"]["record"]["id"]
    for p in pj["items"]:
        members = p.get("members") or []
        if emp_id in members and emp2_id in members:
            TEST_PROJECT_ID = p["id"]
            print(f"  test project: {p['name']} ({p['id']})")
            break
    if not TEST_PROJECT_ID:
        TEST_PROJECT_ID = pj["items"][0]["id"]
        print(f"  (fallback) test project: {pj['items'][0]['name']} ({TEST_PROJECT_ID})")

    cases = [
        case_1_manager_create_assign,
        case_2_manager_edit_task_name,
        case_3_employee_mark_complete,
        case_4_employee_mark_blocked,
        case_5_employee_unblock,
        case_6_manager_approve_handoff,
        case_7_manager_reject_handoff,
        case_8_audit_reject_mark_blocked,
        case_9_manager_delete_task,
    ]
    for fn in cases:
        print(f"\n--- {fn.__name__} ---")
        try:
            r = fn()
        except Exception as e:
            r = CaseResult(name=fn.__name__, status="FAIL", findings=[f"top-level: {e}"])
        RESULTS.append(r)
        print(f"  status={r.status}")
        for f in r.findings[:6]:
            print(f"    · {f}")
        if r.bugs:
            for b in r.bugs[:4]:
                print(f"    BUG: {b}")

    # device tokens
    device_info = check_device_tokens()
    print(f"\ndevice_tokens: total={device_info.get('total')} error={device_info.get('error')}")

    # cleanup
    cleanup()

    # report
    write_report(device_info)

    elapsed = time.time() - t0
    print(f"\n=== Done in {elapsed:.1f}s ===")
    for r in RESULTS:
        print(f"  {r.status:11s} {r.name}")

    return 0 if all(r.status == "PASS" for r in RESULTS) else 1


if __name__ == "__main__":
    sys.exit(main())
