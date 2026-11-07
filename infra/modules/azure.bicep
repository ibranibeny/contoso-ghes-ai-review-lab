// Azure landing zone in Southeast Asia: the network that faces "on-prem" over the VPN, the AKS cluster that
// runs the GitHub Actions runners (Actions Runner Controller), the MCP server VM, the private endpoint to
// Microsoft Foundry (East US), Key Vault and Azure Container Registry.
param location string
param tags object = {}
param uniq string
param addressSpace string
param aksSubnetPrefix string
param mcpSubnetPrefix string
param peSubnetPrefix string
param apimSubnetPrefix string
param gatewaySubnetPrefix string
param mcpPrivateIp string
param aksNodeSize string
param aksNodeCount int = 2
param mcpVmSize string
param adminUsername string
param sshPublicKey string
param deployerPrincipalId string
param logAnalyticsId string
param foundryAccountId string
param cognitiveZoneId string
param openaiZoneId string
param servicesAiZoneId string
param ghesFqdn string
param repoUrl string
param repoRef string = 'main'

@description('Namespace and service account the ARC runner pods use (workload identity).')
param runnerNamespace string = 'arc-runners'
param runnerServiceAccount string = 'ghes-reviewer'

// region network
resource natPip 'Microsoft.Network/publicIPAddresses@2024-05-01' = {
  name: 'pip-natgw-sea'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
  }
}

// Explicit egress for AKS and the MCP VM (container images, packages). Production: Azure Firewall with an FQDN allow-list.
resource natGw 'Microsoft.Network/natGateways@2024-05-01' = {
  name: 'natgw-sea'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
  }
  properties: {
    idleTimeoutInMinutes: 10
    publicIpAddresses: [
      {
        id: natPip.id
      }
    ]
  }
}

resource nsgAks 'Microsoft.Network/networkSecurityGroups@2024-05-01' = {
  name: 'nsg-aks'
  location: location
  tags: tags
  properties: {
    securityRules: []
  }
}

resource nsgMcp 'Microsoft.Network/networkSecurityGroups@2024-05-01' = {
  name: 'nsg-mcp'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        // Only the runner subnet may call the MCP servers.
        name: 'Allow-Runners-To-MCP'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: aksSubnetPrefix
          sourcePortRange: '*'
          destinationAddressPrefix: mcpSubnetPrefix
          destinationPortRanges: [
            '8080'
            '8082'
          ]
        }
      }
      {
        name: 'Deny-Other-VNet-To-MCP'
        properties: {
          priority: 200
          direction: 'Inbound'
          access: 'Deny'
          protocol: '*'
          sourceAddressPrefix: 'VirtualNetwork'
          sourcePortRange: '*'
          destinationAddressPrefix: mcpSubnetPrefix
          destinationPortRange: '*'
        }
      }
    ]
  }
}

// API Management (stv2, internal VNet mode) needs these rules on its subnet.
resource nsgApim 'Microsoft.Network/networkSecurityGroups@2024-05-01' = {
  name: 'nsg-apim'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'Allow-APIM-Management'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: 'ApiManagement'
          sourcePortRange: '*'
          destinationAddressPrefix: 'VirtualNetwork'
          destinationPortRange: '3443'
        }
      }
      {
        name: 'Allow-AzureLB-Health'
        properties: {
          priority: 110
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: 'AzureLoadBalancer'
          sourcePortRange: '*'
          destinationAddressPrefix: 'VirtualNetwork'
          destinationPortRange: '6390'
        }
      }
      {
        name: 'Allow-Runners-HTTPS'
        properties: {
          priority: 120
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: aksSubnetPrefix
          sourcePortRange: '*'
          destinationAddressPrefix: 'VirtualNetwork'
          destinationPortRange: '443'
        }
      }
      {
        name: 'Allow-Storage-Out'
        properties: {
          priority: 100
          direction: 'Outbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: 'VirtualNetwork'
          sourcePortRange: '*'
          destinationAddressPrefix: 'Storage'
          destinationPortRange: '443'
        }
      }
      {
        name: 'Allow-Sql-Out'
        properties: {
          priority: 110
          direction: 'Outbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: 'VirtualNetwork'
          sourcePortRange: '*'
          destinationAddressPrefix: 'Sql'
          destinationPortRange: '1433'
        }
      }
      {
        name: 'Allow-KeyVault-Out'
        properties: {
          priority: 120
          direction: 'Outbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: 'VirtualNetwork'
          sourcePortRange: '*'
          destinationAddressPrefix: 'AzureKeyVault'
          destinationPortRange: '443'
        }
      }
      {
        name: 'Allow-Monitor-Out'
        properties: {
          priority: 130
          direction: 'Outbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: 'VirtualNetwork'
          sourcePortRange: '*'
          destinationAddressPrefix: 'AzureMonitor'
          destinationPortRanges: [
            '1886'
            '443'
          ]
        }
      }
    ]
  }
}

resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: 'vnet-ai-sea'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        addressSpace
      ]
    }
    subnets: [
      {
        name: 'snet-aks'
        properties: {
          addressPrefix: aksSubnetPrefix
          networkSecurityGroup: {
            id: nsgAks.id
          }
          natGateway: {
            id: natGw.id
          }
          defaultOutboundAccess: false
        }
      }
      {
        name: 'snet-mcp'
        properties: {
          addressPrefix: mcpSubnetPrefix
          networkSecurityGroup: {
            id: nsgMcp.id
          }
          natGateway: {
            id: natGw.id
          }
          defaultOutboundAccess: false
        }
      }
      {
        name: 'snet-pe'
        properties: {
          addressPrefix: peSubnetPrefix
          defaultOutboundAccess: false
        }
      }
      {
        name: 'snet-apim'
        properties: {
          addressPrefix: apimSubnetPrefix
          networkSecurityGroup: {
            id: nsgApim.id
          }
        }
      }
      {
        name: 'GatewaySubnet'
        properties: {
          addressPrefix: gatewaySubnetPrefix
        }
      }
    ]
  }
}
// endregion

// region shared services
resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-ghes-${uniq}'
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    // Lab: public endpoint so Cloud Shell can write the generated secrets. Production: private endpoint only.
    publicNetworkAccess: 'Enabled'
  }
}

resource kvOfficer 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(kv.id, deployerPrincipalId, 'kv-secrets-officer')
  scope: kv
  properties: {
    principalId: deployerPrincipalId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7')
  }
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'acrghes${uniq}'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
  }
  properties: {
    adminUserEnabled: false
  }
}
// endregion

// region identities
resource aksIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-aks-ghes-runners'
  location: location
  tags: tags
}

// AKS (bring-your-own subnet + NAT gateway) needs Network Contributor on the networking resources it uses.
resource aksNetContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, aksIdentity.id, 'network-contributor')
  properties: {
    principalId: aksIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4d97b98b-1d4f-4787-a291-c67834d212e7')
  }
}

// The identity the AI reviewer job uses (workload identity, no secrets). API Management only accepts this client ID.
resource reviewerIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-ghes-reviewer'
  location: location
  tags: tags
}
// endregion

// region AKS for Actions Runner Controller
resource aks 'Microsoft.ContainerService/managedClusters@2024-09-01' = {
  name: 'aks-ghes-runners'
  location: location
  tags: tags
  dependsOn: [
    aksNetContributor
  ]
  sku: {
    name: 'Base'
    tier: 'Free' // lab; production uses Standard for the uptime SLA
  }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${aksIdentity.id}': {}
    }
  }
  properties: {
    dnsPrefix: 'aks-ghes-${uniq}'
    enableRBAC: true
    disableLocalAccounts: true
    aadProfile: {
      managed: true
      enableAzureRBAC: true
      tenantID: subscription().tenantId
    }
    apiServerAccessProfile: {
      enablePrivateCluster: true // no public API server; admins use 'az aks command invoke'
    }
    oidcIssuerProfile: {
      enabled: true
    }
    securityProfile: {
      workloadIdentity: {
        enabled: true
      }
    }
    autoUpgradeProfile: {
      upgradeChannel: 'patch'
      nodeOSUpgradeChannel: 'NodeImage'
    }
    networkProfile: {
      networkPlugin: 'azure'
      networkPluginMode: 'overlay'
      networkDataplane: 'cilium'
      networkPolicy: 'cilium'
      podCidr: '10.244.0.0/16'
      serviceCidr: '10.0.0.0/16'
      dnsServiceIP: '10.0.0.10'
      outboundType: 'userAssignedNATGateway'
    }
    agentPoolProfiles: [
      {
        name: 'system'
        mode: 'System'
        vmSize: aksNodeSize
        count: aksNodeCount
        enableAutoScaling: true
        minCount: 1
        maxCount: 4
        osType: 'Linux'
        osSKU: 'AzureLinux'
        type: 'VirtualMachineScaleSets'
        vnetSubnetID: '${vnet.id}/subnets/snet-aks'
        maxPods: 60
      }
    ]
    addonProfiles: {
      omsagent: {
        enabled: true
        config: {
          logAnalyticsWorkspaceResourceID: logAnalyticsId
          useAADAuth: 'true'
        }
      }
    }
  }
}

resource aksAdmin 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aks.id, deployerPrincipalId, 'aks-rbac-cluster-admin')
  scope: aks
  properties: {
    principalId: deployerPrincipalId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b1ff04bb-8a4e-4dc4-8eb5-8693973ce19b')
  }
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, aks.id, 'acrpull')
  scope: acr
  properties: {
    principalId: aks.properties.identityProfile.kubeletidentity.objectId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

resource reviewerFederation 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: reviewerIdentity
  name: 'aks-arc-runners'
  properties: {
    issuer: aks.properties.oidcIssuerProfile.issuerURL
    subject: 'system:serviceaccount:${runnerNamespace}:${runnerServiceAccount}'
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}
// endregion

// region MCP server VM (GitHub MCP server + Contoso standards MCP server, Docker)
var cloudInit = format('''#cloud-config
package_update: true
packages:
  - docker.io
  - docker-compose-v2
  - git
write_files:
  - path: /etc/ghes-lab.env
    permissions: '0644'
    content: |
      GHES_HOST={0}
runcmd:
  - systemctl enable --now docker
  - git clone --depth 1 --branch {2} {1} /opt/lab
  - cp /etc/ghes-lab.env /opt/lab/mcp/.env
  - cd /opt/lab/mcp && docker compose up -d --build
''', ghesFqdn, repoUrl, repoRef)

resource nicMcp 'Microsoft.Network/networkInterfaces@2024-05-01' = {
  name: 'nic-vm-mcp-01'
  location: location
  tags: tags
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          privateIPAllocationMethod: 'Static'
          privateIPAddress: mcpPrivateIp
          subnet: {
            id: '${vnet.id}/subnets/snet-mcp'
          }
        }
      }
    ]
  }
}

resource mcpVm 'Microsoft.Compute/virtualMachines@2024-07-01' = {
  name: 'vm-mcp-01'
  location: location
  tags: union(tags, {
    role: 'mcp-servers'
  })
  properties: {
    hardwareProfile: {
      vmSize: mcpVmSize
    }
    osProfile: {
      computerName: 'mcp01'
      adminUsername: adminUsername
      customData: base64(cloudInit)
      linuxConfiguration: {
        disablePasswordAuthentication: true
        ssh: {
          publicKeys: [
            {
              path: '/home/${adminUsername}/.ssh/authorized_keys'
              keyData: sshPublicKey
            }
          ]
        }
      }
    }
    storageProfile: {
      imageReference: {
        publisher: 'Canonical'
        offer: 'ubuntu-24_04-lts'
        sku: 'server'
        version: 'latest'
      }
      osDisk: {
        name: 'osdisk-vm-mcp-01'
        createOption: 'FromImage'
        managedDisk: {
          storageAccountType: 'Premium_LRS'
        }
      }
    }
    networkProfile: {
      networkInterfaces: [
        {
          id: nicMcp.id
        }
      ]
    }
    securityProfile: {
      securityType: 'TrustedLaunch'
      uefiSettings: {
        secureBootEnabled: true
        vTpmEnabled: true
      }
    }
    diagnosticsProfile: {
      bootDiagnostics: {
        enabled: true
      }
    }
  }
}
// endregion

// region private endpoint to Microsoft Foundry (East US), placed in this VNet
resource peFoundry 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: 'pe-foundry-eus'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: '${vnet.id}/subnets/snet-pe'
    }
    privateLinkServiceConnections: [
      {
        name: 'foundry'
        properties: {
          privateLinkServiceId: foundryAccountId
          groupIds: [
            'account'
          ]
        }
      }
    ]
  }
}

resource peFoundryDns 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = {
  parent: peFoundry
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'cognitiveservices'
        properties: {
          privateDnsZoneId: cognitiveZoneId
        }
      }
      {
        name: 'openai'
        properties: {
          privateDnsZoneId: openaiZoneId
        }
      }
      {
        name: 'services-ai'
        properties: {
          privateDnsZoneId: servicesAiZoneId
        }
      }
    ]
  }
}
// endregion

output vnetId string = vnet.id
output gatewaySubnetId string = '${vnet.id}/subnets/GatewaySubnet'
output apimSubnetId string = '${vnet.id}/subnets/snet-apim'
output aksName string = aks.name
output aksOidcIssuer string = aks.properties.oidcIssuerProfile.issuerURL
output reviewerClientId string = reviewerIdentity.properties.clientId
output reviewerPrincipalId string = reviewerIdentity.properties.principalId
output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
output keyVaultName string = kv.name
output mcpPrivateIp string = mcpPrivateIp
output natEgressIp string = natPip.properties.ipAddress
