# 🚀 Hackathon Event Management System

A production-style three-tier web application demonstrating:
- **Frontend**: Nginx serving static HTML/CSS/JS
- **Backend**: Node.js 18 + Express REST API
- **Database**: MySQL 8
- **CI/CD**: Jenkins declarative pipeline
- **Orchestration**: Kubernetes (Minikube)
- **Monitoring**: Prometheus + Grafana (via Helm)

---

## 📁 Project Structure

```
hackathon-app/
├── frontend/
│   ├── index.html        # Single-page app (register/list/delete teams)
│   ├── nginx.conf        # Nginx config: proxies /api/ → backend:5000
│   └── Dockerfile        # nginx:1.25-alpine
├── backend/
│   ├── server.js         # Express API (GET/POST/DELETE /api/teams, /api/health)
│   ├── package.json
│   └── Dockerfile        # node:18-alpine, multi-stage, non-root user
├── k8s/
│   ├── namespace.yaml
│   ├── mysql-secret.yaml
│   ├── mysql-pvc.yaml
│   ├── mysql-deployment.yaml
│   ├── mysql-service.yaml
│   ├── backend-deployment.yaml
│   ├── backend-service.yaml
│   ├── frontend-deployment.yaml
│   └── frontend-service.yaml
├── docker-compose.yml
├── Jenkinsfile
└── README.md
```

---

## 🐳 Running Locally with Docker Compose

### Prerequisites
- Docker Desktop ≥ 24 (with Docker Compose v2)

### Steps

```bash
# 1. Clone / navigate to the project
cd hackathon-app

# 2. Build and start all three tiers
docker compose up -d --build

# 3. Wait ~30s for MySQL to initialise, then verify
# Health check
curl http://localhost:5000/api/health

# Register a team
curl -s -X POST http://localhost:5000/api/teams \
  -H 'Content-Type: application/json' \
  -d '{"team_name":"Code Ninjas","members":"Alice, Bob","project_idea":"AI-powered scheduler"}' \
  | python3 -m json.tool

# List all teams
curl -s http://localhost:5000/api/teams | python3 -m json.tool

# Open the UI in a browser
start http://localhost:8081

# 4. Stop and clean up
docker compose down -v
```

### Port Map (local Docker)

| Service  | Host Port |
|----------|-----------|
| Frontend | 8081      |
| Backend  | 5000      |
| MySQL    | 3306      |

---

## ☸️ Kubernetes Deployment (Minikube)

### Prerequisites
- Minikube ≥ 1.30, `kubectl`, Helm 3
- Docker Hub account (images must be pushed first)

### 1. Start Minikube

```bash
minikube start --driver=docker --cpus=2 --memory=4096
minikube status
```

### 2. Build & Push Docker Images

```bash
export DOCKERHUB_USER=your-dockerhub-username

docker build -t $DOCKERHUB_USER/hackathon-frontend:1 ./frontend
docker build -t $DOCKERHUB_USER/hackathon-backend:1  ./backend

docker login
docker push $DOCKERHUB_USER/hackathon-frontend:1
docker push $DOCKERHUB_USER/hackathon-backend:1
```

### 3. Substitute Placeholders & Apply Manifests

```bash
# Create a deploy directory with substituted images
export IMAGE_TAG=1
cp -r k8s/ /tmp/k8s-deploy/

find /tmp/k8s-deploy/ -name '*.yaml' \
  -exec sed -i "s|DOCKERHUB_USER|$DOCKERHUB_USER|g" {} +
find /tmp/k8s-deploy/ -name '*.yaml' \
  -exec sed -i "s|IMAGE_TAG|$IMAGE_TAG|g" {} +

# Apply in dependency order
kubectl apply -f /tmp/k8s-deploy/namespace.yaml
kubectl apply -f /tmp/k8s-deploy/mysql-secret.yaml
kubectl apply -f /tmp/k8s-deploy/mysql-pvc.yaml
kubectl apply -f /tmp/k8s-deploy/mysql-deployment.yaml
kubectl apply -f /tmp/k8s-deploy/mysql-service.yaml
kubectl apply -f /tmp/k8s-deploy/backend-deployment.yaml
kubectl apply -f /tmp/k8s-deploy/backend-service.yaml
kubectl apply -f /tmp/k8s-deploy/frontend-deployment.yaml
kubectl apply -f /tmp/k8s-deploy/frontend-service.yaml

rm -rf /tmp/k8s-deploy/
```

### 4. Monitor Rollouts

```bash
kubectl rollout status deployment/mysql    -n hackathon --timeout=180s
kubectl rollout status deployment/backend  -n hackathon --timeout=180s
kubectl rollout status deployment/frontend -n hackathon --timeout=120s

kubectl get pods,svc -n hackathon
```

### 5. Access the Application

```bash
# Option A – minikube service (opens browser)
minikube service frontend -n hackathon --url

# Option B – NodePort directly
minikube ip      # e.g. 192.168.49.2
# Then open: http://192.168.49.2:30080
```

---

## 🔧 Jenkins CI/CD Pipeline

### One-Time Setup on the Ubuntu Jenkins Host

#### a) Add Jenkins to the docker group
```bash
sudo usermod -aG docker jenkins
sudo systemctl restart jenkins
# Verify inside Jenkins: docker ps (should succeed)
```

#### b) Make kubectl available to Jenkins
```bash
# Copy minikube kubeconfig and certificates
sudo mkdir -p /var/lib/jenkins/.kube
sudo cp ~/.kube/config /var/lib/jenkins/.kube/config

# Copy minikube certs (the config references them by absolute path)
sudo mkdir -p /var/lib/jenkins/.minikube/profiles/minikube
sudo cp -r ~/.minikube/ca.crt               /var/lib/jenkins/.minikube/
sudo cp -r ~/.minikube/profiles/minikube/   /var/lib/jenkins/.minikube/profiles/

# Fix absolute paths in the copied config to point to jenkins home
sudo sed -i 's|/home/YOUR_USER/.minikube|/var/lib/jenkins/.minikube|g' \
    /var/lib/jenkins/.kube/config

# Fix ownership
sudo chown -R jenkins:jenkins /var/lib/jenkins/.kube /var/lib/jenkins/.minikube

# Test
sudo -u jenkins kubectl get nodes
```

#### c) Verify Jenkins can reach the cluster
```bash
# Minikube must be running
minikube status

# If using docker driver, ensure the API server host is reachable from Jenkins
# The kubeconfig will show something like: server: https://127.0.0.1:PORT
# This works if Jenkins runs on the same host.
```

### Create the Docker Hub Credential in Jenkins

1. Jenkins → **Manage Jenkins** → **Credentials** → (global) → **Add Credentials**
2. Kind: **Username with password**
3. ID: **dockerhub-creds** *(must match the Jenkinsfile)*
4. Username: your Docker Hub username
5. Password: your Docker Hub password or access token

### Create the Pipeline Job

1. Jenkins → **New Item** → name it `hackathon-app` → **Pipeline** → OK
2. Under *Pipeline*:
   - Definition: **Pipeline script from SCM**
   - SCM: **Git**
   - Repository URL: `https://github.com/your-username/hackathon-app.git`
   - Branch: `*/main`
   - Script Path: `Jenkinsfile`
3. **Save**

### Update DOCKERHUB_USER in Jenkinsfile

Edit `Jenkinsfile` line 6:
```groovy
DOCKERHUB_USER = 'your-actual-dockerhub-username'
```
Commit and push to GitHub.

### Push the Project to GitHub

```bash
cd hackathon-app
git init
git add .
git commit -m "feat: initial Hackathon Event Management System"
git remote add origin https://github.com/your-username/hackathon-app.git
git branch -M main
git push -u origin main
```

### Run the Pipeline

1. Open the `hackathon-app` job in Jenkins
2. Click **Build Now**
3. Watch the **Console Output** for progress
4. On success: `minikube service frontend -n hackathon --url`

---

## 📊 Monitoring – Prometheus & Grafana

### Install via Helm

```bash
# Add the Helm repo
helm repo add prometheus-community \
  https://prometheus-community.github.io/helm-charts
helm repo update

# Install kube-prometheus-stack in a dedicated namespace
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set grafana.adminPassword=admin123 \
  --set prometheus.prometheusSpec.resources.requests.memory=256Mi \
  --set prometheus.prometheusSpec.resources.limits.memory=512Mi \
  --wait

# Verify
kubectl get pods -n monitoring
```

### Access Grafana

```bash
# Option A: port-forward
kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring &
# Open: http://localhost:3000

# Option B: expose as NodePort (persistent across sessions)
kubectl patch svc monitoring-grafana -n monitoring \
  -p '{"spec":{"type":"NodePort","ports":[{"port":80,"nodePort":32000,"targetPort":3000}]}}'
minikube service monitoring-grafana -n monitoring --url
```

### Get the Grafana Admin Password

```bash
# If you set it during install:
#   admin123  (as shown above)
# Or retrieve the auto-generated secret:
kubectl get secret monitoring-grafana -n monitoring \
  -o jsonpath="{.data.admin-password}" | base64 --decode
echo
# Username is always: admin
```

### Useful Dashboards (import by ID in Grafana → Dashboards → Import)
| Dashboard | ID |
|---|---|
| Kubernetes cluster overview | 315 |
| Node Exporter Full | 1860 |
| Kubernetes Deployment Statefulset Daemonset metrics | 8588 |

---

## 🔍 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check (returns DB status) |
| GET | `/api/teams` | List all registered teams |
| POST | `/api/teams` | Register a new team |
| DELETE | `/api/teams/:id` | Delete a team by ID |

### POST /api/teams – Request Body
```json
{
  "team_name": "Code Ninjas",
  "members": "Alice, Bob, Charlie",
  "project_idea": "AI-powered event scheduler"
}
```

---

## 🛠️ Troubleshooting

### ImagePullBackOff
```bash
kubectl describe pod <pod-name> -n hackathon
```
**Causes & Fixes:**
- Wrong image name → check `DOCKERHUB_USER` in Jenkinsfile matches your Docker Hub username
- Image not pushed → run the push commands manually and retry
- Private repo → add a Docker Hub pull secret to the namespace:
  ```bash
  kubectl create secret docker-registry regcred \
    --docker-username=YOUR_USER \
    --docker-password=YOUR_TOKEN \
    -n hackathon
  # Then add imagePullSecrets to the deployment
  ```

### Permission Denied on docker.sock
```
Got permission denied while trying to connect to the Docker daemon socket
```
**Fix:**
```bash
sudo usermod -aG docker jenkins
sudo systemctl restart jenkins
# Log out/in on the Jenkins UI and re-run
```

### kubectl: Connection Refused from Jenkins
```
The connection to the server 127.0.0.1:PORT was refused
```
**Causes & Fixes:**
1. Minikube is not running → `minikube start`
2. kubeconfig not copied to Jenkins → redo the setup steps in *One-Time Setup*
3. Cert paths wrong in copied config → re-run the `sed` path-fix command
4. API server port changed → `minikube ip` + `kubectl cluster-info` and update the config

### Backend Pods CrashLoopBackOff
```bash
kubectl logs deployment/backend -n hackathon
```
- If logs show DB connection errors → MySQL pod may not be ready yet; wait and check:
  ```bash
  kubectl rollout status deployment/mysql -n hackathon
  kubectl logs deployment/mysql -n hackathon
  ```

### MySQL Pod Stuck in Pending
```bash
kubectl describe pod -l app=mysql -n hackathon
```
- **PVC not bound** → `kubectl get pvc -n hackathon`; ensure Minikube storage provisioner is active:
  ```bash
  minikube addons enable storage-provisioner
  ```

### Frontend Returns 502 Bad Gateway
- Backend pods are not ready yet (wait for DB)
- Check: `kubectl get endpoints backend -n hackathon` — should show pod IPs
- Nginx proxy target is `backend:5000`; ensure the service name is exactly `backend`

---

## 🔐 Security Notes

- **No real passwords are committed to this repository.** All credentials use placeholder values.
- In production, replace the `mysql-secret.yaml` placeholders with values from a secrets manager (e.g., Vault, AWS Secrets Manager) or use Sealed Secrets / External Secrets Operator.
- The backend Dockerfile runs as a non-root user (`appuser`).

---

## 📝 License

MIT License – feel free to use for coursework and labs.
