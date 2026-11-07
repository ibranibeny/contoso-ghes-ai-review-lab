// Links every private DNS zone to both VNets and adds the A records for GHES and the MCP server.
param tags object = {}
param zoneNames array
param vnetIds array
param ghesZoneName string
param ghesPrivateIp string
param labZoneName string
param mcpPrivateIp string

resource zones 'Microsoft.Network/privateDnsZones@2024-06-01' existing = [for z in zoneNames: {
  name: z
}]

// Every zone is linked to each VNet (2 x N links).
resource links 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = [for i in range(0, length(zoneNames) * length(vnetIds)): {
  parent: zones[i % length(zoneNames)]
  name: 'link-${last(split(vnetIds[i / length(zoneNames)], '/'))}'
  location: 'global'
  tags: tags
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnetIds[i / length(zoneNames)]
    }
  }
}]

resource ghesZone 'Microsoft.Network/privateDnsZones@2024-06-01' existing = {
  name: ghesZoneName
}

resource ghesApex 'Microsoft.Network/privateDnsZones/A@2024-06-01' = {
  parent: ghesZone
  name: '@'
  properties: {
    ttl: 300
    aRecords: [
      {
        ipv4Address: ghesPrivateIp
      }
    ]
  }
}

resource labZone 'Microsoft.Network/privateDnsZones@2024-06-01' existing = {
  name: labZoneName
}

resource mcpRecord 'Microsoft.Network/privateDnsZones/A@2024-06-01' = {
  parent: labZone
  name: 'mcp'
  properties: {
    ttl: 300
    aRecords: [
      {
        ipv4Address: mcpPrivateIp
      }
    ]
  }
}
