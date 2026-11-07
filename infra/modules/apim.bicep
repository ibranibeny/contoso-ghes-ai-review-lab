// AI gateway: Azure API Management (Developer tier, stv2, internal VNet mode) in front of Microsoft Foundry.
// Callers authenticate with Microsoft Entra ID (the runner's workload identity); APIM calls Foundry with its own
// managed identity over the private endpoint, enforces a token quota per repository and emits token metrics.
param location string
param tags object = {}
param uniq string
param subnetId string
param appInsightsId string
param foundryEndpoint string
param reviewerClientId string
param publisherEmail string = 'platform@contoso.com'

var apimName = 'apim-ghes-${uniq}'

resource pip 'Microsoft.Network/publicIPAddresses@2024-05-01' = {
  name: 'pip-${apimName}'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
    dnsSettings: {
      domainNameLabel: apimName // stv2 management traffic only; the gateway itself is internal
    }
  }
}

resource apim 'Microsoft.ApiManagement/service@2024-05-01' = {
  name: apimName
  location: location
  tags: tags
  sku: {
    name: 'Developer'
    capacity: 1
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    publisherEmail: publisherEmail
    publisherName: 'Contoso Platform Engineering'
    virtualNetworkType: 'Internal'
    virtualNetworkConfiguration: {
      subnetResourceId: subnetId
    }
    publicIpAddressId: pip.id
  }
}

resource appi 'Microsoft.Insights/components@2020-02-02' existing = {
  name: last(split(appInsightsId, '/'))
}

resource logger 'Microsoft.ApiManagement/service/loggers@2024-05-01' = {
  parent: apim
  name: 'appi'
  properties: {
    loggerType: 'applicationInsights'
    resourceId: appInsightsId
    credentials: {
      instrumentationKey: appi.properties.InstrumentationKey
    }
  }
}

resource backend 'Microsoft.ApiManagement/service/backends@2024-05-01' = {
  parent: apim
  name: 'foundry-review'
  properties: {
    protocol: 'http'
    url: '${foundryEndpoint}/openai/v1'
    tls: {
      validateCertificateChain: true
      validateCertificateName: true
    }
    circuitBreaker: {
      rules: [
        {
          name: 'trip-on-throttling'
          tripDuration: 'PT30S'
          acceptRetryAfter: true
          failureCondition: {
            count: 3
            interval: 'PT1M'
            statusCodeRanges: [
              {
                min: 429
                max: 429
              }
              {
                min: 500
                max: 503
              }
            ]
          }
        }
      ]
    }
  }
}

resource api 'Microsoft.ApiManagement/service/apis@2024-05-01' = {
  parent: apim
  name: 'foundry-openai-v1'
  properties: {
    displayName: 'Foundry OpenAI v1 (AI code review)'
    path: 'openai/v1'
    protocols: [
      'https'
    ]
    serviceUrl: '${foundryEndpoint}/openai/v1'
    subscriptionRequired: false
  }
}

resource opPost 'Microsoft.ApiManagement/service/apis/operations@2024-05-01' = {
  parent: api
  name: 'post-any'
  properties: {
    displayName: 'POST *'
    method: 'POST'
    urlTemplate: '/*'
  }
}

resource opGet 'Microsoft.ApiManagement/service/apis/operations@2024-05-01' = {
  parent: api
  name: 'get-any'
  properties: {
    displayName: 'GET *'
    method: 'GET'
    urlTemplate: '/*'
  }
}

var policy = '''<policies>
  <inbound>
    <base />
    <validate-azure-ad-token tenant-id="{0}" failed-validation-httpcode="401" failed-validation-error-message="Only the reviewer workload identity may call this API.">
      <client-application-ids>
        <application-id>{1}</application-id>
      </client-application-ids>
      <audiences>
        <audience>https://cognitiveservices.azure.com</audience>
      </audiences>
    </validate-azure-ad-token>
    <llm-token-limit counter-key="@(context.Request.Headers.GetValueOrDefault(&quot;x-repo&quot;,&quot;unknown&quot;))" tokens-per-minute="100000" token-quota="5000000" token-quota-period="Monthly" estimate-prompt-tokens="false" remaining-tokens-header-name="x-ratelimit-remaining-tokens" tokens-consumed-header-name="x-tokens-consumed" />
    <llm-emit-token-metric namespace="ai-review">
      <dimension name="Repo" value="@(context.Request.Headers.GetValueOrDefault(&quot;x-repo&quot;,&quot;unknown&quot;))" />
      <dimension name="API ID" />
    </llm-emit-token-metric>
    <authentication-managed-identity resource="https://cognitiveservices.azure.com" />
    <set-backend-service backend-id="foundry-review" />
  </inbound>
  <backend>
    <base />
  </backend>
  <outbound>
    <base />
  </outbound>
  <on-error>
    <base />
  </on-error>
</policies>'''

resource apiPolicy 'Microsoft.ApiManagement/service/apis/policies@2024-05-01' = {
  parent: api
  name: 'policy'
  dependsOn: [
    backend
  ]
  properties: {
    format: 'rawxml'
    value: format(policy, subscription().tenantId, reviewerClientId)
  }
}

resource diag 'Microsoft.ApiManagement/service/apis/diagnostics@2024-05-01' = {
  parent: api
  name: 'applicationinsights'
  properties: {
    loggerId: logger.id
    alwaysLog: 'allErrors'
    metrics: true // required for llm-emit-token-metric
    sampling: {
      samplingType: 'fixed'
      percentage: 100
    }
    verbosity: 'information'
  }
}

output name string = apim.name
output principalId string = apim.identity.principalId
output gatewayHost string = '${apim.name}.azure-api.net'
output privateIp string = apim.properties.privateIPAddresses[0]
