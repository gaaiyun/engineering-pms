r"""
E2E 卡点 blocker 流程测试 — 真实 PB API 操作。

业务流程（对照 frontend/src/lib/api.ts:useMarkTaskBlocked/useUnblockTask）：
  B1 经理建任务给员工
  B2 员工标记卡点（含 need_help_from 数组）
  B3 验证 blocker 字段落库 + 通知 need_help_from 成员 + Bug#8 rollback_to probe
  B4 员工解除卡点（unblock）
  B5 验证状态回到 in_progress + audit log + 通知 + 经理审计中心拒绝场景

前置：pocketbase :8090 + Vite :5173 都已启动。
"""
import json
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

PB_URL = "http://127.0.0.1:8090"
PASSWORD = "12345678"

ROLES = {
    "MANAGER": {"username": "zhang_manager", "name": "张经理"},
    "MANAGER2": {"username": "mgr_li", "name": "李经理"},
    "EMPLOYEE": {"username": "zhao_site", "name": "赵工长"},
    "EMPLOYEE2": {"username": "chen_doc", "name": "陈资料"},
    "ADMIN": {"username": "admin_boss", "name": "赵总(老板)"},
}

OUT_DIR = Path(r"G:\项目管理软件_v2\docs\superpowers\qa-screenshots")
OUT_DIR.mkdir(parents=True, exist_ok=True)
TEST_PREFIX = f"E2E-Blocker-{int(time.time())}-"


@dataclass
class ScenarioResult:
    name: str
    passed: bool = False
    error: str = ""
    warnings: list[str] = field(default_factory=list)
    db_dumps: dict[str, Any] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)


ALL_RESULTS: list[ScenarioResult] = []
STATE: dict[str, Any] = {}


# ---- PB REST helpers ----
def pb_login(identity: str) -> dict:
    req = urllib.request.Request(
        f"{PB_URL}/api/collections/users/auth-with-password", method="POST",
        data=json.dumps({"identity": identity, "password": PASSWORD}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read())


def _hdr(token: str) -> dict:
    return {"Authorization": token} if token else {}


def pb_get(path: str, token: str = "", params: dict | None = None) -> dict:
    url = f"{PB_URL}{path}" + ("?" + urlencode(params) if params else "")
    req = urllib.request.Request(url, headers=_hdr(token))
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read())


def _send(method: str, path: str, token: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"{PB_URL}{path}", method=method, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", **_hdr(token)})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {e.code}: {body_text}") from e


def pb_post(path: str, token: str, body: dict) -> dict:
    return _send("POST", path, token, body)


def pb_patch(path: str, token: str, body: dict) -> dict:
    return _send("PATCH", path, token, body)


def pb_delete(path: str, token: str) -> int:
    req = urllib.request.Request(f"{PB_URL}{path}", method="DELETE",
                                  headers=_hdr(token))
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def find_project(auth: dict) -> dict | None:
    try:
        ps = pb_get("/api/collections/projects/records", auth["token"],
                    {"perPage": 50, "filter": 'status="active"'})
        return ps["items"][0] if ps["items"] else None
    except Exception:
        return None


def create_notification(token: str, body: dict) -> dict:
    return pb_post("/api/collections/notifications/records", token, body)


# ---- Scenarios ----
def b1_create_task(manager: dict, employee: dict) -> ScenarioResult:
    """B1: 经理建任务给员工 → 启动到 in_progress。"""
    r = ScenarioResult(name="B1_create_task")
    try:
        project = find_project(manager)
        if not project:
            r.error = "no active project"
            return r
        r.notes.append(f"project: {project['name']} ({project['id']})")

        task = pb_post("/api/collections/tasks/records", manager["token"], {
            "project": project["id"],
            "stage_name": f"{TEST_PREFIX}B1-待卡点",
            "description": "E2E B1 — 等员工标记卡点",
            "status": "pending",
            "deadline": "2026-07-20 23:59:59.000Z",
            "assignees": [employee["record"]["id"]],
            "priority": "high",
            "created_by": manager["record"]["id"],
            "sequence": 99201,
        })
        STATE["B1_task_id"] = task["id"]
        STATE["project_id"] = project["id"]
        r.db_dumps["task"] = {"id": task["id"], "status": task["status"],
                              "assignees": task.get("assignees"),
                              "blocker": task.get("blocker")}
        r.notes.append(f"task created: {task['id']} status={task['status']}")
        if task["status"] != "pending":
            r.error = f"expected pending, got {task['status']}"
            return r
        if employee["record"]["id"] not in (task.get("assignees") or []):
            r.error = "employee not in assignees"
            return r

        create_notification(manager["token"], {
            "user": employee["record"]["id"], "type": "task_assigned",
            "title": "你有新任务",
            "content": f"任务「{TEST_PREFIX}B1-待卡点」已分配给你",
            "link_type": "task", "link_id": task["id"],
        })

        pb_patch(f"/api/collections/tasks/records/{task['id']}",
                 employee["token"], {"status": "in_progress"})
        time.sleep(0.5)
        verify = pb_get(f"/api/collections/tasks/records/{task['id']}",
                        employee["token"])
        r.notes.append(f"after employee start: status={verify['status']}")
        if verify["status"] != "in_progress":
            r.error = f"can't transition to in_progress: {verify['status']}"
            return r
        r.passed = True
    except Exception as e:
        r.error = f"exception: {type(e).__name__}: {e}"
    return r


def b2_mark_blocked(employee: dict, help_users: list[dict]) -> ScenarioResult:
    """B2: 员工标记卡点，含 need_help_from 数组。模拟 useMarkTaskBlocked 全套副作用。"""
    r = ScenarioResult(name="B2_mark_blocked")
    task_id = STATE.get("B1_task_id")
    if not task_id:
        r.error = "no B1_task_id"
        return r
    try:
        blocker = {
            "reason_type": "awaiting_input",
            "reason_detail": "等待客户提供详细规格说明,无法继续推进",
            "need_help_from": [u["record"]["id"] for u in help_users],
            "expected_resolve": "2026-05-25 12:00:00.000Z",
        }
        STATE["B2_blocker"] = blocker

        pb_patch(f"/api/collections/tasks/records/{task_id}", employee["token"],
                 {"status": "blocked", "blocker": blocker})

        task = pb_get(f"/api/collections/tasks/records/{task_id}", employee["token"])
        try:
            pb_post("/api/collections/audit_logs/records", employee["token"], {
                "project": task["project"], "task": task_id,
                "action_type": "mark_blocked",
                "operator": employee["record"]["id"], "after_data": blocker,
            })
            r.notes.append("audit_log mark_blocked created")
        except Exception as e:
            r.warnings.append(f"audit_log create failed: {e}")

        notif_results = []
        for u in help_users:
            try:
                n = create_notification(employee["token"], {
                    "user": u["record"]["id"], "type": "blocker_reported",
                    "title": "有任务遇到卡点需要您协助",
                    "content": blocker["reason_detail"],
                    "link_type": "task", "link_id": task_id,
                })
                notif_results.append((u["record"]["username"], n["id"]))
            except Exception as e:
                r.warnings.append(f"notify {u['record']['username']} failed: {e}")
        r.notes.append(f"notifications sent to help_users: {notif_results}")

        r.db_dumps["task_after"] = {"status": task["status"], "blocker": task.get("blocker")}
        r.notes.append(f"task after: status={task['status']} blocker={task.get('blocker')!r}")
        if task["status"] != "blocked":
            r.error = f"expected blocked, got {task['status']}"
            return r
        if not task.get("blocker"):
            r.error = "blocker field empty after update"
            return r
        r.passed = True
    except Exception as e:
        r.error = f"exception: {type(e).__name__}: {e}"
    return r


def b3_verify_persistence(employee: dict, help_users: list[dict],
                            admin: dict) -> ScenarioResult:
    """B3: blocker 字段落库 + need_help_from 收到通知 + Bug#8 rollback_to probe。"""
    r = ScenarioResult(name="B3_verify_persistence")
    task_id = STATE.get("B1_task_id")
    expected = STATE.get("B2_blocker")
    if not task_id or not expected:
        r.error = "missing prior state"
        return r
    try:
        task = pb_get(f"/api/collections/tasks/records/{task_id}", admin["token"])
        b = task.get("blocker")
        r.db_dumps["persisted_blocker"] = b
        r.notes.append(f"persisted blocker (raw): {b!r}")
        if not isinstance(b, dict):
            r.error = f"blocker not dict: type={type(b).__name__} value={b!r}"
            return r
        for k in ("reason_type", "reason_detail", "expected_resolve"):
            if b.get(k) != expected[k]:
                r.warnings.append(f"blocker.{k} mismatch: expected={expected[k]!r} got={b.get(k)!r}")
        if sorted(b.get("need_help_from") or []) != sorted(expected["need_help_from"]):
            r.warnings.append(f"need_help_from mismatch: {expected['need_help_from']} vs {b.get('need_help_from')}")
        r.notes.append("blocker field persisted correctly" if not r.warnings else "blocker partial mismatch (see warnings)")

        # 通知验证 — PB notifications.listRule 限制 user=@request.auth.id，必须用各 user token
        notif_summary = []
        for u in help_users:
            uauth = pb_login(u["record"]["username"])
            ns = pb_get("/api/collections/notifications/records", uauth["token"],
                        {"perPage": 50, "sort": "-created",
                         "filter": f'link_id="{task_id}" && type="blocker_reported"'})
            cnt = ns.get("totalItems", 0)
            notif_summary.append({"user": u["record"]["username"], "count": cnt})
            if cnt < 1:
                r.warnings.append(f"user {u['record']['username']} no blocker_reported")
        r.db_dumps["notification_summary"] = notif_summary
        r.notes.append(f"notif distribution: {notif_summary}")

        logs = pb_get("/api/collections/audit_logs/records", admin["token"],
                      {"perPage": 5, "sort": "-created",
                       "filter": f'task="{task_id}" && action_type="mark_blocked"'})
        r.db_dumps["audit_blocked_count"] = logs.get("totalItems", 0)
        r.notes.append(f"audit_logs mark_blocked: {logs.get('totalItems', 0)}")
        if logs.get("totalItems", 0) < 1:
            r.warnings.append("missing audit_log mark_blocked")

        # Bug #8 probe: PB 是否持久化 blocker.rollback_to？（Task 类型 :48-53 没声明此字段）
        try:
            test_blocker = dict(expected, rollback_to="rollbacktest123")
            pb_patch(f"/api/collections/tasks/records/{task_id}", employee["token"],
                     {"blocker": test_blocker})
            re_read = pb_get(f"/api/collections/tasks/records/{task_id}", admin["token"])
            new_b = re_read.get("blocker") or {}
            r.notes.append(f"[Bug#8 probe] wrote rollback_to='rollbacktest123', "
                           f"PB persisted = {new_b.get('rollback_to')!r}")
            if "rollback_to" not in new_b:
                r.warnings.append("[BUG #8 CONFIRMED] PB does NOT persist rollback_to")
            else:
                r.notes.append("[Bug #8 partial] PB 持久化 rollback_to OK; "
                               "但 Task.blocker 类型未声明，useUnblockTask 不读它")
            pb_patch(f"/api/collections/tasks/records/{task_id}", employee["token"],
                     {"blocker": expected})  # 还原
        except Exception as e:
            r.notes.append(f"Bug#8 probe failed: {e}")

        if not any(s["count"] >= 1 for s in notif_summary):
            r.error = "no help_user received notification"
            return r
        r.passed = True
    except Exception as e:
        r.error = f"exception: {type(e).__name__}: {e}"
    return r


def b4_unblock(employee: dict, admin: dict) -> ScenarioResult:
    """B4: 员工解除卡点（unblock）— 模拟 useUnblockTask 副作用。"""
    r = ScenarioResult(name="B4_unblock")
    task_id = STATE.get("B1_task_id")
    if not task_id:
        r.error = "no task_id"
        return r
    try:
        before = pb_get(f"/api/collections/tasks/records/{task_id}", employee["token"])
        STATE["B4_blocker_before"] = before.get("blocker")
        r.notes.append(f"before unblock: status={before['status']} blocker_present={bool(before.get('blocker'))}")

        pb_patch(f"/api/collections/tasks/records/{task_id}", employee["token"],
                 {"status": "in_progress", "blocker": None})

        try:
            pb_post("/api/collections/audit_logs/records", employee["token"], {
                "project": before["project"], "task": task_id,
                "action_type": "unblock_task",
                "operator": employee["record"]["id"],
                "before_data": {"status": "blocked"},
                "after_data": {"status": "in_progress"},
            })
            r.notes.append("audit_log unblock_task created")
        except Exception as e:
            r.warnings.append(f"audit_log create failed: {e}")

        # 模拟 notifyProjectMembers：给曾经的 help_users 发"卡点解除"通知
        help_ids = (STATE["B4_blocker_before"] or {}).get("need_help_from") or []
        sent = 0
        for uid in help_ids:
            try:
                create_notification(employee["token"], {
                    "user": uid, "type": "task_update",
                    "title": "卡点解除",
                    "content": f"任务「{TEST_PREFIX}B1-待卡点」的卡点已解除",
                    "link_type": "task", "link_id": task_id,
                })
                sent += 1
            except Exception as e:
                r.warnings.append(f"unblock notif fail: {e}")
        STATE["B4_unblock_notif_count"] = sent
        r.notes.append(f"unblock-resolve notifications sent: {sent}")

        time.sleep(0.5)
        after = pb_get(f"/api/collections/tasks/records/{task_id}", employee["token"])
        r.db_dumps["task_after_unblock"] = {"status": after["status"], "blocker": after.get("blocker")}
        r.notes.append(f"after unblock: status={after['status']} blocker={after.get('blocker')!r}")
        if after["status"] != "in_progress":
            r.error = f"expected in_progress, got {after['status']}"
            return r
        if isinstance(after.get("blocker"), dict) and after["blocker"]:
            r.warnings.append(f"blocker not cleared: {after['blocker']}")
        r.passed = True
    except Exception as e:
        r.error = f"exception: {type(e).__name__}: {e}"
    return r


def b5_verify_unblock(employee: dict, manager: dict, admin: dict) -> ScenarioResult:
    """B5: 验证最终状态 + audit log + 通知 + 经理审计中心拒绝场景。"""
    r = ScenarioResult(name="B5_verify_unblock")
    task_id = STATE.get("B1_task_id")
    if not task_id:
        r.error = "no task_id"
        return r
    try:
        task = pb_get(f"/api/collections/tasks/records/{task_id}", admin["token"])
        r.notes.append(f"final task: status={task['status']} blocker={task.get('blocker')!r}")
        r.db_dumps["final_task"] = {"status": task["status"], "blocker": task.get("blocker")}
        if task["status"] != "in_progress":
            r.error = f"task not back to in_progress: {task['status']}"
            return r

        logs = pb_get("/api/collections/audit_logs/records", admin["token"],
                      {"perPage": 5, "sort": "-created",
                       "filter": f'task="{task_id}" && action_type="unblock_task"'})
        r.db_dumps["audit_unblock_count"] = logs.get("totalItems", 0)
        r.notes.append(f"audit_logs unblock_task: {logs.get('totalItems', 0)}")
        if logs.get("totalItems", 0) < 1:
            r.warnings.append("missing audit_log unblock_task")

        help_ids = (STATE.get("B4_blocker_before") or {}).get("need_help_from") or []
        help_tokens = STATE.get("B5_help_tokens", {})
        r.notes.append(f"B5 checking notif for help_ids={help_ids} task_id={task_id}")
        for uid in help_ids:
            token = help_tokens.get(uid)
            if not token:
                r.warnings.append(f"missing token for {uid}")
                continue
            ns = pb_get("/api/collections/notifications/records", token,
                        {"perPage": 20, "sort": "-created",
                         "filter": f'link_id="{task_id}"'})
            types = [(n.get("type"), n.get("title")) for n in ns["items"]]
            r.notes.append(f"user {uid} notif (total={ns['totalItems']}): {types[:5]}")
            if not any("解除" in (n.get("title") or "") for n in ns["items"]):
                r.warnings.append(f"[BUG] user {uid} did not receive 卡点解除 notification")

        # 经理在审计中心拒绝 mark_blocked audit_log
        try:
            blocked_log = pb_get("/api/collections/audit_logs/records", manager["token"],
                                 {"perPage": 1, "sort": "-created",
                                  "filter": f'task="{task_id}" && action_type="mark_blocked"'})
            if not blocked_log["items"]:
                r.warnings.append("no mark_blocked audit_log to reject")
            else:
                log_id = blocked_log["items"][0]["id"]
                pb_patch(f"/api/collections/audit_logs/records/{log_id}", manager["token"],
                         {"review_status": "rejected",
                          "reviewed_by": manager["record"]["id"],
                          "reject_note": "卡点理由不充分，请重新评估"})
                r.notes.append(f"manager rejected mark_blocked audit_log {log_id}")
                updated = pb_get(f"/api/collections/audit_logs/records/{log_id}", manager["token"])
                r.db_dumps["rejected_audit"] = {
                    "reject_note": updated.get("reject_note"),
                    "review_status": updated.get("review_status"),
                }
                task_after = pb_get(f"/api/collections/tasks/records/{task_id}", manager["token"])
                r.notes.append(f"task status after audit reject: {task_after['status']} "
                               f"blocker={task_after.get('blocker')!r}")
                # useUpdateAuditLogStatus (api.ts:1573-1672) 对 mark_complete/update_task 做回滚
                # 但 mark_blocked 无任何处理 — 这是关键 bug
                r.warnings.append("[BUG] useUpdateAuditLogStatus (api.ts:1573-1672) 拒绝 "
                                  "mark_blocked 时无 action_type 特殊处理 — "
                                  "task.status/blocker 字段保持不变，与拒绝 mark_complete 不一致；"
                                  "若任务仍在 blocked 状态，员工被拒后仍无法恢复")
        except Exception as e:
            r.warnings.append(f"audit reject scenario failed: {e}")

        r.passed = True
    except Exception as e:
        r.error = f"exception: {type(e).__name__}: {e}"
    return r


# ---- Cleanup ----
def cleanup_e2e_data():
    print("\n=== cleanup ===")
    try:
        token = pb_login(ROLES["ADMIN"]["username"])["token"]
    except Exception as e:
        print(f"  cleanup login fail: {e}")
        return
    try:
        tasks = pb_get("/api/collections/tasks/records", token,
                       {"perPage": 200, "filter": f'stage_name~"{TEST_PREFIX[:-1]}"'})
        print(f"  E2E-Blocker tasks: {tasks['totalItems']}")
        for t in tasks["items"]:
            tid = t["id"]
            for col, fk in [("audit_logs", "task"), ("handoffs", "from_task")]:
                try:
                    items = pb_get(f"/api/collections/{col}/records", token,
                                   {"perPage": 200, "filter": f'{fk}="{tid}"'})
                    for x in items["items"]:
                        pb_delete(f"/api/collections/{col}/records/{x['id']}", token)
                except Exception:
                    pass
            try:
                ns = pb_get("/api/collections/notifications/records", token,
                            {"perPage": 200, "filter": f'link_type="task" && link_id="{tid}"'})
                for n in ns["items"]:
                    pb_delete(f"/api/collections/notifications/records/{n['id']}", token)
            except Exception:
                pass
            pb_delete(f"/api/collections/tasks/records/{tid}", token)
        print("  cleanup done")
    except Exception as e:
        print(f"  cleanup error: {e}")


# ---- Main ----
def main() -> int:
    print(f"=== E2E Blocker test starting, prefix={TEST_PREFIX} ===")
    mgr = pb_login(ROLES["MANAGER"]["username"])
    emp = pb_login(ROLES["EMPLOYEE"]["username"])
    emp2 = pb_login(ROLES["EMPLOYEE2"]["username"])
    mgr2 = pb_login(ROLES["MANAGER2"]["username"])
    admin = pb_login(ROLES["ADMIN"]["username"])
    print(f"manager={mgr['record']['name']} / employee={emp['record']['name']}")
    print(f"help_users: {emp2['record']['name']}, {mgr2['record']['name']}")

    help_users = [emp2, mgr2]
    STATE["B5_help_tokens"] = {u["record"]["id"]: u["token"] for u in help_users}

    scenarios = [
        ("B1_create_task", lambda: b1_create_task(mgr, emp)),
        ("B2_mark_blocked", lambda: b2_mark_blocked(emp, help_users)),
        ("B3_verify_persistence", lambda: b3_verify_persistence(emp, help_users, admin)),
        ("B4_unblock", lambda: b4_unblock(emp, admin)),
        ("B5_verify_unblock", lambda: b5_verify_unblock(emp, mgr, admin)),
    ]

    for name, fn in scenarios:
        print(f"\n--- {name} ---")
        try:
            r = fn()
        except Exception as e:
            r = ScenarioResult(name=name, error=f"top: {type(e).__name__}: {e}")
        ALL_RESULTS.append(r)
        status = "PASS" if r.passed else "FAIL"
        if r.passed and r.warnings:
            status = "WARN"
        print(f"  {status}: {r.error or 'ok'}")
        for n in r.notes:
            print(f"    · {n}")
        for w in r.warnings:
            print(f"    ! {w}")

    cleanup_e2e_data()

    out = OUT_DIR / "e2e_blocker_results.json"
    out.write_text(
        json.dumps([r.__dict__ for r in ALL_RESULTS], ensure_ascii=False, indent=2),
        encoding="utf-8")

    passed = sum(1 for r in ALL_RESULTS if r.passed and not r.warnings)
    warned = sum(1 for r in ALL_RESULTS if r.passed and r.warnings)
    failed = sum(1 for r in ALL_RESULTS if not r.passed)
    print(f"\n=== {passed} PASS, {warned} WARN, {failed} FAIL / total={len(ALL_RESULTS)} ===")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
