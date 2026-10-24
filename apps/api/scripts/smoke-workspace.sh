#!/usr/bin/env bash
#
# browser-workspace end-to-end smoke test against the REAL core-api (npm run dev).
#
# As Maya: create a workspace for the L1 ticket, read the buggy app/shipments.py,
# write the fixed version, run the visible tests, submit, poll until passed, and
# assert XP increased and reviewBody is non-empty.
#
# Requires curl + python3. Exits non-zero on the first failed assertion.
#
# Recommended env for a deterministic, network-free run:
#   GRADER_RUNNER=demo LLM_PROVIDER=gemini WORKSPACE_OPEN_PR=false npm run dev
#   npm run smoke:workspace
#
set -euo pipefail

BASE="${BASE:-http://localhost:4000}"
TICKET="${TICKET:-brightline-l1-pagination}"
FILE="${FILE:-app/shipments.py}"
POLL_MAX="${POLL_MAX:-120}"

maya=(-H "X-Demo-User: maya" -H "Content-Type: application/json")
jqget() { python3 -c "import sys,json;print(json.load(sys.stdin)${1})"; }
fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }

echo "== browser-workspace smoke test as Maya =="
curl -fsS "${BASE}/health" >/dev/null || fail "API not reachable at ${BASE} (start it with: npm run dev)"

# 0. Starting XP.
xp_before="$(curl -fsS "${maya[@]}" "${BASE}/users/me" | jqget "['xp']")"
echo "  start xp=${xp_before}"

# 1. Start an attempt on the L1 ticket.
aid="$(curl -fsS "${maya[@]}" -d "{\"ticketId\":\"${TICKET}\"}" "${BASE}/attempts" | jqget "['id']")"
echo "  attempt=${aid}"

# 2. Create the workspace and assert the buggy file is present in the tree.
tree="$(curl -fsS "${maya[@]}" -X POST "${BASE}/attempts/${aid}/workspace")"
echo "${tree}" | python3 -c "import sys,json; files=[n['path'] for n in json.load(sys.stdin)['files']]; sys.exit(0 if '${FILE}' in files else 1)" \
  || fail "${FILE} not in the workspace tree"
echo "  workspace created; ${FILE} present"

# 3-4. Read the buggy file, write the FIXED version (offset drop the +1).
#      Done in one Python block over HTTP to avoid shell-quoting fragility.
python3 - "$BASE" "$aid" "$FILE" <<'PY' || fail "read/fix/write step failed"
import json, sys, urllib.request
base, aid, path = sys.argv[1], sys.argv[2], sys.argv[3]
hdr = {"X-Demo-User": "maya", "Content-Type": "application/json"}

def call(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=hdr)
    return json.load(urllib.request.urlopen(req))

got = call("GET", f"{base}/attempts/{aid}/workspace/file?path={path}")
content = got["content"]
bug = "offset = page * pageSize"
fix = "offset = (page - 1) * pageSize"
if bug not in content:
    sys.stderr.write("expected buggy line not found\n"); sys.exit(3)
res = call("PUT", f"{base}/attempts/{aid}/workspace/file",
           {"path": path, "content": content.replace(bug, fix)})
sys.exit(0 if res.get("ok") is True else 1)
PY
echo "  read buggy ${FILE}, wrote fixed version"

# 5. Run the visible tests (should be green after the fix).
rt="$(curl -fsS "${maya[@]}" -X POST "${BASE}/attempts/${aid}/workspace/run-tests")"
rt_passed="$(echo "${rt}" | jqget "['passed']")"
rt_failed="$(echo "${rt}" | jqget "['failed']")"
echo "  visible tests: passed=${rt_passed} failed=${rt_failed}"
[ "${rt_failed}" = "0" ] || fail "visible tests still failing after the fix (${rt_failed} failed)"

# 6. Submit the workspace -> 202.
code="$(curl -fsS -o /tmp/ws_submit.json -w '%{http_code}' "${maya[@]}" -X POST "${BASE}/attempts/${aid}/workspace/submit")"
[ "${code}" = "202" ] || fail "workspace submit returned HTTP ${code}, expected 202"
echo "  submitted workspace (HTTP 202)"

# 7. Poll until the attempt resolves.
final=""
for _ in $(seq 1 "${POLL_MAX}"); do
  a="$(curl -fsS "${maya[@]}" "${BASE}/attempts/${aid}")"
  st="$(echo "${a}" | jqget "['status']")"
  if [ "${st}" = "passed" ] || [ "${st}" = "changes_requested" ]; then final="${st}"; break; fi
  sleep 1
done
[ "${final}" = "passed" ] || fail "attempt resolved to '${final:-<timeout>}', expected passed"
echo "  attempt resolved: passed"

# 8. Assert reviewBody non-empty and XP increased.
a="$(curl -fsS "${maya[@]}" "${BASE}/attempts/${aid}")"
review_len="$(echo "${a}" | python3 -c "import sys,json;print(len((json.load(sys.stdin).get('reviewBody') or '').strip()))")"
[ "${review_len}" -gt 0 ] || fail "reviewBody is empty"
echo "  reviewBody present (${review_len} chars)"

xp_after="$(curl -fsS "${maya[@]}" "${BASE}/users/me" | jqget "['xp']")"
[ "${xp_after}" -gt "${xp_before}" ] || fail "xp did not increase (${xp_before} -> ${xp_after})"
echo "  xp ${xp_before} -> ${xp_after}"

echo "== WORKSPACE SMOKE PASS: Maya edited in-browser, ran tests, submitted, passed; xp ${xp_before} -> ${xp_after} =="
