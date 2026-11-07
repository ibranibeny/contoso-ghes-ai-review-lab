#!/usr/bin/env bash
# Step 30: check the MCP VM (no public IP): containers, health, and that it reaches GHES over the VPN.
source ./00-variables.sh >/dev/null
az vm run-command invoke -g "$RG_AZ" -n vm-mcp-01 --command-id RunShellScript --query 'value[0].message' -o tsv --scripts "
cloud-init status --long | head -3
cd /opt/lab/mcp && docker compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Ports}}'
echo; curl -s localhost:8080/healthz; echo
getent hosts $GHES_HOST
curl -s -o /dev/null -w 'GHES over VPN: HTTP %{http_code} in %{time_total}s\n' https://$GHES_HOST/api/v3/meta
"
