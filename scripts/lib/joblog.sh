#!/usr/bin/env bash
# Workstation: print the reviewer's lines from the latest "AI review" job log (or from a given run id).
# Usage: bash lib/joblog.sh [run_id] [repo]
source ./00-variables.sh >/dev/null
R=${2:-$GHES_ORG/contoso-orders-api}
RUN=${1:-$(ghes_api GET "/repos/$R/actions/runs?per_page=10" | jq -r '[.workflow_runs[] | select(.name=="AI review")][0].id')}
for JOB in $(ghes_api GET "/repos/$R/actions/runs/$RUN/jobs" | jq -r '.jobs[].id'); do
  echo "== run $RUN job $JOB"
  curl -s -L $CA_OPT -H "Authorization: token $(cat "$LAB/ghes-token")" \
    "https://$GHES_HOST/api/v3/repos/$R/actions/jobs/$JOB/logs" \
    | sed -E 's/^[0-9T:.-]+Z //' | grep -E "ai-review|Error|error|Traceback|File \"" | cut -c1-700
done
