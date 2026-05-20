#!/bin/bash

# Configuration
SERVICE_NAME="domain-expansion-ar"
REGION="asia-east2"

echo "🚀 Deploying $SERVICE_NAME to Google Cloud Run in $REGION..."

# Deploy the service (without allow-unauthenticated to avoid redundant policy warnings)
gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform managed \
  --region $REGION \
  --session-affinity \
  --set-env-vars CLOUD_RUN=true \
  --ingress=all \
  --quiet

echo "✅ Deployment process finished!"
echo "🔗 URL: $(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)')"
echo "📢 NOTE: If the URL is 'Forbidden', please manually click 'Allow public access' in the Cloud Run Console."
