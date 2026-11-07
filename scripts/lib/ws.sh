#!/usr/bin/env bash
# ws "commands" - run commands on the private admin workstation through Azure Run Command (no inbound ports)
# and print the output. The commands start in /opt/lab/repo/scripts with HOME=/root.
# Long jobs: ws "nohup bash 11-ghes-tls-actions.sh > /var/log/lab-11.log 2>&1 &"  then  ws "tail /var/log/lab-11.log"
ws() {
  az vm run-command invoke -g "${RG_ONP:-rg-ghes-onprem-idc}" -n "${WS_VM:-vm-corp-ws01}" --command-id RunShellScript \
    --scripts "export HOME=/root; cd /opt/lab/repo/scripts 2>/dev/null; $*" --query 'value[0].message' -o tsv \
    | sed -e '/^Enable succeeded:/d' -e '/^\[stdout\]$/d' -e '/^\[stderr\]$/d'
}
