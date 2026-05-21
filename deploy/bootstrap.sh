#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 24.04 LTS server (Aeza Frankfurt or similar).
#
# Usage (run as root, e.g. via Aeza web console "Root SSH"):
#   curl -fsSL https://raw.githubusercontent.com/merchant-stack/storefront/main/deploy/bootstrap.sh \
#     | bash -s -- <your-github-username>
#
# What it does:
#   - apt update + upgrade
#   - installs Docker engine + compose plugin (official repo)
#   - enables UFW firewall (allows 22/80/443 only)
#   - enables fail2ban + unattended security upgrades
#   - creates 'deploy' user, adds your GitHub SSH public keys
#   - disables root SSH + password auth (only AFTER deploy user has keys)
#   - creates /opt/rustskinpay/ owned by deploy
#
# After this completes:
#   - You SSH in as: ssh deploy@<server-ip>
#   - GitHub Actions deploys to /opt/rustskinpay/ via this same deploy user

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
	echo "ERROR: run as root" >&2
	exit 1
fi

GH_USER="${1:-}"
if [[ -z "$GH_USER" ]]; then
	echo "ERROR: pass your GitHub username as the first argument" >&2
	echo "       (your SSH keys will be fetched from https://github.com/<username>.keys)" >&2
	exit 1
fi

# Fetch keys FIRST — if this fails, we abort before touching SSH config.
KEYS_TMP=$(mktemp)
trap 'rm -f "$KEYS_TMP"' EXIT
if ! curl -fsSL "https://github.com/${GH_USER}.keys" -o "$KEYS_TMP"; then
	echo "ERROR: failed to fetch SSH keys from github.com/${GH_USER}.keys" >&2
	exit 1
fi
if [[ ! -s "$KEYS_TMP" ]]; then
	echo "ERROR: no SSH keys found on GitHub for user '${GH_USER}'" >&2
	echo "       Add a key at https://github.com/settings/keys first" >&2
	exit 1
fi

echo "==> System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get -y -qq upgrade
apt-get -y -qq install ca-certificates curl gnupg ufw fail2ban unattended-upgrades

echo "==> Unattended security upgrades"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

echo "==> Firewall (UFW)"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> fail2ban"
systemctl enable --now fail2ban

echo "==> Docker engine (official repo)"
install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
	curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
	chmod a+r /etc/apt/keyrings/docker.gpg
fi
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
	>/etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get -y -qq install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

echo "==> deploy user"
if ! id deploy &>/dev/null; then
	useradd -m -s /bin/bash deploy
fi
usermod -aG docker deploy
install -d -m 0700 -o deploy -g deploy /home/deploy/.ssh
install -m 0600 -o deploy -g deploy "$KEYS_TMP" /home/deploy/.ssh/authorized_keys

echo "==> App directory"
install -d -m 0755 -o deploy -g deploy /opt/rustskinpay

echo "==> Lock down SSH (root login + password auth)"
sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?KbdInteractiveAuthentication .*/KbdInteractiveAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

cat <<EOF

================================================================
  Bootstrap complete.
================================================================

Test SSH from your laptop BEFORE closing this root session:

    ssh deploy@$(curl -fsSL ifconfig.me || echo '<server-ip>')

If that works, you can disconnect this root session.

App will live at:  /opt/rustskinpay/
GitHub Actions deploys to it as the 'deploy' user.

EOF
