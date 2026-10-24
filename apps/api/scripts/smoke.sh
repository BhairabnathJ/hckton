#!/usr/bin/env bash
#
# core-api end-to-end smoke test — the full learning loop as Maya.
#
# Runs against an already-running core-api (npm run dev). Requires only curl +
# python3 (for JSON parsing). Exits non-zero on the first failed assertion.
#
#   Loop: GET /users/me (capture XP) -> POST /attempts (L1) -> POST
#   /attempts/:id/submit {prUrl} (202) -> poll GET /attempts/:id until terminal
#   -> GET /users/me (assert XP increased, level recomputed).
#
# Env:
#   BASE      API base URL        (default http://localhost:4000)
#   DEMO_USER X-Demo-User handle   (default maya)
#   TICKET    ticket id            (default brightline-l1-pagination; alias "BRT-101")
#   PR_URL    PR url to submit     (default a placeholder; the demo runner ignores
#                                    the URL, the real grader clones it)
#   POLL_MAX  max poll attempts    (default 60)
#
set -euo pipefail

BASE="${BASE:-http://localhost:4000}"
DEMO_USER="${DEMO_USER:-maya}"
TICKET="${TICKET:-brightline-l1-pagination}"
PR_URL="${PR_URL:-https://github.com/sidequest/brightline/pull/1}"
POLL_MAX="${POLL_MAX:-60}"

hdr=(-H "X-Demo-User: ${DEMO_USER}" -H "Content-Type: application/json")

jqget() { python3 -c "import sys,json;print(json.load(sys.stdin)${1})"; }
fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }

echo "== core-api smoke test as ${DEMO_USER} (ticket ${TICKET}) =="

# 0. API reachable.
curl -fsS "${BASE}/health" >/dev/null || fail "API not reachable at ${BASE} (start it with: npm run dev)"

# 1. Starting profile.
me_before="$(curl -fsS "${hdr[@]}" "${BASE}/users/me")" || fail "GET /users/me failed"
xp_before="$(echo "${me_before}" | jqget "['xp']")"
level_before="$(echo "${me_before}" | jqget "['level']")"
echo "  start: xp=${xp_before} level=${level_before}"

# 2. Start the attempt.
start="$(curl -fsS "${hdr[@]}" -d "{\"ticketId\":\"${TICKET}\"}" "${BASE}/attempts")" || fail "POST /attempts failed"
aid="$(echo "${start}" | jqget "['id']")"
status="$(echo "${start}" | jqget "['status']")"
[ "${status}" = "in_progress" ] || fail "new attempt status is '${status}', expected in_progress"
echo "  started attempt ${aid} (status=${status})"

# 3. Submit the PR — must be 202.
code="$(curl -fsS -o /tmp/smoke_submit.json -w '%{http_code}' "${hdr[@]}" \
  -d "{\"prUrl\":\"${PR_URL}\"}" "${BASE}/attempts/${aid}/submit")" || fail "submit request failed"
[ "${code}" = "202" ] || fail "submit returned HTTP ${code}, expected 202"
echo "  submitted PR (HTTP 202)"

# 4. Poll until terminal (passed | changes_requested).
final=""
for i in $(seq 1 "${POLL_MAX}"); do
  a="$(curl -fsS "${hdr[@]}" "${BASE}/attempts/${aid}")" || fail "GET /attempts/${aid} failed"
  st="$(echo "${a}" | jqget "['status']")"
  if [ "${st}" = "passed" ] || [ "${st}" = "changes_requested" ]; then
    final="${st}"; break
  fi
  sleep 1
done
[ -n "${final}" ] || fail "attempt did not resolve within ${POLL_MAX}s"
echo "  attempt resolved: status=${final}"
[ "${final}" = "passed" ] || fail "attempt resolved to '${final}', expected passed (tests must pass AND review APPROVE)"

# 5. XP must have increased and level recomputed.
me_after="$(curl -fsS "${hdr[@]}" "${BASE}/users/me")" || fail "GET /users/me (after) failed"
xp_after="$(echo "${me_after}" | jqget "['xp']")"
level_after="$(echo "${me_after}" | jqget "['level']")"
echo "  end: xp=${xp_after} level=${level_after}"

[ "${xp_after}" -gt "${xp_before}" ] || fail "xp did not increase (${xp_before} -> ${xp_after})"
expected_level=$(( xp_after / 100 + 1 ))
[ "${level_after}" = "${expected_level}" ] || fail "level ${level_after} != floor(xp/100)+1 = ${expected_level}"

echo "== SMOKE PASS: ${DEMO_USER} cleared ${TICKET}; xp ${xp_before} -> ${xp_after}, level ${level_before} -> ${level_after} =="
