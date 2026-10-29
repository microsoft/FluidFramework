#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

load_azure_cloud() {
  local cloud
  cloud="$(az cloud show -o json)" || return 1
  if ! jq -e '[
      .name, .endpoints.resourceManager, .endpoints.activeDirectory, .endpoints.portal,
      .endpoints.microsoftGraphResourceId,
      .suffixes.acrLoginServerEndpoint, .suffixes.keyvaultDns
    ] | all(type == "string" and length > 0)' <<<"$cloud" >/dev/null; then
    echo "ERROR: Azure CLI returned incomplete cloud endpoint metadata." >&2
    return 1
  fi
  AZURE_CLOUD_NAME="$(jq -r '.name' <<<"$cloud")"
  AZURE_RESOURCE_MANAGER="$(jq -r '.endpoints.resourceManager | rtrimstr("/")' <<<"$cloud")"
  AZURE_AUTHORITY_HOST="$(jq -r '.endpoints.activeDirectory | rtrimstr("/")' <<<"$cloud")"
  AZURE_PORTAL_URL="$(jq -r '.endpoints.portal | rtrimstr("/")' <<<"$cloud")"
  AZURE_MICROSOFT_GRAPH_RESOURCE="$(jq -r '.endpoints.microsoftGraphResourceId | rtrimstr("/")' <<<"$cloud")"
  AZURE_ACR_SUFFIX="$(jq -r '.suffixes.acrLoginServerEndpoint' <<<"$cloud")"
  AZURE_KEYVAULT_DNS_SUFFIX="$(jq -r '.suffixes.keyvaultDns | ltrimstr(".")' <<<"$cloud")"
  case "$AZURE_CLOUD_NAME" in
    AzureCloud) AZURE_CSI_CLOUD_NAME=AzurePublicCloud ;;
    AzureUSGovernment) AZURE_CSI_CLOUD_NAME=AzureUSGovernmentCloud ;;
    *) AZURE_CSI_CLOUD_NAME="$AZURE_CLOUD_NAME" ;;
  esac
}

azure_token_issuer() {
  local tenant="$1" version="$2" discovery
  discovery="$AZURE_AUTHORITY_HOST/$tenant"
  [[ "$version" != v2 ]] || discovery+="/v2.0"
  curl --fail --silent --show-error "$discovery/.well-known/openid-configuration" |
    jq -er '.issuer | select(type == "string" and startswith("https://"))'
}
