#!/usr/bin/env bash
# Step 11: TLS with Let's Encrypt (ACME HTTP-01 needs port 80 open to the internet for a few minutes),
# then GitHub Actions with Azure Blob storage reached through the private endpoint.
# Usage: bash 11-ghes-tls-actions.sh [--actions-only]
source ./00-variables.sh >/dev/null
SSH="ssh -p 122 -i $LAB/id_rsa -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 admin@$GHES_HOST"

if [ "${1:-}" != "--actions-only" ]; then
  echo "--- TLS: Let's Encrypt certificate for $GHES_HOST"
  echo "    temporary NSG rule: port 80 from the internet for the ACME HTTP-01 challenge"
  az network nsg rule create -g "$RG_ONP" --nsg-name nsg-ghes -n Temp-ACME-HTTP --priority 150 --access Allow \
    --direction Inbound --protocol Tcp --source-address-prefixes Internet --destination-port-ranges 80 -o none
  $SSH -- "ghe-ssl-acme -e" 2>&1 | tail -8; RC=${PIPESTATUS[0]}
  az network nsg rule delete -g "$RG_ONP" --nsg-name nsg-ghes -n Temp-ACME-HTTP -o none
  echo "    ACME exit code: $RC (temporary rule removed)"
  echo | openssl s_client -connect "$GHES_HOST:443" -servername "$GHES_HOST" 2>/dev/null | openssl x509 -noout -issuer -enddate
fi

echo "--- GitHub Actions storage (Azure Blob through the private endpoint)"
# The appliance must resolve the storage account to its private endpoint (10.30.2.x): the private DNS zone
# link is created at the end of the infrastructure deployment.
IP=$($SSH -- "getent hosts $ST_ACTIONS.blob.core.windows.net" | awk '{print $1}')
echo "    $ST_ACTIONS.blob.core.windows.net -> ${IP:-unresolved}"
case "$IP" in
  10.*) ;;
  *) echo "    Not private yet. Wait for the deployment to finish (bash 02-wait-infra.sh), then: bash 11-ghes-tls-actions.sh --actions-only"; exit 0 ;;
esac
KEY=$(az storage account keys list -g "$RG_ONP" -n "$ST_ACTIONS" --query '[0].value' -o tsv)
CS="DefaultEndpointsProtocol=https;AccountName=$ST_ACTIONS;AccountKey=$KEY;EndpointSuffix=core.windows.net"
echo "    connection test (ghe-actions-precheck):"
$SSH -- "echo No | ghe-actions-precheck -p azure -cs '$CS'" 2>&1 | grep -viE 'accountkey|connection string' | tail -8
echo "    enabling GitHub Actions (ghe-config + ghe-config-apply, about 10 minutes)"
$SSH -- "ghe-config app.actions.enabled true && ghe-config secrets.actions.storage.blob-provider azure && ghe-config secrets.actions.storage.azure.connection-string '$CS' && ghe-config-apply" 2>&1 | tail -5
$SSH -- "ghe-actions-check" 2>&1 | tail -10 || true
lab_backup
