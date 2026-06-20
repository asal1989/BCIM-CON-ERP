# ConstructERP — E2E Networks Deployment Guide 🇮🇳
# Live URL : https://app.bcim.in
# Provider : E2E Networks (Indian Cloud — Delhi / Mumbai)
# Cost     : ~₹800–1,200/month

---

## WHY E2E NETWORKS
- Indian datacenter (Delhi / Mumbai) — 5–20ms latency
- Pay via UPI, NEFT, Indian debit/credit card
- GST invoice provided (for your accounts)
- 24×7 Indian support

---

## STEP 1 — Create E2E Networks Account

1. Go to https://myaccount.e2enetworks.com/register
2. Sign up with your email: it@bcim.in
3. Complete KYC (Aadhaar / PAN verification — takes 1–2 hours)
4. Add money to wallet:
   - Minimum ₹500 via UPI / Net Banking / Credit Card
   - UPI ID: shown after login

---

## STEP 2 — Create Virtual Machine (Node)

1. Login → **Compute** → **Nodes** → **Create Node**

2. Fill in the form:

   | Field         | Value                        |
   |---------------|------------------------------|
   | **Region**    | Delhi (DEL1) or Mumbai (BOM1)|
   | **OS Image**  | Ubuntu 22.04 LTS             |
   | **Plan**      | C1 — 2 vCPU, 4GB RAM, 50GB  |
   | **Node Name** | constructerp-prod            |
   | **SSH Key**   | Add your public key (below)  |

3. Click **Create Node** → Takes ~2 minutes
4. Note the **Public IP address** shown in dashboard

### Generate SSH Key (Windows — Git Bash or PowerShell):
```bash
ssh-keygen -t ed25519 -C "it@bcim.in"
# Press Enter for all prompts (no passphrase needed)

# View your public key to copy into E2E:
cat ~/.ssh/id_ed25519.pub
```
Paste the output into E2E Networks → SSH Keys section.

---

## STEP 3 — Configure Security Group (Firewall)

In E2E dashboard → **Security Groups** → Your node's security group → Add rules:

| Protocol | Port | Source    | Purpose          |
|----------|------|-----------|------------------|
| TCP      | 22   | Your IP   | SSH access       |
| TCP      | 80   | 0.0.0.0/0 | HTTP (SSL renew) |
| TCP      | 443  | 0.0.0.0/0 | HTTPS (main app) |
| ICMP     | All  | 0.0.0.0/0 | Ping/health check|

> ⚠️ Keep port 22 restricted to your office IP for security.

---

## STEP 4 — Point Domain to Server

In your domain registrar (where bcim.in is registered):

| Type | Name  | Value              | TTL |
|------|-------|--------------------|-----|
| A    | app   | YOUR_E2E_PUBLIC_IP | 300 |
| A    | @     | YOUR_E2E_PUBLIC_IP | 300 |
| A    | www   | YOUR_E2E_PUBLIC_IP | 300 |

Wait 5–15 minutes. Test:
```bash
ping app.bcim.in
# Should show your E2E IP
```

---

## STEP 5 — SSH Into Your Server

```bash
ssh root@YOUR_E2E_PUBLIC_IP
```

First time? Accept the fingerprint by typing `yes`.

---

## STEP 6 — Upload Your Project

### Option A — From GitHub (Recommended)
```bash
# On the server:
apt-get install -y git
git clone https://github.com/YOUR_USERNAME/construct-erp.git /opt/constructerp
```

### Option B — Direct Upload from Your PC (SCP)
```bash
# Run from Git Bash on your Windows PC:
scp -r "H:/OFFICE PROJECTS/consrpro/construct-erp/" root@YOUR_E2E_IP:/opt/constructerp/
```

### Option C — Using FileZilla (Easiest for Windows)
1. Open FileZilla
2. Host: `sftp://YOUR_E2E_IP`  |  Username: `root`  |  Port: `22`
3. Key file: `C:\Users\YourName\.ssh\id_ed25519`
4. Upload the entire project folder to `/opt/constructerp/`

---

## STEP 7 — Run Server Setup Script

```bash
cd /opt/constructerp
chmod +x scripts/setup-server.sh
bash scripts/setup-server.sh
```

This automatically installs:
- ✅ Docker + Docker Compose
- ✅ Certbot (Let's Encrypt SSL)
- ✅ UFW Firewall
- ✅ 2GB Swap (critical for 4GB RAM server)
- ✅ SSL certificate for app.bcim.in

**Time: ~5 minutes**

---

## STEP 8 — Configure Environment Variables

```bash
cd /opt/constructerp
cp .env.production.example .env.production
nano .env.production
```

Update these values (rest can stay as default):

```env
DOMAIN=app.bcim.in

DB_PASSWORD=ConstructERP@2024#BCIM    # change this — min 20 chars

# Generate JWT secret — run this command and paste the output:
# openssl rand -base64 48
JWT_SECRET=PASTE_OUTPUT_HERE
```

Save: `Ctrl+X` → `Y` → Enter

---

## STEP 9 — Deploy!

```bash
cd /opt/constructerp
chmod +x scripts/deploy.sh
bash scripts/deploy.sh
```

**First deployment takes ~8–10 minutes** (building Docker images).

You'll see:
```
[1/5] Pulling latest code...
[2/5] Building Docker images...
[3/5] Backing up database...
[4/5] Deploying containers...
[5/5] Health check...
   ✅ Backend healthy

✅ Deployment successful!
🌐 https://app.bcim.in
```

---

## STEP 10 — Open in Browser

🌐 **https://app.bcim.in**

Login:
- Email    : `it@bcim.in`
- Password : `BCIM@1234`

---

## Useful Commands After Deployment

```bash
# Check all containers running
docker compose -f docker-compose.prod.yml ps

# View live logs
docker compose -f docker-compose.prod.yml logs -f

# Restart only backend
docker compose -f docker-compose.prod.yml restart backend

# Connect to database
docker exec -it erp_db psql -U erp_user -d construct_erp

# Manual DB backup
docker exec erp_db pg_dump -U erp_user construct_erp > ~/backup_$(date +%Y%m%d).sql

# Check disk space
df -h

# Check memory usage
free -h

# Update app (after code changes)
bash scripts/deploy.sh
```

---

## Monthly Cost Breakdown (E2E Networks)

| Item                    | Cost         |
|-------------------------|--------------|
| C1 Node (2vCPU, 4GB)   | ₹800/month   |
| Public IP               | ₹100/month   |
| Storage (50GB included) | ₹0           |
| SSL Certificate         | FREE         |
| **Total**               | **~₹900/month** |

---

## Backup Strategy

Automatic daily backups are built in (last 7 kept):
```bash
ls -lh /opt/constructerp/backups/
```

For extra safety, also enable **E2E Snapshots**:
- E2E Dashboard → Nodes → Your Node → **Snapshots**
- Create weekly snapshot (₹2/GB/month)
- Keeps full server image if anything goes wrong

---

## Troubleshooting

### SSL certificate failed
```bash
# Wait for DNS to propagate, then retry:
certbot certonly --standalone -d app.bcim.in -d bcim.in -d www.bcim.in
```

### Port 80/443 not accessible
```bash
# Check E2E Security Group has port 80 and 443 open
# Also check UFW:
ufw status
```

### Container not starting
```bash
docker compose -f docker-compose.prod.yml logs backend
docker compose -f docker-compose.prod.yml logs postgres
```

### Out of memory
```bash
free -h   # check swap is active
# If not:
swapon /swapfile
```

### Database connection error
```bash
# Wait 30 seconds for postgres to fully start, then:
docker compose -f docker-compose.prod.yml restart backend
```

---

## Scaling Up (When You Have 20+ Companies)

| Stage | Plan | Cost |
|-------|------|------|
| Now (0–20 companies) | C1 (4GB) | ₹900/mo |
| Growth (20–100 companies) | C2 (8GB) | ₹1,500/mo |
| Scale (100+ companies) | C4 (16GB) + Managed DB | ₹4,000/mo |

Upgrade without downtime:
```bash
# E2E Dashboard → Resize Node → Pick larger plan
# No data loss — takes 2 minutes
```
