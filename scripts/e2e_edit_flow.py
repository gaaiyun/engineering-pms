r"""
E2E 任务编辑 + 批量编辑 + sequence 拖拽 流程测试 — Agent F
E1..E5: 单条 stage_name / deadline+assignees / batch 4 / sequence drag / audit 完整性
"""
from __future__ import annotations
import io, json, sys, time, urllib.error, urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", line_buffering=True)
except Exception:
    pass

PB_URL = "http://127.0.0.1:8090"
PASSWORD = "12345678"
ROLES = {"MANAGER": "zhang_manager", "EMPLOYEE": "zhao_site",
         "EMPLOYEE2": "chen_doc", "ADMIN": "admin_boss"}
TEST_PREFIX = f"E2E-Edit-{int(time.time())}-"


@dataclass
class R:
    name: str
    passed: bool = False
    error: str = ""
    notes: list[str] = field(default_factory=list)
    dumps: dict[str, Any] = field(default_factory=dict)


ALL: list[R] = []
ST: dict[str, Any] = {}
BUGS: list[dict[str, str]] = []


# ---- PB helpers ----
def _req(method: str, path: str, token: str = "", body: dict | None = None,
         params: dict | None = None) -> dict | int:
    url = PB_URL + path + (("?" + urlencode(params)) if params else "")
    headers = {"Authorization": token} if token else {}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, method=method, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            if method == "DELETE":
                return r.status
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if method == "DELETE":
            return e.code
        raise RuntimeError(f"{method} {path} HTTP {e.code}: {e.read().decode(errors='ignore')[:200]}")


login = lambda i: _req("POST", "/api/collections/users/auth-with-password",
                        body={"identity": i, "password": PASSWORD})
get = lambda p, t="", params=None: _req("GET", p, t, params=params)
post = lambda p, t, b: _req("POST", p, t, body=b)
patch = lambda p, t, b: _req("PATCH", p, t, body=b)
delete = lambda p, t: _req("DELETE", p, t)


# ---- simulate frontend mutations ----
def _try_notify(token, user, type_, title, content, lt, lid):
    try:
        post("/api/collections/notifications/records", token,
             {"user": user, "type": type_, "title": title, "content": content,
              "link_type": lt, "link_id": lid})
    except Exception:
        pass


def sim_update_task(token: str, op_id: str, tid: str, data: dict, members: list[str]) -> None:
    """模拟 lib/api.ts:432 useUpdateTask 副作用。"""
    before = get(f"/api/collections/tasks/records/{tid}", token)
    patch(f"/api/collections/tasks/records/{tid}", token, data)
    post("/api/collections/audit_logs/records", token, {
        "project": before["project"], "task": tid, "action_type": "update_task",
        "operator": op_id, "after_data": data,
        "before_data": {k: before.get(k) for k in ("status", "stage_name", "assignees", "deadline")},
    })
    changes = []
    if data.get("status") and data["status"] != before.get("status"): changes.append("状态")
    if data.get("stage_name") and data["stage_name"] != before.get("stage_name"): changes.append("名称")
    if "assignees" in data: changes.append("人员")
    if "deadline" in data: changes.append("时间")
    if changes:
        content = f"修改了「{before['stage_name']}」: {'、'.join(changes)}"
        for m in members:
            if m != op_id:
                _try_notify(token, m, "task_update", "任务变更", content, "task", tid)


def sim_batch_save(token: str, op_id: str, pid: str, tasks: list[dict],
                   members: list[str]) -> list[dict]:
    """模拟 lib/api.ts:1374 useBatchSaveTasks。"""
    results, reassigned = [], []
    for t in tasks:
        if not (t.get("stage_name") or "").strip():
            continue
        if t.get("id"):
            prev = None
            try:
                prev = get(f"/api/collections/tasks/records/{t['id']}", token)
            except Exception:
                pass
            r = patch(f"/api/collections/tasks/records/{t['id']}", token, {
                "stage_name": t["stage_name"], "assignees": t["assignees"],
                "start_date": t.get("start_date") or None,
                "deadline": t.get("deadline") or None,
            })
            prev_a = (prev or {}).get("assignees") or []
            added = [a for a in (t.get("assignees") or []) if a not in prev_a]
            if added:
                reassigned.append((t["id"], t["stage_name"], added))
            results.append(r)
        else:
            r = post("/api/collections/tasks/records", token, {
                "project": pid, "stage_name": t["stage_name"],
                "assignees": t["assignees"], "deadline": t.get("deadline"),
                "start_date": t.get("start_date") or "2026-05-16T00:00:00.000Z",
                "status": "pending", "created_by": op_id,
                "sequence": int(time.time() * 1000) + len(results),
            })
            results.append(r)
    post("/api/collections/audit_logs/records", token, {
        "project": pid, "action_type": "batch_edit_tasks", "operator": op_id,
        "after_data": {"count": len(results)},
    })
    for m in members:
        if m != op_id:
            _try_notify(token, m, "task_update", "任务批量更新",
                        f"批量编辑了 {len(results)} 个任务", "project", pid)
    for tid, sn, adds in reassigned:
        for a in adds:
            if a != op_id:
                _try_notify(token, a, "task_assigned", "你被加入了任务",
                            f"你被加入了任务「{sn}」", "task", tid)
    return results


# ---- Scenarios ----
def e1_edit_stage_name(mgr: dict) -> R:
    r = R("E1_edit_stage_name")
    try:
        p = ST["project"]
        task = post("/api/collections/tasks/records", mgr["token"], {
            "project": p["id"], "stage_name": f"{TEST_PREFIX}E1-原名",
            "status": "pending", "deadline": "2026-06-30 23:59:59.000Z",
            "assignees": [ST["emp1"]["record"]["id"]], "priority": "normal",
            "created_by": mgr["record"]["id"], "sequence": 91001,
        })
        ST["E1_id"] = task["id"]
        r.notes.append(f"created {task['id']} '{task['stage_name']}'")
        new_name = f"{TEST_PREFIX}E1-改后"
        sim_update_task(mgr["token"], mgr["record"]["id"], task["id"],
                        {"stage_name": new_name}, p.get("members") or [])
        after = get(f"/api/collections/tasks/records/{task['id']}", mgr["token"])
        r.dumps["stage_name_after"] = after["stage_name"]
        if after["stage_name"] != new_name:
            r.error = f"stage_name not updated: {after['stage_name']}"
            return r
        logs = get("/api/collections/audit_logs/records", mgr["token"], {
            "perPage": 3, "sort": "-created",
            "filter": f'task="{task["id"]}" && action_type="update_task"'})
        r.dumps["audit_logs"] = logs.get("totalItems", 0)
        if logs["totalItems"] == 0:
            r.error = "no update_task audit_log"
            return r
        bd = logs["items"][0].get("before_data") or {}
        ad = logs["items"][0].get("after_data") or {}
        r.dumps["before_after"] = {"before.stage_name": bd.get("stage_name"),
                                    "after.stage_name": ad.get("stage_name")}
        r.notes.append(f"audit before='{bd.get('stage_name')}', after='{ad.get('stage_name')}'")
        notifs = get("/api/collections/notifications/records", ST["emp1"]["token"], {
            "perPage": 3, "filter": f'link_id="{task["id"]}" && type="task_update"'})
        r.dumps["notifications"] = notifs.get("totalItems", 0)
        r.notes.append(f"emp1 task_update notifs: {notifs['totalItems']}")
        r.passed = True
    except Exception as e:
        r.error = f"{type(e).__name__}: {e}"
    return r


def e2_edit_deadline_assignees(mgr: dict) -> R:
    r = R("E2_edit_deadline_assignees")
    try:
        p = ST["project"]
        task = post("/api/collections/tasks/records", mgr["token"], {
            "project": p["id"], "stage_name": f"{TEST_PREFIX}E2-改截止与人员",
            "status": "pending", "deadline": "2026-06-15 23:59:59.000Z",
            "assignees": [ST["emp1"]["record"]["id"]], "priority": "normal",
            "created_by": mgr["record"]["id"], "sequence": 91002,
        })
        ST["E2_id"] = task["id"]
        new_deadline = "2026-08-15 23:59:59.000Z"
        new_a = [ST["emp1"]["record"]["id"], ST["emp2"]["record"]["id"]]
        sim_update_task(mgr["token"], mgr["record"]["id"], task["id"],
                        {"deadline": new_deadline, "assignees": new_a},
                        p.get("members") or [])
        after = get(f"/api/collections/tasks/records/{task['id']}", mgr["token"])
        r.dumps["after"] = {"deadline": after["deadline"][:10], "assignees": after["assignees"]}
        if not after["deadline"].startswith("2026-08-15"):
            r.error = f"deadline not updated: {after['deadline']}"
            return r
        if set(after["assignees"]) != set(new_a):
            r.error = f"assignees mismatch: {after['assignees']}"
            return r
        r.notes.append(f"deadline → {after['deadline'][:10]}, assignees → {after['assignees']}")
        logs = get("/api/collections/audit_logs/records", mgr["token"], {
            "perPage": 3, "sort": "-created",
            "filter": f'task="{task["id"]}" && action_type="update_task"'})
        r.dumps["audit_logs"] = logs.get("totalItems", 0)
        if logs["totalItems"] == 0:
            r.error = "missing audit_log"
            return r
        notifs = get("/api/collections/notifications/records", ST["emp2"]["token"], {
            "perPage": 3, "filter": f'link_id="{task["id"]}" && type="task_update"'})
        r.dumps["emp2_notifs"] = notifs.get("totalItems", 0)
        r.notes.append(f"emp2 task_update notifs: {notifs['totalItems']}")
        if ST["emp2"]["record"]["id"] not in (p.get("members") or []):
            r.notes.append("WARN: emp2 不在项目成员中，应不会收到 notifyProjectMembers")
        r.passed = True
    except Exception as e:
        r.error = f"{type(e).__name__}: {e}"
    return r


def e3_batch_save(mgr: dict) -> R:
    r = R("E3_batch_save")
    try:
        p = ST["project"]
        existing = post("/api/collections/tasks/records", mgr["token"], {
            "project": p["id"], "stage_name": f"{TEST_PREFIX}E3-原有",
            "status": "pending", "deadline": "2026-06-01 23:59:59.000Z",
            "assignees": [ST["emp1"]["record"]["id"]],
            "created_by": mgr["record"]["id"], "sequence": 91003,
        })
        ST["E3_existing"] = existing["id"]
        e1id, e2id = ST["emp1"]["record"]["id"], ST["emp2"]["record"]["id"]
        batch = [
            {"id": existing["id"], "stage_name": f"{TEST_PREFIX}E3-原有-改后",
             "assignees": [e1id, e2id], "deadline": "2026-07-10 23:59:59.000Z"},
            {"stage_name": f"{TEST_PREFIX}E3-新-1", "assignees": [e1id],
             "deadline": "2026-06-15 23:59:59.000Z"},
            {"stage_name": f"{TEST_PREFIX}E3-新-2", "assignees": [e2id],
             "deadline": "2026-06-20 23:59:59.000Z"},
            {"stage_name": f"{TEST_PREFIX}E3-新-3", "assignees": [e1id, e2id],
             "deadline": "2026-06-25 23:59:59.000Z"},
        ]
        before = get("/api/collections/audit_logs/records", mgr["token"], {
            "perPage": 1, "filter": 'action_type="batch_edit_tasks"'}).get("totalItems", 0)
        results = sim_batch_save(mgr["token"], mgr["record"]["id"], p["id"],
                                  batch, p.get("members") or [])
        r.dumps["count"] = len(results)
        if len(results) != 4:
            r.error = f"expected 4, got {len(results)}"
            return r
        u = get(f"/api/collections/tasks/records/{existing['id']}", mgr["token"])
        r.dumps["updated"] = {"stage_name": u["stage_name"], "assignees": u["assignees"],
                              "deadline": u["deadline"][:10]}
        if "改后" not in u["stage_name"] or e2id not in u["assignees"]:
            r.error = f"existing task wrong state: {r.dumps['updated']}"
            return r
        new_tasks = get("/api/collections/tasks/records", mgr["token"], {
            "perPage": 10,
            "filter": f'project="{p["id"]}" && stage_name~"{TEST_PREFIX}E3-新"'})
        r.dumps["new_count"] = new_tasks.get("totalItems", 0)
        if new_tasks["totalItems"] != 3:
            r.error = f"expected 3 new, got {new_tasks['totalItems']}"
            return r
        ST["E3_new"] = [t["id"] for t in new_tasks["items"]]
        after = get("/api/collections/audit_logs/records", mgr["token"], {
            "perPage": 1, "filter": 'action_type="batch_edit_tasks"'}).get("totalItems", 0)
        r.dumps["batch_audit_diff"] = after - before
        r.notes.append(f"batch_edit_tasks audit +{after - before} (expect +1)")
        if after - before != 1:
            r.notes.append("WARN: batch audit_log 异常")
        n = get("/api/collections/notifications/records", ST["emp2"]["token"], {
            "perPage": 3,
            "filter": f'link_id="{existing["id"]}" && type="task_assigned"'})
        r.dumps["emp2_task_assigned"] = n.get("totalItems", 0)
        r.notes.append(f"emp2 task_assigned for existing: {n['totalItems']}")
        r.passed = True
    except Exception as e:
        r.error = f"{type(e).__name__}: {e}"
    return r


def e4_sequence_drag(mgr: dict) -> R:
    """直接 PATCH sequence，模拟 useUpdateTaskSequence 当前实现（lib/api.ts:480）。"""
    r = R("E4_sequence_drag")
    try:
        p = ST["project"]
        ids = []
        for i in range(3):
            t = post("/api/collections/tasks/records", mgr["token"], {
                "project": p["id"], "stage_name": f"{TEST_PREFIX}E4-seq-{i+1}",
                "status": "pending", "assignees": [ST["emp1"]["record"]["id"]],
                "created_by": mgr["record"]["id"],
                "deadline": "2026-06-30 23:59:59.000Z", "sequence": 92000 + i,
            })
            ids.append(t["id"])
        ST["E4_ids"] = ids
        new_order = [(ids[2], 1), (ids[0], 2), (ids[1], 3)]
        for tid, seq in new_order:
            patch(f"/api/collections/tasks/records/{tid}", mgr["token"],
                  {"sequence": seq})
        after_seq = {}
        for tid, exp in new_order:
            t = get(f"/api/collections/tasks/records/{tid}", mgr["token"])
            after_seq[tid] = t["sequence"]
            if t["sequence"] != exp:
                r.error = f"sequence not updated: {tid} got {t['sequence']}"
                return r
        r.dumps["after_seq"] = after_seq
        r.notes.append(f"3 sequences updated: {list(after_seq.values())}")
        seq_logs = get("/api/collections/audit_logs/records", mgr["token"], {
            "perPage": 10, "sort": "-created",
            "filter": (f'project="{p["id"]}" && (action_type="update_sequence" || '
                       f'action_type="reorder_tasks" || action_type~"sequence")')})
        r.dumps["seq_audit"] = seq_logs.get("totalItems", 0)
        per_task = sum(get("/api/collections/audit_logs/records", mgr["token"], {
            "perPage": 3, "filter": f'task="{tid}"'}).get("totalItems", 0) for tid in ids)
        r.dumps["per_task_audit"] = per_task
        r.notes.append(f"sequence audit_logs: {r.dumps['seq_audit']}; per_task: {per_task}")
        notifs = get("/api/collections/notifications/records", ST["emp1"]["token"], {
            "perPage": 10,
            "filter": (f'(link_id="{ids[0]}" || link_id="{ids[1]}" || link_id="{ids[2]}")')})
        r.dumps["seq_notifs"] = notifs.get("totalItems", 0)
        r.notes.append(f"emp1 notifs for seq tasks: {notifs['totalItems']}")
        if r.dumps["seq_audit"] == 0 and per_task == 0:
            BUGS.append({
                "severity": "P2",
                "title": "useUpdateTaskSequence 不写 audit_log",
                "file": "frontend/src/lib/api.ts:480",
                "evidence": f"3 sequence 改动后 sequence-type audit_logs=0, per-task audit_logs=0",
                "fix": ("mutationFn 中 await Promise.all(updates) 后，写一条 "
                        "action_type='reorder_tasks' 的 audit_log，after_data 含 updates 数组"),
            })
            r.notes.append("[CONFIRM] Bug #7: sequence 不写 audit_log")
        if notifs.get("totalItems", 0) == 0:
            r.notes.append("[CONFIRM] Bug #7: sequence 不发通知")
        r.passed = True
    except Exception as e:
        r.error = f"{type(e).__name__}: {e}"
    return r


def e5_audit_integrity(mgr: dict) -> R:
    r = R("E5_audit_integrity")
    try:
        p = ST["project"]
        relevant_tids = {ST.get("E1_id"), ST.get("E2_id"),
                         ST.get("E3_existing"), *(ST.get("E3_new") or []),
                         *(ST.get("E4_ids") or [])}
        relevant_tids.discard(None)
        logs = get("/api/collections/audit_logs/records", mgr["token"], {
            "perPage": 100, "sort": "-created",
            "filter": f'project="{p["id"]}"'})
        by_action: dict[str, int] = {}
        # 只看 prefix 内的：通过 task_id 或时间窗口
        prefix_seconds = int(TEST_PREFIX.split("-")[2])
        for it in logs["items"]:
            tid = it.get("task", "")
            at = it.get("action_type", "?")
            include = False
            if tid and tid in relevant_tids:
                include = True
            elif not tid and at == "batch_edit_tasks":
                # 比较 created 时间 (字符串 ISO 字典序可比)
                created = it.get("created", "")
                # 当前 batch 是这次测试的（粗略：取最近 1 条）
                ad = it.get("after_data") or {}
                if isinstance(ad, dict) and ad.get("count") == 4:
                    include = True
            if include:
                by_action[at] = by_action.get(at, 0) + 1
        r.dumps["breakdown"] = by_action
        r.notes.append(f"breakdown: {by_action}")
        missing = []
        for k, v in {"update_task": 2, "batch_edit_tasks": 1}.items():
            if by_action.get(k, 0) < v:
                missing.append(f"{k}>={v} got {by_action.get(k, 0)}")
        if missing:
            r.error = "audit log expectations not met: " + "; ".join(missing)
            return r
        seq_audit = by_action.get("update_sequence", 0) + by_action.get("reorder_tasks", 0)
        r.dumps["seq_audit"] = seq_audit
        r.notes.append(f"sequence audit: {seq_audit} (Bug #7 expect 3 got 0)")
        r.passed = True
    except Exception as e:
        r.error = f"{type(e).__name__}: {e}"
    return r


def cleanup():
    print("\n=== cleanup ===")
    try:
        tok = login(ROLES["ADMIN"])["token"]
    except Exception as e:
        print(f"  admin login fail: {e}"); return
    try:
        ts = get("/api/collections/tasks/records", tok,
                 {"perPage": 200, "filter": f'stage_name~"{TEST_PREFIX}"'})
        print(f"  tasks: {ts.get('totalItems', 0)}")
        for t in ts["items"]:
            for col, k in (("audit_logs", "task"), ("notifications", "link_id")):
                try:
                    items = get(f"/api/collections/{col}/records", tok,
                                {"perPage": 50, "filter": f'{k}="{t["id"]}"'})
                    for x in items["items"]:
                        delete(f"/api/collections/{col}/records/{x['id']}", tok)
                except Exception: pass
            delete(f"/api/collections/tasks/records/{t['id']}", tok)
        try:
            als = get("/api/collections/audit_logs/records", tok, {
                "perPage": 5, "sort": "-created",
                "filter": 'action_type="batch_edit_tasks" && task=""'})
            for al in als["items"][:3]:
                delete(f"/api/collections/audit_logs/records/{al['id']}", tok)
        except Exception: pass
    except Exception as e:
        print(f"  cleanup err: {e}")
    print("  done")


def main() -> int:
    print(f"=== Agent F edit-flow E2E, prefix={TEST_PREFIX} ===")
    mgr = login(ROLES["MANAGER"])
    ST["emp1"] = login(ROLES["EMPLOYEE"])
    ST["emp2"] = login(ROLES["EMPLOYEE2"])
    projs = get("/api/collections/projects/records", mgr["token"],
                {"perPage": 50, "filter": 'status="active"'})
    if not projs.get("items"):
        print("FATAL: no active project")
        return 2
    ST["project"] = projs["items"][0]
    p = ST["project"]
    print(f"manager: {mgr['record']['name']}, project: {p['name']} ({p['id']})")
    print(f"emp1={ST['emp1']['record']['name']}, emp2={ST['emp2']['record']['name']}, "
          f"members={len(p.get('members') or [])}")

    for sc in (e1_edit_stage_name, e2_edit_deadline_assignees, e3_batch_save,
               e4_sequence_drag, e5_audit_integrity):
        print(f"\n--- {sc.__name__} ---")
        try:
            res = sc(mgr)
        except Exception as e:
            res = R(name=sc.__name__, error=f"top: {type(e).__name__}: {e}")
        ALL.append(res)
        print(f"  {'PASS' if res.passed else 'FAIL'}: {res.error or 'ok'}")
        for n in res.notes:
            print(f"    · {n}")
        if res.dumps:
            print(f"    DUMPS: {json.dumps(res.dumps, ensure_ascii=False)[:240]}")

    cleanup()

    print("\n=== BUGS FOUND ===")
    for b in BUGS:
        print(f"  [{b['severity']}] {b['title']}\n    file: {b['file']}\n"
              f"    evidence: {b['evidence']}")

    out = Path(r"G:\项目管理软件_v2\docs\superpowers\qa-screenshots\agent_F_edit_e2e.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "prefix": TEST_PREFIX,
        "scenarios": [r.__dict__ for r in ALL], "bugs": BUGS,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"results json → {out}")
    passed = sum(1 for r in ALL if r.passed)
    print(f"=== {passed}/{len(ALL)} PASS ===")
    return 0 if passed == len(ALL) else 1


if __name__ == "__main__":
    sys.exit(main())
