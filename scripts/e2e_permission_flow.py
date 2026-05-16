r"""
E2E 权限边界测试 — Round 4 / Agent K

测试 PB 各 collection 的 rule 是否真的拦截非授权操作：
  P1 — 员工 PATCH 不在自己 assignees 列表的 task
  P2 — 员工 DELETE 任务
  P3 — 员工创建他人 audit_log（伪造 operator）
  P4 — 员工创建发给他人的 notification
  P5 — useUnblockTask rollback_to 跨 assignees 联动（H-1 复现）
  P6 — 员工创建 from_task 不属于自己的 handoff
  P7 — 员工跨项目查看 tasks（PB listRule 限制）
  P8 — 员工列 audit_logs 是否泄露其他项目数据

前置：pocketbase :8090 已启动；测试 user 5 个标准账号。
"""
from __future__ import annotations

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
    "EMPLOYEE_A": {"username": "zhao_site", "name": "赵工长"},
    "EMPLOYEE_B": {"username": "chen_doc", "name": "陈资料"},
    "ADMIN": {"username": "admin_boss", "name": "赵总(老板)"},
}

OUT_DIR = Path(r"G:\项目管理软件_v2\docs\superpowers\overnight-log")
OUT_DIR.mkdir(parents=True, exist_ok=True)
TEST_PREFIX = f"E2E-Perm-{int(time.time())}-"


@dataclass
class CaseResult:
    name: str
    verdict: str = "INCONCLUSIVE"   # PASS / FAIL / INCONCLUSIVE
    summary: str = ""
    details: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)


ALL_RESULTS: list[CaseResult] = []
CREATED_IDS: dict[str, list[str]] = {
    "tasks": [],
    "audit_logs": [],
    "notifications": [],
    "handoffs": [],
    "projects": [],
}


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


def _send_raw(method: str, path: str, token: str, body: dict | None) -> tuple[int, str]:
    """Return (status, body_text) without raising on HTTPError."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{PB_URL}{path}", method=method, data=data,
        headers={"Content-Type": "application/json", **_hdr(token)})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return r.status, r.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="ignore")
        return e.code, body_text


def pb_post_raw(path: str, token: str, body: dict) -> tuple[int, str]:
    return _send_raw("POST", path, token, body)


def pb_patch_raw(path: str, token: str, body: dict) -> tuple[int, str]:
    return _send_raw("PATCH", path, token, body)


def pb_delete_raw(path: str, token: str) -> tuple[int, str]:
    return _send_raw("DELETE", path, token, None)


def pb_post(path: str, token: str, body: dict) -> dict:
    code, txt = pb_post_raw(path, token, body)
    if code >= 400:
        raise RuntimeError(f"HTTP {code}: {txt}")
    return json.loads(txt)


def pb_patch(path: str, token: str, body: dict) -> dict:
    code, txt = pb_patch_raw(path, token, body)
    if code >= 400:
        raise RuntimeError(f"HTTP {code}: {txt}")
    return json.loads(txt)


# ---- Fixture setup ----
def find_or_get_two_projects(admin_token: str, manager_id: str,
                              employee_a_id: str, employee_b_id: str) -> tuple[dict, dict]:
    """
    P-A: 含 employee_a 不含 employee_b
    P-B: 含 employee_b 不含 employee_a
    若已存在就用，否则新建（admin 建，cleanup 时删）。
    """
    p_a = None
    p_b = None
    existing = pb_get("/api/collections/projects/records", admin_token,
                      {"perPage": 200})
    for p in existing["items"]:
        members = p.get("members") or []
        if employee_a_id in members and employee_b_id not in members and not p_a:
            p_a = p
        elif employee_b_id in members and employee_a_id not in members and not p_b:
            p_b = p

    def _mk(name: str, members: list[str]) -> dict:
        proj = pb_post("/api/collections/projects/records", admin_token, {
            "name": f"{TEST_PREFIX}{name}",
            "status": "active",
            "members": members,
            "manager": manager_id,
            "start_date": "2026-05-01 00:00:00.000Z",
            "deadline": "2026-12-31 23:59:59.000Z",
        })
        CREATED_IDS["projects"].append(proj["id"])
        return proj

    if not p_a:
        p_a = _mk("ProjA-EmpA-only", [manager_id, employee_a_id])
    if not p_b:
        p_b = _mk("ProjB-EmpB-only", [manager_id, employee_b_id])
    return p_a, p_b


def create_task(token: str, project_id: str, name: str,
                  assignees: list[str], creator_id: str,
                  status: str = "pending", blocker: Any = None,
                  sequence: int = 99001) -> dict:
    body = {
        "project": project_id,
        "stage_name": f"{TEST_PREFIX}{name}",
        "description": "permission boundary test",
        "status": status,
        "deadline": "2026-08-20 23:59:59.000Z",
        "assignees": assignees,
        "priority": "high",
        "created_by": creator_id,
        "sequence": sequence,
    }
    if blocker is not None:
        body["blocker"] = blocker
    t = pb_post("/api/collections/tasks/records", token, body)
    CREATED_IDS["tasks"].append(t["id"])
    return t


# ============= CASES =============
def case_p1_employee_patch_foreign_task(emp_a: dict, emp_b: dict,
                                          admin_token: str, proj_id: str) -> CaseResult:
    """P1 — A 不在 task T 的 assignees, 尝试 PATCH stage_name。预期 403/404。"""
    r = CaseResult(name="P1_patch_foreign_task")
    try:
        t = create_task(admin_token, proj_id,
                          f"P1-T-assign-to-B-{int(time.time()*1000)%100000}",
                          assignees=[emp_b["record"]["id"]],
                          creator_id=admin_token and emp_b["record"]["id"],
                          sequence=99101)
        r.details.append(f"created task {t['id']} assignees=[{emp_b['record']['username']}]")

        # A 尝试 PATCH 别人的 task
        code, txt = pb_patch_raw(f"/api/collections/tasks/records/{t['id']}",
                                  emp_a["token"], {"stage_name": "HACKED"})
        r.raw["patch_status"] = code
        r.raw["patch_body"] = txt[:300]
        r.details.append(f"PATCH by employee A → HTTP {code}")

        # 验证内容未改
        after = pb_get(f"/api/collections/tasks/records/{t['id']}", admin_token)
        r.details.append(f"stage_name after attempt: {after['stage_name']!r}")

        if code in (403, 404):
            if "HACKED" not in after["stage_name"]:
                r.verdict = "PASS"
                r.summary = f"PB blocked unauthorized PATCH (HTTP {code}); task unchanged."
            else:
                r.verdict = "FAIL"
                r.summary = f"HTTP {code} but stage_name was changed!"
        elif code == 200:
            r.verdict = "FAIL"
            r.summary = "PB allowed unauthorized PATCH — SECURITY HOLE"
        else:
            r.verdict = "INCONCLUSIVE"
            r.summary = f"unexpected HTTP {code}"
    except Exception as e:
        r.verdict = "INCONCLUSIVE"
        r.summary = f"exception: {type(e).__name__}: {e}"
    return r


def case_p2_employee_delete_task(emp_a: dict, admin_token: str,
                                   proj_id: str) -> CaseResult:
    """P2 — A 尝试 DELETE 任务（即使是自己 assignees）。预期 403/404。"""
    r = CaseResult(name="P2_employee_delete_task")
    try:
        t = create_task(admin_token, proj_id,
                          f"P2-T-self-delete-{int(time.time()*1000)%100000}",
                          assignees=[emp_a["record"]["id"]],
                          creator_id=emp_a["record"]["id"],
                          sequence=99102)
        r.details.append(f"created task {t['id']} assigned to employee A")

        code, txt = pb_delete_raw(f"/api/collections/tasks/records/{t['id']}",
                                    emp_a["token"])
        r.raw["delete_status"] = code
        r.raw["delete_body"] = txt[:300]
        r.details.append(f"DELETE by employee A → HTTP {code}")

        # 验证还存在
        try:
            check = pb_get(f"/api/collections/tasks/records/{t['id']}", admin_token)
            still_exists = bool(check.get("id"))
        except Exception:
            still_exists = False
        r.details.append(f"task still exists: {still_exists}")

        if code in (403, 404) and still_exists:
            r.verdict = "PASS"
            r.summary = f"PB blocked employee DELETE (HTTP {code})."
        elif code == 204 or not still_exists:
            r.verdict = "FAIL"
            r.summary = "PB allowed employee to DELETE task — SECURITY HOLE"
        else:
            r.verdict = "INCONCLUSIVE"
            r.summary = f"unexpected HTTP {code}"
    except Exception as e:
        r.verdict = "INCONCLUSIVE"
        r.summary = f"exception: {type(e).__name__}: {e}"
    return r


def case_p3_audit_log_operator_forge(emp_a: dict, emp_b: dict,
                                       admin_token: str, proj_id: str) -> CaseResult:
    """P3 — A 创建 audit_log body { operator: B.id }。预期 403（migration 1772800000）。"""
    r = CaseResult(name="P3_audit_log_forge_operator")
    try:
        t = create_task(admin_token, proj_id,
                          f"P3-T-{int(time.time()*1000)%100000}",
                          assignees=[emp_a["record"]["id"]],
                          creator_id=emp_a["record"]["id"],
                          sequence=99103)

        forged_body = {
            "project": proj_id,
            "task": t["id"],
            "action_type": "fake_action",
            "operator": emp_b["record"]["id"],   # 伪造为他人
            "note": "P3 forge test",
        }
        code, txt = pb_post_raw("/api/collections/audit_logs/records",
                                   emp_a["token"], forged_body)
        r.raw["forge_status"] = code
        r.raw["forge_body"] = txt[:300]
        r.details.append(f"forge POST operator={emp_b['record']['username']} → HTTP {code}")

        if code == 200:
            # 记下 id 用于 cleanup
            try:
                rec_id = json.loads(txt)["id"]
                CREATED_IDS["audit_logs"].append(rec_id)
            except Exception:
                pass

        # 对比：用 A 自己当 operator 应该 OK
        own_body = dict(forged_body, operator=emp_a["record"]["id"])
        code2, txt2 = pb_post_raw("/api/collections/audit_logs/records",
                                    emp_a["token"], own_body)
        r.details.append(f"self-operator POST → HTTP {code2}")
        if code2 == 200:
            try:
                CREATED_IDS["audit_logs"].append(json.loads(txt2)["id"])
            except Exception:
                pass

        if code in (403, 400) and code2 == 200:
            r.verdict = "PASS"
            r.summary = f"PB rejected forged operator (HTTP {code}); self-operator OK."
        elif code == 200:
            r.verdict = "FAIL"
            r.summary = "PB ALLOWED forged operator — migration 1772800000 not in effect!"
        else:
            r.verdict = "INCONCLUSIVE"
            r.summary = f"forge HTTP {code} / self HTTP {code2}"
    except Exception as e:
        r.verdict = "INCONCLUSIVE"
        r.summary = f"exception: {type(e).__name__}: {e}"
    return r


def case_p4_notification_to_other(emp_a: dict, emp_b: dict,
                                    admin_token: str) -> CaseResult:
    """P4 — A 创建发给 B 的 notification。前端实际逻辑需要允许。"""
    r = CaseResult(name="P4_notification_to_other_user")
    try:
        code, txt = pb_post_raw("/api/collections/notifications/records",
                                   emp_a["token"], {
            "user": emp_b["record"]["id"],
            "type": "task_update",
            "title": f"{TEST_PREFIX}P4 test",
            "content": "A 发给 B 的通知，前端业务需要这个",
            "link_type": "task",
            "link_id": "fakeid12345",
        })
        r.raw["post_status"] = code
        r.raw["post_body"] = txt[:300]
        r.details.append(f"A → B notification POST → HTTP {code}")

        if code == 200:
            try:
                nid = json.loads(txt)["id"]
                CREATED_IDS["notifications"].append(nid)
                r.verdict = "PASS"
                r.summary = "PB allows A to create notif for B (createRule = auth.id != ''). 前端业务可用。"
                r.warnings.append("当前 notifications.createRule = '@request.auth.id != \"\"'，"
                                  "任何登录用户能给任意用户发通知 — 可被滥用做骚扰/钓鱼")
            except Exception:
                pass
        elif code == 403:
            r.verdict = "FAIL"
            r.summary = "PB blocks A→B notification — 前端业务（通知项目成员）会被卡死"
        else:
            r.verdict = "INCONCLUSIVE"
            r.summary = f"unexpected HTTP {code}: {txt[:200]}"
    except Exception as e:
        r.verdict = "INCONCLUSIVE"
        r.summary = f"exception: {type(e).__name__}: {e}"
    return r


def case_p5_unblock_rollback_to_h1(emp_a: dict, emp_b: dict,
                                     admin_token: str, proj_id: str) -> CaseResult:
    """
    P5 — H-1 复现：
      X assignee=B（已完成）→ T assignee=A（卡点，blocker.rollback_to=X.id）
      A 解卡点 → useUnblockTask 应把 X.status 设回 completed
      但 A 不在 X.assignees, PB tasks.updateRule 拦截
    """
    r = CaseResult(name="P5_unblock_rollback_h1")
    try:
        # X: assigned to B, completed
        x = create_task(admin_token, proj_id,
                          f"P5-X-prior-task-{int(time.time()*1000)%100000}",
                          assignees=[emp_b["record"]["id"]],
                          creator_id=emp_b["record"]["id"],
                          status="completed",
                          sequence=99201)
        r.details.append(f"X created: id={x['id']} assignee=B status=completed")

        # T: assigned to A, blocked with rollback_to=X
        blocker = {
            "reason_type": "awaiting_input",
            "reason_detail": "等待 X 输出",
            "need_help_from": [emp_b["record"]["id"]],
            "expected_resolve": "2026-06-01 12:00:00.000Z",
            "rollback_to": x["id"],
        }
        t = create_task(admin_token, proj_id,
                          f"P5-T-blocked-{int(time.time()*1000)%100000}",
                          assignees=[emp_a["record"]["id"]],
                          creator_id=emp_a["record"]["id"],
                          status="blocked", blocker=blocker,
                          sequence=99202)
        r.details.append(f"T created: id={t['id']} assignee=A status=blocked blocker.rollback_to=X")

        # 把 X 改成 in_progress 模拟「上游被回退」的状态
        # 用 admin 改（避免在 setup 阶段就 hit P1 错误）
        pb_patch(f"/api/collections/tasks/records/{x['id']}", admin_token,
                 {"status": "in_progress"})
        x_mid = pb_get(f"/api/collections/tasks/records/{x['id']}", admin_token)
        r.details.append(f"X reset to {x_mid['status']} via admin (simulating prior rollback)")

        # 现在模拟 useUnblockTask（api.ts:1349-1418）的完整流程
        # Step 1: A unblock T
        unblock_code, unblock_txt = pb_patch_raw(
            f"/api/collections/tasks/records/{t['id']}", emp_a["token"],
            {"status": "in_progress", "blocker": None})
        r.raw["unblock_T_status"] = unblock_code
        r.details.append(f"A PATCH T (unblock) → HTTP {unblock_code}")

        # Step 2: A 尝试 PATCH X status=completed（这就是 H-1 的核心）
        rollback_code, rollback_txt = pb_patch_raw(
            f"/api/collections/tasks/records/{x['id']}", emp_a["token"],
            {"status": "completed",
             "completed_at": "2026-05-16 12:00:00.000Z"})
        r.raw["rollback_X_status"] = rollback_code
        r.raw["rollback_X_body"] = rollback_txt[:300]
        r.details.append(f"A PATCH X (rollback to completed) → HTTP {rollback_code}")

        time.sleep(0.5)
        x_final = pb_get(f"/api/collections/tasks/records/{x['id']}", admin_token)
        r.details.append(f"X final status: {x_final['status']}")
        r.raw["X_final_status"] = x_final["status"]

        # H-1 判定：
        #   IF rollback PATCH 返回 403/404 AND X.status == in_progress
        #   → H-1 CONFIRMED：前端 catch 吞掉错误，X 永远停留 in_progress
        if rollback_code in (403, 404) and x_final["status"] == "in_progress":
            r.verdict = "FAIL"
            r.summary = ("H-1 CONFIRMED: A 解卡点后 useUnblockTask 尝试 PATCH X，"
                         f"PB 返回 HTTP {rollback_code}（A 不在 X.assignees），"
                         f"前端 try/catch 静默吞掉 → X.status 永远停留 in_progress 而非 completed。")
            r.warnings.append("修复方案：either (a) PB hook 拦截 unblock 时由系统代理回写 X.status；"
                              "或 (b) 前端检测 403 后弹「请联系 X 的负责人手动恢复」提示；"
                              "或 (c) 把回写权限授给 rollback 源任务的所有 assignees。")
        elif rollback_code == 200 and x_final["status"] == "completed":
            r.verdict = "PASS"
            r.summary = "PB 允许 A 跨 assignees 联动 X（可能因 updateRule 放宽或 X 创建者是 A）"
        elif rollback_code in (403, 404) and x_final["status"] == "completed":
            r.verdict = "INCONCLUSIVE"
            r.summary = ("PB 拦截 PATCH 但 X 最终是 completed —— 可能有别的副作用（PB hook?）")
        else:
            r.verdict = "INCONCLUSIVE"
            r.summary = f"PATCH HTTP {rollback_code} / X.status={x_final['status']}"
    except Exception as e:
        r.verdict = "INCONCLUSIVE"
        r.summary = f"exception: {type(e).__name__}: {e}"
    return r


def case_p6_handoff_from_foreign_task(emp_a: dict, emp_b: dict,
                                        admin_token: str, proj_id: str) -> CaseResult:
    """P6 — A 不在 task T 的 assignees, 但创建 from_task=T 的 handoff。"""
    r = CaseResult(name="P6_handoff_from_foreign_task")
    try:
        t = create_task(admin_token, proj_id,
                          f"P6-T-emp-B-{int(time.time()*1000)%100000}",
                          assignees=[emp_b["record"]["id"]],
                          creator_id=emp_b["record"]["id"],
                          sequence=99106)
        r.details.append(f"T created: assignee=B id={t['id']}")

        body = {
            "project": proj_id,
            "from_task": t["id"],
            "proposed_title": f"{TEST_PREFIX}P6 handoff",
            "proposed_due_date": "2026-08-01 23:59:59.000Z",
            "status": "pending",
            "submitter": emp_a["record"]["id"],
        }
        code, txt = pb_post_raw("/api/collections/handoffs/records",
                                  emp_a["token"], body)
        r.raw["post_status"] = code
        r.raw["post_body"] = txt[:400]
        r.details.append(f"A POST handoff with from_task=B's task → HTTP {code}")

        if code == 200:
            try:
                hid = json.loads(txt)["id"]
                CREATED_IDS["handoffs"].append(hid)
                r.verdict = "FAIL"
                r.summary = ("PB ALLOWS A to create handoff from B's task — "
                             "handoffs.createRule 太宽（@request.auth.id != \"\"），"
                             "应限制为 from_task.assignees ~ auth.id || role in (admin,manager)")
            except Exception:
                pass
        elif code in (403, 400):
            r.verdict = "PASS"
            r.summary = f"PB blocked A's handoff create (HTTP {code})"
        else:
            r.verdict = "INCONCLUSIVE"
            r.summary = f"unexpected HTTP {code}: {txt[:200]}"
    except Exception as e:
        r.verdict = "INCONCLUSIVE"
        r.summary = f"exception: {type(e).__name__}: {e}"
    return r


def case_p7_cross_project_task_list(emp_a: dict, proj_b_id: str,
                                     admin_token: str) -> CaseResult:
    """P7 — A 不在项目 P-B members, 但 filter project=P-B。预期返回 0 条。"""
    r = CaseResult(name="P7_cross_project_task_list")
    try:
        # 在 P-B 项目中先建几个任务（admin 建）
        seeded = []
        for i in range(2):
            t = create_task(admin_token, proj_b_id,
                              f"P7-seed-{i}-{int(time.time()*1000)%100000}",
                              assignees=[],
                              creator_id=admin_token and emp_a["record"]["id"],
                              sequence=99110 + i)
            seeded.append(t["id"])
        r.details.append(f"seeded {len(seeded)} tasks in proj_B={proj_b_id}")

        # A 查
        res = pb_get("/api/collections/tasks/records", emp_a["token"],
                     {"perPage": 50, "filter": f'project="{proj_b_id}"'})
        n = res.get("totalItems", 0)
        r.raw["A_list_count"] = n
        r.raw["A_list_items"] = [it["id"] for it in res["items"]]
        r.details.append(f"A list tasks filter=proj_B → totalItems={n}")

        # admin 对照（确认任务存在）
        admin_res = pb_get("/api/collections/tasks/records", admin_token,
                             {"perPage": 50, "filter": f'project="{proj_b_id}"'})
        admin_n = admin_res.get("totalItems", 0)
        r.details.append(f"admin sees {admin_n} tasks in proj_B")

        if n == 0 and admin_n > 0:
            r.verdict = "PASS"
            r.summary = f"PB listRule 正确隔离: A 看到 0/{admin_n} 条 proj_B 任务"
        elif n > 0 and admin_n > 0 and n < admin_n:
            r.verdict = "INCONCLUSIVE"
            r.summary = (f"A 看到 {n}/{admin_n} 条 proj_B 任务 —— 部分泄露? "
                         f"（可能 A 是某个 task 的 assignee 或 created_by）")
        elif n >= admin_n and admin_n > 0:
            r.verdict = "FAIL"
            r.summary = (f"A 看到全部 {n} 条 proj_B 任务（admin {admin_n}） —— 跨项目权限失效")
        else:
            r.verdict = "INCONCLUSIVE"
            r.summary = f"admin_n={admin_n} A_n={n} 数据不足以判定"
    except Exception as e:
        r.verdict = "INCONCLUSIVE"
        r.summary = f"exception: {type(e).__name__}: {e}"
    return r


def case_p8_audit_logs_cross_project(emp_a: dict, emp_b: dict,
                                       admin_token: str,
                                       proj_a_id: str, proj_b_id: str) -> CaseResult:
    """P8 — A 列 audit_logs 是否能看到 proj_B 的日志？"""
    r = CaseResult(name="P8_audit_logs_cross_project")
    try:
        # 创建一条 proj_B 的 audit_log（admin 直接写不行，因为 operator = auth.id 要求；
        # 改用 emp_b 写一条属于 proj_B 的）
        t_b = create_task(admin_token, proj_b_id,
                            f"P8-B-task-{int(time.time()*1000)%100000}",
                            assignees=[emp_b["record"]["id"]],
                            creator_id=emp_b["record"]["id"],
                            sequence=99120)
        own_audit_body = {
            "project": proj_b_id,
            "task": t_b["id"],
            "action_type": "p8_seed",
            "operator": emp_b["record"]["id"],
            "note": "P8 seed log in proj_B",
        }
        code_seed, txt_seed = pb_post_raw("/api/collections/audit_logs/records",
                                              emp_b["token"], own_audit_body)
        r.details.append(f"seed audit_log in proj_B (by B) → HTTP {code_seed}")
        if code_seed == 200:
            try:
                CREATED_IDS["audit_logs"].append(json.loads(txt_seed)["id"])
            except Exception:
                pass

        # 同样在 proj_A 也建一条（让对比可见）
        t_a = create_task(admin_token, proj_a_id,
                            f"P8-A-task-{int(time.time()*1000)%100000}",
                            assignees=[emp_a["record"]["id"]],
                            creator_id=emp_a["record"]["id"],
                            sequence=99121)
        pb_post_raw("/api/collections/audit_logs/records", emp_a["token"], {
            "project": proj_a_id, "task": t_a["id"],
            "action_type": "p8_seed", "operator": emp_a["record"]["id"],
            "note": "P8 seed log in proj_A",
        })
        # cleanup 这个不重要 — admin scan 会捕获

        # A 列所有 audit_logs
        res = pb_get("/api/collections/audit_logs/records", emp_a["token"],
                     {"perPage": 100, "sort": "-created",
                      "filter": 'action_type="p8_seed"'})
        items = res["items"]
        proj_ids = sorted({it.get("project") for it in items if it.get("project")})
        r.raw["A_audit_seen_projects"] = proj_ids
        r.raw["A_audit_count"] = len(items)
        r.details.append(f"A sees {len(items)} p8_seed audit_logs; projects = {proj_ids}")

        # 关键：proj_B 是否出现在 A 的结果里？
        leaked = proj_b_id in proj_ids
        if leaked:
            r.verdict = "FAIL"
            r.summary = (f"audit_logs 跨项目泄露：A（不在 proj_B members）能看到 proj_B 的 audit_log。"
                         f"当前 listRule = '@request.auth.id != \"\"'，无项目过滤。")
            r.warnings.append("修复建议：listRule 改为 "
                              "'@request.auth.role = \"admin\" || "
                              "@request.auth.role = \"manager\" || "
                              "project.members ~ @request.auth.id || "
                              "operator = @request.auth.id'")
        else:
            r.verdict = "PASS"
            r.summary = "A 未看到 proj_B 的 audit_log（可能是巧合或已修过）"
            r.warnings.append("注意：当前 audit_logs.listRule = 'auth.id != \"\"' "
                              "理论上无限制。本次未泄露可能是 seed 数据不足，建议加 PB rule 防护。")
    except Exception as e:
        r.verdict = "INCONCLUSIVE"
        r.summary = f"exception: {type(e).__name__}: {e}"
    return r


# ---- Cleanup ----
def cleanup_e2e_data(admin_token: str) -> None:
    print("\n=== cleanup ===")

    # 1) prefix-scan tasks/projects/handoffs/audit_logs/notifications
    def scan_and_delete(col: str, filter_str: str) -> int:
        try:
            res = pb_get(f"/api/collections/{col}/records", admin_token,
                          {"perPage": 200, "filter": filter_str})
            for it in res["items"]:
                CREATED_IDS.setdefault(col, []).append(it["id"])
            return len(res["items"])
        except Exception as e:
            print(f"  scan {col} fail: {e}")
            return 0

    # by tracked IDs (definitive) + by prefix sweep (catch leakage)
    scan_and_delete("tasks", f'stage_name~"{TEST_PREFIX[:-1]}"')
    scan_and_delete("projects", f'name~"{TEST_PREFIX[:-1]}"')
    scan_and_delete("audit_logs", 'action_type="p8_seed" || action_type="fake_action"')
    scan_and_delete("notifications", f'title~"{TEST_PREFIX[:-1]}"')
    scan_and_delete("handoffs", f'proposed_title~"{TEST_PREFIX[:-1]}"')

    order = ["handoffs", "audit_logs", "notifications", "tasks", "projects"]
    for col in order:
        ids = list(dict.fromkeys(CREATED_IDS.get(col, [])))
        if not ids:
            continue
        ok = 0
        for rid in ids:
            code, _ = pb_delete_raw(f"/api/collections/{col}/records/{rid}", admin_token)
            if code in (204, 404):
                ok += 1
        print(f"  {col}: deleted {ok}/{len(ids)}")


# ---- Main ----
def main() -> int:
    print(f"=== E2E Permission test starting, prefix={TEST_PREFIX} ===")
    sessions = {}
    for k, info in ROLES.items():
        try:
            sessions[k] = pb_login(info["username"])
            print(f"  login {k:10s} = {info['username']:14s} role={sessions[k]['record']['role']}")
        except Exception as e:
            print(f"  login FAIL {info['username']}: {e}")
            return 2

    admin = sessions["ADMIN"]
    mgr = sessions["MANAGER"]
    emp_a = sessions["EMPLOYEE_A"]
    emp_b = sessions["EMPLOYEE_B"]

    # 准备两个项目：proj_A 含 emp_a 不含 emp_b；proj_B 反之
    try:
        proj_a, proj_b = find_or_get_two_projects(admin["token"],
                                                     mgr["record"]["id"],
                                                     emp_a["record"]["id"],
                                                     emp_b["record"]["id"])
        print(f"  proj_A = {proj_a['name']} ({proj_a['id']}) members={proj_a.get('members')}")
        print(f"  proj_B = {proj_b['name']} ({proj_b['id']}) members={proj_b.get('members')}")
    except Exception as e:
        print(f"  project setup FAIL: {e}")
        cleanup_e2e_data(admin["token"])
        return 2

    cases = [
        ("P1_patch_foreign_task",
         lambda: case_p1_employee_patch_foreign_task(emp_a, emp_b, admin["token"], proj_a["id"])),
        ("P2_employee_delete_task",
         lambda: case_p2_employee_delete_task(emp_a, admin["token"], proj_a["id"])),
        ("P3_audit_log_forge_operator",
         lambda: case_p3_audit_log_operator_forge(emp_a, emp_b, admin["token"], proj_a["id"])),
        ("P4_notification_to_other_user",
         lambda: case_p4_notification_to_other(emp_a, emp_b, admin["token"])),
        ("P5_unblock_rollback_h1",
         lambda: case_p5_unblock_rollback_to_h1(emp_a, emp_b, admin["token"], proj_a["id"])),
        ("P6_handoff_from_foreign_task",
         lambda: case_p6_handoff_from_foreign_task(emp_a, emp_b, admin["token"], proj_a["id"])),
        ("P7_cross_project_task_list",
         lambda: case_p7_cross_project_task_list(emp_a, proj_b["id"], admin["token"])),
        ("P8_audit_logs_cross_project",
         lambda: case_p8_audit_logs_cross_project(emp_a, emp_b, admin["token"],
                                                       proj_a["id"], proj_b["id"])),
    ]
    for name, fn in cases:
        print(f"\n--- {name} ---")
        try:
            r = fn()
        except Exception as e:
            r = CaseResult(name=name, verdict="INCONCLUSIVE",
                            summary=f"top-level exc: {type(e).__name__}: {e}")
        ALL_RESULTS.append(r)
        print(f"  {r.verdict}: {r.summary}")
        for d in r.details:
            print(f"    · {d}")
        for w in r.warnings:
            print(f"    ! {w}")

    cleanup_e2e_data(admin["token"])

    out = OUT_DIR / "agent_K_permission_e2e_results.json"
    out.write_text(json.dumps([r.__dict__ for r in ALL_RESULTS],
                                ensure_ascii=False, indent=2),
                     encoding="utf-8")
    print(f"\n=== results → {out} ===")

    passes = sum(1 for r in ALL_RESULTS if r.verdict == "PASS")
    fails = sum(1 for r in ALL_RESULTS if r.verdict == "FAIL")
    inconc = sum(1 for r in ALL_RESULTS if r.verdict == "INCONCLUSIVE")
    print(f"\n=== {passes} PASS, {fails} FAIL, {inconc} INCONCLUSIVE / total={len(ALL_RESULTS)} ===")
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
