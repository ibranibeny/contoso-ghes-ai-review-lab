// =============================================================================
// AI code review for GitHub Enterprise Server (GHES) - hybrid lab
// main.bicep (subscription scope). Three regions, one deployment:
//
//   "On-prem" (Indonesia Central) : GHES appliance VM, Actions blob storage (private endpoint), VPN gateway
//   Azure (Southeast Asia)        : AKS (Actions Runner Controller), MCP server VM, API Management (AI gateway),
//                                   private endpoint to Foundry, Key Vault, ACR, Log Analytics, VPN gateway
//   AI (East US)                  : Microsoft Foundry account + project + model deployment
//
//   Site-to-site IPsec VPN (IKEv2) between Indonesia Central and Southeast Asia stands in for ExpressRoute.
//
// Deploy: scripts/01-deploy-infra.sh  (az deployment sub create -n ghes-ai-lab -l southeastasia ...)
// =============================================================================
targetScope = 'subscription'

param locationOnprem string = 'indonesiacentral'
param locationAzure string = 'southeastasia'
param locationAi string = 'eastus'

param rgOnpremName string = 'rg-ghes-onprem-idc'
param rgAzureName string = 'rg-ghes-ai-sea'
param rgAiName string = 'rg-ghes-foundry-eus'

@description('Linux admin user on the VMs (GHES ignores it after setup; the MCP VM uses it).')
param adminUsername string = 'labadmin'

@description('SSH public key for the VMs and the GHES administrative shell.')
param sshPublicKey string

@secure()
@description('IPsec pre-shared key, identical on both connections.')
param vpnSharedKey string

@description('Public IPs (CIDR) allowed to reach GHES and the Foundry portal: the presenter and Cloud Shell.')
param allowedSourceIps array

@description('Object ID of the person running the deployment (AKS admin, Key Vault secrets, Foundry portal).')
param deployerPrincipalId string

param ghesVmSize string = 'Standard_E8s_v5'
param ghesImage object = {
  publisher: 'GitHub'
  offer: 'GitHub-Enterprise'
  sku: 'GitHub-Enterprise'
  version: 'latest'
}
param ghesImagePlan object = {}

param aksNodeSize string = 'Standard_D4s_v5'
param mcpVmSize string = 'Standard_D2s_v5'

param modelDeploymentName string = 'gpt-review'
param modelName string
param modelVersion string
param modelSku string = 'GlobalStandard'
param modelCapacity int = 100

param deployApim bool = true

@description('Public Git repository the MCP VM clones at boot (MCP server code and standards).')
param repoUrl string = 'https://github.com/ibranibeny/contoso-ghes-ai-review-lab.git'

param tags object = {
  lab: 'ghes-ai-code-review'
}

// ---- address plan (lab ranges) ----------------------------------------------
var onpremAddressSpace = '10.30.0.0/16'
var azureAddressSpace = '10.40.0.0/16'
var ghesPrivateIp = '10.30.1.10'
var mcpPrivateIp = '10.40.4.10'

var uniq = take(uniqueString(subscription().id, 'ghes-ai-lab'), 6)
var ghesDnsLabel = 'ghes-contoso-${uniq}'
var ghesFqdn = '${ghesDnsLabel}.${locationOnprem}.cloudapp.azure.com'

resource rgOnprem 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: rgOnpremName
  location: locationOnprem
  tags: union(tags, {
    site: 'contoso-onprem-simulated'
  })
}

resource rgAzure 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: rgAzureName
  location: locationAzure
  tags: union(tags, {
    site: 'azure-landing-zone'
  })
}

resource rgAi 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: rgAiName
  location: locationAi
  tags: union(tags, {
    site: 'ai-foundry'
  })
}

// Gateway public IPs first: each local network gateway needs the other side's address.
module pipOnprem 'modules/gateway-public-ip.bicep' = {
  scope: rgOnprem
  name: 'pip-vpngw-onprem-idc'
  params: {
    name: 'pip-vpngw-onprem-idc'
    location: locationOnprem
    tags: tags
  }
}

module pipAzure 'modules/gateway-public-ip.bicep' = {
  scope: rgAzure
  name: 'pip-vpngw-ai-sea'
  params: {
    name: 'pip-vpngw-ai-sea'
    location: locationAzure
    tags: tags
  }
}

module monitoring 'modules/monitoring.bicep' = {
  scope: rgAzure
  name: 'monitoring'
  params: {
    location: locationAzure
    tags: tags
    uniq: uniq
  }
}

module dnsZones 'modules/dns-zones.bicep' = {
  scope: rgAzure
  name: 'dns-zones'
  params: {
    tags: tags
    ghesFqdn: ghesFqdn
    labZoneName: 'lab.contoso.com'
  }
}

module foundry 'modules/foundry.bicep' = {
  scope: rgAi
  name: 'foundry'
  params: {
    location: locationAi
    tags: tags
    uniq: uniq
    allowedSourceIps: allowedSourceIps
    modelDeploymentName: modelDeploymentName
    modelName: modelName
    modelVersion: modelVersion
    modelSku: modelSku
    modelCapacity: modelCapacity
    logAnalyticsId: monitoring.outputs.lawId
  }
}

module onprem 'modules/onprem.bicep' = {
  scope: rgOnprem
  name: 'onprem-site'
  params: {
    location: locationOnprem
    tags: tags
    addressSpace: onpremAddressSpace
    ghesSubnetPrefix: '10.30.1.0/24'
    peSubnetPrefix: '10.30.2.0/24'
    gatewaySubnetPrefix: '10.30.255.0/27'
    ghesPrivateIp: ghesPrivateIp
    ghesDnsLabel: ghesDnsLabel
    ghesVmSize: ghesVmSize
    ghesImage: ghesImage
    ghesImagePlan: ghesImagePlan
    adminUsername: adminUsername
    sshPublicKey: sshPublicKey
    allowedSourceIps: allowedSourceIps
    blobDnsZoneId: dnsZones.outputs.blobZoneId
    storageAccountName: 'stghesact${uniq}'
    logAnalyticsId: monitoring.outputs.lawId
  }
}

module azure 'modules/azure.bicep' = {
  scope: rgAzure
  name: 'azure-landing-zone'
  params: {
    location: locationAzure
    tags: tags
    uniq: uniq
    addressSpace: azureAddressSpace
    aksSubnetPrefix: '10.40.0.0/22'
    mcpSubnetPrefix: '10.40.4.0/24'
    peSubnetPrefix: '10.40.5.0/24'
    apimSubnetPrefix: '10.40.6.0/24'
    gatewaySubnetPrefix: '10.40.255.0/27'
    mcpPrivateIp: mcpPrivateIp
    aksNodeSize: aksNodeSize
    mcpVmSize: mcpVmSize
    adminUsername: adminUsername
    sshPublicKey: sshPublicKey
    deployerPrincipalId: deployerPrincipalId
    logAnalyticsId: monitoring.outputs.lawId
    foundryAccountId: foundry.outputs.accountId
    cognitiveZoneId: dnsZones.outputs.cognitiveZoneId
    openaiZoneId: dnsZones.outputs.openaiZoneId
    servicesAiZoneId: dnsZones.outputs.servicesAiZoneId
    ghesFqdn: ghesFqdn
    repoUrl: repoUrl
  }
}

module vpnOnprem 'modules/vpn-site.bicep' = {
  scope: rgOnprem
  name: 'vpn-onprem-idc'
  params: {
    location: locationOnprem
    tags: tags
    namePrefix: 'onprem-idc'
    gatewaySubnetId: onprem.outputs.gatewaySubnetId
    gatewayPublicIpId: pipOnprem.outputs.id
    remoteGatewayIp: pipAzure.outputs.ipAddress
    remoteAddressPrefixes: [
      azureAddressSpace
    ]
    vpnSharedKey: vpnSharedKey
  }
}

module vpnAzure 'modules/vpn-site.bicep' = {
  scope: rgAzure
  name: 'vpn-ai-sea'
  params: {
    location: locationAzure
    tags: tags
    namePrefix: 'ai-sea'
    gatewaySubnetId: azure.outputs.gatewaySubnetId
    gatewayPublicIpId: pipAzure.outputs.id
    remoteGatewayIp: pipOnprem.outputs.ipAddress
    remoteAddressPrefixes: [
      onpremAddressSpace
    ]
    vpnSharedKey: vpnSharedKey
  }
}

module dnsLinks 'modules/dns-links.bicep' = {
  scope: rgAzure
  name: 'dns-links'
  params: {
    tags: tags
    zoneNames: dnsZones.outputs.zoneNames
    vnetIds: [
      onprem.outputs.vnetId
      azure.outputs.vnetId
    ]
    ghesZoneName: dnsZones.outputs.ghesZoneName
    ghesPrivateIp: ghesPrivateIp
    labZoneName: dnsZones.outputs.labZoneName
    mcpPrivateIp: mcpPrivateIp
  }
}

module apim 'modules/apim.bicep' = if (deployApim) {
  scope: rgAzure
  name: 'apim-ai-gateway'
  params: {
    location: locationAzure
    tags: tags
    uniq: uniq
    subnetId: azure.outputs.apimSubnetId
    appInsightsId: monitoring.outputs.appiId
    foundryEndpoint: foundry.outputs.endpoint
    reviewerClientId: azure.outputs.reviewerClientId
  }
}

module apimDns 'modules/apim-dns.bicep' = if (deployApim) {
  scope: rgAzure
  name: 'apim-dns'
  params: {
    tags: tags
    gatewayHost: deployApim ? apim.outputs.gatewayHost : ''
    privateIp: deployApim ? apim.outputs.privateIp : ''
    vnetId: azure.outputs.vnetId
  }
}

module foundryRbac 'modules/foundry-rbac.bicep' = {
  scope: rgAi
  name: 'foundry-rbac'
  params: {
    accountName: foundry.outputs.accountName
    apimPrincipalId: deployApim ? apim.outputs.principalId : ''
    reviewerPrincipalId: azure.outputs.reviewerPrincipalId
    allowDirectAccess: !deployApim
    deployerPrincipalId: deployerPrincipalId
  }
}

output ghesFqdn string = onprem.outputs.ghesFqdn
output ghesPublicIp string = onprem.outputs.ghesPublicIp
output ghesPrivateIp string = ghesPrivateIp
output actionsStorageAccount string = onprem.outputs.storageAccountName
output onpremGatewayIp string = pipOnprem.outputs.ipAddress
output azureGatewayIp string = pipAzure.outputs.ipAddress
output aksName string = azure.outputs.aksName
output reviewerClientId string = azure.outputs.reviewerClientId
output acrName string = azure.outputs.acrName
output acrLoginServer string = azure.outputs.acrLoginServer
output keyVaultName string = azure.outputs.keyVaultName
output mcpUrl string = 'http://mcp.lab.contoso.com'
output natEgressIp string = azure.outputs.natEgressIp
output foundryAccount string = foundry.outputs.accountName
output foundryEndpoint string = foundry.outputs.endpoint
output modelDeployment string = foundry.outputs.deploymentName
output apimGateway string = deployApim ? 'https://${apim.outputs.gatewayHost}/openai/v1' : ''
output aiEndpointForRunners string = deployApim ? 'https://${apim.outputs.gatewayHost}/openai/v1' : '${foundry.outputs.endpoint}/openai/v1'
output uniq string = uniq
