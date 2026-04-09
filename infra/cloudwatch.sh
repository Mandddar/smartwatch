#!/usr/bin/env bash
#
# VitalWatch — CloudWatch alarms for production monitoring
#
# Creates alarms for:
#   - 5xx error rate (App Runner)
#   - High response latency (App Runner)
#   - RDS CPU utilization
#   - RDS free storage space
#
# Usage: ./infra/cloudwatch.sh
#
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
APP_NAME="vitalwatch"
APP_RUNNER_SERVICE="${APP_NAME}-api"
RDS_INSTANCE="${APP_NAME}-db"
SNS_TOPIC="${APP_NAME}-alerts"

log() { echo "=> $*"; }

# Create SNS topic for alarm notifications
log "Creating SNS alarm topic..."
TOPIC_ARN=$(aws sns create-topic \
  --name "$SNS_TOPIC" \
  --region "$REGION" \
  --query 'TopicArn' \
  --output text)
log "SNS topic: ${TOPIC_ARN}"

echo ""
echo "IMPORTANT: Subscribe your email to receive alerts:"
echo "  aws sns subscribe --topic-arn ${TOPIC_ARN} --protocol email --notification-endpoint YOUR_EMAIL@example.com --region ${REGION}"
echo ""

# Get App Runner service ARN
SERVICE_ARN=$(aws apprunner list-services \
  --region "$REGION" \
  --query "ServiceSummaryList[?ServiceName=='${APP_RUNNER_SERVICE}'].ServiceArn" \
  --output text)

if [ -z "$SERVICE_ARN" ] || [ "$SERVICE_ARN" = "None" ]; then
  log "WARNING: App Runner service not found. Skipping App Runner alarms."
else
  # Extract service ID from ARN for CloudWatch dimension
  SERVICE_ID=$(echo "$SERVICE_ARN" | grep -o '[^/]*$')

  # Alarm 1: 5xx Error Rate > 5% over 5 minutes
  log "Creating 5xx error rate alarm..."
  aws cloudwatch put-metric-alarm \
    --alarm-name "${APP_NAME}-5xx-errors" \
    --alarm-description "VitalWatch API 5xx error rate exceeded 5%" \
    --namespace "AWS/AppRunner" \
    --metric-name "5xxStatusResponses" \
    --dimensions "Name=ServiceName,Value=${APP_RUNNER_SERVICE}" \
    --statistic Sum \
    --period 300 \
    --evaluation-periods 2 \
    --threshold 10 \
    --comparison-operator GreaterThanThreshold \
    --alarm-actions "$TOPIC_ARN" \
    --ok-actions "$TOPIC_ARN" \
    --treat-missing-data notBreaching \
    --region "$REGION"

  # Alarm 2: P95 Latency > 3 seconds
  log "Creating high latency alarm..."
  aws cloudwatch put-metric-alarm \
    --alarm-name "${APP_NAME}-high-latency" \
    --alarm-description "VitalWatch API P95 latency exceeded 3 seconds" \
    --namespace "AWS/AppRunner" \
    --metric-name "RequestLatency" \
    --dimensions "Name=ServiceName,Value=${APP_RUNNER_SERVICE}" \
    --extended-statistic p95 \
    --period 300 \
    --evaluation-periods 3 \
    --threshold 3000 \
    --comparison-operator GreaterThanThreshold \
    --alarm-actions "$TOPIC_ARN" \
    --ok-actions "$TOPIC_ARN" \
    --treat-missing-data notBreaching \
    --region "$REGION"
fi

# Alarm 3: RDS CPU > 80%
log "Creating RDS CPU alarm..."
aws cloudwatch put-metric-alarm \
  --alarm-name "${APP_NAME}-rds-cpu" \
  --alarm-description "VitalWatch RDS CPU utilization exceeded 80%" \
  --namespace "AWS/RDS" \
  --metric-name "CPUUtilization" \
  --dimensions "Name=DBInstanceIdentifier,Value=${RDS_INSTANCE}" \
  --statistic Average \
  --period 300 \
  --evaluation-periods 3 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions "$TOPIC_ARN" \
  --ok-actions "$TOPIC_ARN" \
  --treat-missing-data notBreaching \
  --region "$REGION"

# Alarm 4: RDS Free Storage < 2GB
log "Creating RDS storage alarm..."
aws cloudwatch put-metric-alarm \
  --alarm-name "${APP_NAME}-rds-storage" \
  --alarm-description "VitalWatch RDS free storage below 2GB" \
  --namespace "AWS/RDS" \
  --metric-name "FreeStorageSpace" \
  --dimensions "Name=DBInstanceIdentifier,Value=${RDS_INSTANCE}" \
  --statistic Average \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 2147483648 \
  --comparison-operator LessThanThreshold \
  --alarm-actions "$TOPIC_ARN" \
  --ok-actions "$TOPIC_ARN" \
  --treat-missing-data notBreaching \
  --region "$REGION"

log ""
log "=== CloudWatch alarms created ==="
log "Alarms:"
log "  - ${APP_NAME}-5xx-errors      (>10 5xx responses in 10 min)"
log "  - ${APP_NAME}-high-latency    (P95 latency >3s for 15 min)"
log "  - ${APP_NAME}-rds-cpu         (CPU >80% for 15 min)"
log "  - ${APP_NAME}-rds-storage     (Free storage <2GB)"
log ""
log "Don't forget to subscribe your email:"
log "  aws sns subscribe --topic-arn ${TOPIC_ARN} --protocol email --notification-endpoint YOUR_EMAIL --region ${REGION}"
