#!/bin/sh
set -e

# SQLite 数据目录在容器里是一个挂载卷，首次启动时挂载点的属主是 root、权限 755，
# 非 root 的运行用户无法写入。这里先以 root 身份把挂载点改归运行用户，再降权启动，
# 保证数据卷（含 -wal / -shm）可持久化且写入正常。
mkdir -p /app/data
chown -R appuser:nodejs /app/data

# 通过 su 降权到 appuser；docker/compose 注入的环境变量会被继承。
exec su appuser -s /bin/sh -c "exec node --disable-warning=ExperimentalWarning scripts/serve.mjs"
