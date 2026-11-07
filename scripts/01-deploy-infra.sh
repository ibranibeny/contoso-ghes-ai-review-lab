#!/usr/bin/env bash
# Step 1: build and deploy the whole lab (three resource groups, three regions) with Bicep.
# Usage: MODEL_NAME=gpt-5.4 MODEL_VERSION=2026-03-05 PRESENTER_IP=203.0.113.10 ./01-deploy-infra.sh
# The VPN gateways and API Management are the long pole (30-60 minutes); the deployment runs in Azure, so you can close Cloud Shell.
source ./00-variables.sh
: "${MODEL_NAME:?set MODEL_NAME (see 00-preflight.sh)}"
: "${MODEL_VERSION:?set MODEL_VERSION (see 00-preflight.sh)}"

# Allow-list: Cloud Shell's egress IP plus the presenter's browser IP (optional, comma separated)
CS_IP=$(curl -s https://api.ipify.org)
IPS="$CS_IP/32"; for ip in ${PRESENTER_IP//,/ }; do IPS="$IPS ${ip%/32}/32"; done
echo "$IPS" | tr ' ' '\n' | sort -u > "$LAB/allowed-ips"
ALLOWED_JSON=$(jq -R . < "$LAB/allowed-ips" | jq -cs .)

IMG="$(cat "$LAB/ghes-image-urn" 2>/dev/null || echo GitHub:GitHub-Enterprise:GitHub-Enterprise:latest)"
IFS=: read -r P O S V <<< "$IMG"
PLAN=$(az vm image show --urn "$IMG" --query "plan" -o json 2>/dev/null); [ -z "$PLAN" ] || [ "$PLAN" = "null" ] && PLAN='{}'
if [ "$PLAN" != "{}" ]; then az vm image terms accept --urn "$IMG" -o none && echo "Marketplace terms accepted for $IMG"; fi

jq -n --arg ssh "$(cat "$SSH_PUB")" --arg psk "$VPN_PSK" --argjson ips "$ALLOWED_JSON" \
      --arg oid "$(az ad signed-in-user show --query id -o tsv)" \
      --arg vm "$GHES_VM_SIZE" --arg aks "$AKS_NODE_SIZE" --arg mcp "$MCP_VM_SIZE" \
      --arg mn "$MODEL_NAME" --arg mv "$MODEL_VERSION" --arg msku "${MODEL_SKU:-GlobalStandard}" --argjson mcap "${MODEL_CAPACITY:-100}" \
      --arg p "$P" --arg o "$O" --arg s "$S" --arg v "$V" --argjson plan "$PLAN" --argjson apim "$DEPLOY_APIM" '
  { "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#", contentVersion: "1.0.0.0",
    parameters: {
      sshPublicKey: {value: $ssh}, vpnSharedKey: {value: $psk}, allowedSourceIps: {value: $ips}, deployerPrincipalId: {value: $oid},
      ghesVmSize: {value: $vm}, aksNodeSize: {value: $aks}, mcpVmSize: {value: $mcp},
      ghesImage: {value: {publisher: $p, offer: $o, sku: $s, version: $v}}, ghesImagePlan: {value: $plan},
      modelName: {value: $mn}, modelVersion: {value: $mv}, modelSku: {value: $msku}, modelCapacity: {value: $mcap},
      deployApim: {value: $apim} } }' > "$LAB/params.json"
chmod 600 "$LAB/params.json"

cd ../infra
az bicep build --file main.bicep --stdout > /dev/null && echo "Bicep build: OK"
az deployment sub validate -n "$DEPLOYMENT" -l "$LOC_AZ" -f main.bicep -p @"$LAB/params.json" --query properties.provisioningState -o tsv
echo "--- deploy (runs in Azure; safe to close Cloud Shell) ---"
az deployment sub create -n "$DEPLOYMENT" -l "$LOC_AZ" -f main.bicep -p @"$LAB/params.json" --no-wait
echo "Started $(date '+%H:%M:%S'). Follow it with ./02-wait-infra.sh or in the portal: Subscriptions > Deployments > $DEPLOYMENT"
