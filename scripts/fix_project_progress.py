"""
一次性修复所有 projects.total_tasks / completed_tasks / progress 字段
(Bug I9: PB hook 尚未稳定，先用脚本同步真实值。)

依赖：admin user (admin_boss / 12345678) 可写 projects。

用法：
    PYTHONIOENCODING=utf-8 PYTHONUTF8=1 python scripts/fix_project_progress.py
"""
import json
import sys
import urllib.parse
import urllib.request

PB = "http://127.0.0.1:8090"
ADMIN_USER = {"identity": "admin_boss", "password": "12345678"}


def http_post(path: str, body: dict, token: str | None = None) -> dict:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = token
    req = urllib.request.Request(
        f"{PB}{path}",
        data=json.dumps(body).encode(),
        headers=headers,
        method="POST",
    )
    return json.loads(urllib.request.urlopen(req).read())


def http_get(path: str, token: str) -> dict:
    req = urllib.request.Request(f"{PB}{path}", headers={"Authorization": token})
    return json.loads(urllib.request.urlopen(req).read())


def http_patch(path: str, body: dict, token: str) -> dict:
    req = urllib.request.Request(
        f"{PB}{path}",
        data=json.dumps(body).encode(),
        headers={"Authorization": token, "Content-Type": "application/json"},
        method="PATCH",
    )
    return json.loads(urllib.request.urlopen(req).read())


def main() -> int:
    print("[1/3] login admin_boss")
    auth = http_post("/api/collections/users/auth-with-password", ADMIN_USER)
    token = auth["token"]
    print(f"      OK, role={auth['record']['role']}")

    print("[2/3] list all projects")
    projects = http_get("/api/collections/projects/records?perPage=100&fields=id,name,total_tasks,completed_tasks,progress", token)["items"]
    print(f"      {len(projects)} projects")

    print("[3/3] recompute and patch each project")
    changes = 0
    for p in projects:
        pid = p["id"]
        name = p["name"][:30]
        # Count real values
        flt_all = urllib.parse.quote(f'project="{pid}"')
        total = http_get(f"/api/collections/tasks/records?perPage=1&fields=id&filter={flt_all}", token)["totalItems"]
        flt_done = urllib.parse.quote(f'project="{pid}" && status="completed"')
        done = http_get(f"/api/collections/tasks/records?perPage=1&fields=id&filter={flt_done}", token)["totalItems"]
        progress = round((done / total * 100), 1) if total > 0 else 0

        old_total = p.get("total_tasks", 0) or 0
        old_done = p.get("completed_tasks", 0) or 0
        old_prog = p.get("progress", 0) or 0

        if (old_total, old_done, old_prog) == (total, done, progress):
            print(f"  ✓ {name:30s} (no change: t={total}, d={done}, p={progress})")
            continue

        try:
            http_patch(f"/api/collections/projects/records/{pid}",
                       {"total_tasks": total, "completed_tasks": done, "progress": progress},
                       token)
            print(f"  ✏️ {name:30s} (t={old_total}→{total}, d={old_done}→{done}, p={old_prog}→{progress})")
            changes += 1
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            print(f"  ❌ {name:30s} FAILED: HTTP {e.code} {body}")

    print(f"\nDone. {changes}/{len(projects)} projects updated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
