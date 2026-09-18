# Codespaces WebTransport Investigation Plan

Status: Initial research complete; current forwarding route blocked; alternative selection pending.
Created: 2026-09-18.

This is an independently assignable investigation, separate from the [SEA WASM and ServiceClient integration plan](SERVICE_CLIENT_PLAN.md).
It does not require that plan's package extraction or inventory-app integration to be complete.
Use the existing WebTransport client and server for the smallest useful probe.

## Goal and Boundaries

Determine whether a user's browser outside GitHub Codespaces can interactively connect to a SEA WebTransport server inside the Codespace.
The desired experience is parity with Tinylicious: start the page host and service from VS Code connected to a Codespace, make the required forwarded ports public, and open the example in the user's local browser.
Other users should be able to open the shared URL without installing a tunnel client, changing browser security settings, or configuring certificates manually.
The existing page-hosting workflow should remain unchanged.
Preserve native WebTransport and transport-backed backpressure in both directions.
Do not pursue WebSocket transports or WebSocket bridges under this plan; the user prefers to avoid them because the browser WebSocket API does not provide equivalent backpressure.
Wrapping a WebSocket in a Streams API does not by itself meet this requirement.
Routes requiring additional client software or hosting outside Codespaces are alternatives, not success for this primary workflow.
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

- [x] Check current authoritative Codespaces forwarding documentation and browser WebTransport requirements, recording source URLs and the date checked.
- [x] Determine whether supported forwarding can carry the required connection from an external browser to the Codespace, including User Datagram Protocol (UDP), QUIC, Transport Layer Security (TLS) certificates, origin handling, and Codespaces access controls.
- [ ] Identify a practical connection route, if any, and state its browser, certificate, forwarding, and host prerequisites.
- [ ] Try the smallest end-to-end probe when a supported route appears feasible; confirm actual WebTransport traffic rather than only successful page loading.
- [ ] Record direct interactive access and internal Chromium results separately, including the browser location and endpoint used.
- [x] Identify practical alternatives and their costs or operational constraints without deploying infrastructure outside the approved scope.
- [x] If blocked or unresolved, add a current item to [Known Issues](KNOWN_ISSUES.md) with evidence, user impact, and a concrete follow-up trigger.

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
For a proposed gateway or tunnel, explain how a slow reader limits upstream sending and buffering across every hop.
Validate bounded buffering and pressure propagation with a slow-reader probe before claiming that a working route preserves backpressure.

Validate any code or harness changes with focused tests and the applicable gates in [Development](DEVELOPMENT.md).
For documentation changes, run the documentation checker from `rust-service/` and `pnpm policy-check --path rust-service` from the repository root.
Do not run implementation builds solely for a documentation-only report.

When complete, hand findings to the main integration owner, place supported usage in the appropriate current guide, and archive this plan and its evidence under [Historical records](historical/README.md).
This assignment does not authorize commits, pushes, or starting a numbered iteration.

## Initial Findings: 2026-09-18

### Conclusion and Evidence

The current SEA HTTP/3 server cannot use supported ordinary Codespaces port forwarding to provide the requested public-browser workflow.
GitHub documents forwarding as access to TCP ports, whereas the current server binds a QUIC/UDP endpoint.
Making a port public changes who can access it, not the transport protocol.
Selecting HTTPS forwarding also does not convert TCP traffic into QUIC or provide a WebTransport gateway.
This is a documented platform/implementation mismatch, not a failed external-browser measurement or proof that every alternative is impossible.

Sources checked on 2026-09-18:

- [GitHub Codespaces port forwarding](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace) documents TCP forwarding, public access, and HTTP/HTTPS settings.
	The public browser URL uses HTTPS even when the application-side forwarding protocol is HTTP.
	Public visibility remains subject to organization policy.
- [GitHub CLI port forwarding](https://cli.github.com/manual/gh_codespace_ports_forward) documents local port forwarding, not a browser-accessible UDP gateway.
- [WebTransport specification](https://www.w3.org/TR/2026/CR-webtransport-20260730/) describes HTTP/3 and HTTP/2 mappings, protocol negotiation, omitted cookies, no redirect following, and certificate-hash authentication.
	HTTP/2 in the specification does not establish support in the chosen browser, GitHub forwarding intermediary, or SEA server.
	Ordinary HTTP/2 support is insufficient without WebTransport negotiation and handling.
- [Chrome WebTransport guide](https://developer.chrome.com/docs/capabilities/web-apis/webtransport) explains HTTP/3 transport and the compatibility/performance tradeoffs with WebSockets.
- [WebSocket ponyfill repository](https://github.com/fails-components/webtransport-ponyfill-websocket) demonstrates that a WebTransport-like interface over WebSockets requires a matching server implementation.
	That repository is deprecated; do not adopt it based on the older link in Chrome's guide.
	A replacement library would need a separate compatibility, maintenance, and license review.
- [Dev tunnels overview](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/overview) mentions possible UDP-based protocols in its terminology.
	That statement does not document a usable native-browser WebTransport route through Codespaces public port URLs.

The [native listener](crates/sea-webtransport-server/src/server.rs) binds HTTP/3 and reports a UDP address.
Its acceptance path checks `/sea` but adds no origin allowlist or client authentication.
The [browser binding](crates/sea-webtransport/src/wasm/sea.rs) requires a 32-byte certificate hash; the [browser transport](crates/sea-webtransport/src/transport/browser.rs) supplies it through `serverCertificateHashes`.
The [certificate generator](tests/webtransport-browser/generate-cert.sh) creates an ECDSA P-256 certificate valid for 13 days.
Pinning authenticates the server, not clients.
A TLS-terminating gateway presents its own certificate, so the backend certificate pin cannot be reused for that connection.
Private Codespaces page authentication also does not establish WebTransport authentication, since the latter does not carry the page's cookies or follow login redirects.
Public visibility removes that authentication requirement but does not remove the TCP/UDP mismatch.

### Alternatives, Not Yet Implemented or Tested

| Option | Match to desired workflow | Work and constraints |
| --- | --- | --- |
| WebTransport over HTTP/2 | First compatibility question to investigate, not an available configuration. | Requires verified native-browser and forwarding support plus a compatible server or gateway. Provides flow control but retains TCP head-of-line blocking across streams. SEA currently only listens on HTTP/3. Do not assume a browser option makes this work. |
| UDP-preserving tunnel with a public endpoint | Could preserve end-to-end QUIC to SEA inside Codespaces without per-user software. | Requires an externally reachable UDP endpoint and a reverse tunnel from Codespaces. No suitable setup has been verified. Check datagram preservation, MTU, congestion behavior, bounded buffering, TLS identity, access controls, and cost. |
| Public UDP-capable host or external WebTransport gateway | Can preserve browser-native WebTransport without per-user software; page can remain in Codespaces. | Requires separately managed hosting, TLS, exposure controls, and possible recurring cost. Hosting SEA there moves the service out of the Codespace; a gateway retaining SEA in Codespaces also needs a working reverse connection and stream bridge. |
| Private UDP-capable overlay or tunnel | Potentially preserves native WebTransport to SEA in the Codespace. | Requires client setup, enrollment/access policy, and network/certificate validation. Does not meet the anyone-with-a-public-URL goal. Ordinary SSH TCP forwarding alone is insufficient. |
| SEA WebSocket transport or WebSocket-to-WebTransport bridge | Not selected; superseded by the backpressure requirement. | A browser WebSocket does not expose equivalent backpressure. A stream-shaped adapter alone is insufficient. Do not implement or probe this option without revisiting the requirement with the user. |
| Continue using Tinylicious remotely and local SEA for local-service examples | Existing practical fallback while retaining the page workflow. | Does not exercise remote SEA. Keep separate native WebTransport tests in a reachable environment. |

The [client transport contract](crates/sea-webtransport/src/transport/mod.rs) requires independent bidirectional byte streams, not application datagrams.
The generated `SeaInjectedClient` already accepts a JavaScript transport implementing these operations.
This makes reuse of the shared client plausible, but the server stream handlers currently use concrete `wtransport` stream types.
This abstraction is not evidence that an alternate transport preserves backpressure.
Do not silently fall back when native WebTransport was selected.

### Probe Disposition and Next Decision

Inspection ran in `/workspaces/FluidFramework`, branch `rust-service`, HEAD `259293dfe70290b6ef53cd749e2bb5690b280acf`.
The working tree already contained an unrelated modification to `rust-service/SERVICE_CLIENT_PLAN.md`; it was left untouched.
`CODESPACES=true`; locally installed Chromium reported `152.0.7977.82` on Debian GNU/Linux 13.
Commands used for environment evidence were `git branch --show-current`, `git rev-parse HEAD`, `git status --short`, `command -v chromium`, and `chromium --version`.
Only non-secret environment flags were inspected.

No connection probe was run: ordinary forwarding has no supported route to the current UDP listener, and no alternative transport or infrastructure has been authorized or provisioned.
No internal Chromium success is claimed, and external browser control has not been established.
No services, certificates, tunnels, port-visibility changes, or other test resources were created; no resource cleanup was needed.
The [existing runner](tests/webtransport-browser/run-headless.mjs) starts internal Chromium and owns the temporary page host; it is not a persistent external-browser launch command.

The initial WebSocket recommendation was superseded on 2026-09-18 by the user's requirement to preserve backpressure and preference to avoid WebSockets.
Recommended next step: a bounded native WebTransport compatibility investigation, not an implementation commitment.
First check actual HTTP/2 WebTransport support in the target browser and Codespaces forwarding intermediary, including extended CONNECT handling and certificate requirements.
If a supported combination exists, identify the minimum server or gateway change and request approval before implementing it.
Otherwise investigate a UDP-preserving reverse tunnel with a public endpoint that keeps SEA inside Codespaces and requires no client installation.
Propose the infrastructure, access controls, operational cost, and probe budget before deploying it.
If neither route is practical, present external SEA hosting versus per-user tunnel setup as an explicit workflow tradeoff.

For any approved feasible route, test document creation, event submission, live delivery to a second session, slow-reader backpressure, and disconnect cleanup.
Use an external browser with the unchanged page-hosting workflow and a fresh browser context without GitHub login for public-access evidence.
Provide an actual page URL and visible pass/fail result after the endpoint exists; no working external SEA setup has been established yet.
Keep page origin, service endpoint, browser/version, transport choice, and server evidence in the result.
Stop after the compatibility assessment and smallest approved probe for a scope decision before broader implementation or infrastructure work.

Any public probe must use disposable data, bounded lifetime and resources, and explicitly approved exposure.
Public-port parity is a development convenience, not a production authentication claim; the existing security limitation remains applicable.
Keep this plan active pending the alternative decision, then archive its evidence when the investigation is closed.