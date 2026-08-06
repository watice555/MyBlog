#!/bin/zsh

set -u

PROJECT_DIR="$(cd -- "$(dirname -- "$0")/.." && pwd)"
PORT="${PORT:-8001}"
BASE_URL="http://127.0.0.1:${PORT}"
EDITOR_URL="${BASE_URL}/#editor"

export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH}"
cd "$PROJECT_DIR" || exit 1

pause_on_error() {
  printf "\n按任意键关闭窗口…"
  read -k 1
  printf "\n"
}

if ! command -v npm >/dev/null 2>&1; then
  echo "未找到 npm。请先安装 Node.js 22 或更高版本。"
  pause_on_error
  exit 1
fi

if curl --silent --fail --max-time 2 "$BASE_URL" | grep -q "凝泠"; then
  echo "本地博客已经启动，正在打开编辑器…"
  open "$EDITOR_URL"
  exit 0
fi

FALLBACK_ATTEMPTS=100
LAST_PORT=$((PORT + FALLBACK_ATTEMPTS - 1))
if [ "$LAST_PORT" -gt 65535 ]; then
  LAST_PORT=65535
fi

SELECTED_PORT=""
candidate="$PORT"
while [ "$candidate" -le "$LAST_PORT" ]; do
  if ! lsof -nP -iTCP:"$candidate" -sTCP:LISTEN >/dev/null 2>&1; then
    SELECTED_PORT="$candidate"
    break
  fi
  candidate=$((candidate + 1))
done

if [ -z "$SELECTED_PORT" ]; then
  echo "端口 ${PORT} 到 ${LAST_PORT} 均已被占用，无法启动本地博客。"
  echo "请关闭占用这些端口的程序，或设置 PORT 环境变量指定其他端口。"
  pause_on_error
  exit 1
fi

if [ "$SELECTED_PORT" != "$PORT" ]; then
  echo "端口 ${PORT} 已被其他程序占用，自动改用 ${SELECTED_PORT}。"
fi
PORT="$SELECTED_PORT"
BASE_URL="http://127.0.0.1:${PORT}"
EDITOR_URL="${BASE_URL}/#editor"

if [[ ! -d node_modules ]]; then
  echo "首次启动，正在安装依赖…"
  npm install || {
    pause_on_error
    exit 1
  }
fi

echo "正在启动凝泠本地编辑器…"
echo "关闭此终端窗口或按 Control-C 即可停止服务。"
echo

npm run dev -- --port "$PORT" --hostname 127.0.0.1 &
server_pid=$!

cleanup() {
  if kill -0 "$server_pid" >/dev/null 2>&1; then
    kill "$server_pid" >/dev/null 2>&1
  fi
}
trap cleanup INT TERM EXIT

for attempt in {1..90}; do
  if curl --silent --fail --max-time 2 "$BASE_URL" | grep -q "凝泠"; then
    echo
    echo "编辑器已就绪，正在打开浏览器…"
    open "$EDITOR_URL"
    wait "$server_pid"
    exit $?
  fi

  if ! kill -0 "$server_pid" >/dev/null 2>&1; then
    wait "$server_pid"
    status=$?
    echo
    echo "本地服务启动失败（退出码：${status}）。"
    pause_on_error
    exit "$status"
  fi

  sleep 1
done

echo
echo "等待本地服务启动超时。"
pause_on_error
exit 1
