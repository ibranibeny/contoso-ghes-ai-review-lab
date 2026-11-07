#!/usr/bin/env bash
# Step 13 (workstation): organisation, repository with the sample app, Actions variables, required status check.
# Needs the admin token in ~/.ghes-lab/ghes-token (step 12).
# From Cloud Shell: source lib/ws.sh && ws "bash 13-ghes-bootstrap.sh"
source ./00-variables.sh >/dev/null
[ -s "$LAB/ghes-token" ] || { echo "Put the GHES admin token in $LAB/ghes-token first (step 12)"; exit 1; }
O=$GHES_ORG; R=contoso-orders-api; SRC="$PWD/../ghes/contoso-orders-api"

echo "--- organisation $O"
ghes_api POST /admin/organizations "{\"login\":\"$O\",\"admin\":\"$GHES_ADMIN\",\"profile_name\":\"Contoso\"}" | jq -c '{login, url}'
echo "--- repository $O/$R"
ghes_api POST "/orgs/$O/repos" "{\"name\":\"$R\",\"private\":true,\"auto_init\":false,\"description\":\"Contoso order service (AI review lab)\"}" | jq -c '{full_name, private}'

echo "--- push the sample app"
TMP=$(mktemp -d); cp -r "$SRC/." "$TMP"; cd "$TMP" || exit 1
git init -q -b main && git add -A && git -c user.name="$GHES_ADMIN" -c user.email="$GHES_ADMIN_EMAIL" commit -qm "Contoso orders API with AI review workflow"
git -c http.sslCAInfo="$LAB/pki/ca.crt" push -q "https://$GHES_ADMIN:$(cat "$LAB/ghes-token")@$GHES_HOST/$O/$R.git" main && echo "pushed main"
cd - >/dev/null || exit 1

echo "--- organisation Actions variables (non-secret configuration)"
for kv in "AI_ENDPOINT=$AI_ENDPOINT" "MODEL_DEPLOYMENT=$MODEL_DEPLOYMENT" \
          "MCP_GITHUB_URL=http://mcp.lab.contoso.com:8082/mcp" "MCP_STANDARDS_URL=http://mcp.lab.contoso.com:8080/mcp" \
          "REASONING_EFFORT=medium"; do
  k=${kv%%=*}; v=${kv#*=}
  ghes_api POST "/orgs/$O/actions/variables" "{\"name\":\"$k\",\"value\":\"$v\",\"visibility\":\"all\"}" >/dev/null || \
  ghes_api PATCH "/orgs/$O/actions/variables/$k" "{\"name\":\"$k\",\"value\":\"$v\",\"visibility\":\"all\"}" >/dev/null
  echo "  $k = $v"
done

echo "--- branch protection on main: AI review status required, 1 human approval"
ghes_api PUT "/repos/$O/$R/branches/main/protection" '{
  "required_status_checks": {"strict": false, "contexts": ["ai-review/foundry"]},
  "enforce_admins": false,
  "required_pull_request_reviews": {"required_approving_review_count": 1},
  "restrictions": null}' | jq -c '{checks: .required_status_checks.contexts, reviews: .required_pull_request_reviews.required_approving_review_count}'
echo "Repository: https://$GHES_HOST/$O/$R"
echo "STEP 13 DONE"
