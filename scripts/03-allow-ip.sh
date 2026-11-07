#!/usr/bin/env bash
# Step 03: allow your public IP (and Cloud Shell's) through the Microsoft Foundry network rules, so you can open
# the Foundry portal from your browser. The runners never use this path: they reach Foundry through API
# Management and private endpoints.
# Note: GHES itself is NOT published to the internet. The Contoso tenant removes inbound internet rules for
# management ports automatically, which is also the production design: administer GHES from the private admin
# workstation (steps 05-06).
# Usage: bash 03-allow-ip.sh [extra-ip ...]
source ./00-variables.sh >/dev/null
CS_IP=$(curl -s https://api.ipify.org)
FOUNDRY_ACCOUNT=${FOUNDRY_ACCOUNT:-$(az cognitiveservices account list -g "$RG_AI" --query "[0].name" -o tsv 2>/dev/null)}
for ip in "$CS_IP" "$@"; do
  az cognitiveservices account network-rule add -g "$RG_AI" -n "$FOUNDRY_ACCOUNT" --ip-address "${ip%/32}" -o none 2>/dev/null
  echo "Foundry network rules: allowed $ip"
done
