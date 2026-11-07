#!/usr/bin/env bash
# Step 21: Actions Runner Controller on the private AKS cluster (az aks command invoke: no public API server).
# Scale set "ai-review-runners" registers at the contoso organisation on GHES; runner pods use workload identity.
# The listener trusts the appliance certificate through the Contoso lab CA (githubServerTLS); the runner image
# already has the CA in its system store (step 20).
source ./00-variables.sh >/dev/null
source ./lib/ws.sh
IMG=$(cat "$LAB/runner-image")
[ -s "$LAB/ghes-token" ] || ws "cat /root/.ghes-lab/ghes-token" | tr -d '\r\n ' > "$LAB/ghes-token"
W=$(mktemp -d)
cp "$LAB/pki/ca.crt" "$W/ca.crt"
cat > "$W/values.yaml" <<YAML
githubConfigUrl: https://$GHES_HOST/$GHES_ORG
githubConfigSecret: ghes-arc-token
githubServerTLS:
  certificateFrom:
    configMapKeyRef:
      name: contoso-lab-ca
      key: ca.crt
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
kubectl -n $RUNNER_NS create configmap contoso-lab-ca --from-file=ca.crt=ca.crt --dry-run=client -o yaml | kubectl apply -f -
kubectl -n $RUNNER_NS create secret generic ghes-arc-token --from-literal=github_token=\$(cat token) --dry-run=client -o yaml | kubectl apply -f -
helm upgrade --install $RUNNER_SET --namespace $RUNNER_NS -f values.yaml \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set
sleep 60
kubectl get pods -n arc-systems -o wide; kubectl get pods -n $RUNNER_NS -o wide
SH
cp "$LAB/ghes-token" "$W/token"
(cd "$W" && az aks command invoke -g "$RG_AZ" -n "$AKS_NAME" --command "bash install.sh" \
  --file install.sh --file values.yaml --file sa.yaml --file token --file ca.crt -o tsv --query logs)
rm -rf "$W"
echo "--- runners registered on GHES (checked from the admin workstation)"
ws "source ./00-variables.sh >/dev/null; ghes_api GET /orgs/$GHES_ORG/actions/runners | jq -c '.runners[]? | {name, status, labels: [.labels[].name]}'"
