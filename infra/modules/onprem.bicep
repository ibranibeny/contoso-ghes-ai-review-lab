// "Contoso on-premises" data centre, simulated in Indonesia Central:
// VNet, GitHub Enterprise Server appliance (Azure Marketplace image), blob storage for GitHub Actions
// (reached only through a Private Endpoint) and the on-prem end of the site-to-site VPN.
param location string
param tags object = {}
param addressSpace string
param ghesSubnetPrefix string
param peSubnetPrefix string
param gatewaySubnetPrefix string
param ghesPrivateIp string
param ghesDnsLabel string
param ghesVmSize string
param ghesImage object
param ghesImagePlan object = {}
param ghesDataDiskGb int = 512
param adminUsername string
param sshPublicKey string

@description('Public client IPs (CIDR) allowed to reach the appliance: the presenter and Cloud Shell.')
param allowedSourceIps array

param blobDnsZoneId string
param storageAccountName string
param logAnalyticsId string

// region network
resource nsgGhes 'Microsoft.Network/networkSecurityGroups@2024-05-01' = {
  name: 'nsg-ghes'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        // Corporate users and the Azure landing zone (through the VPN) use the web UI, API and Git.
        name: 'Allow-Corp-Web-Git'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: 'VirtualNetwork'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRanges: [
            '443'
            '22'
          ]
        }
      }
      {
        // Lab shortcut: the presenter and Cloud Shell reach the appliance over its public IP, allow-listed.
        // Production: no public IP; administrators come in over ExpressRoute or a jump host.
        name: 'Allow-Admin-Allowlist'
        properties: {
          priority: 200
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefixes: allowedSourceIps
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRanges: [
            '443'
            '8443'
            '122'
            '22'
            '80'
          ]
        }
      }
    ]
  }
}

resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: 'vnet-onprem-idc'
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
        name: 'snet-ghes'
        properties: {
          addressPrefix: ghesSubnetPrefix
          networkSecurityGroup: {
            id: nsgGhes.id
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
        name: 'GatewaySubnet'
        properties: {
          addressPrefix: gatewaySubnetPrefix
        }
      }
    ]
  }
}
// endregion

// region GitHub Enterprise Server appliance
resource pipGhes 'Microsoft.Network/publicIPAddresses@2024-05-01' = {
  name: 'pip-ghes'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
    dnsSettings: {
      domainNameLabel: ghesDnsLabel
    }
  }
}

resource nicGhes 'Microsoft.Network/networkInterfaces@2024-05-01' = {
  name: 'nic-ghes'
  location: location
  tags: tags
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          privateIPAllocationMethod: 'Static'
          privateIPAddress: ghesPrivateIp
          subnet: {
            id: '${vnet.id}/subnets/snet-ghes'
          }
          publicIPAddress: {
            id: pipGhes.id
          }
        }
      }
    ]
  }
}

resource ghes 'Microsoft.Compute/virtualMachines@2024-07-01' = {
  name: 'vm-ghes'
  location: location
  tags: union(tags, {
    role: 'github-enterprise-server'
  })
  plan: empty(ghesImagePlan) ? null : ghesImagePlan
  properties: {
    hardwareProfile: {
      vmSize: ghesVmSize
    }
    osProfile: {
      computerName: 'ghes'
      adminUsername: adminUsername
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
      imageReference: ghesImage
      osDisk: {
        name: 'osdisk-vm-ghes'
        createOption: 'FromImage'
        managedDisk: {
          storageAccountType: 'Premium_LRS'
        }
      }
      dataDisks: [
        {
          // GitHub docs: the appliance needs a separate persistent data disk (500 GB for a trial).
          name: 'datadisk-vm-ghes'
          lun: 0
          createOption: 'Empty'
          diskSizeGB: ghesDataDiskGb
          caching: 'ReadWrite'
          managedDisk: {
            storageAccountType: 'Premium_LRS'
          }
        }
      ]
    }
    networkProfile: {
      networkInterfaces: [
        {
          id: nicGhes.id
        }
      ]
    }
    diagnosticsProfile: {
      bootDiagnostics: {
        enabled: true
      }
    }
  }
}
// endregion

// region Actions storage (block blobs), private only
resource st 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    // GHES reaches the account with a connection string (OIDC would need its token endpoint on the internet).
    allowSharedKeyAccess: true
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Disabled'
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
    }
  }
}

resource peBlob 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: 'pe-${storageAccountName}-blob'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: '${vnet.id}/subnets/snet-pe'
    }
    privateLinkServiceConnections: [
      {
        name: 'blob'
        properties: {
          privateLinkServiceId: st.id
          groupIds: [
            'blob'
          ]
        }
      }
    ]
  }
}

resource peBlobDns 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = {
  parent: peBlob
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'blob'
        properties: {
          privateDnsZoneId: blobDnsZoneId
        }
      }
    ]
  }
}

resource stDiag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'to-law'
  scope: st
  properties: {
    workspaceId: logAnalyticsId
    metrics: [
      {
        category: 'Transaction'
        enabled: true
      }
    ]
  }
}
// endregion

output vnetId string = vnet.id
output gatewaySubnetId string = '${vnet.id}/subnets/GatewaySubnet'
output ghesFqdn string = pipGhes.properties.dnsSettings.fqdn
output ghesPublicIp string = pipGhes.properties.ipAddress
output ghesPrivateIp string = ghesPrivateIp
output storageAccountName string = st.name
output nsgName string = nsgGhes.name
