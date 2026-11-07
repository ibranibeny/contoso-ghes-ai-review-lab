// Shared observability: one Log Analytics workspace and a workspace-based Application Insights.
param location string
param tags object = {}
param uniq string

resource law 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'law-ghes-ai-${uniq}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appi 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-ghes-ai-${uniq}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: law.id
  }
}

output lawId string = law.id
output appiId string = appi.id
output appiName string = appi.name
