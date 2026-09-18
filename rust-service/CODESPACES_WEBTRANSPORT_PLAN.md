# Codespaces WebTransport Investigation Plan

Status: Planned; investigation has not started under this plan.
Created: 2026-09-18.

This is an independently assignable investigation, separate from the [SEA WASM and ServiceClient integration plan](SERVICE_CLIENT_PLAN.md).
It does not require that plan's package extraction or inventory-app integration to be complete.
Use the existing WebTransport client and server for the smallest useful probe.

## Goal and Boundaries

Determine whether a user's browser outside GitHub Codespaces can interactively connect to a SEA WebTransport server inside the Codespace.
The user tests examples through Codespaces, so distinguish this workflow from Chromium running inside the Codespace and reaching a local server.
An internal browser test proves neither external reachability nor compatibility with Codespaces forwarding.

Time-box the initial investigation to one focused research-and-probe pass.
Propose a further budget before undertaking infrastructure work.
Do not deploy an external relay, paid host, or public unauthenticated service without approval.
Do not weaken certificate validation or record credentials as a workaround.

The main integration plan still requires a local ephemeral SEA option without WebTransport and real WebTransport collaboration in a suitable browser environment.
Neither depends on this investigation succeeding.
Do not expand this assignment into implementing the WASM packages, ServiceClient, or inventory example.

## Fresh-Context Entry

- Read this plan's scope and acceptance criteria; the [main integration plan](SERVICE_CLIENT_PLAN.md) supplies context, not additional implementation tasks or prerequisites.
- Read [Sea architecture](SEA_ARCHITECTURE.md), [Known Issues](KNOWN_ISSUES.md), and [Development](DEVELOPMENT.md), particularly current security and deployment limits.
- Use the [WebTransport browser harness](tests/webtransport-browser/README.md), [transport guide](crates/sea-webtransport/README.md), and [server guide](crates/sea-webtransport-server/README.md) as implementation anchors.
- Check the assigned worktree path, branch, HEAD, and working-tree status; preserve existing changes.
- Check available browser access, network access, and current harness commands before making changes; follow relocated code if the main integration has changed the harness.
- Establish whether the agent can test from an external browser or only inside Codespaces; unavailable external access remains unverified, not passed.
- Coordinate with other agents before changing shared harness or server files; prefer a minimal probe using existing facilities.

## Investigation Checklist

- [ ] Check current authoritative Codespaces forwarding documentation and browser WebTransport requirements, recording source URLs and the date checked.
- [ ] Determine whether supported forwarding can carry the required connection from an external browser to the Codespace, including User Datagram Protocol (UDP), QUIC, Transport Layer Security (TLS) certificates, origin handling, and Codespaces access controls.
- [ ] Identify a practical connection route, if any, and state its browser, certificate, forwarding, and host prerequisites.
- [ ] Try the smallest end-to-end probe when a supported route appears feasible; confirm actual WebTransport traffic rather than only successful page loading.
- [ ] Record direct interactive access and internal Chromium results separately, including the browser location and endpoint used.
- [ ] Identify practical alternatives and their costs or operational constraints without deploying infrastructure outside the approved scope.
- [ ] If blocked or unresolved, add a current item to [Known Issues](KNOWN_ISSUES.md) with evidence, user impact, and a concrete follow-up trigger.

Do not equate failure of ordinary port forwarding with proof that every possible approach is impossible.
When external browser access is unavailable to the agent, mark that route unverified and provide the smallest remaining user-run test.
Do not report a documented possibility as a tested setup.

## Evidence and Acceptance

Maintain findings and commands in this plan while the investigation is active, including browser/version, environment, server configuration, observed errors, source references, and cleanup of test-owned resources.
Do not record secrets or temporary credentials.
Update the checklist as work proceeds.

Acceptance is either a tested, reproducible external interactive setup or a bounded report of evidence, uncertainty, attempted probes, and the next experiment.
A successful setup must include startup, certificate, connection, and cleanup instructions suitable for the user and the example-integration owner.
A blocked result must distinguish platform restrictions from missing access or inconclusive evidence.

Validate any code or harness changes with focused tests and the applicable gates in [Development](DEVELOPMENT.md).
For documentation changes, run the documentation checker from `rust-service/` and `pnpm policy-check --path rust-service` from the repository root.
Do not run implementation builds solely for a documentation-only report.

When complete, hand findings to the main integration owner, place supported usage in the appropriate current guide, and archive this plan and its evidence under [Historical records](historical/README.md).
This assignment does not authorize commits, pushes, or starting a numbered iteration.