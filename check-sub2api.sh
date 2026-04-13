#!/usr/bin/env bash
set -euo pipefail

cd "$HOME/projects/sub2api/deploy"

echo '== Docker 版本 =='
sudo docker --version
sudo docker compose version

echo
echo '== 容器状态 =='
sudo docker compose ps

echo
echo '== sub2api 最近日志 =='
sudo docker compose logs --tail=80 sub2api

echo
echo '== 本地健康检查 =='
if command -v curl >/dev/null 2>&1; then
  curl -fsS http://127.0.0.1:8080/health && echo
else
  wget -qO- http://127.0.0.1:8080/health && echo
fi

echo
echo '== 登录信息 =='
echo '地址: http://127.0.0.1:8080'
echo '管理员邮箱: admin@sub2api.local'
echo '管理员密码: S1KX0fVRYESQ4fOiZLLi'
