# deploy/

Production deploy artifacts for the Aeza VPS path. See `../DEPLOY.md` for the full runbook.

| File                 | Purpose                                                    |
| -------------------- | ---------------------------------------------------------- |
| `bootstrap.sh`       | One-time server setup (Docker, UFW, fail2ban, deploy user) |
| `docker-compose.yml` | Prod stack: caddy + api + worker                           |
| `Caddyfile`          | Reverse proxy + auto-TLS for `api.rustskinpay.com`         |
| `api.env.example`    | Template for `/opt/rustskinpay/api.env` on the server      |
| `worker.env.example` | Template for `/opt/rustskinpay/worker.env` on the server   |

`docker-compose.yml` + `Caddyfile` are scp'd to the server on every deploy by
`.github/workflows/deploy.yml`. The `*.env` files are NOT — they live only on
the server and must be edited there directly (then `docker compose up -d`).

## Ops cheatsheet

SSH in as the deploy user, then:

```sh
cd /opt/rustskinpay

# View logs
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f caddy

# Restart a service after editing its env file
docker compose up -d api      # or worker

# Force-pull the latest image and restart
docker compose pull && docker compose up -d

# Status
docker compose ps
```
