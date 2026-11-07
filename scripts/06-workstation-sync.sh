#!/usr/bin/env bash
# Step 06: lab certificate authority + copy what the workstation needs (resolved settings, secrets, admin SSH
# key, appliance certificate, license) into /root/.ghes-lab on the workstation over Azure Run Command.
#   bash 06-workstation-sync.sh          push Cloud Shell state to the workstation (and git pull the lab repo there)
#   bash 06-workstation-sync.sh --pull   new Cloud Shell session: get the state back from the workstation
source ./00-variables.sh >/dev/null
source ./lib/ws.sh
umask 077
if [ "${1:-}" = "--pull" ]; then
  N=$(ws "tar -C /root -czf /tmp/st.tgz .ghes-lab && base64 -w0 /tmp/st.tgz > /tmp/st.b64 && wc -c < /tmp/st.b64" | tr -dc 0-9)
  : > "$LAB/.st.b64"
  for ((o=1; o<=N; o+=3000)); do ws "cut -c$o-$((o+2999)) /tmp/st.b64" | tr -d '\n' >> "$LAB/.st.b64"; done
  base64 -d "$LAB/.st.b64" | tar -C "$HOME" -xzf - && rm -f "$LAB/.st.b64" && ws "rm -f /tmp/st.tgz /tmp/st.b64" >/dev/null
  echo "Lab state restored from the workstation: $(ls "$LAB" | tr '\n' ' ')"; exit 0
fi

echo "--- Contoso lab certificate authority (stands in for the enterprise PKI)"
PKI="$LAB/pki"; mkdir -p "$PKI"
[ -f "$PKI/ca.crt" ] || openssl req -x509 -newkey rsa:4096 -sha256 -days 365 -nodes -keyout "$PKI/ca.key" \
  -out "$PKI/ca.crt" -subj "/O=Contoso/CN=Contoso Lab Root CA" \
  -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
if [ ! -f "$PKI/ghes.crt" ]; then
  openssl req -newkey rsa:2048 -nodes -keyout "$PKI/ghes.key" -out "$PKI/ghes.csr" -subj "/O=Contoso/CN=$GHES_HOST" 2>/dev/null
  printf 'subjectAltName=DNS:%s\nextendedKeyUsage=serverAuth\nkeyUsage=critical,digitalSignature,keyEncipherment\nbasicConstraints=CA:FALSE\n' "$GHES_HOST" > "$PKI/ghes.ext"
  openssl x509 -req -in "$PKI/ghes.csr" -CA "$PKI/ca.crt" -CAkey "$PKI/ca.key" -CAcreateserial -days 180 -sha256 \
    -extfile "$PKI/ghes.ext" -out "$PKI/ghes.crt" 2>/dev/null
fi
openssl x509 -in "$PKI/ghes.crt" -noout -subject -issuer -enddate

echo "--- resolved settings for the workstation (it has no Azure CLI)"
KEY=$(az storage account keys list -g "$RG_ONP" -n "$ST_ACTIONS" --query '[0].value' -o tsv 2>/dev/null)
{
  echo "export LAB_OUTPUTS_LOADED=1 LAB_ON_WORKSTATION=1"
  for v in GHES_HOST GHES_PUBLIC_IP ST_ACTIONS AKS_NAME REVIEWER_CLIENT_ID ACR_NAME KV_NAME AI_ENDPOINT MODEL_DEPLOYMENT FOUNDRY_ACCOUNT; do
    echo "export $v='${!v}'"
  done
  echo "export ACTIONS_STORAGE_CS='DefaultEndpointsProtocol=https;AccountName=$ST_ACTIONS;AccountKey=$KEY;EndpointSuffix=core.windows.net'"
} > "$LAB/lab.env"
[ -f "$HOME/ghes-trial.ghl" ] && cp "$HOME/ghes-trial.ghl" "$LAB/ghes-trial.ghl"

echo "--- copy to the workstation (root-only folder), then update the lab repository there"
B64=$(tar -C "$HOME" --exclude='pki/ca.key' --exclude='*.b64' -czf - .ghes-lab | base64 -w0)
ws "umask 077; echo '$B64' | base64 -d | tar -C /root -xzf - && cd /opt/lab/repo && git pull -q; echo synced: \$(ls /root/.ghes-lab | tr '\n' ' '); echo repo: \$(git -C /opt/lab/repo log -1 --format='%h %s')"
