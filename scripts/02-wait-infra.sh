#!/usr/bin/env bash
# Step 2: show deployment progress (one line per module) and, when done, the outputs. Safe to re-run.
source ./00-variables.sh >/dev/null
s=$(az deployment sub show -n "$DEPLOYMENT" --query properties.provisioningState -o tsv)
echo "$(date '+%H:%M:%S')  $DEPLOYMENT: $s"
az deployment operation sub list -n "$DEPLOYMENT" \
  --query "[?properties.targetResource.resourceName!=null].{Module:properties.targetResource.resourceName, State:properties.provisioningState, Duration:properties.duration}" -o table
for m in onprem-site azure-landing-zone vpn-onprem-idc vpn-ai-sea foundry apim-ai-gateway; do
  rg=$RG_AZ; case $m in onprem-site|vpn-onprem-idc) rg=$RG_ONP;; foundry) rg=$RG_AI;; esac
  az deployment operation group list -g "$rg" -n "$m" --query "[?properties.provisioningState!='Succeeded'].{Resource:properties.targetResource.resourceName, State:properties.provisioningState, Error:properties.statusMessage.error.message}" -o table 2>/dev/null | sed "s/^/[$m] /"
done
if [ "$s" = "Succeeded" ]; then
  az deployment sub show -n "$DEPLOYMENT" --query "properties.outputs | {ghes:ghesFqdn.value, ghesIp:ghesPublicIp.value, aks:aksName.value, acr:acrName.value, kv:keyVaultName.value, foundry:foundryEndpoint.value, model:modelDeployment.value, ai:aiEndpointForRunners.value}" -o yaml
fi
