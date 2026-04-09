#!/usr/bin/env bash
#
# VitalWatch — AWS infrastructure setup & deployment script
# Creates ECR, RDS, Secrets Manager, and App Runner resources.
#
# Prerequisites: AWS CLI v2, Docker, jq
# Usage:
#   export AWS_REGION=ap-south-1
#   ./infra/deploy.sh setup      # One-time: create all AWS resources
#   ./infra/deploy.sh deploy     # Build, push, and deploy new image
#   ./infra/deploy.sh status     # Check service health
#
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
APP_NAME="vitalwatch"
ECR_REPO="${APP_NAME}-backend"
RDS_INSTANCE="${APP_NAME}-db"
DB_NAME="smartwatch"
DB_USER="smartwatch"
SECRET_NAME="${APP_NAME}/prod"
APP_RUNNER_SERVICE="${APP_NAME}-api"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}"

log() { echo "=> $*"; }

cmd_setup() {
  log "Setting up AWS infrastructure in ${REGION}..."

  # 1. ECR Repository
  log "Creating ECR repository..."
  aws ecr create-repository \
    --repository-name "$ECR_REPO" \
    --region "$REGION" \
    --image-scanning-configuration scanOnPush=true \
    2>/dev/null || log "ECR repo already exists"

  # 2. Generate secrets
  DB_PASSWORD=$(openssl rand -base64 24 | tr -d '=/+' | head -c 32)
  JWT_SECRET=$(openssl rand -base64 48 | tr -d '=/+' | head -c 64)

  # 3. Store in Secrets Manager
  log "Storing secrets..."
  aws secretsmanager create-secret \
    --name "$SECRET_NAME" \
    --region "$REGION" \
    --secret-string "{\"db_password\":\"${DB_PASSWORD}\",\"jwt_secret\":\"${JWT_SECRET}\"}" \
    2>/dev/null || log "Secret already exists — updating..."
  aws secretsmanager update-secret \
    --secret-id "$SECRET_NAME" \
    --region "$REGION" \
    --secret-string "{\"db_password\":\"${DB_PASSWORD}\",\"jwt_secret\":\"${JWT_SECRET}\"}" \
    2>/dev/null || true

  # 4. RDS PostgreSQL (Free-tier eligible)
  log "Creating RDS instance (db.t4g.micro)..."
  aws rds create-db-instance \
    --db-instance-identifier "$RDS_INSTANCE" \
    --db-instance-class db.t4g.micro \
    --engine postgres \
    --engine-version "15" \
    --allocated-storage 20 \
    --db-name "$DB_NAME" \
    --master-username "$DB_USER" \
    --master-user-password "$DB_PASSWORD" \
    --publicly-accessible \
    --backup-retention-period 7 \
    --storage-type gp3 \
    --region "$REGION" \
    2>/dev/null || log "RDS instance already exists"

  log "Waiting for RDS to be available (this takes 5-10 minutes)..."
  aws rds wait db-instance-available \
    --db-instance-identifier "$RDS_INSTANCE" \
    --region "$REGION"

  RDS_ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier "$RDS_INSTANCE" \
    --region "$REGION" \
    --query 'DBInstances[0].Endpoint.Address' \
    --output text)
  log "RDS endpoint: ${RDS_ENDPOINT}"

  # 5. Build and push initial image
  cmd_deploy

  # 6. Create App Runner service
  log "Creating App Runner service..."
  cat > /tmp/apprunner-config.json <<EOF
{
  "ServiceName": "${APP_RUNNER_SERVICE}",
  "SourceConfiguration": {
    "AuthenticationConfiguration": {
      "AccessRoleArn": "arn:aws:iam::${ACCOUNT_ID}:role/AppRunnerECRAccessRole"
    },
    "AutoDeploymentsEnabled": true,
    "ImageRepository": {
      "ImageIdentifier": "${ECR_URI}:latest",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "8080",
        "RuntimeEnvironmentVariables": {
          "SPRING_PROFILES_ACTIVE": "prod",
          "SPRING_DATASOURCE_URL": "jdbc:postgresql://${RDS_ENDPOINT}:5432/${DB_NAME}",
          "SPRING_DATASOURCE_USERNAME": "${DB_USER}",
          "SPRING_DATASOURCE_PASSWORD": "${DB_PASSWORD}",
          "JWT_SECRET": "${JWT_SECRET}"
        }
      }
    }
  },
  "InstanceConfiguration": {
    "Cpu": "0.25 vCPU",
    "Memory": "0.5 GB"
  },
  "HealthCheckConfiguration": {
    "Protocol": "HTTP",
    "Path": "/actuator/health",
    "Interval": 10,
    "Timeout": 5,
    "HealthyThreshold": 1,
    "UnhealthyThreshold": 5
  }
}
EOF

  aws apprunner create-service \
    --cli-input-json file:///tmp/apprunner-config.json \
    --region "$REGION"

  log "App Runner service created. Waiting for it to start..."
  log "Check status: ./infra/deploy.sh status"
  log ""
  log "=== Setup complete! ==="
  log "Next steps:"
  log "  1. Wait for App Runner to finish deploying (~5 min)"
  log "  2. Run: ./infra/deploy.sh status"
  log "  3. Update eas.json APP_RUNNER_URL with the service URL"
  log "  4. Run: ./infra/cloudwatch.sh   (to set up alarms)"
}

cmd_deploy() {
  log "Building and pushing Docker image..."

  aws ecr get-login-password --region "$REGION" \
    | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

  docker build -t "${ECR_URI}:latest" -t "${ECR_URI}:$(git rev-parse --short HEAD)" ./backend

  docker push "${ECR_URI}:latest"
  docker push "${ECR_URI}:$(git rev-parse --short HEAD)"

  log "Image pushed. App Runner will auto-deploy if auto-deployments are enabled."
  log "Or trigger manually: aws apprunner start-deployment --service-arn <ARN>"
}

cmd_status() {
  SERVICE_URL=$(aws apprunner list-services \
    --region "$REGION" \
    --query "ServiceSummaryList[?ServiceName=='${APP_RUNNER_SERVICE}'].ServiceUrl" \
    --output text)

  if [ -z "$SERVICE_URL" ] || [ "$SERVICE_URL" = "None" ]; then
    log "App Runner service '${APP_RUNNER_SERVICE}' not found in ${REGION}"
    exit 1
  fi

  log "Service URL: https://${SERVICE_URL}"

  STATUS=$(aws apprunner describe-service \
    --service-arn "$(aws apprunner list-services \
      --region "$REGION" \
      --query "ServiceSummaryList[?ServiceName=='${APP_RUNNER_SERVICE}'].ServiceArn" \
      --output text)" \
    --region "$REGION" \
    --query 'Service.Status' \
    --output text)
  log "Service status: ${STATUS}"

  log "Health check:"
  curl -sf "https://${SERVICE_URL}/actuator/health" 2>/dev/null \
    && echo "" \
    || log "Health check failed (service may still be starting)"
}

case "${1:-help}" in
  setup)  cmd_setup  ;;
  deploy) cmd_deploy ;;
  status) cmd_status ;;
  *)
    echo "Usage: $0 {setup|deploy|status}"
    echo "  setup  — Create all AWS resources (one-time)"
    echo "  deploy — Build + push new Docker image"
    echo "  status — Check App Runner service health"
    ;;
esac
