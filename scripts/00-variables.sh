#!/usr/bin/env bash
# =============================================================================
# AI code review for GHES - hybrid lab
# 00-variables.sh: shared settings. Every step script sources this file.
# Run from Azure Cloud Shell (Bash), inside the scripts/ folder.
# =============================================================================
az config set extension.use_dynamic_install=yes_without_prompt -o none 2>/dev/null

export DEPLOYMENT="ghes-ai-lab"
export LOC_ONP="indonesiacentral"   # "Contoso on-prem" data centre (GHES appliance)
export LOC_AZ="southeastasia"       # Azure landing zone (AKS runners, MCP server, API Management)
export LOC_AI="eastus"              # Microsoft Foundry
export RG_ONP="rg-ghes-onprem-idc"
export RG_AZ="rg-ghes-ai-sea"
export RG_AI="rg-ghes-foundry-eus"

export GHES_VM_SIZE="${GHES_VM_SIZE:-Standard_E8s_v5}"   # memory optimized, premium storage (GitHub docs)
export AKS_NODE_SIZE="${AKS_NODE_SIZE:-Standard_D4s_v5}"
export MCP_VM_SIZE="${MCP_VM_SIZE:-Standard_D2s_v5}"
export DEPLOY_APIM="${DEPLOY_APIM:-true}"

export GHES_ORG="contoso"
export GHES_ADMIN="ibranibeny"                      # first site administrator on the appliance
export GHES_ADMIN_EMAIL="ibranibeny@contoso.com"
export RUNNER_SET="ai-review-runners"               # ARC scale set name = the runs-on label
export RUNNER_NS="arc-runners"
export RUNNER_SA="ghes-reviewer"

# Lab state: secrets are generated once, kept in your Cloud Shell home (mode 600) and copied to Key Vault later.
export LAB="$HOME/.ghes-lab"
mkdir -p "$LAB" && chmod 700 "$LAB"
if [ ! -f "$LAB/secrets.env" ]; then
  umask 077
  {
    echo "export VPN_PSK='$(openssl rand -hex 24)'"
    echo "export GHES_MGMT_PASS='Mgmt-$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 20)'"
    echo "export GHES_ADMIN_PASS='Ghes-$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 20)'"
  } > "$LAB/secrets.env"
fi
# shellcheck disable=SC1091
source "$LAB/secrets.env"
[ -f "$LAB/id_rsa" ] || ssh-keygen -q -t rsa -b 4096 -N '' -C 'ghes-lab' -f "$LAB/id_rsa"
export SSH_PUB="$LAB/id_rsa.pub"

# Read deployment outputs once they exist (empty before the first deployment).
out() { az deployment sub show -n "$DEPLOYMENT" --query "properties.outputs.$1.value" -o tsv 2>/dev/null; }
if [ -z "${LAB_OUTPUTS_LOADED:-}" ] && az deployment sub show -n "$DEPLOYMENT" -o none 2>/dev/null; then
  GHES_HOST="$(out ghesFqdn)";        export GHES_HOST
  GHES_PUBLIC_IP="$(out ghesPublicIp)"; export GHES_PUBLIC_IP
  ST_ACTIONS="$(out actionsStorageAccount)"; export ST_ACTIONS
  AKS_NAME="$(out aksName)";          export AKS_NAME
  REVIEWER_CLIENT_ID="$(out reviewerClientId)"; export REVIEWER_CLIENT_ID
  ACR_NAME="$(out acrName)";          export ACR_NAME
  KV_NAME="$(out keyVaultName)";      export KV_NAME
  AI_ENDPOINT="$(out aiEndpointForRunners)"; export AI_ENDPOINT
  MODEL_DEPLOYMENT="$(out modelDeployment)"; export MODEL_DEPLOYMENT
  FOUNDRY_ACCOUNT="$(out foundryAccount)";   export FOUNDRY_ACCOUNT
  export LAB_OUTPUTS_LOADED=1
fi

ghes_api() { # ghes_api METHOD PATH [JSON] - REST call to the appliance with the admin token
  local m="$1" p="$2" d="${3:-}"
  curl -sS -X "$m" -H "Authorization: Bearer $(cat "$LAB/ghes-token" 2>/dev/null)" \
       -H "Accept: application/vnd.github+json" ${d:+-H "Content-Type: application/json" -d "$d"} \
       "https://$GHES_HOST/api/v3$p"
}

echo "Subscription : $(az account show --query name -o tsv) ($(az account show --query id -o tsv))"
echo "Deployment   : $DEPLOYMENT  |  $RG_ONP ($LOC_ONP)  |  $RG_AZ ($LOC_AZ)  |  $RG_AI ($LOC_AI)"
[ -n "${GHES_HOST:-}" ] && echo "GHES         : https://$GHES_HOST"
true
