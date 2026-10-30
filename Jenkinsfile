pipeline {
    agent any

    // ─── Environment ────────────────────────────────────────────────────────────
    environment {
        // Your Docker Hub username – change this to your actual username
        DOCKERHUB_USER  = 'your-dockerhub-username'

        FRONTEND_IMAGE  = "${DOCKERHUB_USER}/hackathon-frontend"
        BACKEND_IMAGE   = "${DOCKERHUB_USER}/hackathon-backend"
        IMAGE_TAG       = "${BUILD_NUMBER}"

        // Kubernetes namespace
        K8S_NAMESPACE   = 'hackathon'

        // Jenkins credential ID for Docker Hub (created in Jenkins → Credentials)
        DOCKERHUB_CREDS = 'dockerhub-creds'
    }

    // ─── Options ────────────────────────────────────────────────────────────────
    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    // ─── Stages ─────────────────────────────────────────────────────────────────
    stages {

        // ── Stage 1: Checkout ──────────────────────────────────────────────────
        stage('Checkout') {
            steps {
                echo "=== Stage 1: Checkout ==="
                checkout scm
                sh 'echo "Workspace: $(pwd)"'
                sh 'ls -la'
            }
        }

        // ── Stage 2: Build Docker Images ──────────────────────────────────────
        stage('Build Docker Images') {
            steps {
                echo "=== Stage 2: Build Docker Images (tag: ${IMAGE_TAG}) ==="

                // Build frontend
                sh """
                    docker build \\
                        -t ${FRONTEND_IMAGE}:${IMAGE_TAG} \\
                        -t ${FRONTEND_IMAGE}:latest \\
                        ./frontend
                """

                // Build backend
                sh """
                    docker build \\
                        -t ${BACKEND_IMAGE}:${IMAGE_TAG} \\
                        -t ${BACKEND_IMAGE}:latest \\
                        ./backend
                """

                sh "docker images | grep hackathon"
            }
        }

        // ── Stage 3: Push to Docker Hub ───────────────────────────────────────
        stage('Push to Docker Hub') {
            steps {
                echo "=== Stage 3: Push to Docker Hub ==="

                withCredentials([usernamePassword(
                    credentialsId: "${DOCKERHUB_CREDS}",
                    usernameVariable: 'DH_USER',
                    passwordVariable: 'DH_PASS'
                )]) {
                    sh """
                        echo "${DH_PASS}" | docker login -u "${DH_USER}" --password-stdin

                        # Push frontend (both tags)
                        docker push ${FRONTEND_IMAGE}:${IMAGE_TAG}
                        docker push ${FRONTEND_IMAGE}:latest

                        # Push backend (both tags)
                        docker push ${BACKEND_IMAGE}:${IMAGE_TAG}
                        docker push ${BACKEND_IMAGE}:latest

                        docker logout
                    """
                }
            }
        }

        // ── Stage 4: Deploy to Kubernetes ─────────────────────────────────────
        stage('Deploy to Kubernetes') {
            steps {
                echo "=== Stage 4: Deploy to Kubernetes ==="

                sh """
                    # Verify kubectl is available and cluster is reachable
                    kubectl version --client
                    kubectl cluster-info

                    # ── Substitute placeholders in manifests ──────────────────
                    # Work on copies so the originals stay pristine for git
                    cp -r k8s/ /tmp/k8s-deploy/

                    # Replace DOCKERHUB_USER placeholder
                    find /tmp/k8s-deploy/ -name '*.yaml' -exec \\
                        sed -i 's|DOCKERHUB_USER|${DOCKERHUB_USER}|g' {} +

                    # Replace IMAGE_TAG placeholder
                    find /tmp/k8s-deploy/ -name '*.yaml' -exec \\
                        sed -i 's|IMAGE_TAG|${IMAGE_TAG}|g' {} +

                    echo "--- Rendered backend-deployment.yaml ---"
                    grep 'image:' /tmp/k8s-deploy/backend-deployment.yaml
                    echo "--- Rendered frontend-deployment.yaml ---"
                    grep 'image:' /tmp/k8s-deploy/frontend-deployment.yaml

                    # ── Apply in dependency order ─────────────────────────────
                    kubectl apply -f /tmp/k8s-deploy/namespace.yaml

                    kubectl apply -f /tmp/k8s-deploy/mysql-secret.yaml

                    kubectl apply -f /tmp/k8s-deploy/mysql-pvc.yaml
                    kubectl apply -f /tmp/k8s-deploy/mysql-deployment.yaml
                    kubectl apply -f /tmp/k8s-deploy/mysql-service.yaml

                    kubectl apply -f /tmp/k8s-deploy/backend-deployment.yaml
                    kubectl apply -f /tmp/k8s-deploy/backend-service.yaml

                    kubectl apply -f /tmp/k8s-deploy/frontend-deployment.yaml
                    kubectl apply -f /tmp/k8s-deploy/frontend-service.yaml

                    # Clean up temp copies
                    rm -rf /tmp/k8s-deploy/
                """
            }
        }

        // ── Stage 5: Verify Deployments ───────────────────────────────────────
        stage('Verify') {
            steps {
                echo "=== Stage 5: Verify Deployments ==="

                sh """
                    # Wait for MySQL (single replica, may take longer)
                    echo "→ Waiting for mysql rollout..."
                    kubectl rollout status deployment/mysql \\
                        -n ${K8S_NAMESPACE} --timeout=180s

                    # Wait for backend (2 replicas, probe needs DB ready)
                    echo "→ Waiting for backend rollout..."
                    kubectl rollout status deployment/backend \\
                        -n ${K8S_NAMESPACE} --timeout=180s

                    # Wait for frontend (2 replicas)
                    echo "→ Waiting for frontend rollout..."
                    kubectl rollout status deployment/frontend \\
                        -n ${K8S_NAMESPACE} --timeout=120s

                    # Final status report
                    echo ""
                    echo "════════════════════════════════════════"
                    echo "  Pods & Services in namespace: ${K8S_NAMESPACE}"
                    echo "════════════════════════════════════════"
                    kubectl get pods,svc -n ${K8S_NAMESPACE} -o wide
                """
            }
        }
    }

    // ─── Post ────────────────────────────────────────────────────────────────────
    post {
        success {
            echo """
╔══════════════════════════════════════════════════════╗
║  ✅  BUILD & DEPLOY SUCCEEDED  (Build #${BUILD_NUMBER})  ║
╚══════════════════════════════════════════════════════╝

Access the application:
  minikube service frontend -n hackathon --url

Or via NodePort directly:
  http://<minikube-ip>:30080

Docker Hub images pushed:
  ${FRONTEND_IMAGE}:${IMAGE_TAG}
  ${BACKEND_IMAGE}:${IMAGE_TAG}
"""
        }
        failure {
            echo """
╔══════════════════════════════════════════════════════╗
║  ❌  BUILD FAILED  (Build #${BUILD_NUMBER})              ║
╚══════════════════════════════════════════════════════╝

Common fixes:
  • ImagePullBackOff  → check DOCKERHUB_USER env var and 'dockerhub-creds' credential
  • docker: permission denied → add jenkins to docker group, restart Jenkins
  • kubectl: connection refused → copy minikube kubeconfig to /var/lib/jenkins/.kube/
  See README.md → Troubleshooting section for details.
"""
        }
        always {
            sh 'docker system prune -f --filter "until=24h" || true'
        }
    }
}
