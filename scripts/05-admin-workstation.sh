#!/usr/bin/env bash
# Step 05: private admin workstation inside the "on-premises" network.
# GHES is not published to the internet: the Contoso tenant removes inbound internet rules for management ports
# automatically, and that is the production design anyway. The appliance is administered from a workstation in
# the data centre network. Cloud Shell drives it with Azure Run Command, so no inbound port is opened anywhere
# and the workstation has no public IP address.
source ./00-variables.sh >/dev/null
VM=vm-corp-ws01; SUBNET=snet-workstations; PREFIX=10.30.3.0/24; NAT=ng-onprem-idc
echo "--- outbound internet for the data centre network: NAT gateway"
az network public-ip create -g "$RG_ONP" -n "pip-$NAT" -l "$LOC_ONP" --sku Standard -o none
az network nat gateway create -g "$RG_ONP" -n "$NAT" -l "$LOC_ONP" --public-ip-addresses "pip-$NAT" -o none
echo "--- workstation subnet $PREFIX with its own NSG (Azure default rules only: no inbound from the internet)"
az network nsg create -g "$RG_ONP" -n nsg-workstations -l "$LOC_ONP" -o none
az network vnet subnet create -g "$RG_ONP" --vnet-name vnet-onprem-idc -n "$SUBNET" --address-prefixes "$PREFIX" \
  --nat-gateway "$NAT" --network-security-group nsg-workstations --default-outbound false -o none
echo "--- appliance NSG: management console (8443) and admin SSH (122) from the workstation subnet only"
az network nsg rule create -g "$RG_ONP" --nsg-name nsg-ghes -n Allow-Admin-Workstations --priority 110 \
  --direction Inbound --access Allow --protocol Tcp --source-address-prefixes "$PREFIX" \
  --destination-port-ranges 8443 122 443 22 -o none
echo "--- workstation VM (Ubuntu 24.04, no public IP, managed identity)"
az vm create -g "$RG_ONP" -n "$VM" -l "$LOC_ONP" --image Canonical:ubuntu-24_04-lts:server:latest \
  --size Standard_D2s_v5 --vnet-name vnet-onprem-idc --subnet "$SUBNET" --public-ip-address "" --nsg "" \
  --admin-username azureuser --ssh-key-values "$SSH_PUB" --custom-data cloud-init/workstation.yaml \
  --assign-identity --os-disk-size-gb 64 --tags lab=ghes-ai-review role=admin-workstation -o none
PID=$(az vm show -g "$RG_ONP" -n "$VM" --query identity.principalId -o tsv)
echo "--- the workstation may push demo media (screenshots) to the lab registry"
az role assignment create --assignee-object-id "$PID" --assignee-principal-type ServicePrincipal --role AcrPush \
  --scope "$(az acr show -n "$ACR_NAME" --query id -o tsv)" -o none
echo "--- waiting for cloud-init (tools + headless Chromium), about 5 minutes"
for i in $(seq 1 30); do
  R=$(az vm run-command invoke -g "$RG_ONP" -n "$VM" --command-id RunShellScript \
      --scripts "test -f /opt/lab/ready && echo READY || echo waiting" --query 'value[0].message' -o tsv 2>/dev/null)
  echo "$R" | grep -q READY && { echo "workstation ready"; break; }
  sleep 30
done
bash ./06-workstation-sync.sh
