// One end of the site-to-site IPsec tunnel: route-based VPN gateway, local network gateway and connection.
param location string
param tags object = {}
param namePrefix string
param gatewaySubnetId string
param gatewayPublicIpId string

@description('Public IP of the VPN gateway on the other side.')
param remoteGatewayIp string

@description('Address spaces reachable through the tunnel.')
param remoteAddressPrefixes array

@secure()
param vpnSharedKey string

resource gw 'Microsoft.Network/virtualNetworkGateways@2024-05-01' = {
  name: 'vpngw-${namePrefix}'
  location: location
  tags: tags
  properties: {
    gatewayType: 'Vpn'
    vpnType: 'RouteBased'
    vpnGatewayGeneration: 'Generation1'
    sku: {
      name: 'VpnGw1AZ'
      tier: 'VpnGw1AZ'
    }
    activeActive: false
    enableBgp: false
    ipConfigurations: [
      {
        name: 'default'
        properties: {
          privateIPAllocationMethod: 'Dynamic'
          subnet: {
            id: gatewaySubnetId
          }
          publicIPAddress: {
            id: gatewayPublicIpId
          }
        }
      }
    ]
  }
}

resource lng 'Microsoft.Network/localNetworkGateways@2024-05-01' = {
  name: 'lng-to-${namePrefix}-peer'
  location: location
  tags: tags
  properties: {
    gatewayIpAddress: remoteGatewayIp
    localNetworkAddressSpace: {
      addressPrefixes: remoteAddressPrefixes
    }
  }
}

resource cn 'Microsoft.Network/connections@2024-05-01' = {
  name: 'cn-${namePrefix}-s2s'
  location: location
  tags: tags
  properties: {
    connectionType: 'IPsec'
    connectionProtocol: 'IKEv2'
    virtualNetworkGateway1: {
      id: gw.id
      properties: {}
    }
    localNetworkGateway2: {
      id: lng.id
      properties: {}
    }
    sharedKey: vpnSharedKey
    enableBgp: false
  }
}

output gatewayId string = gw.id
output connectionName string = cn.name
