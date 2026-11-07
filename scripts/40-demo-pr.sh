#!/usr/bin/env bash
# Step 40: open the demo pull request (discount codes) and follow the AI review.
source ./00-variables.sh >/dev/null
O=$GHES_ORG; R=contoso-orders-api; B=feature/discount-codes
TMP=$(mktemp -d); cd "$TMP" || exit 1
git clone -q "https://$GHES_ADMIN:$(cat "$LAB/ghes-token")@$GHES_HOST/$O/$R.git" . && git checkout -qb "$B"
cp "$OLDPWD/../ghes/pr-demo/orders/discounts.py" orders/
cat "$OLDPWD/../ghes/pr-demo/orders/app_patch.py" | sed '1,2d' >> orders/app.py
git add -A && git -c user.name="$GHES_ADMIN" -c user.email="$GHES_ADMIN_EMAIL" commit -qm "Add year-end discount codes" && git push -q origin "$B"
cd - >/dev/null || exit 1
PR=$(ghes_api POST "/repos/$O/$R/pulls" "{\"title\":\"Add year-end discount codes\",\"head\":\"$B\",\"base\":\"main\",\"body\":\"Adds discount codes for the year-end campaign and notifies the campaign webhook.\"}" | jq -r .number)
echo "Opened PR #$PR: https://$GHES_HOST/$O/$R/pull/$PR"
for i in $(seq 1 40); do
  S=$(ghes_api GET "/repos/$O/$R/commits/$B/status" | jq -r '.statuses[]? | select(.context=="ai-review/foundry") | "\(.state): \(.description)"' | head -1)
  echo "$(date +%H:%M:%S) ai-review/foundry -> ${S:-waiting for runner}"
  case "$S" in success*|failure*|error*) break;; esac; sleep 15
done
ghes_api GET "/repos/$O/$R/pulls/$PR/comments" | jq -r '.[] | "\(.path):\(.line)  \(.body | split("\n")[0])"'
