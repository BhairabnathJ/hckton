#!/usr/bin/env bash
#
# Combined demo smoke test against the REAL core-api server (npm run dev).
#
# Part A — the learning loop as Maya:
#   GET /users/me (capture XP) -> POST /attempts (L1) -> POST
#   /attempts/:id/submit {prUrl} (202) -> poll until passed -> XP increased.
#
# Part B — the marketplace as Jordan (Level 6):
#   POST /admin/jobs/drop-demo (job.dropped on SSE) -> Jordan claims (200) ->
#   a second claim on the same job gets 409 -> assert job.dropped + job.claimed
#   fired on GET /events.
#
# Requires only curl + python3. Exits non-zero on the first failed assertion.
# Run with GRADER_RUNNER=demo for a deterministic, network-free pass, e.g.:
#   GRADER_RUNNER=demo LLM_PROVIDER=gemini npm run dev   # in one shell
#   npm run smoke:demo                                   # in another
#
set -euo pipefail

BASE="${BASE:-http://localhost:4000}"
TICKET="${TICKET:-brightline-l1-pagination}"
PR_URL="${PR_URL:-https://github.com/sidequest/brightline/pull/1}"
POLL_MAX="${POLL_MAX:-60}"

maya=(-H "X-Demo-User: maya" -H "Content-Type: application/json")
jordan=(-H "X-Demo-User: jordan" -H "Content-Type: application/json")
admin=(-H "X-Demo-User: admin" -H "Content-Type: application/json")

jqget() { python3 -c "import sys,json;print(json.load(sys.stdin)${1})"; }
fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }

echo "== combined demo smoke test =="
curl -fsS "${BASE}/health" >/dev/null || fail "API not reachable at ${BASE} (start it with: npm run dev)"

# ---------------------------------------------------------------------------
# Part A — Maya learning loop
# ---------------------------------------------------------------------------
echo "-- Part A: Maya learning loop --"
me_before="$(curl -fsS "${maya[@]}" "${BASE}/users/me")" || fail "GET /users/me failed"
xp_before="$(echo "${me_before}" | jqget "['xp']")"
level_before="$(echo "${me_before}" | jqget "['level']")"
echo "  start: xp=${xp_before} level=${level_before}"

start="$(curl -fsS "${maya[@]}" -d "{\"ticketId\":\"${TICKET}\"}" "${BASE}/attempts")" || fail "POST /attempts failed"
aid="$(echo "${start}" | jqget "['id']")"
[ "$(echo "${start}" | jqget "['status']")" = "in_progress" ] || fail "new attempt not in_progress"
echo "  started attempt ${aid}"

code="$(curl -fsS -o /tmp/demo_submit.json -w '%{http_code}' "${maya[@]}" \
  -d "{\"prUrl\":\"${PR_URL}\"}" "${BASE}/attempts/${aid}/submit")" || fail "submit request failed"
[ "${code}" = "202" ] || fail "submit returned HTTP ${code}, expected 202"
echo "  submitted PR (HTTP 202)"

final=""
for _ in $(seq 1 "${POLL_MAX}"); do
  st="$(curl -fsS "${maya[@]}" "${BASE}/attempts/${aid}" | jqget "['status']")"
  if [ "${st}" = "passed" ] || [ "${st}" = "changes_requested" ]; then final="${st}"; break; fi
  sleep 1
done
[ "${final}" = "passed" ] || fail "attempt resolved to '${final:-<timeout>}', expected passed"
me_after="$(curl -fsS "${maya[@]}" "${BASE}/users/me")"
xp_after="$(echo "${me_after}" | jqget "['xp']")"
[ "${xp_after}" -gt "${xp_before}" ] || fail "xp did not increase (${xp_before} -> ${xp_after})"
echo "  PASS: Maya cleared ${TICKET}; xp ${xp_before} -> ${xp_after}"

# ---------------------------------------------------------------------------
# Part B — Marketplace: drop-demo -> claim -> 409, with SSE assertions
# ---------------------------------------------------------------------------
echo "-- Part B: marketplace --"

# Open an SSE listener BEFORE dropping so we capture job.dropped + job.claimed.
sse_out="$(mktemp)"
curl -sN "${jordan[@]}" "${BASE}/events" > "${sse_out}" &
sse_pid=$!
disown "${sse_pid}" 2>/dev/null || true
# Ensure the listener is cleaned up on any exit.
trap 'kill "${sse_pid}" 2>/dev/null || true; rm -f "${sse_out}"' EXIT
sleep 1

# Drop a demo job as admin -> 201.
drop_code="$(curl -fsS -o /tmp/demo_drop.json -w '%{http_code}' "${admin[@]}" -X POST "${BASE}/admin/jobs/drop-demo")" \
  || fail "drop-demo request failed"
[ "${drop_code}" = "201" ] || fail "drop-demo returned HTTP ${drop_code}, expected 201"
job_id="$(jqget "['id']" < /tmp/demo_drop.json)"
[ "$(jqget "['status']" < /tmp/demo_drop.json)" = "open" ] || fail "dropped job not open"
echo "  dropped demo job ${job_id} (HTTP 201)"

# Jordan (Level 6) claims -> 200 claimed.
claim_code="$(curl -fsS -o /tmp/demo_claim.json -w '%{http_code}' "${jordan[@]}" -X POST "${BASE}/jobs/${job_id}/claim")" \
  || fail "claim request failed"
[ "${claim_code}" = "200" ] || fail "claim returned HTTP ${claim_code}, expected 200"
[ "$(jqget "['status']" < /tmp/demo_claim.json)" = "claimed" ] || fail "job not claimed after claim"
echo "  Jordan claimed the job (HTTP 200)"

# A second claim on the same job must lose the race -> 409 job_already_claimed.
code2="$(curl -s -o /tmp/demo_claim2.json -w '%{http_code}' "${jordan[@]}" -X POST "${BASE}/jobs/${job_id}/claim")"
[ "${code2}" = "409" ] || fail "second claim returned HTTP ${code2}, expected 409"
[ "$(jqget "['error']['code']" < /tmp/demo_claim2.json)" = "job_already_claimed" ] \
  || fail "second claim error code != job_already_claimed"
echo "  second claim correctly rejected (HTTP 409 job_already_claimed)"

# Assert the SSE stream carried both events for this job.
sleep 1
kill "${sse_pid}" 2>/dev/null || true
wait "${sse_pid}" 2>/dev/null || true
grep -q "\"type\":\"job.dropped\".*\"id\":\"${job_id}\"" "${sse_out}" || fail "job.dropped not observed on /events for ${job_id}"
grep -q "\"type\":\"job.claimed\".*\"id\":\"${job_id}\"" "${sse_out}" || fail "job.claimed not observed on /events for ${job_id}"
echo "  SSE fired: job.dropped + job.claimed observed on /events"

echo "== COMBINED SMOKE PASS: Maya loop + marketplace drop/claim/409 + SSE =="
