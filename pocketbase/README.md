# pocketbase/ — Linux PB 二进制

`pocketbase` 是 PocketBase v0.22.x Linux amd64 二进制（40 MB），**用于上传到阿里云宝塔服务器**。

本地开发使用 `backend/pocketbase.exe`（Windows 版）。

## 部署到宝塔时

```bash
# 本地上传：
scp pocketbase/pocketbase root@<服务器IP>:/www/server/pocketbase/pocketbase

# 服务器端：
chmod +x /www/server/pocketbase/pocketbase
```

详见 [`docs/宝塔部署操作手册.md`](../docs/宝塔部署操作手册.md)。
