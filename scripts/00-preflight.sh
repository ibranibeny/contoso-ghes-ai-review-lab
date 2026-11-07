#!/usr/bin/env bash
# Step 0: pre-flight. CLI + Bicep, resource providers, VM sizes per region, the GHES Marketplace image,
# and which chat models you can deploy in East US (GlobalStandard) with your quota.
# Writes a short report to ~/.ghes-lab/preflight.txt as well as the screen.
source ./00-variables.sh >/dev/null
R="$LAB/preflight.txt"; : > "$R"
say() { echo "$*" | tee -a "$R"; }

say "Azure CLI : $(az version --query '"azure-cli"' -o tsv)"
az bicep upgrade -o none 2>/dev/null || az bicep install -o none
say "Bicep     : $(az bicep version 2>/dev/null | head -1)"
for ns in Microsoft.Network Microsoft.Compute Microsoft.Storage Microsoft.ContainerService Microsoft.ContainerRegistry \
          Microsoft.KeyVault Microsoft.CognitiveServices Microsoft.ApiManagement Microsoft.OperationalInsights Microsoft.Insights; do
  st=$(az provider show -n "$ns" --query registrationState -o tsv)
  [ "$st" = "Registered" ] || az provider register -n "$ns" -o none
  say "Provider  : $ns = $st"
done

check_size() { # region size
  local r; r=$(az vm list-skus -l "$1" --size "$2" --resource-type virtualMachines \
        --query "[?name=='$2'] | [0].length(restrictions[?type=='Location'])" -o tsv)
  if [ -z "$r" ]; then say "VM size   : $2 in $1 = NOT OFFERED"; elif [ "$r" != "0" ]; then say "VM size   : $2 in $1 = RESTRICTED for this subscription"; else say "VM size   : $2 in $1 = available"; fi
}
check_size "$LOC_ONP" "$GHES_VM_SIZE"
check_size "$LOC_AZ" "$AKS_NODE_SIZE"
check_size "$LOC_AZ" "$MCP_VM_SIZE"
say "Quota     : $LOC_ONP ESv5 family $(az vm list-usage -l "$LOC_ONP" --query "[?name.value=='standardESv5Family'].[currentValue,limit] | [0]" -o tsv | tr '\t' '/') vCPU used/limit"
say "Quota     : $LOC_AZ DSv5 family $(az vm list-usage -l "$LOC_AZ" --query "[?name.value=='standardDSv5Family'].[currentValue,limit] | [0]" -o tsv | tr '\t' '/') vCPU used/limit"

# GitHub Enterprise Server image in Indonesia Central (newest version) and whether it carries a Marketplace plan.
img=$(az vm image list -l "$LOC_ONP" -p GitHub -f GitHub-Enterprise --all --query "[].urn" -o tsv | sort -V | tail -1)
say "GHES image: ${img:-NOT FOUND in $LOC_ONP}"
if [ -n "$img" ]; then
  echo "$img" > "$LAB/ghes-image-urn"
  plan=$(az vm image show --urn "$img" --query "plan" -o json 2>/dev/null)
  say "GHES plan : ${plan:-none}"
fi

# Chat models in East US that support GlobalStandard, newest first, plus the matching quota.
say "Models    : (East US, GlobalStandard)"
az cognitiveservices model list -l "$LOC_AI" \
  --query "[?model.format=='OpenAI' && (starts_with(model.name,'gpt-5') || starts_with(model.name,'gpt-4.1')) && length(model.skus[?name=='GlobalStandard'])>\`0\` && model.lifecycleStatus!='Deprecated'].[model.name, model.version, model.lifecycleStatus]" \
  -o tsv | sort -u | tee -a "$R" | head -40
say "Quota     : (East US, GlobalStandard tokens-per-minute, in thousands)"
az cognitiveservices usage list -l "$LOC_AI" --query "[?contains(name.value,'GlobalStandard') && (contains(name.value,'gpt-5') || contains(name.value,'gpt-4.1'))].[name.value, currentValue, limit]" -o tsv | tee -a "$R" | head -40
say "Your IP   : $(curl -s https://api.ipify.org) (Cloud Shell egress, added to the allow-list)"
echo; echo "Report saved to $R"
