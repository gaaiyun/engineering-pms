r"""
E2E 并发竞态测试 — 多线程同时操作同一资源，验证 PB hook + 前端 mutation 的并发兜底。

业务背景：
  - 最近修了 handoffs_status_sync.pb.js + audit_logs_reject_sync.pb.js 两个 PB hook，
    在 PB 端兜底业务联动（approve handoff 同步 from_task=completed 等）。
  - 还没测过：多 manager 同时 approve / 用户快速点击 / PB hook 与前端 mutation
    同时触发。本脚本用 threading 模拟。

场景：
  C1 — 两个 manager 同时 approve 同一个 handoff
  C2 — manager approve handoff + employee mark_blocked 同 task
  C3 — assignee 快速二次 mark_complete 同 task
  C4 — 两个 manager 同时拖不同 task 改 sequence
  C5 — audit reject mark_complete 与 approve handoff 竞速

前置：pocketbase :8090 + Vite :5173 已启动。
"""
import json
import sys
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from queue import Queue
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
TEST_PREFIX = f"E2E-Concurrent-{int(time.time())}-"


@dataclass
class ScenarioResult:
    name: str
    passed: bool = False
    inconclusive: bool = False
    error: str = ""
    warnings: list[str] = field(default_factory=list)
    db_dumps: dict[str, Any] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)


ALL_RESULTS: list[ScenarioResult] = []
STATE: dict[str, Any] = {}
CLEANUP_IDS: dict[str, list[str]] = {
    "tasks": [],
    "handoffs": [],
    "audit_logs": [],
    "notifications": [],
}


# ---- PB REST helpers ----
def pb_login(identity: str) -> dict:
    req = urllib.request.Request(
        f"{PB_URL}/api/collections/users/auth-with-password", method="POST",
        data=json.dumps({"identity": identity, "password": PASSWORD}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def _hdr(token: str) -> dict:
    return {"Authorization": token} if token else {}


def pb_get(path: str, token: str = "", params: dict | None = None) -> dict:
    url = f"{PB_URL}{path}" + ("?" + urlencode(params) if params else "")
    req = urllib.request.Request(url, headers=_hdr(token))
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def _send(method: str, path: str, token: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"{PB_URL}{path}", method=method, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", **_hdr(token)})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
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
        with urllib.request.urlopen(req, timeout=10) as r:
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


# ---- Threaded helpers ----
def threaded_patch(barrier: threading.Barrier, path: str, token: str,
                    body: dict, out_q: Queue, thread_name: str) -> None:
    """等所有 worker 到 barrier 后同时发 PATCH。"""
    barrier.wait()
    t0 = time.time()
    try:
        result = pb_patch(path, token, body)
        out_q.put({"thread": thread_name, "ok": True,
                   "result": result, "elapsed_ms": int((time.time() - t0) * 1000)})
    except Exception as e:
        out_q.put({"thread": thread_name, "ok": False,
                   "error": f"{type(e).__name__}: {e}",
                   "elapsed_ms": int((time.time() - t0) * 1000)})


def threaded_post(barrier: threading.Barrier, path: str, token: str,
                   body: dict, out_q: Queue, thread_name: str) -> None:
    barrier.wait()
    t0 = time.time()
    try:
        result = pb_post(path, token, body)
        out_q.put({"thread": thread_name, "ok": True,
                   "result": result, "elapsed_ms": int((time.time() - t0) * 1000)})
    except Exception as e:
        out_q.put({"thread": thread_name, "ok": False,
                   "error": f"{type(e).__name__}: {e}",
                   "elapsed_ms": int((time.time() - t0) * 1000)})


# ============================================================
# 业务 setup 助手
# ============================================================
def setup_task(manager: dict, employee: dict, project_id: str,
                title_suffix: str, seq: int = 99500) -> dict:
    """建一个 in_progress 任务（由 manager 创建 + employee 启动）。"""
    task = pb_post("/api/collections/tasks/records", manager["token"], {
        "project": project_id,
        "stage_name": f"{TEST_PREFIX}{title_suffix}",
        "description": f"E2E concurrent — {title_suffix}",
        "status": "pending",
        "deadline": "2026-07-30 23:59:59.000Z",
        "assignees": [employee["record"]["id"]],
        "priority": "high",
        "created_by": manager["record"]["id"],
        "sequence": seq,
    })
    CLEANUP_IDS["tasks"].append(task["id"])
    pb_patch(f"/api/collections/tasks/records/{task['id']}",
             employee["token"], {"status": "in_progress"})
    return task


def _enum_priority() -> str:
    return "normal"  # PB enum: low|normal|high


def setup_handoff_pending(employee: dict, task: dict,
                           next_assignee_id: str) -> dict:
    """employee 标完成 + 创建 pending handoff。"""
    pb_patch(f"/api/collections/tasks/records/{task['id']}",
             employee["token"], {"status": "completed"})
    handoff = pb_post("/api/collections/handoffs/records", employee["token"], {
        "project": task["project"], "from_task": task["id"],
        "proposed_title": f"{TEST_PREFIX}{task['stage_name']} 后续",
        "proposed_description": "并发测试 handoff",
        "proposed_assignees": [next_assignee_id],
        "proposed_due_date": "2026-08-30 23:59:59.000Z",
        "status": "pending", "submitter": employee["record"]["id"],
    })
    CLEANUP_IDS["handoffs"].append(handoff["id"])
    return handoff


# ============================================================
# Scenario C1 — 两个 manager 同时 approve 同一 handoff
# ============================================================
def c1_double_approve_handoff(mgr1: dict, mgr2: dict, employee: dict,
                                project_id: str) -> ScenarioResult:
    r = ScenarioResult(name="C1_double_approve_handoff")
    try:
        task = setup_task(mgr1, employee, project_id, "C1-handoff", 99501)
        handoff = setup_handoff_pending(employee, task, employee["record"]["id"])
        r.notes.append(f"setup: task={task['id']} handoff={handoff['id']}")

        # 两个 manager 同时 PATCH handoff.status='approved'
        barrier = threading.Barrier(2)
        q: Queue = Queue()
        threads = [
            threading.Thread(target=threaded_patch, args=(
                barrier, f"/api/collections/handoffs/records/{handoff['id']}",
                mgr1["token"], {"status": "approved",
                                "reviewer": mgr1["record"]["id"],
                                "review_note": "C1 mgr1"}, q, "mgr1")),
            threading.Thread(target=threaded_patch, args=(
                barrier, f"/api/collections/handoffs/records/{handoff['id']}",
                mgr2["token"], {"status": "approved",
                                "reviewer": mgr2["record"]["id"],
                                "review_note": "C1 mgr2"}, q, "mgr2")),
        ]
        for t in threads: t.start()
        for t in threads: t.join(timeout=15)

        results = [q.get_nowait() for _ in range(2)]
        r.db_dumps["thread_results"] = [
            {"thread": x["thread"], "ok": x["ok"],
             "error": x.get("error", "")[:200], "elapsed_ms": x["elapsed_ms"]}
            for x in results
        ]
        oks = [x for x in results if x["ok"]]
        r.notes.append(f"thread results: {len(oks)}/2 succeeded")

        # 等 hook 跑完
        time.sleep(1.5)

        # 验证最终一致性
        handoff_final = pb_get(f"/api/collections/handoffs/records/{handoff['id']}",
                                mgr1["token"])
        task_final = pb_get(f"/api/collections/tasks/records/{task['id']}",
                             mgr1["token"])
        r.db_dumps["handoff_final"] = {"status": handoff_final["status"],
                                       "reviewer": handoff_final.get("reviewer"),
                                       "approved_task": handoff_final.get("approved_task")}
        r.db_dumps["from_task_final"] = {"status": task_final["status"]}

        # 检查是否创建了重复下游任务（搜 predecessor_tasks 包含 task['id']）
        downstream = pb_get("/api/collections/tasks/records", mgr1["token"], {
            "perPage": 50,
            "filter": f'predecessor_tasks~"{task["id"]}"',
        })
        r.db_dumps["downstream_count"] = downstream.get("totalItems", 0)
        r.db_dumps["downstream_ids"] = [t["id"] for t in downstream.get("items", [])]
        # 加入清理
        for t in downstream.get("items", []):
            CLEANUP_IDS["tasks"].append(t["id"])
        r.notes.append(f"downstream tasks (with from_task as predecessor): {downstream.get('totalItems', 0)}")
        r.notes.append(f"handoff final status: {handoff_final['status']}")
        r.notes.append(f"from_task final status: {task_final['status']}")

        # 期望：最终 handoff=approved，from_task=completed，downstream 任务数 = 1
        if handoff_final["status"] != "approved":
            r.error = f"handoff status not approved: {handoff_final['status']}"
            return r
        if task_final["status"] != "completed":
            r.warnings.append(
                f"from_task status not completed: {task_final['status']}")
        if downstream.get("totalItems", 0) > 1:
            r.error = (f"RACE BUG: downstream tasks created twice "
                       f"({downstream.get('totalItems')}). 复现: "
                       f"两线程同时 PATCH handoffs/{handoff['id']} status=approved "
                       f"→ 前端 useApproveHandoff 各自调 createTaskWithSideEffects → 双下游")
            return r
        # 两个线程都返回 ok 也行 — 第二次更新只是把同样字段写一遍，仍幂等
        r.passed = True
    except Exception as e:
        r.error = f"exception: {type(e).__name__}: {e}"
    return r


# ============================================================
# Scenario C2 — approve handoff (manager) + mark_blocked (employee) 竞速
# ============================================================
def c2_approve_vs_block(mgr1: dict, employee: dict,
                          project_id: str) -> ScenarioResult:
    r = ScenarioResult(name="C2_approve_vs_block")
    try:
        # 注意：mark_blocked 是直接 PATCH task.status='blocked'
        # 而 approve handoff 走 useApproveHandoff（PATCH handoffs.status=approved，
        # PB hook 会把 from_task 同步到 completed）。
        # 设计：task 处于 in_progress + 已有 pending handoff（员工先标完成 + 提交 handoff）
        # 然后 employee 突然反悔标卡点（PATCH task.status='blocked'）
        # 同时 manager approve handoff
        task = setup_task(mgr1, employee, project_id, "C2-vs-blocked", 99502)
        # employee 标完成 + 创建 pending handoff
        handoff = setup_handoff_pending(employee, task, employee["record"]["id"])
        # 注意：现在 task.status=completed，handoff=pending
        # 模拟员工反悔 → 改回 in_progress 再标 blocked（业务上员工通常用 useUnblockHandoff
        # 但并发场景：员工 PATCH task.status=blocked 与 manager PATCH handoff=approved 同时发生）
        # 为更尖锐：让两线程同时跑
        r.notes.append(f"setup: task={task['id']} handoff={handoff['id']}")

        barrier = threading.Barrier(2)
        q: Queue = Queue()
        threads = [
            threading.Thread(target=threaded_patch, args=(
                barrier, f"/api/collections/handoffs/records/{handoff['id']}",
                mgr1["token"], {"status": "approved",
                                "reviewer": mgr1["record"]["id"],
                                "review_note": "C2 approve"}, q, "approve")),
            threading.Thread(target=threaded_patch, args=(
                barrier, f"/api/collections/tasks/records/{task['id']}",
                employee["token"], {"status": "blocked",
                                     "blocker": {"reason_type": "awaiting_input",
                                                 "reason_detail": "C2 竞速测试",
                                                 "need_help_from": []}}, q, "block")),
        ]
        for t in threads: t.start()
        for t in threads: t.join(timeout=15)

        results = [q.get_nowait() for _ in range(2)]
        r.db_dumps["thread_results"] = [
            {"thread": x["thread"], "ok": x["ok"],
             "error": x.get("error", "")[:200],
             "elapsed_ms": x["elapsed_ms"]} for x in results
        ]

        time.sleep(1.5)
        # 等 PB hook 收敛后看最终态
        handoff_final = pb_get(f"/api/collections/handoffs/records/{handoff['id']}",
                                mgr1["token"])
        task_final = pb_get(f"/api/collections/tasks/records/{task['id']}",
                             mgr1["token"])
        r.db_dumps["handoff_final"] = {"status": handoff_final["status"]}
        r.db_dumps["from_task_final"] = {"status": task_final["status"],
                                          "blocker": bool(task_final.get("blocker"))}
        r.notes.append(f"handoff final={handoff_final['status']}, task final={task_final['status']}, blocker={bool(task_final.get('blocker'))}")

        # 矛盾态判定：handoff=approved 但 task=blocked → 不自洽
        # 期望 PB hook handoffs_status_sync 会把 from_task 强写成 completed
        if handoff_final["status"] == "approved" and task_final["status"] == "blocked":
            r.error = ("RACE BUG: handoff=approved 与 task=blocked 矛盾。"
                       f"复现: 同时 PATCH handoffs/{handoff['id']} status=approved 与 "
                       f"PATCH tasks/{task['id']} status=blocked。"
                       "建议: handoffs_status_sync.pb.js 已强制写 completed 但被 "
                       "block PATCH 覆盖 → 需要 PB rule 限制 task.status=blocked 时禁止该 handoff approve，"
                       "或在 hook 里二次 reload + retry。")
            return r
        if handoff_final["status"] == "approved" and task_final["status"] != "completed":
            r.warnings.append(
                f"handoff approved 但 from_task 不是 completed: {task_final['status']}")
        # 残留 blocker 检查：handoff=approved + task=completed 时不应有 blocker
        if (handoff_final["status"] == "approved"
                and task_final["status"] == "completed"
                and task_final.get("blocker")):
            r.warnings.append(
                f"task=completed 但 blocker 字段未清空: {task_final.get('blocker')}。"
                "复现路径: employee 同步写 blocker 字段后被 PB hook 把 status 覆盖成 completed，"
                "但 blocker JSON 残留未清。"
                "建议: handoffs_status_sync.pb.js approved 分支同时 task.set('blocker', null)。")
        r.passed = True
    except Exception as e:
        r.error = f"exception: {type(e).__name__}: {e}"
    return r


# ============================================================
# Scenario C3 — 二次 mark_complete (理论上只该 1 个 handoff)
# ============================================================
def c3_double_mark_complete(mgr1: dict, employee: dict,
                              project_id: str) -> ScenarioResult:
    r = ScenarioResult(name="C3_double_mark_complete")
    try:
        task = setup_task(mgr1, employee, project_id, "C3-double-complete", 99503)
        r.notes.append(f"setup: task={task['id']}")

        # 模拟两次"标记完成"：两线程同时 PATCH task.status=completed + POST handoffs
        # 实际前端是一个 mutation 包，但用户快速双击可能触发两次 mutation
        barrier = threading.Barrier(2)
        q: Queue = Queue()

        def do_mark_complete(barrier, label):
            barrier.wait()
            t0 = time.time()
            try:
                pb_patch(f"/api/collections/tasks/records/{task['id']}",
                          employee["token"], {"status": "completed"})
                h = pb_post("/api/collections/handoffs/records", employee["token"], {
                    "project": task["project"], "from_task": task["id"],
                    "proposed_title": f"{TEST_PREFIX}C3-{label}",
                    "proposed_description": f"C3 二次提交 {label}",
                    "proposed_assignees": [employee["record"]["id"]],
                    "proposed_due_date": "2026-08-30 23:59:59.000Z",
                    "status": "pending", "submitter": employee["record"]["id"],
                })
                CLEANUP_IDS["handoffs"].append(h["id"])
                q.put({"thread": label, "ok": True, "handoff_id": h["id"],
                       "elapsed_ms": int((time.time() - t0) * 1000)})
            except Exception as e:
                q.put({"thread": label, "ok": False,
                       "error": f"{type(e).__name__}: {e}",
                       "elapsed_ms": int((time.time() - t0) * 1000)})

        threads = [
            threading.Thread(target=do_mark_complete, args=(barrier, "click1")),
            threading.Thread(target=do_mark_complete, args=(barrier, "click2")),
        ]
        for t in threads: t.start()
        for t in threads: t.join(timeout=15)
        results = [q.get_nowait() for _ in range(2)]
        r.db_dumps["thread_results"] = results

        time.sleep(1.0)
        # 统计 pending handoffs from_task=task.id
        hs = pb_get("/api/collections/handoffs/records", mgr1["token"], {
            "perPage": 50,
            "filter": f'from_task="{task["id"]}" && status="pending"',
        })
        r.db_dumps["pending_handoffs_count"] = hs.get("totalItems", 0)
        r.notes.append(f"pending handoffs from this task: {hs.get('totalItems', 0)}")

        if hs.get("totalItems", 0) > 1:
            ids = [h["id"] for h in hs.get("items", [])]
            r.error = (f"DUPLICATE HANDOFF: 二次点击产生 {hs.get('totalItems')} 个 pending handoff: {ids}。"
                       f"复现: 两线程同时对 task={task['id']} 跑 useMarkTaskComplete。"
                       "建议: useMarkTaskComplete 应先查询是否已有 pending handoff from_task=taskId，"
                       "或前端按钮加 mutation.isPending disable，或 PB rule 限制每 task 只能有 1 个 pending handoff。")
            return r
        r.passed = True
    except Exception as e:
        r.error = f"exception: {type(e).__name__}: {e}"
    return r


# ============================================================
# Scenario C4 — 并发拖拽 sequence
# ============================================================
def c4_concurrent_drag_sequence(mgr1: dict, mgr2: dict, employee: dict,
                                  project_id: str) -> ScenarioResult:
    r = ScenarioResult(name="C4_concurrent_drag_sequence")
    try:
        # 建 4 个 task (A, B, C, D)，初始 sequence = 100, 200, 300, 400
        tasks = []
        for i, label in enumerate("ABCD"):
            t = pb_post("/api/collections/tasks/records", mgr1["token"], {
                "project": project_id,
                "stage_name": f"{TEST_PREFIX}C4-{label}",
                "description": f"C4 drag — {label}",
                "status": "pending",
                "deadline": "2026-07-30 23:59:59.000Z",
                "assignees": [employee["record"]["id"]],
                "priority": "normal",
                "created_by": mgr1["record"]["id"],
                "sequence": (i + 1) * 100,
            })
            tasks.append(t)
            CLEANUP_IDS["tasks"].append(t["id"])
        r.notes.append(f"setup 4 tasks: {[t['id'] for t in tasks]}")

        # mgr1 想把 A 拖到末尾 → A=500, B=100, C=200, D=300
        # mgr2 同时把 D 拖到最前 → A=200, B=300, C=400, D=100
        # 两个 manager 同时发 batch PATCH
        barrier = threading.Barrier(2)
        q: Queue = Queue()
        updates_mgr1 = [(tasks[0]["id"], 500), (tasks[1]["id"], 100),
                        (tasks[2]["id"], 200), (tasks[3]["id"], 300)]
        updates_mgr2 = [(tasks[0]["id"], 200), (tasks[1]["id"], 300),
                        (tasks[2]["id"], 400), (tasks[3]["id"], 100)]

        def do_batch_update(barrier, token, updates, label):
            barrier.wait()
            t0 = time.time()
            try:
                for tid, seq in updates:
                    pb_patch(f"/api/collections/tasks/records/{tid}",
                              token, {"sequence": seq})
                q.put({"thread": label, "ok": True,
                       "elapsed_ms": int((time.time() - t0) * 1000)})
            except Exception as e:
                q.put({"thread": label, "ok": False,
                       "error": f"{type(e).__name__}: {e}",
                       "elapsed_ms": int((time.time() - t0) * 1000)})

        threads = [
            threading.Thread(target=do_batch_update, args=(
                barrier, mgr1["token"], updates_mgr1, "mgr1")),
            threading.Thread(target=do_batch_update, args=(
                barrier, mgr2["token"], updates_mgr2, "mgr2")),
        ]
        for t in threads: t.start()
        for t in threads: t.join(timeout=20)

        results = [q.get_nowait() for _ in range(2)]
        r.db_dumps["thread_results"] = results
        time.sleep(0.5)

        final_seqs = {}
        for t in tasks:
            cur = pb_get(f"/api/collections/tasks/records/{t['id']}",
                          mgr1["token"])
            final_seqs[t["stage_name"]] = cur.get("sequence")
        r.db_dumps["final_sequences"] = final_seqs
        r.notes.append(f"final sequences: {final_seqs}")

        # 验证：是否所有 task sequence 都是某一线程的最终值（last-writer-wins）
        # 不一致是允许的（last-writer-wins），但若某些 task 取 mgr1 某些取 mgr2，
        # 即"乱序混合"是更严重的可观察竞态。
        vals = list(final_seqs.values())
        # mgr1 末态：500, 100, 200, 300
        # mgr2 末态：200, 300, 400, 100
        is_mgr1 = vals == [500, 100, 200, 300]
        is_mgr2 = vals == [200, 300, 400, 100]
        if is_mgr1:
            r.notes.append("最终态 = mgr1 (last-writer-wins: mgr1)")
        elif is_mgr2:
            r.notes.append("最终态 = mgr2 (last-writer-wins: mgr2)")
        else:
            r.warnings.append(
                f"sequence 混合写入 — 看板顺序可能乱: {final_seqs}")

        # 也检查 sequence 是否存在唯一性问题（4 个值是否互不相等）
        if len(set(vals)) < len(vals):
            r.warnings.append(
                f"final sequences 有重复: {vals} — 拖拽看板会出现并列位置")

        # 检查 audit_log reorder_tasks 是否双写
        logs = pb_get("/api/collections/audit_logs/records", mgr1["token"], {
            "perPage": 20, "sort": "-created",
            "filter": f'project="{project_id}" && action_type="reorder_tasks"',
        })
        # 注意：本测试直接 PATCH 而非通过前端，所以没有 reorder_tasks audit_log
        # 这只是 sanity check
        r.db_dumps["reorder_audit_count"] = logs.get("totalItems", 0)
        r.notes.append(f"reorder_tasks audit_logs count: {logs.get('totalItems', 0)} (本测试直接 PATCH，预期 0)")

        r.passed = True
    except Exception as e:
        r.error = f"exception: {type(e).__name__}: {e}"
    return r


# ============================================================
# Scenario C5 — PB hook reject mark_complete 与 approve handoff 竞速
# ============================================================
def c5_audit_reject_vs_approve(mgr1: dict, mgr2: dict, employee: dict,
                                 project_id: str) -> ScenarioResult:
    r = ScenarioResult(name="C5_audit_reject_vs_approve")
    try:
        # setup: task → completed + handoff pending + audit_log mark_complete pending review
        task = setup_task(mgr1, employee, project_id, "C5-vs-audit", 99505)
        handoff = setup_handoff_pending(employee, task, employee["record"]["id"])
        # review_status 默认 unread；PB enum: unread|read|approved|rejected
        audit = pb_post("/api/collections/audit_logs/records", employee["token"], {
            "project": task["project"], "task": task["id"],
            "action_type": "mark_complete",
            "operator": employee["record"]["id"],
            "after_data": {"handoff_id": handoff["id"]},
        })
        CLEANUP_IDS["audit_logs"].append(audit["id"])
        r.notes.append(f"setup: task={task['id']} handoff={handoff['id']} audit={audit['id']}")

        # 同时：mgr1 拒绝 mark_complete audit_log → PB hook 应该回滚 task 到 in_progress
        #       + 把 pending handoffs 标 rejected
        # mgr2 同时 approve handoff → 前端 useApproveHandoff 走 createTask + 更新 handoff
        barrier = threading.Barrier(2)
        q: Queue = Queue()
        threads = [
            threading.Thread(target=threaded_patch, args=(
                barrier, f"/api/collections/audit_logs/records/{audit['id']}",
                mgr1["token"], {"review_status": "rejected",
                                 "reviewer": mgr1["record"]["id"],
                                 "review_note": "C5 拒绝"}, q, "reject_audit")),
            threading.Thread(target=threaded_patch, args=(
                barrier, f"/api/collections/handoffs/records/{handoff['id']}",
                mgr2["token"], {"status": "approved",
                                 "reviewer": mgr2["record"]["id"],
                                 "review_note": "C5 approve"}, q, "approve_handoff")),
        ]
        for t in threads: t.start()
        for t in threads: t.join(timeout=15)

        results = [q.get_nowait() for _ in range(2)]
        r.db_dumps["thread_results"] = [
            {"thread": x["thread"], "ok": x["ok"],
             "error": x.get("error", "")[:200],
             "elapsed_ms": x["elapsed_ms"]} for x in results
        ]

        # 等 hook chain 收敛 — audit reject hook 会 cancel pending handoffs，
        # 但 handoff 可能已被 mgr2 approved，state 可能矛盾
        time.sleep(2.0)

        handoff_final = pb_get(f"/api/collections/handoffs/records/{handoff['id']}",
                                mgr1["token"])
        task_final = pb_get(f"/api/collections/tasks/records/{task['id']}",
                             mgr1["token"])
        audit_final = pb_get(f"/api/collections/audit_logs/records/{audit['id']}",
                              mgr1["token"])

        r.db_dumps["handoff_final"] = {"status": handoff_final["status"],
                                        "approved_task": handoff_final.get("approved_task")}
        r.db_dumps["task_final"] = {"status": task_final["status"],
                                     "blocker": bool(task_final.get("blocker"))}
        r.db_dumps["audit_final"] = {"review_status": audit_final.get("review_status")}

        r.notes.append(f"handoff final: {handoff_final['status']}, "
                        f"task final: {task_final['status']}, "
                        f"audit final: {audit_final.get('review_status')}")

        # 看下是否有下游 task 被创建（pre*=task.id）
        downstream = pb_get("/api/collections/tasks/records", mgr1["token"], {
            "perPage": 20, "filter": f'predecessor_tasks~"{task["id"]}"',
        })
        r.db_dumps["downstream_count"] = downstream.get("totalItems", 0)
        for t in downstream.get("items", []):
            CLEANUP_IDS["tasks"].append(t["id"])

        # 判定矛盾态：
        # - audit=rejected 表示该次 mark_complete 被否决 → handoff 应被 hook cancel → status='rejected'
        # - 若同时 handoff=approved，说明 mgr2 approve 跑赢了 hook → 状态自洽性破裂
        # 这是设计上的真竞态，需要 PB rule 或 hook 二次校验来防御
        approved_after_reject = (
            audit_final.get("review_status") == "rejected"
            and handoff_final["status"] == "approved"
        )
        if approved_after_reject:
            r.warnings.append(
                "RACE: audit_log.mark_complete=rejected 但 handoff=approved。"
                "audit_logs_reject_sync.pb.js cancel pending handoffs 跑得比 mgr2 approve 慢，"
                "导致 mgr2 approve 先把 handoff 置 approved → hook 不会回滚 approved handoff。"
                f"复现: 同时 PATCH audit_logs/{audit['id']} review_status=rejected 与 "
                f"PATCH handoffs/{handoff['id']} status=approved。"
                "建议: PB rule for handoffs 限制 status='approved' 时必须 from_task.status='completed' "
                "且 from_task 没有 review_status='rejected' 的 mark_complete audit_log；"
                "或前端 approveHandoff 之前 reload audit_log 确认未被拒。")
            # WARN 不是 FAIL — 这是已知设计限制
        if approved_after_reject and downstream.get("totalItems", 0) > 0:
            r.error = (
                f"严重: 上述竞态下还创建了 {downstream.get('totalItems')} 个下游任务，"
                "数据完整性受损（已废弃的 mark_complete 衍生出了下游任务）。")
            return r
        r.passed = True
    except Exception as e:
        r.error = f"exception: {type(e).__name__}: {e}"
    return r


# ============================================================
# Cleanup
# ============================================================
def cleanup(admin_token: str) -> dict:
    """逆序删除测试数据。"""
    stats = {"tasks": 0, "handoffs": 0, "audit_logs": 0,
             "notifications": 0, "errors": []}

    # 先删 handoffs (引用 tasks)
    for hid in set(CLEANUP_IDS["handoffs"]):
        code = pb_delete(f"/api/collections/handoffs/records/{hid}", admin_token)
        if code in (204, 404):
            stats["handoffs"] += 1
        else:
            stats["errors"].append(f"handoff {hid}: HTTP {code}")

    # audit_logs
    for aid in set(CLEANUP_IDS["audit_logs"]):
        code = pb_delete(f"/api/collections/audit_logs/records/{aid}", admin_token)
        if code in (204, 404):
            stats["audit_logs"] += 1
        else:
            stats["errors"].append(f"audit {aid}: HTTP {code}")

    # 还要清测试 prefix 的 audit_logs（hook 自动创建的）
    try:
        more_audit = pb_get("/api/collections/audit_logs/records", admin_token, {
            "perPage": 200,
            "filter": f'action_type="reorder_tasks" || action_type="approve_handoff" || action_type="reject_handoff"',
            "sort": "-created",
        })
        # 只清和我们测试 task 相关的（task 字段在 CLEANUP_IDS["tasks"] 列表里）
        test_task_ids = set(CLEANUP_IDS["tasks"])
        for log in more_audit.get("items", []):
            if log.get("task") in test_task_ids:
                code = pb_delete(f"/api/collections/audit_logs/records/{log['id']}",
                                  admin_token)
                if code in (204, 404):
                    stats["audit_logs"] += 1
    except Exception as e:
        stats["errors"].append(f"audit_logs cleanup query: {e}")

    # 再删 tasks
    for tid in set(CLEANUP_IDS["tasks"]):
        # 先删该 task 上的关联 handoff/audit
        try:
            hs = pb_get("/api/collections/handoffs/records", admin_token, {
                "perPage": 20, "filter": f'from_task="{tid}"',
            })
            for h in hs.get("items", []):
                pb_delete(f"/api/collections/handoffs/records/{h['id']}", admin_token)
        except Exception:
            pass
        try:
            audits = pb_get("/api/collections/audit_logs/records", admin_token, {
                "perPage": 20, "filter": f'task="{tid}"',
            })
            for a in audits.get("items", []):
                pb_delete(f"/api/collections/audit_logs/records/{a['id']}", admin_token)
        except Exception:
            pass
        code = pb_delete(f"/api/collections/tasks/records/{tid}", admin_token)
        if code in (204, 404):
            stats["tasks"] += 1
        else:
            stats["errors"].append(f"task {tid}: HTTP {code}")

    # 清测试 prefix 的 notifications
    try:
        nots = pb_get("/api/collections/notifications/records", admin_token, {
            "perPage": 200,
            "filter": f'content~"{TEST_PREFIX[:18]}"',
        })
        for n in nots.get("items", []):
            code = pb_delete(f"/api/collections/notifications/records/{n['id']}",
                              admin_token)
            if code in (204, 404):
                stats["notifications"] += 1
    except Exception as e:
        stats["errors"].append(f"notifs cleanup: {e}")

    return stats


# ============================================================
# main
# ============================================================
def main() -> int:
    print(f"=== E2E Concurrent test starting, prefix={TEST_PREFIX} ===\n")
    try:
        mgr1 = pb_login(ROLES["MANAGER"]["username"])
        mgr2 = pb_login(ROLES["MANAGER2"]["username"])
        employee = pb_login(ROLES["EMPLOYEE"]["username"])
        admin = pb_login(ROLES["ADMIN"]["username"])
    except Exception as e:
        print(f"FATAL: cannot login: {e}")
        return 1

    project = find_project(mgr1)
    if not project:
        print("FATAL: no active project")
        return 1
    print(f"using project: {project['name']} ({project['id']})\n")
    project_id = project["id"]

    scenarios = [
        ("C1", lambda: c1_double_approve_handoff(mgr1, mgr2, employee, project_id)),
        ("C2", lambda: c2_approve_vs_block(mgr1, employee, project_id)),
        ("C3", lambda: c3_double_mark_complete(mgr1, employee, project_id)),
        ("C4", lambda: c4_concurrent_drag_sequence(mgr1, mgr2, employee, project_id)),
        ("C5", lambda: c5_audit_reject_vs_approve(mgr1, mgr2, employee, project_id)),
    ]

    for label, fn in scenarios:
        print(f"--- {label} ---")
        t0 = time.time()
        try:
            res = fn()
        except Exception as e:
            res = ScenarioResult(name=f"{label}_outer_fail",
                                  error=f"outer exception: {e}")
        res.notes.append(f"elapsed: {int((time.time() - t0) * 1000)}ms")
        ALL_RESULTS.append(res)
        status = ("PASS" if res.passed and not res.warnings
                   else ("WARN" if res.passed else ("INCONCLUSIVE" if res.inconclusive else "FAIL")))
        print(f"  {status}: {res.error or 'ok'}")
        for n in res.notes:
            print(f"    · {n}")
        for w in res.warnings:
            print(f"    ! WARN: {w}")
        print()

    # cleanup
    print("--- cleanup ---")
    cleanup_stats = cleanup(admin["token"])
    print(f"  deleted: tasks={cleanup_stats['tasks']} "
          f"handoffs={cleanup_stats['handoffs']} "
          f"audit_logs={cleanup_stats['audit_logs']} "
          f"notifications={cleanup_stats['notifications']}")
    if cleanup_stats["errors"]:
        print(f"  cleanup errors: {cleanup_stats['errors'][:5]}")

    # 落盘结果
    out_json = OUT_DIR / "e2e_concurrent_results.json"
    out_json.write_text(json.dumps([{
        "name": r.name,
        "passed": r.passed,
        "inconclusive": r.inconclusive,
        "error": r.error,
        "warnings": r.warnings,
        "notes": r.notes,
        "db_dumps": r.db_dumps,
    } for r in ALL_RESULTS], ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nresults JSON: {out_json}")

    passed = sum(1 for r in ALL_RESULTS if r.passed and not r.warnings)
    warn = sum(1 for r in ALL_RESULTS if r.passed and r.warnings)
    fail = sum(1 for r in ALL_RESULTS if not r.passed and not r.inconclusive)
    print(f"\n=== Summary: {passed} PASS / {warn} WARN / {fail} FAIL "
          f"/ {len(ALL_RESULTS)} total ===")

    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
