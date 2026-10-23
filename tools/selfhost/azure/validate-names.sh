#!/usr/bin/env bash
# azure/validate-names.sh — offline validation of every Azure resource name in the deploy parameters
# file against that resource type's naming rules (length, allowed characters, start/end, hyphens).
#
# Usage: azure/validate-names.sh [path/to/deploy.parameters.json]
set -uo pipefail

SELFHOST_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARAMS_FILE="${1:-$SELFHOST_ROOT/azure/deploy.parameters.json}"

if [[ ! -f "$PARAMS_FILE" ]]; then
  echo "ERROR: parameters file not found: $PARAMS_FILE" >&2
  echo "Copy azure/deploy.parameters.example.json to azure/deploy.parameters.json and fill it in." >&2
  exit 1
fi
command -v jq >/dev/null 2>&1 || { echo "ERROR: jq is required." >&2; exit 1; }

banner() { printf '\n=== %s ===\n' "$*"; }
FAILURES=0
fail() { printf '  FAIL: %s\n' "$*" >&2; FAILURES=$((FAILURES + 1)); }
ok()   { printf '  OK:   %s\n' "$*"; }
note() { printf '  NOTE: %s\n' "$*"; }
jqr()  { jq -r "$1 // empty" "$PARAMS_FILE"; }

# check <label> <param-path> <value> <regex> <minlen> <maxlen> <human-rule> [nohyphen]
# Skips empty (optional) values.
check() {
  local label="$1" param="$2" value="$3" regex="$4" minlen="$5" maxlen="$6" rule="$7" nohyphen="${8:-}"
  if [[ -z "$value" ]]; then
    note "$label: not set ($param) -- skipped (optional/defaulted)"
    return
  fi
  local len=${#value} problem=""
  if (( len < minlen || len > maxlen )); then
    problem="length $len not in ${minlen}-${maxlen}"
  fi
  if [[ -z "$problem" ]] && ! [[ "$value" =~ $regex ]]; then
    problem="invalid characters or start/end"
  fi
  if [[ -z "$problem" && "$nohyphen" == "nohyphen" && "$value" == *--* ]]; then
    problem="contains consecutive hyphens"
  fi
  if [[ -z "$problem" ]]; then
    ok "$label '$value' ($len chars)"
  else
    fail "$label '$value' ($len chars): $problem"
    printf '        rule : %s\n' "$rule" >&2
    printf '        param: %s\n' "$param" >&2
  fi
}

banner "Resource name validation ($PARAMS_FILE)"

# Resource group: 1-90 chars; letters, digits, '_', '-', '.', '(' , ')'; may not end with a period.
check "Resource group" ".resourceGroup" "$(jqr '.resourceGroup')" \
  '^[A-Za-z0-9._()-]+$' 1 90 \
  "1-90 chars: letters, digits, and . _ - ( ) ; cannot end with a period"
case "$(jqr '.resourceGroup')" in
  *.) fail "Resource group '$(jqr '.resourceGroup')' ends with a period, which is not allowed" ;;
esac

# ACR (build + deploy): 5-50 alphanumeric characters, globally unique.
build_acr="$(jqr '.buildAcr.name')"
deploy_acr="$(jqr '.deployAcr.name')"
[[ -n "$build_acr" ]] || fail "Build ACR is required (.buildAcr.name)"
[[ -n "$deploy_acr" ]] || fail "Deploy ACR is required (.deployAcr.name)"
check "Build ACR"  ".buildAcr.name"  "$build_acr" \
  '^[a-zA-Z0-9]+$' 5 50 "5-50 alphanumeric characters only (no hyphens/underscores)"
check "Deploy ACR" ".deployAcr.name" "$deploy_acr" \
  '^[a-zA-Z0-9]+$' 5 50 "5-50 alphanumeric characters only (no hyphens/underscores)"
# The build and deploy registries must be different names (globally-unique DNS): reusing one name
# makes deploy.sh's `az acr create` fail with AlreadyInUse.
if [[ -n "$build_acr" && "$build_acr" == "$deploy_acr" ]]; then
  fail "buildAcr.name and deployAcr.name are both '$build_acr' -- they must differ (ACR names are globally unique)"
fi

# Storage account: 3-24 chars, lowercase letters and numbers only.
check "Storage account" ".storage.accountName" "$(jqr '.storage.accountName')" \
  '^[a-z0-9]+$' 3 24 "3-24 chars: lowercase letters and numbers only"

# Key Vault: 3-24 chars, alphanumerics and hyphens, start with a letter, end with letter/digit,
# no consecutive hyphens.
check "Key Vault" ".keyVault.name" "$(jqr '.keyVault.name')" \
  '^[a-zA-Z][a-zA-Z0-9-]*[a-zA-Z0-9]$' 3 24 \
  "3-24 chars: alphanumerics and hyphens; start with a letter, end with a letter or digit, no consecutive hyphens" \
  nohyphen

# Cosmos DB account: 3-44 chars, lowercase letters, digits, hyphens; start/end alphanumeric.
cosmos="$(jqr '.cosmos.clusterName')"
check "Cosmos DB account" ".cosmos.clusterName" "$cosmos" \
  '^[a-z0-9][a-z0-9-]*[a-z0-9]$' 3 44 \
  "3-44 chars: lowercase letters, digits, hyphens; start and end alphanumeric"
if [[ -n "$cosmos" && "${#cosmos}" -gt 40 ]]; then
  note "Cosmos DB name '$cosmos' is >40 chars -- a Cosmos DB for MongoDB vCore cluster caps the name at 40"
fi

# Azure Managed Redis: 1-60 chars, alphanumerics and hyphens, start/end alphanumeric,
# no consecutive hyphens.
check "Azure Managed Redis" ".redis.clusterName" "$(jqr '.redis.clusterName')" \
  '^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$' 1 60 \
  "1-60 chars: alphanumerics and hyphens; start and end alphanumeric, no consecutive hyphens" \
  nohyphen

# AKS managed cluster: 1-63 chars, alphanumerics, '-' and '_', start/end alphanumeric.
check "AKS cluster" ".aks.name" "$(jqr '.aks.name')" \
  '^[a-zA-Z0-9]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$' 1 63 \
  "1-63 chars: alphanumerics, hyphens and underscores; start and end alphanumeric"

# Front Door (Microsoft.Cdn) profile: 1-260 chars, alphanumerics and hyphens, start/end alphanumeric.
check "Front Door profile" ".frontDoor.profileName" "$(jqr '.frontDoor.profileName')" \
  '^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$' 1 260 \
  "1-260 chars: alphanumerics and hyphens; start and end alphanumeric"

# VNet (optional; defaulted to '<aks>-vnet'): 2-64 chars, alphanumerics, '_', '.', '-';
# start alphanumeric, end alphanumeric or underscore.
check "VNet" ".network.vnetName" "$(jqr '.network.vnetName')" \
  '^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9_]$' 2 64 \
  "2-64 chars: alphanumerics and . _ - ; start alphanumeric, end alphanumeric or underscore"

# Workload identity (optional; defaulted): user-assigned managed identity, 3-128 chars,
# alphanumerics, '-' and '_', start with a letter or number.
check "Workload identity" ".workloadIdentity.name" "$(jqr '.workloadIdentity.name')" \
  '^[a-zA-Z0-9][a-zA-Z0-9_-]*$' 3 128 \
  "3-128 chars: alphanumerics, hyphens and underscores; start with a letter or number"

banner "Name validation summary"
if [[ $FAILURES -eq 0 ]]; then
  printf 'All resource names conform to Azure naming rules.\n'
  exit 0
else
  printf '%d resource name(s) FAILED validation -- fix these in %s before deploying.\n' "$FAILURES" "$PARAMS_FILE" >&2
  exit 1
fi
