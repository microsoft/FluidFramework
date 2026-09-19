#!/usr/bin/env bash

# Build every non-Rust dependency, then run the complete Rust and non-Rust test suites.
# This script may be invoked from any directory.

set -euo pipefail

service_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$service_root"

pnpm --dir tests/minimal-fluid-driver run build
cargo test --workspace --all-targets --all-features
# The build above satisfies test:all's prerequisites without traversing the build graph twice.
pnpm --dir tests/minimal-fluid-driver run test:all