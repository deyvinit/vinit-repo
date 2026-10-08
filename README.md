# 5-Container Polyglot Todo Application on AWS

A complete multi-container system featuring **FastAPI**, **Rust (Axum)**, **PostgreSQL**, **Keycloak**, and an ultra-simple **Vanilla Frontend**, fully automated with **AWS CodeCommit** and **AWS CodePipeline**.

---

## Architecture & Assessment Rubric Alignment

| Rubric Component | Whiteboard Weight | Implementation |
|---|---|---|
| **Core Todo App** | **50%** | **Frontend (Nginx)** + **Middleware (FastAPI)** + **Database (PostgreSQL 16)** |
| **Authentication** | **20%** | **Keycloak 24 (Upstream 10%)** with auto-imported realm & client (**Downstream 10%**) |
| **Rust Worker Service** | **10% + Bonus** | **Rust Axum**: returns `"hello world from Rust"` (`GET /`) and handles **`DELETE /todos/{id}`** |
| **CI/CD Pipeline** | **20%** | **GitHub App** + **AWS CodeBuild (`buildspec.yml`)** + **AWS CodeDeploy** + **AWS CodePipeline** |
| **Edge Security & Routing** | **Bonus** | **AWS WAF (Web ACL)** + **Application Load Balancer (ALB)** (OWASP Top 10, XSS, SQLi protection) |

---

## 5 Containers Overview

1. **`todo-frontend` (Port 80):** Serves clean Vanilla HTML/JS UI and reverse-proxies `/api` traffic to FastAPI.
2. **`todo-middleware` (Port 8000):** Python FastAPI application handling CRUD operations (`GET`, `POST`, `PUT`) and delegating `DELETE` to the Rust container.
3. **`todo-rust-api` (Port 8081 / internal 8080):** High-performance Rust microservice returning `"hello world from Rust"` and executing `DELETE` SQL queries against PostgreSQL.
4. **`todo-auth` (Port 8082 / internal 8080):** Keycloak 24 OIDC server pre-loaded with realm `todo-realm`, client `todo-client`, and test user (`testuser` / `password123`).
5. **`todo-db` (Port 5432):** PostgreSQL 16 Alpine database with schema initialization and sample seed data.

---

## Local Development & Testing

### 1. Run All 5 Containers Locally
```bash
# Start all containers in the background
docker compose up -d --build

# Inspect running containers
docker compose ps
```

### 2. Accessing the Services
- **Web App:** Open `http://localhost/` in your browser.
- **FastAPI Docs (Swagger):** `http://localhost:8000/docs`
- **Rust Service Health:** `http://localhost:8081/` (returns `"hello world from Rust"`)
- **Keycloak Admin Console:** `http://localhost:8082/` (admin / admin)

### 3. Testing the Rust DELETE Bonus
In the web UI, clicking **"Delete"** triggers `DELETE /api/todos/{id}` on FastAPI, which forwards the request to Rust:
```bash
# You can also verify via curl:
curl -X DELETE http://localhost:8000/api/todos/1
# Response:
# {"status":"success","message":"Todo 1 deleted successfully from PostgreSQL","deleted_id":1,"handled_by":"Rust Axum Microservice"}
```

---

## AWS Deployment Guide

### Step 1: Push Codebase to AWS CodeCommit
```bash
# Initialize git and commit files
git init
git add .
git commit -m "feat: complete 5-container architecture with keycloak and rust delete"

# Add your AWS CodeCommit repository remote
git remote add origin https://git-codecommit.<your-region>.amazonaws.com/v1/repos/ngtc-assessment

# Push to main branch
git push -u origin main
```

### Step 2: AWS EC2 Instance Setup
> **Memory Recommendation:** Use **`t3.small`** (2 GB RAM) or **`t3.medium`** (4 GB RAM) because Keycloak requires ~1 GB RAM. If using `t2.micro`, enable a 2 GB swap file first.

On your newly created Ubuntu 22.04 / 24.04 EC2 instance, run:
```bash
# 1. Update and install Docker + Compose
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker ubuntu

# 2. (Optional: If on t2.micro) Enable 2GB swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 3. Clone and start
git clone https://git-codecommit.<your-region>.amazonaws.com/v1/repos/ngtc-assessment
cd ngtc-assessment
docker compose up -d --build
```

### Step 3: AWS CodePipeline Setup (20% Rubric)
1. **Source:** GitHub App connecting to repo branch `main`.
2. **Build:** AWS CodeBuild project using `buildspec.yml` (runs `pytest` tests with SQLite in-memory static pool & builds docker images).
3. **Deploy:** AWS CodeDeploy application `vinit-todo-app` deploying to EC2 instance using `appspec.yml`.

---

## AWS WAF & Application Load Balancer (Security & Ingress)

The application is fronted by an **Internet-facing Application Load Balancer** (`vinit-todo-alb`) protected by **AWS WAF** (`vinit-todo-waf`):

- **Port 80 (HTTP):** Routes to Target Group `vinit-todo-tg` (Nginx Frontend on port 80).
- **Port 8082 (HTTP):** Routes to Target Group `vinit-keycloak-tg` (Keycloak IdP on port 8082).
- **AWS Managed Rule Groups Active:**
  - `AWSManagedRulesCommonRuleSet` (Core rule set / OWASP Top 10)
  - `AWSManagedRulesKnownBadInputsRuleSet`
  - `AWSManagedRulesSQLiRuleSet`
  - `AWSManagedRulesLinuxRuleSet`

### Testing WAF Protection
```bash
# Benign traffic (200 OK):
curl -I http://vinit-todo-alb-1632367111.us-east-1.elb.amazonaws.com/

# Malicious XSS probe (Blocked with 403 Forbidden by WAF):
curl -i "http://vinit-todo-alb-1632367111.us-east-1.elb.amazonaws.com/?param=<script>alert('xss')</script>"

# Path Traversal attack (Blocked with 403 Forbidden by WAF):
curl -i "http://vinit-todo-alb-1632367111.us-east-1.elb.amazonaws.com/../../../../etc/passwd"
```


