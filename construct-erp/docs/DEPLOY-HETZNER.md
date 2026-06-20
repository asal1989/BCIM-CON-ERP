# ConstructERP — Hetzner VPS Deployment Guide
# Live URL: https://app.bcim.in

## What You Get
- Frontend : https://app.bcim.in        (React SPA)
- API      : https://app.bcim.in/api/v1 (Node.js)
- SSL      : Auto (Let's Encrypt, auto-renews)
- DB       : PostgreSQL 16 (inside Docker)
- Cost     : ~₹700–1,200/month (Hetzner CX22)

---

## STEP 1 — Create Hetzner Server

1. Go to https://www.hetzner.com/cloud
2. Create account → New Project → "ConstructERP"
3. Add Server:
   - **Location** : Helsinki or Nuremberg (closest to India)
   - **Image**    : Ubuntu 22.04
   - **Type**     : **CX22** (2 vCPU, 4GB RAM) — ₹700/month
   - **SSH Key**  : Add your public key (see below)
   - **Name**     : constructerp-prod
4. Note the **server IP address** (e.g. 65.21.xxx.xxx)

### Generate SSH Key (on your Windows PC)
```
# Open Git Bash or PowerShell:
ssh-keygen -t ed25519 -C "it@bcim.in"
# Press Enter for all prompts
# Public key is at: C:\Users\YourName\.ssh\id_ed25519.pub
```
Copy the contents of `id_ed25519.pub` into Hetzner when adding SSH key.

---

## STEP 2 — Point Domain to Server

In your domain registrar (wherever bcim.in is registered):

| Type | Name          | Value           | TTL  |
|------|---------------|-----------------|------|
| A    | app           | YOUR_SERVER_IP  | 300  |
| A    | @             | YOUR_SERVER_IP  | 300  |
| A    | www           | YOUR_SERVER_IP  | 300  |

Wait 5–15 minutes for DNS to propagate. Test with:
```
ping app.bcim.in
```

---

## STEP 3 — Setup Server (Run Once)

SSH into your server:
```bash
ssh root@YOUR_SERVER_IP
```

Run the setup script:
```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_GITHUB/construct-erp/main/scripts/setup-server.sh | bash
```

OR upload manually and run:
```bash
bash /opt/constructerp/scripts/setup-server.sh
```

This installs: Docker, Nginx, Certbot, Firewall, Swap, SSL certificate.

---

## STEP 4 — Upload Project & Configure

### Option A — Git (Recommended)
```bash
cd /opt/constructerp
git clone https://github.com/YOUR_GITHUB/construct-erp.git .
```

### Option B — Direct Upload (SCP from your PC)
```bash
# Run from your Windows PC (Git Bash):
scp -r "H:/OFFICE PROJECTS/consrpro/construct-erp/" root@YOUR_SERVER_IP:/opt/constructerp/
```

### Create production env file:
```bash
cd /opt/constructerp
cp .env.production.example .env.production
nano .env.production
```

Fill in these values:
```env
DOMAIN=app.bcim.in
DB_PASSWORD=YourStrongPassword123!@#   # at least 20 chars
JWT_SECRET=<run: openssl rand -base64 48>
```

Generate JWT_SECRET:
```bash
openssl rand -base64 48
```

---

## STEP 5 — Deploy

```bash
cd /opt/constructerp
bash scripts/deploy.sh
```

This will:
1. Build Docker images (takes ~5 minutes first time)
2. Run database migrations
3. Start all containers
4. Health check

---

## STEP 6 — Verify

```bash
# Check containers are running
docker compose -f docker-compose.prod.yml ps

# Check backend health
curl https://app.bcim.in/health

# Watch live logs
docker compose -f docker-compose.prod.yml logs -f backend
```

Open browser: **https://app.bcim.in**

Login with: `it@bcim.in` / `BCIM@1234`

---

## STEP 7 — GitHub Auto-Deploy (Optional)

Every `git push` to `main` will auto-deploy to your server.

1. Go to your GitHub repo → Settings → Secrets → Actions
2. Add these secrets:

| Secret Name       | Value                              |
|-------------------|------------------------------------|
| `HETZNER_HOST`    | Your server IP                     |
| `HETZNER_USER`    | `root`                             |
| `HETZNER_SSH_KEY` | Contents of `~/.ssh/id_ed25519`    |
| `DB_PASSWORD`     | Your DB password                   |
| `JWT_SECRET`      | Your JWT secret                    |

3. Push any change to `main` → GitHub deploys automatically

---

## Useful Commands

```bash
# View all containers
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Restart backend only
docker compose -f docker-compose.prod.yml restart backend

# Stop everything
docker compose -f docker-compose.prod.yml down

# Connect to database
docker exec -it erp_db psql -U erp_user -d construct_erp

# Manual backup
docker exec erp_db pg_dump -U erp_user construct_erp > backup_$(date +%Y%m%d).sql

# Check disk usage
df -h
docker system df
```

---

## Monthly Cost Breakdown

| Service              | Cost       |
|----------------------|------------|
| Hetzner CX22 server  | €3.79/mo (~₹340) |
| Hetzner IPv4 address | €0.50/mo (~₹45)  |
| Domain (bcim.in)     | ~₹800/year       |
| SSL certificate      | FREE (Let's Encrypt) |
| **Total**            | **~₹450/month** |

---

## Scaling Up (When Needed)

When you have 20+ companies using the SaaS:
1. Upgrade to Hetzner CX32 (8GB RAM) — €5.77/mo
2. Move PostgreSQL to Hetzner Managed Database — €10/mo
3. Add Hetzner Object Storage for uploads — €1/mo per 100GB
