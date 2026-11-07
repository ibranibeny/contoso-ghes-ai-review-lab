#!/usr/bin/env bash
# Workstation: push the screenshots in /opt/lab/shots to the lab container registry as an OCI artifact.
# The public lab repository pulls them with a GitHub Actions workflow (OIDC + AcrPull, no stored secrets) and
# commits them to docs/ (see .github/workflows/import-media.yml). Usage: bash lib/publish-media.sh [tag]
source ./00-variables.sh >/dev/null
REG="$ACR_NAME.azurecr.io"; TAG="${1:-shots}"
AAD=$(curl -s -H Metadata:true "http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://management.azure.com/" | jq -r .access_token)
RT=$(curl -s -X POST "https://$REG/oauth2/exchange" --data-urlencode grant_type=access_token \
      --data-urlencode "service=$REG" --data-urlencode "access_token=$AAD" | jq -r .refresh_token)
echo "$RT" | oras login "$REG" -u 00000000-0000-0000-0000-000000000000 --password-stdin >/dev/null
cd /opt/lab/shots && oras push "$REG/lab-media:$TAG" --artifact-type application/vnd.contoso.lab.media $(ls *.png *.json *.txt 2>/dev/null) | tail -2
