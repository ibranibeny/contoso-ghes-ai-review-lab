// Private DNS zones (global resources). Links and records are added after both VNets exist.
param tags object = {}
param ghesFqdn string
param labZoneName string

var zoneNames = [
  'privatelink.blob.core.windows.net'
  'privatelink.cognitiveservices.azure.com'
  'privatelink.openai.azure.com'
  'privatelink.services.ai.azure.com'
  ghesFqdn // split-horizon: the appliance's public name resolves to its private IP inside the VNets
  labZoneName // lab.contoso.com: internal names such as mcp.lab.contoso.com
]

resource zones 'Microsoft.Network/privateDnsZones@2024-06-01' = [for z in zoneNames: {
  name: z
  location: 'global'
  tags: tags
}]

output blobZoneId string = zones[0].id
output cognitiveZoneId string = zones[1].id
output openaiZoneId string = zones[2].id
output servicesAiZoneId string = zones[3].id
output ghesZoneName string = zones[4].name
output labZoneName string = zones[5].name
output zoneNames array = zoneNames
