// Microsoft Foundry in East US: AIServices account (Entra ID only), a project and the reviewer model deployment.
// Inbound: private endpoint from the Southeast Asia VNet (created in azure.bicep) plus an allow-list for the portal.
param location string
param tags object = {}
param uniq string
param allowedSourceIps array
param modelDeploymentName string
param modelName string
param modelVersion string
param modelSku string
param modelCapacity int
param logAnalyticsId string

resource account 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: 'aif-ghes-${uniq}'
  location: location
  tags: tags
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: 'aif-ghes-${uniq}'
    allowProjectManagement: true
    disableLocalAuth: true // keys are off: every caller uses Microsoft Entra ID
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Deny' // only the allow-listed IPs (portal) and the private endpoint get in
      ipRules: [for ip in allowedSourceIps: {
        value: replace(ip, '/32', '')
      }]
      virtualNetworkRules: []
    }
  }
}

resource project 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: account
  name: 'proj-code-review'
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    displayName: 'AI code review for GHES'
    description: 'Model and evaluations for the Contoso pull request reviewer.'
  }
}

resource deployment 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = {
  parent: account
  name: modelDeploymentName
  dependsOn: [
    project
  ]
  sku: {
    name: modelSku
    capacity: modelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
  }
}

resource diag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'to-law'
  scope: account
  properties: {
    workspaceId: logAnalyticsId
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

output accountId string = account.id
output accountName string = account.name
output endpoint string = 'https://${account.properties.customSubDomainName}.openai.azure.com'
output deploymentName string = deployment.name
output projectName string = project.name
