#!/usr/bin/env bash
# Step 07 (optional): keyless identity for the public docs pipeline (screenshots import + narrated video).
# A user-assigned managed identity trusted by GitHub OIDC for this repository's main branch, allowed to pull the
# screenshot artifact from the lab registry (AcrPull) and to synthesise speech (Cognitive Services Speech User).
# Usage: bash 07-docs-pipeline-identity.sh <owner>/<repo>
source ./00-variables.sh >/dev/null
REPO_SLUG="${1:-ibranibeny/contoso-ghes-ai-review-lab}"; ID=id-gh-narration
UNIQ=${GHES_HOST#ghes-contoso-}; UNIQ=${UNIQ%%.*}; SPEECH="spch-ghes-lab-$UNIQ"
echo "--- Azure AI Speech with a custom domain (required for Microsoft Entra ID authentication)"
az cognitiveservices account create -n "$SPEECH" -g "$RG_AZ" -l "$LOC_AZ" --kind SpeechServices --sku S0 \
  --custom-domain "$SPEECH" --yes --query properties.endpoint -o tsv
echo "--- managed identity $ID, trusted by GitHub Actions on main"
az identity create -g "$RG_AZ" -n "$ID" --query clientId -o tsv
# GitHub now issues subject claims with immutable owner and repository IDs for new repositories, for example
#   repo:octo-org@123/octo-repo@456:ref:refs/heads/main
# Trust both formats; the IDs come from the public GitHub API.
OWNER=${REPO_SLUG%/*}; NAME=${REPO_SLUG#*/}
IDS=$(curl -s "https://api.github.com/repos/$REPO_SLUG" | jq -r '"\(.owner.id) \(.id)"')
read -r OWNER_ID REPO_ID <<< "$IDS"
for s in "repo:$REPO_SLUG:ref:refs/heads/main" "repo:$OWNER@$OWNER_ID/$NAME@$REPO_ID:ref:refs/heads/main"; do
  n=gh-main-$(echo -n "$s" | md5sum | cut -c1-8)
  az identity federated-credential create -g "$RG_AZ" --identity-name "$ID" -n "$n" \
    --issuer https://token.actions.githubusercontent.com --subject "$s" --audiences api://AzureADTokenExchange -o none \
    && echo "    trusts $s"
done
PID=$(az identity show -g "$RG_AZ" -n "$ID" --query principalId -o tsv)
sleep 20
az role assignment create --assignee-object-id "$PID" --assignee-principal-type ServicePrincipal \
  --role "Cognitive Services Speech User" --scope "$(az cognitiveservices account show -n "$SPEECH" -g "$RG_AZ" --query id -o tsv)" -o none
az role assignment create --assignee-object-id "$PID" --assignee-principal-type ServicePrincipal \
  --role AcrPull --scope "$(az acr show -n "$ACR_NAME" --query id -o tsv)" -o none
echo "Repository variables to set: AZURE_CLIENT_ID=$(az identity show -g "$RG_AZ" -n "$ID" --query clientId -o tsv)"
echo "  AZURE_TENANT_ID=$(az account show --query tenantId -o tsv)  LAB_ACR=$ACR_NAME  SPEECH_ENDPOINT=https://$SPEECH.cognitiveservices.azure.com/"
