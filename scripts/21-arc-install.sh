#!/usr/bin/env bash
# Step 21: Actions Runner Controller on the private AKS cluster (az aks command invoke: no public API server).
# Scale set "ai-review-runners" registers at the contoso organisation on GHES; runner pods use workload identity.
source ./00-variables.sh >/dev/null
IMG=$(cat "$LAB/runner-image")
W=$(mktemp -d)
cat > "$W/values.yaml" <<YAML
githubConfigUrl: https://$GHES_HOST/$GHES_ORG
githubConfigSecret: ghes-arc-token
runnerScaleSetName: $RUNNER_SET
minRunners: 1
maxRunners: 4
template:
  metadata:
    labels:
      azure.workload.identity/use: "true"
  spec:
    serviceAccountName: $RUNNER_SA
    containers:
      - name: runner
        image: $IMG
        command: ["/home/runner/run.sh"]
        resources:
          requests: { cpu: "500m", memory: 1Gi }
          limits: { cpu: "2", memory: 4Gi }
YAML
cat > "$W/sa.yaml" <<YAML
apiVersion: v1
kind: Namespace
metadata: { name: $RUNNER_NS }
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: $RUNNER_SA
  namespace: $RUNNER_NS
  annotations:
    azure.workload.identity/client-id: $REVIEWER_CLIENT_ID
YAML
cat > "$W/install.sh" <<SH
set -e
helm upgrade --install arc --namespace arc-systems --create-namespace \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set-controller
kubectl apply -f sa.yaml
kubectl -n $RUNNER_NS create secret generic ghes-arc-token --from-literal=github_token=\$(cat token) --dry-run=client -o yaml | kubectl apply -f -
helm upgrade --install $RUNNER_SET --namespace $RUNNER_NS -f values.yaml \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set
sleep 45
kubectl get pods -n arc-systems; kubectl get pods -n $RUNNER_NS
SH
cp "$LAB/ghes-token" "$W/token"
cd "$W" && az aks command invoke -g "$RG_AZ" -n "$AKS_NAME" --command "bash install.sh" --file install.sh --file values.yaml --file sa.yaml --file token -o tsv --query logs
rm -rf "$W"
echo "--- runners registered on GHES"
ghes_api GET "/orgs/$GHES_ORG/actions/runners" | jq -c '.runners[]? | {name, status, labels: [.labels[].name]}'
