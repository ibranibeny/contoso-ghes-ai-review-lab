// Standard, zone-redundant public IP for a VPN gateway (required for the AZ gateway SKUs).
param name string
param location string
param tags object = {}

resource pip 'Microsoft.Network/publicIPAddresses@2024-05-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Regional'
  }
  zones: [
    '1'
    '2'
    '3'
  ]
  properties: {
    publicIPAllocationMethod: 'Static'
    publicIPAddressVersion: 'IPv4'
  }
}

output id string = pip.id
output ipAddress string = pip.properties.ipAddress
