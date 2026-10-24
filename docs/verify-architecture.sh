#!/usr/bin/env bash
#
# verify-architecture.sh — smoke test for the system-architecture spec.
#
# This is a documentation-only spec: no service runs, so this is NOT an HTTP
# curl check. It asserts, against the static artifact, that:
#   1. /docs/architecture.md exists.
#   2. All nine required numbered top-level sections (1-9) are present and in
#      ascending order (matched flexibly on the "## N." prefix).
#   3. At least 7 fenced ```mermaid blocks are present (component diagram,
#      ER diagram, three sequence diagrams, two state machines).
#   4. No application source files were produced by this spec under apps/,
#      packages/, grader/, or sim-companies/ — the only deliverables are
#      docs/architecture.md and this script under docs/.
#
# Exit non-zero on any failed check, with a clear PASS/FAIL summary.

set -euo pipefail

# Resolve repository root relative to this script (docs/ lives at the root).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DOC="${ROOT_DIR}/docs/architecture.md"

fail_count=0
pass_count=0

pass() {
  printf '  PASS  %s\n' "$1"
  pass_count=$((pass_count + 1))
}

fail() {
  printf '  FAIL  %s\n' "$1"
  fail_count=$((fail_count + 1))
}

echo "=== system-architecture smoke test ==="
echo "root:     ${ROOT_DIR}"
echo "artifact: ${DOC}"
echo

# ---------------------------------------------------------------------------
# Check 1: the artifact exists.
# ---------------------------------------------------------------------------
echo "[1] Artifact existence"
if [[ -f "${DOC}" ]]; then
  pass "docs/architecture.md exists"
else
  fail "docs/architecture.md does not exist"
  # Nothing else can be checked without the document — summarize and bail.
  echo
  echo "=== SUMMARY: FAIL (${pass_count} passed, ${fail_count} failed) ==="
  exit 1
fi
echo

# ---------------------------------------------------------------------------
# Check 2: all nine numbered top-level sections, present and in ascending order.
# Match flexibly on the "## N." prefix so minor title wording doesn't break it.
# ---------------------------------------------------------------------------
echo "[2] Nine numbered top-level sections (1-9), ascending"

# Extract the numbers from headings of the form "## N. <title>", in file order.
# Portable (bash 3.2, no mapfile): read line by line into an array.
section_numbers=()
while IFS= read -r num; do
  [[ -n "${num}" ]] && section_numbers+=("${num}")
done < <(
  grep -Eo '^##[[:space:]]+[0-9]+\.' "${DOC}" \
    | grep -Eo '[0-9]+' || true
)

expected_count=9
if [[ "${#section_numbers[@]}" -eq "${expected_count}" ]]; then
  pass "found exactly ${expected_count} numbered '## N.' sections"
else
  fail "expected ${expected_count} numbered '## N.' sections, found ${#section_numbers[@]}"
fi

# Assert each expected number 1..9 is present, and that the sequence is ascending.
prev=0
ascending=1
for n in "${section_numbers[@]:-}"; do
  [[ -z "${n}" ]] && continue
  if [[ "${n}" -le "${prev}" ]]; then
    ascending=0
  fi
  prev="${n}"
done

for want in $(seq 1 "${expected_count}"); do
  found=0
  for n in "${section_numbers[@]:-}"; do
    if [[ "${n}" -eq "${want}" ]]; then
      found=1
      break
    fi
  done
  if [[ "${found}" -eq 1 ]]; then
    pass "section ${want} present"
  else
    fail "section ${want} MISSING"
  fi
done

if [[ "${ascending}" -eq 1 ]]; then
  pass "sections are in ascending order (${section_numbers[*]:-none})"
else
  fail "sections are NOT in ascending order (${section_numbers[*]:-none})"
fi
echo

# ---------------------------------------------------------------------------
# Check 3: at least 7 fenced ```mermaid blocks.
# component diagram + ER diagram + 3 sequence diagrams + 2 state machines = 7.
# ---------------------------------------------------------------------------
echo "[3] Mermaid fences (expect >= 7)"
mermaid_count="$(grep -c '^```mermaid' "${DOC}" || true)"
min_mermaid=7
if [[ "${mermaid_count}" -ge "${min_mermaid}" ]]; then
  pass "found ${mermaid_count} \`\`\`mermaid blocks (>= ${min_mermaid})"
else
  fail "found ${mermaid_count} \`\`\`mermaid blocks (need >= ${min_mermaid})"
fi
echo

# ---------------------------------------------------------------------------
# Check 4: no application source files produced by this spec.
# The directories may not exist at all (preferred). If one exists, it must
# contain no source files attributable to this spec.
# ---------------------------------------------------------------------------
echo "[4] No application code produced (docs-only spec)"
app_dirs=("apps" "packages" "grader" "sim-companies")
# Common source extensions this spec's downstream code would introduce.
src_glob_exts=("ts" "tsx" "js" "jsx" "py" "prisma" "json" "sh")

stray_total=0
for d in "${app_dirs[@]}"; do
  target="${ROOT_DIR}/${d}"
  if [[ ! -e "${target}" ]]; then
    pass "${d}/ does not exist"
    continue
  fi

  # Directory exists — count any source files within it.
  stray=0
  for ext in "${src_glob_exts[@]}"; do
    while IFS= read -r _; do
      stray=$((stray + 1))
    done < <(find "${target}" -type f -name "*.${ext}" 2>/dev/null)
  done

  if [[ "${stray}" -eq 0 ]]; then
    pass "${d}/ exists but contains no source files from this spec"
  else
    fail "${d}/ contains ${stray} source file(s) — this spec must produce none"
    stray_total=$((stray_total + stray))
  fi
done

# The only deliverables live under docs/: architecture.md and this script.
echo "      (only deliverables: docs/architecture.md, docs/verify-architecture.sh)"
echo

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
if [[ "${fail_count}" -eq 0 ]]; then
  echo "=== SUMMARY: PASS (${pass_count} checks passed, 0 failed) ==="
  exit 0
else
  echo "=== SUMMARY: FAIL (${pass_count} passed, ${fail_count} failed) ==="
  exit 1
fi
