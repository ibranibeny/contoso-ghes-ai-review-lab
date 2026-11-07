#!/usr/bin/env bash
# Delete everything (the VPN gateways, API Management, AKS and the GHES VM bill by the hour).
source ./00-variables.sh >/dev/null
for rg in "$RG_AZ" "$RG_ONP" "$RG_AI"; do az group delete -n "$rg" --yes --no-wait && echo "Deleting $rg"; done
az deployment sub delete -n "$DEPLOYMENT" --no-wait 2>/dev/null
echo "Deletion runs in the background (about 20 minutes). Key Vault and Foundry stay soft-deleted: purge them if you redeploy with the same names."
