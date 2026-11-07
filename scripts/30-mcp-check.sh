#!/usr/bin/env bash
# Step 30: prepare and check the MCP VM (no public IP): trust the Contoso lab CA (GitHub's MCP server calls GHES
# over TLS), restart the containers, check health and that the VM reaches GHES over the VPN.
source ./00-variables.sh >/dev/null
CA_B64=$(base64 -w0 "$LAB/pki/ca.crt")
az vm run-command invoke -g "$RG_AZ" -n vm-mcp-01 --command-id RunShellScript --query 'value[0].message' -o tsv --scripts "
echo '$CA_B64' | base64 -d > /usr/local/share/ca-certificates/contoso-lab-ca.crt && update-ca-certificates >/dev/null && echo 'lab CA trusted'
cd /opt/lab && git pull -q && cd mcp && docker compose up -d --build >/dev/null 2>&1
sleep 5; docker compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Ports}}'
echo; curl -s localhost:8080/healthz; echo
echo \"GHES resolves to: \$(getent hosts $GHES_HOST | awk '{print \$1}')\"
curl -s -o /dev/null -w 'GHES over VPN: HTTP %{http_code} in %{time_total}s\n' https://$GHES_HOST/api/v3/meta
" | sed -e '/^Enable succeeded:/d' -e '/^\[std/d'
