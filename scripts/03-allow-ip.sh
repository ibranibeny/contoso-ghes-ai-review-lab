#!/usr/bin/env bash
# Add your current IP (Cloud Shell) and optional extra IPs to the GHES NSG and the Foundry network allow-list.
# Usage: ./03-allow-ip.sh [extra-ip ...]
source ./00-variables.sh >/dev/null
CS_IP=$(curl -s https://api.ipify.org)
# Merge: what the NSG already allows + this Cloud Shell session + any extra IPs given as arguments.
CURRENT=$(az network nsg rule show -g "$RG_ONP" --nsg-name nsg-ghes -n Allow-Admin-Allowlist --query "sourceAddressPrefixes[]" -o tsv 2>/dev/null)
{ echo "$CURRENT"; cat "$LAB/allowed-ips" 2>/dev/null; echo "$CS_IP/32"; for ip in "$@"; do echo "${ip%/32}/32"; done; } | grep -E '^[0-9.]+(/[0-9]+)?$' | sed -E 's#^([0-9.]+)$#\1/32#' | sort -u > "$LAB/allowed-ips.new"
mv "$LAB/allowed-ips.new" "$LAB/allowed-ips"
az network nsg rule update -g "$RG_ONP" --nsg-name nsg-ghes -n Allow-Admin-Allowlist \
  --source-address-prefixes $(tr '\n' ' ' < "$LAB/allowed-ips") -o none
FOUNDRY_ACCOUNT=${FOUNDRY_ACCOUNT:-$(az cognitiveservices account list -g "$RG_AI" --query "[0].name" -o tsv 2>/dev/null)}
for ip in $(sed 's#/32##' "$LAB/allowed-ips"); do
  [ -n "$FOUNDRY_ACCOUNT" ] && az cognitiveservices account network-rule add -g "$RG_AI" -n "$FOUNDRY_ACCOUNT" --ip-address "$ip" -o none 2>/dev/null
done
echo "Allow-list now: $(tr '\n' ' ' < "$LAB/allowed-ips")"
