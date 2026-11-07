#!/usr/bin/env bash
# Step 11: TLS with Let's Encrypt (ACME HTTP-01 needs port 80 open to the internet for a few minutes),
# then GitHub Actions with Azure Blob storage reached through the private endpoint.
source ./00-variables.sh >/dev/null
SSH="ssh -p 122 -i $LAB/id_rsa -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 admin@$GHES_HOST"

echo "--- temporary NSG rule: port 80 from Internet for the ACME challenge"
az network nsg rule create -g "$RG_ONP" --nsg-name nsg-ghes -n Temp-ACME-HTTP --priority 150 --access Allow \
  --direction Inbound --protocol Tcp --source-address-prefixes Internet --destination-port-ranges 80 -o none
$SSH -- "ghe-ssl-acme -e" ; RC=$?
az network nsg rule delete -g "$RG_ONP" --nsg-name nsg-ghes -n Temp-ACME-HTTP -o none
echo "ACME exit code: $RC (temporary rule removed)"
curl -sI "https://$GHES_HOST" | head -1

echo "--- GitHub Actions storage (Azure Blob over private endpoint)"
KEY=$(az storage account keys list -g "$RG_ONP" -n "$ST_ACTIONS" --query '[0].value' -o tsv)
CS="DefaultEndpointsProtocol=https;AccountName=$ST_ACTIONS;AccountKey=$KEY;EndpointSuffix=core.windows.net"
$SSH -- "nslookup $ST_ACTIONS.blob.core.windows.net | tail -3; ghe-actions-precheck -p azure -cs '$CS'"
$SSH -- "ghe-config app.actions.enabled true && ghe-config secrets.actions.storage.blob-provider azure && ghe-config secrets.actions.storage.azure.connection-string '$CS' && ghe-config-apply"
$SSH -- "ghe-actions-check" || true
