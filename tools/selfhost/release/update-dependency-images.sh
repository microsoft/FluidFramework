#!/usr/bin/env bash
# Validate or update dependency image tags for a self-host release.
#
# Usage:
#   ./release/update-dependency-images.sh --validate
#   ./release/update-dependency-images.sh --name <dependency-name> --image-tag <tag>
#
# A dependency name is the repository portion of its configured pinned image.
#
# The script never selects a tag automatically: maintainers review and supply it.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/lib.sh"

usage() {
  cat <<'EOF'
Usage:
  ./release/update-dependency-images.sh --validate
  ./release/update-dependency-images.sh --name <dependency-name> --image-tag <tag>

Environment:
  DEPENDENCY_MAP_FILE  Dependency map to read and update (default:
                       release/dependency-images.json).
  TARGET_PLATFORM      Expected image platform: linux/amd64 or linux/arm64
                       (default: linux/amd64).
EOF
}

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
esac

DEPENDENCY_MAP_FILE="${DEPENDENCY_MAP_FILE:-$SCRIPT_DIR/dependency-images.json}"
TARGET_PLATFORM="${TARGET_PLATFORM:-linux/amd64}"

# Allow only platforms supported by release generation.
case "$TARGET_PLATFORM" in
  linux/amd64|linux/arm64) ;;
  *) fail "unsupported TARGET_PLATFORM '$TARGET_PLATFORM'. Select linux/amd64 or linux/arm64." ;;
esac

command -v docker >/dev/null 2>&1 || fail "docker buildx is required to inspect dependency image manifests."
docker buildx version >/dev/null 2>&1 || fail "docker buildx is required to inspect dependency image manifests."
command -v jq >/dev/null 2>&1 || fail "jq is required to read $DEPENDENCY_MAP_FILE."
[ -f "$DEPENDENCY_MAP_FILE" ] || fail "dependency map not found: $DEPENDENCY_MAP_FILE"
jq -e '.dependencyImages | arrays' "$DEPENDENCY_MAP_FILE" >/dev/null 2>&1 || fail "$DEPENDENCY_MAP_FILE must contain a 'dependencyImages' array."

# Confirm the selected image is reachable and supports the selected platform.
validate_reference() {
  local reference="$1" raw platform_os platform_architecture
  raw="$(docker buildx imagetools inspect "$reference" --raw 2>/dev/null)" || fail "could not inspect $reference."
  [ -n "$raw" ] || fail "registry returned an empty manifest for $reference."

  platform_os="${TARGET_PLATFORM%%/*}"
  platform_architecture="${TARGET_PLATFORM##*/}"
  # Validate platform support for manifests.
  if jq -e '.manifests? | type == "array"' >/dev/null 2>&1 <<<"$raw"; then
    jq -e --arg os "$platform_os" --arg architecture "$platform_architecture" \
      '.manifests[]? | select(.platform.os == $os and .platform.architecture == $architecture)' \
      >/dev/null <<<"$raw" || fail "$reference does not publish a $TARGET_PLATFORM manifest."
  else
    local detected_platform
    detected_platform="$(
      docker buildx imagetools inspect "$reference" 2>/dev/null \
        | awk -F': ' '/^[[:space:]]*Platform:[[:space:]]*/ {print $2; exit}'
    )"
    [ -n "$detected_platform" ] || fail "could not determine platform for $reference; ensure it publishes a $TARGET_PLATFORM manifest."
    [ "$detected_platform" = "$TARGET_PLATFORM" ] || fail "$reference platform is $detected_platform; expected $TARGET_PLATFORM."
  fi
}

# Find a dependency by repository name and return its source and pinned references.
configured_dependency() {
  local dependency_name="$1"
  jq -er --arg name "$dependency_name" '
    .dependencyImages[]
    | select((.pinned | sub(":[^:]+$"; "")) == $name)
    | "\(.source)|\(.pinned)"
  ' "$DEPENDENCY_MAP_FILE"
}

# Validate all current pins without modifying the dependency map.
case "${1:-}" in
  --validate)
    [ "$#" -eq 1 ] || { usage >&2; exit 1; }
    echo "Validating configured dependency images for $TARGET_PLATFORM ..."
    while IFS='|' read -r source pinned; do
      validate_reference "$pinned"
      echo "  $source -> $pinned"
    done < <(jq -r '.dependencyImages[] | "\(.source)|\(.pinned)"' "$DEPENDENCY_MAP_FILE")
    ;;
  "")
    usage
    ;;
  *)
    dependency_name=""
    image_tag=""
    dependency_name_set=false
    image_tag_set=false
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --name)
          [ "$#" -ge 2 ] || fail "--name requires a value."
          [ "$dependency_name_set" = false ] || fail "--name may only be provided once."
          dependency_name="$2"
          dependency_name_set=true
          shift 2
          ;;
        --image-tag)
          [ "$#" -ge 2 ] || fail "--image-tag requires a value."
          [ "$image_tag_set" = false ] || fail "--image-tag may only be provided once."
          image_tag="$2"
          image_tag_set=true
          shift 2
          ;;
        *)
          usage >&2
          exit 1
          ;;
      esac
    done
    [ -n "$dependency_name" ] || fail "--name is required."
    [ -n "$image_tag" ] || fail "--image-tag is required."
    [[ "$image_tag" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || fail "invalid image tag '$image_tag'."

    dependency_entry="$(configured_dependency "$dependency_name")" || fail "unknown dependency '$dependency_name'. Use --validate to list configured dependencies."
    source="${dependency_entry%%|*}"
    current_image="${dependency_entry#*|}"
    repository="${current_image%:*}"
    new_image="$repository:$image_tag"

    validate_reference "$new_image"
    echo "Applying approved dependency image update:"
    echo "  source : $source"
    echo "  old    : $current_image"
    echo "  new    : $new_image"

    # Write and validate a complete replacement before updating the map.
    temp_file="$(mktemp "${DEPENDENCY_MAP_FILE}.tmp.XXXXXX")"
    trap 'rm -f "$temp_file"' EXIT
    jq --arg name "$dependency_name" --arg pinned "$new_image" '
      .dependencyImages |= map(
        if (.pinned | sub(":[^:]+$"; "")) == $name then .pinned = $pinned else . end
      )
    ' "$DEPENDENCY_MAP_FILE" > "$temp_file"
    jq -e '.dependencyImages | arrays' "$temp_file" >/dev/null || fail "updated dependency map must contain a 'dependencyImages' array."
    mv "$temp_file" "$DEPENDENCY_MAP_FILE"
    trap - EXIT
    ;;
esac
