#!/usr/bin/env bash
# Step 20: build the runner image (actions-runner + reviewer) in Azure Container Registry. No local Docker needed.
source ./00-variables.sh >/dev/null
TAG="ghes-ai-reviewer-runner:$(date +%Y%m%d%H%M)"
az acr build -r "$ACR_NAME" -t "$TAG" -t ghes-ai-reviewer-runner:latest ../runner --no-logs -o none && \
  echo "$ACR_NAME.azurecr.io/$TAG" | tee "$LAB/runner-image"
az acr repository show-tags -n "$ACR_NAME" --repository ghes-ai-reviewer-runner -o tsv | tail -3
