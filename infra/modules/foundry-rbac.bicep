// Who may call the model: API Management's managed identity (the AI gateway). Optionally the runners directly.
param accountName string
param apimPrincipalId string = ''
param reviewerPrincipalId string = ''
param allowDirectAccess bool = false
param deployerPrincipalId string

var openAiUser = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd' // Cognitive Services OpenAI User
var foundryUser = '53ca6127-db72-4b80-b1b0-d745d6d5456d' // Foundry User (formerly Azure AI User): portal + projects

resource account 'Microsoft.CognitiveServices/accounts@2025-06-01' existing = {
  name: accountName
}

resource apimRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(apimPrincipalId)) {
  name: guid(account.id, apimPrincipalId, openAiUser)
  scope: account
  properties: {
    principalId: apimPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', openAiUser)
  }
}

resource reviewerRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (allowDirectAccess && !empty(reviewerPrincipalId)) {
  name: guid(account.id, reviewerPrincipalId, openAiUser)
  scope: account
  properties: {
    principalId: reviewerPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', openAiUser)
  }
}

resource deployerRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(account.id, deployerPrincipalId, foundryUser)
  scope: account
  properties: {
    principalId: deployerPrincipalId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', foundryUser)
  }
}
