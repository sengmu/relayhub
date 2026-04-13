#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

install_from_ubuntu_repo() {
  echo '[fallback] 改用 Ubuntu 软件源安装 Docker...'
  sudo apt-get update
  sudo apt-get install -y docker.io docker-compose-v2
}

echo '[1/7] 安装基础依赖...'
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

echo '[2/7] 尝试连接 Docker 官方仓库...'
if curl -fsSL --connect-timeout 10 --max-time 20 https://download.docker.com/linux/ubuntu/gpg >/tmp/docker.gpg.asc; then
  echo '[3/7] 添加 Docker GPG key...'
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg /tmp/docker.gpg.asc
  sudo chmod a+r /etc/apt/keyrings/docker.gpg

  echo '[4/7] 配置 Docker 官方 apt 源...'
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

  echo '[5/7] 从 Docker 官方源安装 Docker Engine / Compose 插件...'
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin || install_from_ubuntu_repo
else
  echo '[info] 无法访问 download.docker.com，自动切换到 Ubuntu 软件源。'
  install_from_ubuntu_repo
fi

echo '[6/7] 启动 Docker 并设置开机自启...'
sudo systemctl enable --now docker

echo '[7/7] 将当前用户加入 docker 组，并启动 sub2api...'
sudo groupadd docker 2>/dev/null || true
sudo usermod -aG docker "$USER"
cd "$HOME/projects/sub2api/deploy"
sudo docker compose up -d

cat <<'EOF'

完成。

检查状态：
  sudo docker compose -f ~/projects/sub2api/deploy/docker-compose.yml ps

查看日志：
  sudo docker compose -f ~/projects/sub2api/deploy/docker-compose.yml logs -f sub2api

访问地址：
  http://127.0.0.1:8080

登录信息：
  邮箱: admin@sub2api.local
  密码: S1KX0fVRYESQ4fOiZLLi

注意：
1. 由于刚把你加入 docker 组，当前 shell 未重新登录前，普通 docker 命令可能还不能直接用；
   现在请继续使用 sudo docker ...，或者重新登录一次。
2. 如果端口被占用，可编辑 ~/projects/sub2api/deploy/.env 中的 SERVER_PORT 后重启。
EOF
