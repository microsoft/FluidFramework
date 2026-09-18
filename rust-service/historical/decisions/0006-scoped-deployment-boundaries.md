# Decision 0006: Scoped Deployment Boundaries

Status: accepted
Date: 2026-09-12
Iteration: 0003
Owners: interactive user and GitHub Copilot
Supersedes: none
Superseded by: none

## Context

Iteration 0003 tested three boundaries that earlier iterations had only modeled in process: sequencer fencing, abrupt process termination, and process-isolated transport. The resulting implementations have explicit platform and deployment limits.

## Decision Drivers

The research prototype needs honest deployable scopes without requiring distributed systems or hardware fault infrastructure before assembling a usable service. Kernel and protocol semantics must not be weakened to obtain broader claims.

## Options and Evidence

A same-host file-lock authority held through replay, validation, and append rejected stale owners across independent processes and recovered after process death. Child-process termination tests preserved acknowledged log prefixes and valid snapshot lineage on the tested Linux filesystem. Unix-domain transport preserved bounded reads and opaque positions across a child process. Distributed fencing, power-loss behavior, and cross-platform transport remain untested.

## Decision

Accept cooperating single-host deployment fencing, Linux process-termination recovery, and Unix process transport as explicitly scoped prototype guarantees. Do not generalize them to multiple hosts, unsuitable network filesystems, authority-file replacement, direct storage writers, kernel-cache loss, hardware power loss, or non-Unix clients.

Browser and cross-host transport proceeds through a separate WebTransport implementation. Distributed fencing and power-loss qualification remain optional future work rather than blockers for service assembly.

## Consequences

The runnable service may target one host first and reuse the accepted kernel and sequencer contracts. Deployment documentation must identify the stable authority inode and cooperating-writer assumptions. WebTransport, native client lifecycle, wrappers, and benchmarks may proceed without a kernel change.

## Validation and Follow-Up

Iteration 0004 assembles the service and adds native-server plus native/browser-WASM WebTransport. Any deployment beyond the accepted scope must add evidence or supersede this decision.