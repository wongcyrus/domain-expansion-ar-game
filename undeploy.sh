#!/bin/bash

# Configuration
SERVICE_NAME="domain-expansion-ar"
REGION="asia-east2"

echo "⚠️ Deleting $SERVICE_NAME from Google Cloud Run in $REGION..."

gcloud run services delete $SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --quiet

echo "✅ Service deleted."
