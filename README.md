# AI code review for GitHub Enterprise Server: hybrid lab

GitHub Enterprise Server (GHES) has no built-in Copilot code review. This lab builds one that keeps code and
credentials inside the network: a GitHub Actions job on self-hosted runners reads the pull request, asks a model
in **Microsoft Foundry** through an **API Management AI gateway**, grounds the review with two **external MCP
servers** (GitHub's MCP server pointed at GHES, and Contoso's engineering standards), then posts a review and a
required status check.

Workshop guide and demo video: **https://ibranibeny.github.io/contoso-ghes-ai-review-lab/**

| Site | Region | What runs there |
|---|---|---|
| "Contoso data centre" (simulated) | Indonesia Central | GHES appliance VM, Actions blob storage (private endpoint), VPN gateway |
| Azure landing zone | Southeast Asia | Private AKS with Actions Runner Controller, MCP server VM, API Management (internal), private endpoint to Foundry, Key Vault, ACR, Log Analytics, VPN gateway |
| AI | East US | Microsoft Foundry account, project and model deployment (private endpoint, keyless) |

The two sites are joined by a site-to-site IPsec VPN (IKEv2), standing in for ExpressRoute.

## Run it (Azure Cloud Shell, Bash)

```bash
git clone https://github.com/ibranibeny/contoso-ghes-ai-review-lab.git && cd contoso-ghes-ai-review-lab/scripts
./00-preflight.sh                                   # providers, VM sizes, GHES image, models + quota in East US
MODEL_NAME=<model> MODEL_VERSION=<version> PRESENTER_IP=<your-ip> ./01-deploy-infra.sh
./02-wait-infra.sh                                  # 45-60 minutes: VPN gateways and API Management
./10-ghes-init.sh ~/ghes-trial.ghl                  # license, root password, host name, apply
./11-ghes-tls-actions.sh                            # Let's Encrypt + Actions on Azure Blob
./12-ghes-bootstrap.sh                              # org, repo, variables, required status check
./20-runner-image.sh && ./21-arc-install.sh         # runner image in ACR, ARC on private AKS
./30-mcp-check.sh                                   # MCP servers up, GHES reachable over the VPN
./40-demo-pr.sh                                     # open the demo PR and watch the AI review
./99-cleanup.sh                                     # delete everything
```

You need a GHES license: request a 45-day trial at https://github.com/enterprise/trial and download the `.ghl` file.

## Repository layout

| Path | Contents |
|---|---|
| `infra/` | Bicep: `main.bicep` (subscription scope) and modules per site |
| `scripts/` | Numbered steps, run from Cloud Shell |
| `mcp/` | Docker Compose for the MCP VM: `github-mcp-server` (HTTP, read-only, GHES) and `standards-mcp` (FastMCP) |
| `runner/` | Runner image: `actions-runner` + the reviewer (`review.py`, instructions, pinned dependencies) |
| `ghes/` | Sample repository `contoso-orders-api` (with the `ai-review.yml` workflow) and the demo pull request |
| `docs/` | GitHub Pages workshop guide, architecture, agent studio and video |

## Lab shortcuts (not for production)

- GHES has a public IP allow-listed to the presenter and Cloud Shell, and uses a `cloudapp.azure.com` name with
  subdomain isolation off. Production: no public IP, a corporate domain, subdomain isolation on.
- Actions storage uses a connection string. Production: OpenID Connect to Azure Blob.
- API Management is the Developer tier (no SLA); Foundry uses one Global Standard deployment.
- The VPN replaces ExpressRoute; one gateway per site, no active-active.

Sample code and names are fictitious (Contoso). Not an official Microsoft or GitHub product.
