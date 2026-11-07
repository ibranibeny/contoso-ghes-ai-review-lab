#!/usr/bin/env bash
# Step 41 (workstation): the developer answers the AI review with a second commit on the same branch.
# The AI review runs again (pull_request_target: synchronize) and the ai-review/foundry status should turn green.
# From Cloud Shell: ws "bash 41-demo-fix.sh"                      (first answer: ghes/pr-demo-fix)
#                  ws "bash 41-demo-fix.sh pr-demo-fix2 '<msg>'"  (second round: ghes/pr-demo-fix2)
source ./00-variables.sh >/dev/null
O=$GHES_ORG; R=contoso-orders-api; B=feature/discount-codes; FIX="$(cd .. && pwd)/ghes/${1:-pr-demo-fix}"
MSG=${2:-"Address AI review: parameterized SQL, secret from environment, integer money, timeouts, bounded inputs, tests"}
TMP=$(mktemp -d); cd "$TMP" || exit 1
GIT="git -c http.sslCAInfo=$LAB/pki/ca.crt"
$GIT clone -q -b "$B" "https://$GHES_ADMIN:$(cat "$LAB/ghes-token")@$GHES_HOST/$O/$R.git" . || exit 1
# start app.py again from main, then append the corrected endpoints
$GIT fetch -q origin main && git show origin/main:orders/app.py > orders/app.py
sed '1,2d' "$FIX/orders/app_patch.py" >> orders/app.py
cp "$FIX/orders/discounts.py" orders/discounts.py
mkdir -p tests && cp "$FIX/tests/test_discounts.py" tests/
python3 - "$FIX/orders/db_schema_patch.sql" <<'PY'
import re, sys
sql = open(sys.argv[1]).read().strip()
p = "orders/db.py"; s = open(p).read()
stmts = [x.strip() + ";" for x in sql.split(";") if x.strip()]
def key(st):  # a table name for CREATE TABLE, the statement itself otherwise
    m = re.search(r"CREATE TABLE IF NOT EXISTS (\w+)", st)
    return m.group(1) if m else st.splitlines()[-1]
add = [st for st in stmts if key(st) not in s]
if add:  # add only the tables the schema does not have yet
    head, sep, tail = s.partition('"""\n\n\ndef connect')
    s = head.rstrip("\n") + "\n" + "\n".join(add) + "\n" + sep + tail
open(p, "w").write(s)
PY
git add -A
git -c user.name="$GHES_ADMIN" -c user.email="$GHES_ADMIN_EMAIL" commit -qm "$MSG"
$GIT push -q origin "$B" || exit 1
SHA=$(git rev-parse HEAD); cd - >/dev/null || exit 1
PR=$(ghes_api GET "/repos/$O/$R/pulls?head=$O:$B&state=open" | jq -r '.[0].number')
echo "Pushed $SHA to PR #$PR: https://$GHES_HOST/$O/$R/pull/$PR"
for i in $(seq 1 40); do
  S=$(ghes_api GET "/repos/$O/$R/commits/$SHA/status" | jq -r '.statuses[]? | select(.context=="ai-review/foundry") | "\(.state): \(.description)"' | head -1)
  echo "$(date +%H:%M:%S) ai-review/foundry -> ${S:-waiting for runner}"
  case "$S" in success*|failure*|error*) break;; esac; sleep 15
done
ghes_api GET "/repos/$O/$R/pulls/$PR/reviews" | jq -r '.[-1].body' | head -12
