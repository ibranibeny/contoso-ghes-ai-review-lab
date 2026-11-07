#!/usr/bin/env bash
# Step 11 (workstation): TLS certificate from the Contoso lab CA, then GitHub Actions with Azure Blob storage
# reached through the private endpoint. One configuration run applies both (10-15 minutes).
# From Cloud Shell: source lib/ws.sh && ws "nohup bash 11-ghes-tls-actions.sh > /var/log/lab-11.log 2>&1 &"
source ./00-variables.sh >/dev/null
M="https://$GHES_HOST:8443/manage/v1"; AUTH="api_key:$GHES_MGMT_PASS"
SSH="ssh -p 122 -i $LAB/id_rsa -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 admin@$GHES_HOST"

echo "--- appliance reachable from the workstation (private DNS: $(getent hosts "$GHES_HOST" | awk '{print $1}'))"
curl -sk -u "$AUTH" "$M/config/apply" | jq -c '{last_run_running: .running, last_run_successful: .successful}'

echo "--- TLS: certificate for $GHES_HOST issued by the Contoso lab CA"
jq -n --rawfile c "$LAB/pki/ghes.crt" --rawfile k "$LAB/pki/ghes.key" '{github_ssl: {enabled: true, cert: $c, key: $k}}' > /tmp/tls.json
curl -sk -u "$AUTH" -X PUT "$M/config/settings" -H 'Content-Type: application/json' --data @/tmp/tls.json -w 'settings: HTTP %{http_code}\n'
rm -f /tmp/tls.json

echo "--- GitHub Actions storage: Azure Blob through the private endpoint"
echo "    appliance resolves $ST_ACTIONS.blob.core.windows.net to: $($SSH -- "getent hosts $ST_ACTIONS.blob.core.windows.net" | awk '{print $1}')"
$SSH -- "echo No | ghe-actions-precheck -p azure -cs '$ACTIONS_STORAGE_CS'" 2>&1 | grep -viE 'accountkey' | tail -6
$SSH -- "ghe-config app.actions.enabled true && ghe-config secrets.actions.storage.blob-provider azure && ghe-config secrets.actions.storage.azure.connection-string '$ACTIONS_STORAGE_CS'" \
  && echo "    Actions settings stored"

echo "--- apply (TLS + Actions)"
RUN=$(curl -sk -u "$AUTH" -X POST "$M/config/apply" | jq -r '.run_id // empty'); echo "run_id=$RUN"
sleep 60
for i in $(seq 1 60); do   # up to 30 minutes
  S=$(curl -sk -m 20 -u "$AUTH" "$M/config/apply${RUN:+?run_id=$RUN}")
  echo "$(date +%H:%M:%S) $(echo "$S" | jq -c '{running, successful}' 2>/dev/null || echo 'console restarting')"
  echo "$S" | jq -e '.running == false' >/dev/null 2>&1 && break
  sleep 30
done

echo "--- verify TLS with the lab CA and the Actions services"
echo | openssl s_client -connect "$GHES_HOST:443" -servername "$GHES_HOST" -CAfile "$LAB/pki/ca.crt" 2>/dev/null \
  | grep -E '^(subject|issuer)=|Verify return code'
$SSH -- "ghe-actions-check" 2>&1 | tail -6
echo "STEP 11 DONE"
