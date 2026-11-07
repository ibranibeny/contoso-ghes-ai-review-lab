#!/usr/bin/env bash
# Step 10: first-time setup of the GHES appliance through the Management Console API (port 8443):
# upload the trial license, set the root site administrator password, host name and basic settings, apply.
# Usage: ./10-ghes-init.sh ~/ghes-trial.ghl
source ./00-variables.sh >/dev/null
LIC="${1:-$HOME/ghes-trial.ghl}"; [ -f "$LIC" ] || { echo "License file not found: $LIC (upload it to Cloud Shell first)"; exit 1; }
M="https://$GHES_HOST:8443/manage/v1"
echo "Waiting for the appliance to answer on :8443 ..."
until curl -sk -o /dev/null -w '%{http_code}' --max-time 20 "https://$GHES_HOST:8443/setup/start" | grep -qvE '^(000|502|503)$'; do sleep 20; printf .; done; echo

echo "--- upload license + set root site admin password"
curl -sk -X POST "$M/config/init" -F "license=@$LIC" -F "password=$GHES_MGMT_PASS" -w '\nHTTP %{http_code}\n'

echo "--- settings: host name, private mode, no public sign-up"
curl -sk -u "api_key:$GHES_MGMT_PASS" -X PUT "$M/config/settings" -H 'Content-Type: application/json' \
  -d "{\"github_hostname\":\"$GHES_HOST\",\"private_mode\":true,\"signup_enabled\":false,\"subdomain_isolation\":false,\"timezone\":\"Asia/Jakarta\"}" -w 'HTTP %{http_code}\n'

echo "--- administrative SSH key (port 122)"
curl -sk -u "api_key:$GHES_MGMT_PASS" -X POST "$M/access/ssh" -H 'Content-Type: application/json' \
  -d "{\"key\":\"$(cat "$SSH_PUB")\"}" -w 'HTTP %{http_code}\n'

echo "--- apply configuration (10-20 minutes the first time)"
RUN=$(curl -sk -u "api_key:$GHES_MGMT_PASS" -X POST "$M/config/apply" | jq -r '.run_id // empty')
echo "run_id=$RUN"
while :; do
  S=$(curl -sk -u "api_key:$GHES_MGMT_PASS" "$M/config/apply${RUN:+?run_id=$RUN}")
  echo "$(date +%H:%M:%S) $(echo "$S" | jq -c '[.nodes[]? | {node:.hostname, status:.status}] // .' 2>/dev/null | head -c 200)"
  echo "$S" | jq -e '.running == false' >/dev/null 2>&1 && break
  sleep 30
done
echo "$S" | jq '{running, successful}'
lab_backup
