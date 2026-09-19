# Codespaces WebTransport Investigation Plan

Status: Optional feature-gated SEA WebSocketStream adapter implemented; local Chromium and external Codespaces collaboration flows passed.
Created: 2026-09-18.

Current recommendation: explicitly enable native `WebSocketStream` for the Codespaces development path; see [implementation and validation](tests/webtransport-browser/README.md#optional-websocketstream-validation).
The user declined third-party relay deployment; retain those options as alternatives only.
Earlier recommendations below are historical evidence, not authorization to deploy a relay.

## Implementation Follow-Up

The user approved implementation after the bounded probe.
Both crates now have an off-by-default `websocket-stream` feature, with localized browser, wire-envelope, server-listener, and stream-adapter modules.
The existing SEA codec and logical-session handlers remain shared; a private server stream trait isolates transport operations.
One control socket owns a dispatcher and one socket per logical stream preserves independent backpressure.
Bounded DATA and directional FIN records avoid an application-level multiplexing/credit system.
Explicit selection permits WebTransport-only, WebSocketStream-only, or initial establishment fallback; there is no operation replay or mid-session switch.

Focused tests cover origin/protocol admission, group/stream limits, owner cleanup and token revocation, half-close, malformed/oversized records, pending-read cancellation, independent-stream progress, and bounded stall/recovery.
The real Chromium 152 harness passes collaboration, selection, and shutdown over the fallback.
The external Windows integrated browser (Chrome 148) also passed real SEA document/event/content/snapshot/reconnect traffic through public Codespaces forwarding on 2026-09-19 UTC.
The test used disposable memory storage; both test ports returned to private and listeners were stopped.
No third-party relay, client-side helper, certificate bypass, or ordinary-WebSocket substitution was used.

See the [client contract](crates/sea-webtransport/README.md#optional-websocketstream-fallback) and [server setup](crates/sea-webtransport-server/README.md#optional-websocket-listener).
Production authentication, cross-browser support beyond native API availability, and total browser/proxy memory bounds remain out of scope.
The rest of this record preserves earlier scope decisions and measurements chronologically.

Validation before rebasing onto the newer `rust-service` branch:

- All 147 Rust workspace all-target/all-feature tests passed; both transport crates also passed their feature-disabled tests.
- Workspace formatting, strict Clippy, strict Rust documentation, and documentation-link checks passed.
- WASM feature-enabled strict Clippy and feature-disabled compilation passed.
- The feature-enabled Chromium collaboration/selection/shutdown flow and the default WebTransport collaboration/shutdown flow passed.
- Modified JavaScript passed Biome checks.
- `pnpm build:fast` completed the compilation tasks, including generated WASM and the minimal driver, but remained red on root Biome and policy tasks.
	Root Biome reported 45 formatting findings, including retained historical benchmark JSON and the pre-existing local probe scripts.
	`pnpm policy-check --path rust-service` reported only missing copyright headers in the two uncommitted probe scripts.
	Those historical files and experiments were left unchanged; this is not a fully green repository gate.

All implementation edits and build outputs remain in `/workspaces/FluidFramework-codespaces-webtransport` on `rust-service-codespaces-webtransport`.
The active main worktree was not modified.

### Rebase and Build Follow-Up: 2026-09-19

The implementation was committed as `e4d78d11713`, then rebased onto local `rust-service` at `dd6b9c69ade`.
Its rebased commit is `a17c6f65177`; the only conflict combined the new default `bindings` gate with the optional `websocket-stream` feature in the client manifest.
Both native server and browser WASM transport checks passed after resolution.
The neutral `sea-wasm` API remains unchanged.

The newer base fixed the historical benchmark formatting blockers.
The two synthetic probe scripts were moved together, without content changes, from the source test directory to ignored `rust-service/target/websocket-probes/` in the isolated worktree.
They remain available as local investigation artifacts rather than production/test source.
Root Biome and `pnpm policy-check --path rust-service` pass after this relocation.
The earlier probe instructions below record their original paths at the time of the experiment.

Post-rebase validation is green: `pnpm build:fast`, root Biome, Rust-service policy, canonical Rust formatting/Clippy/docs/build, all 149 workspace tests, and target-specific WASM Clippy passed.
Both default WebTransport and feature-enabled WebSocketStream Chromium collaboration and bounded-shutdown tests passed.
Default generated bindings were restored after the optional-feature browser run.
No push or merge into the active worktree was performed.

This is an independently assignable investigation, separate from the [SEA WASM and ServiceClient integration plan](SERVICE_CLIENT_PLAN.md).
It does not require that plan's package extraction or inventory-app integration to be complete.
Use the existing WebTransport client and server for the smallest useful probe.

## Goal and Boundaries

Determine whether a user's browser outside GitHub Codespaces can interactively connect to a SEA WebTransport server inside the Codespace.
The desired experience is parity with Tinylicious: start the page host and service from VS Code connected to a Codespace, make the required forwarded ports public, and open the example in the user's local browser.
Other users should be able to open the shared URL without installing a tunnel client, changing browser security settings, or configuring certificates manually.
The existing page-hosting workflow should remain unchanged.
Preserve transport-backed backpressure in both directions.
The user subsequently proposed native `WebSocketStream` and authorized a forwarded-server test in VS Code's embedded browser.
This revises the initial native-WebTransport-only constraint, not the backpressure requirement.
Wrapping the traditional `WebSocket` API in a Streams API does not by itself meet this requirement; do not silently substitute that fallback.
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
- [x] Identify a practical connection route, if any, and state its browser, certificate, forwarding, and host prerequisites.
- [x] Try the smallest end-to-end probe when a supported route appears feasible; confirm actual native `WebSocketStream` traffic under the revised scope rather than only successful page loading.
- [x] Record direct interactive access and internal Chromium results separately, including the browser location and endpoint used.
- [ ] Adapt SEA and validate collaboration, independent-stream behavior, half-close, cancellation, and cleanup over the selected transport.
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
| Native WebSocketStream transport | Subsequently selected for a primitive probe; see the follow-up results below. | Native stream backpressure differs from a JavaScript wrapper around traditional WebSocket. SEA adaptation still needs independent-stream and half-close design; retain bounded messages and awaited sends. |
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

## Isolated Follow-Up: 2026-09-18

The user authorized investigation in a separate worktree while the primary checkout is used for other work.
All follow-up notes and changes belong to `/workspaces/FluidFramework-codespaces-webtransport`, branch `rust-service-codespaces-webtransport`.
The base is `91d61bae22672bdc7564694a0947969984370cd2`; the new worktree was clean at entry.
At entry, no commit, push, numbered iteration, external relay, or public service deployment was authorized by this follow-up.
The later WebSocketStream request authorized the bounded synthetic-data forwarding probe described below, not public SEA deployment.

Environment: Codespaces on Debian GNU/Linux 13; Chromium `152.0.7977.82`; Node.js `v22.23.2`; curl `8.14.1` with HTTP/2 and HTTP/3 support.
The Codespaces forwarding domain is `app.github.dev`.
Browser automation available inside this environment is not control of the user's external browser.

Initial hypothesis: native HTTP/2 WebTransport is blocked before SEA by browser implementation limits or lack of extended CONNECT at the Codespaces forwarding edge.
The cheapest discriminating checks are native browser capability inspection and a verified-TLS HTTP/2 connection that records the edge's SETTINGS, without starting a service or changing port visibility.
A supported browser and an edge advertising extended CONNECT would require further investigation; neither condition alone proves WebTransport or forwarding to SEA works.
After those checks, inspect public UDP-preserving tunnel options and their operational and backpressure constraints.

### Observed HTTP/2 Prerequisites

Both probes completed successfully on 2026-09-18 without starting SEA, changing port visibility, using authentication tokens, or bypassing certificate validation.

| Probe | Observation | Interpretation |
| --- | --- | --- |
| Native Chromium, temporary loopback page and fresh profile | Secure context; `typeof WebTransport === "function"`; `supportsReliableOnly` not exposed; no `reliability` prototype property | API availability alone is not proof of HTTP/2 support. This was an internal Codespaces browser, not an external visitor. |
| Node HTTP/2 connection to the current Codespace's port-4433 forwarding hostname | ALPN `h2`; `tlsAuthorized: true`; `enableConnectProtocol: false` | The observed edge connection did not enable extended CONNECT, a prerequisite for HTTP/2 WebTransport. No application stream or backend request was sent. |

The browser probe used Chromium's `--dump-dom` with `--headless=new`, `--no-sandbox`, `--disable-gpu`, and `--disable-dev-shm-usage`, plus an isolated profile.
Its page evaluated `navigator.userAgent`, `isSecureContext`, `typeof WebTransport`, `WebTransport.supportsReliableOnly`, and `"reliability" in WebTransport.prototype`.
The reported user agent identified `HeadlessChrome/152.0.0.0`.
The temporary loopback server and profile were removed after completion.

The [Chromium client factory at the installed version's tag](https://github.com/chromium/chromium/blob/152.0.7977.82/net/quic/web_transport_client.cc) provides stronger implementation evidence than missing JavaScript properties:
`CreateWebTransportClient` creates `DedicatedWebTransportHttp3Client` for HTTPS, or fails when HTTP/3 is disabled; it does not select an HTTP/2 fallback.
This does not establish the capabilities of every browser.
For example, [WebKit's current implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/webtransport/WebTransport.cpp) returns `true` from `supportsReliableOnly`; Safari was not run in this investigation.
That live-source observation is not a verified Safari-to-Codespaces connection.

To repeat the edge prerequisite check from this worktree, use the following Node command.
It constructs the endpoint from Codespaces metadata without logging that identifier, uses normal TLS verification, and sends no application request:

```bash
node --input-type=module <<'NODE'
import { connect } from "node:http2";
const { CODESPACE_NAME, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN } = process.env;
if (!CODESPACE_NAME || !GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
	throw new Error("Codespaces endpoint metadata unavailable");
}
const endpoint = `https://${CODESPACE_NAME}-4433.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`;
const session = connect(endpoint);
const deadline = setTimeout(() => {
	console.error("HTTP2_SETTINGS_TIMEOUT");
	process.exitCode = 1;
	session.destroy();
}, 15000);
session.once("error", error => {
	console.error(error.code);
	process.exitCode = 1;
});
session.once("remoteSettings", settings => {
	console.log(JSON.stringify({
		alpn: session.socket.alpnProtocol,
		tlsAuthorized: session.socket.authorized,
		settings,
	}));
	session.close();
});
session.once("close", () => clearTimeout(deadline));
NODE
```

Other returned settings were `headerTableSize: 4096`, `enablePush: true`, `initialWindowSize: 65536`, `maxFrameSize: 16777215`, `maxConcurrentStreams: 128`, and `maxHeaderListSize: 4294967295`.
The endpoint was inspected without assuming a backend existed or the port was public.
This is one edge connection's SETTINGS, not a permanent claim about every region or future forwarding implementation.
It is sufficient to reject implementing an HTTP/2 SEA server as the next step for this observed environment.
Public visibility alone cannot enable a missing protocol prerequisite.

### Public UDP Candidate Assessment

Primary provider documentation was checked on 2026-09-18; no provider account, tunnel, VM, or persistent process was created.

| Candidate | Documented fit | Remaining uncertainty and cost |
| --- | --- | --- |
| [Playit](https://playit.gg/) custom UDP | Public tunnel with a host-side agent; visitors do not install software. The homepage lists UDP in the free tier. | No SEA/QUIC test yet. Verify datagram size, mapping stability, outbound Codespaces connectivity, relay limits, and browser access to the allocated port. [Pricing](https://playit.gg/pricing) lists four ports and two agents on free, with premium advertised at $3/month for additional features; recheck before signup. |
| [frp UDP forwarding](https://github.com/fatedier/frp/blob/dev/README.md#forward-dns-query-requests) | `frps` binds a public UDP port; `frpc` in Codespaces forwards it to a local UDP endpoint. The ordinary browser needs no `frpc` visitor. | Requires an approved public VM/address, firewall rules, authenticated agent connection, and hosting/egress budget. A UDP proxy type does not establish the internal tunnel's loss, queue, or head-of-line behavior. |
| [Cloudflare Tunnel published applications](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/protocols/) | Useful for HTTP page hosting, but its published protocol table does not provide this public raw-UDP route. | Non-HTTP routes require visitor-side `cloudflared`; documented TCP routing uses WebSockets. Internal QUIC use by an agent is not public WebTransport support. Not selected. |
| [Tailscale Funnel](https://tailscale.com/kb/1223/funnel) | Public access without visitor software, but documented as a TCP proxy. | Not a public raw-UDP route to the existing SEA endpoint. Private tailnet connectivity is a different workflow requiring visitor setup. Not selected. |

Playit's [acceptable-use guidance](https://playit.gg/support/prohibited-uses/) permits normal user-driven hobby applications and ordinary encrypted application traffic.
That is not confirmation of approval for an organizational deployment or a load test; confirm applicable terms and organizational policy before use.
Do not disguise traffic as a supported game protocol or bypass network restrictions.

A raw UDP relay can leave QUIC encryption, stream flow control, and acknowledgements between the browser and SEA.
It cannot acknowledge decrypted stream data on SEA's behalf, so a stopped reader should eventually stall the sender after bounded transport buffers fill.
That is a mechanism-level expectation, not measured backpressure evidence.
Relay queues, retransmission layers, packet loss, MTU, and idle mapping expiry can still cause poor latency or failed connections.
In particular, frp's documented QUIC option does not by itself prove that forwarded UDP packets use an unreliable datagram path rather than reliable encapsulation.
Neither candidate has passed the required slow-reader test.

### Proposed Next Experiment and Decision

This relay recommendation was subsequently superseded by the user's WebSocketStream proposal and preference not to use a third-party service.

Recommendation: approve a short Playit custom-UDP trial first, provided its terms and organizational policy permit this development use.
Keep SEA in Codespaces; keep page hosting on ordinary Codespaces HTTP forwarding; publish only SEA's UDP port through the relay.
Use `frp` on an approved existing VM as the alternative when relay control or managed-provider policy requires it.
Do not implement a new application transport, HTTP/2 server, or WebSocket bridge for this trial.

The experiment needs explicit approval for the provider/account, agent installation, public exposure, and any charges.
Proposed budget: one free UDP allocation, one disposable SEA instance, two external browser sessions, at most 30 minutes of public exposure, and at most 64 MiB of application test data.
Do not purchase premium, provision a VM, increase traffic, or extend exposure without a further decision.
If transport windows or provider limits make that data budget insufficient to demonstrate a stalled write, record an inconclusive result rather than increase load automatically.

1. Start the existing SEA endpoint with disposable storage and a fresh short-lived P-256 certificate; bind it to loopback and forward only that UDP endpoint.
2. Deliver the relay URL and SHA-256 leaf pin through the trusted HTTPS page configuration, automatically rather than as visitor certificate setup.
   The current native browser adapter already supplies `serverCertificateHashes`; the existing loopback harness is not a persistent public page launcher, so a small scoped launcher/configuration change remains necessary.
   Keep private keys and provider credentials out of page assets, URLs, and logs.
3. In an ordinary external browser and a second fresh context without GitHub login, verify connection readiness, document creation, event submission, live delivery, and disconnect cleanup.
   Record browser/version, page origin, transport endpoint, negotiated behavior, and server evidence.
4. Pause application reads in each direction in turn while writing beyond configured transport windows within the approved budget.
   Record pending write completion, sender and receiver memory, available relay queue/drop metrics, then recovery after reads resume.
   Use awaited sequential writes, not an unbounded producer queue; distinguish a transport stall from SEA-level request/response pacing.
   A successful handshake or bounded application queue alone does not prove transport-backed backpressure.
5. Confirm datagrams of at least QUIC's 1200-byte Initial requirement traverse the route, exercise sustained transfer and an idle/reconnect interval, and check that independent clients remain correctly mapped.
   Stop on persistent truncation, unexpected exposure, unbounded memory growth, or a need to weaken TLS verification.
6. Stop the owned service/page/agent processes, remove the public mapping and temporary credentials/data, and record cleanup.

The built-in host does not supply production client authentication or an explicit origin allowlist.
The certificate pin authenticates SEA to the browser, not visitors to SEA; a public page URL is not an access-control boundary.
Use only disposable development data, bounded resources, and approved exposure.
An origin allowlist alone would not authenticate non-browser clients.

Follow-up outcome: HTTP/2 is not a viable next implementation step for the observed Codespaces edge and installed Chromium.
A public raw-UDP relay is the most promising remaining route that preserves native WebTransport and keeps SEA in Codespaces, but remains unverified end to end.
No working external page URL, collaboration result, or slow-reader result is claimed.
The investigation remains active pending approval of the public relay experiment; no runtime source changes were made.

### Follow-Up Validation

- `node scripts/check-documentation.mjs` from `rust-service`: passed, with 27 roots, 34 READMEs, and 68 local links.
- `pnpm policy-check --path rust-service` from the isolated root, using the primary checkout's installed executable through `PATH`: failed because the isolated worktree has no installed TypeScript dependencies.
- Retrying with `NODE_PATH=/workspaces/FluidFramework/node_modules` resolved the missing module but still failed `fluid-build-tasks-tsc` checks for the untouched `sea-driver`, `sea-tree`, and `minimal-fluid-driver` package manifests, reporting unspecified `compilerOptions.module`.
	This reused-tooling run is not a clean policy pass; no dependency installation or unrelated package repair was performed.
- Runtime builds and SEA integration tests were not run for this documentation-only pass.
	The prerequisite probes above are not substitutes for an external-browser collaboration or backpressure test.

## Native WebSocketStream Probe: 2026-09-18

### Scope and Browser Location

The user authorized running a web server and connecting through VS Code's embedded browser to test the Codespaces boundary.
All source and notes stayed in the isolated worktree and branch recorded above; the primary checkout was not modified.
No SEA service, user data, third-party relay, certificates, credentials, or paid resources were used.

The browser controlled by the integrated Playwright tools reported `Win32` and this user agent:

```text
Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.138.0 Chrome/148.0.7778.280 Electron/42.10.0 Safari/537.36
```

It exposed `WebSocketStream` without enabling flags.
This was the Windows VS Code embedded browser, not the Debian Chromium process inside Codespaces used in the earlier prerequisite inspection.
Both page and WebSocket connections used the public forwarding hostname, not loopback:

```text
https://stunning-space-meme-7p9xrg66qx7cpr66-18765.app.github.dev/
wss://stunning-space-meme-7p9xrg66qx7cpr66-18765.app.github.dev/download
wss://stunning-space-meme-7p9xrg66qx7cpr66-18765.app.github.dev/upload
```

These are recorded endpoints, not currently running services.
The public page showed GitHub's standard development-port warning; continuing reached the probe without a login prompt.
An additional `curl` request to the public `/state` endpoint, with no cookies or authorization supplied, returned the session evidence.
The browser's existing login state was not inspected or cleared, so this is not a fresh-profile anonymous browser test.
TLS verification remained enabled; Codespaces supplied the public certificate and forwarded to local HTTP/WebSocket.

### Method and Results

The local, uncommitted server probe `tests/webtransport-browser/websocketstream-probe.mjs` uses Node `v22.23.2` and the existing `ws` `8.21.0` installation, read-only from the primary checkout.
The local, uncommitted browser probe `tests/webtransport-browser/websocketstream-probe-client.mjs` uses the native API, not a polyfill.
These scripts remain in the isolated worktree and are not included in the notes-only commit; the reproduction commands below require those local artifacts.
Each direction sends 512 ordered binary messages of 65,536 bytes, or 32 MiB, with compression disabled.
The receiver validates message size, sequence number, and a payload sentinel.
Each sender awaits one write completion before producing the next message; no application acknowledgement gates individual writes.
The upload uses one final acknowledgement after all messages have arrived.

For download, the browser acquires a reader but does not call `read()` until resumed.
For upload, the server calls `ws.pause()` before receiving application messages, then `ws.resume()` on a separate HTTP control request.
This pauses underlying socket reads, rather than draining messages into an application queue.
Each server process permits one session per direction, a 120-second connection deadline, and a 15-minute total lifetime.

| Direction | Paused-reader evidence | Recovery evidence |
| --- | --- | --- |
| Server to browser | Clean run stalled after 111 completed sends, 6.9375 MiB; the next send callback stayed pending for over 10 seconds. Browser application reads remained zero. | Browser validated all 512 messages after resume and reported `done`; completion took 3.949 seconds from its resume timestamp. Server also completed 512 sends and observed closure. |
| Browser to server | Browser stalled after 176 completed writes, 11 MiB; the same `writer.write()` remained pending across repeated samples. Server received zero messages while socket reads were paused. | Server validated all 512 messages after resume in 10.514 seconds, sent the final acknowledgement, and observed closure. The browser tool lost its page handle during the resume call, so its final upload state was not retrieved. |

The 32 MiB in each direction is the successful measured run's application payload budget, not a throughput benchmark.
An earlier diagnostic download was stopped after 224 completed sends following a binary-type mismatch, adding about 14 MiB of diagnostic payload plus an in-flight message.
That run is not counted as a recovery pass.
The native API returned `ArrayBuffer` in this Chromium version; the probe now normalizes both `ArrayBuffer` and `Uint8Array` before validation.

Observed memory during the clean paused intervals:

- Download server RSS remained 63,713,280 bytes and external memory 3,810,743 bytes across repeated stalled samples.
- Upload server RSS remained 65,024,000 bytes and external memory 3,885,329 bytes across 22 paused samples spanning about 21 seconds.
- Browser reported JS heap stayed approximately 4.24 MB during the download pause and 3.25 MB during the upload pause, with small sampling/rendering allocations.
	`performance.memory` is limited, non-standard evidence; it does not measure the browser network process, all backing stores, operating-system socket buffers, or the Codespaces proxy.
- Final server RSS was 73,580,544 bytes versus 63,438,848 bytes at startup.
	This short experiment does not establish long-run memory stability or a universal buffer bound.

Backpressure is delayed by substantial buffering, but it did propagate through the tested public forwarding route in both directions and sending recovered after reads resumed.
The 6.9375 MiB and 11 MiB plateaus are observed accepted-send quantities, not configured queue limits or a guarantee for other networks.
No proxy-internal memory measurements are available.
Browser and server clocks differ; durations above use timestamps from the same process, not cross-machine subtraction.

Final server evidence:

```json
[
	{"mode":"download","startedAt":1789773904897,"completedMessages":512,"pendingSince":null,"closed":true,"finishedAt":1789773925221,"closeCode":1005},
	{"mode":"upload","startedAt":1789773956553,"completedMessages":512,"pendingSince":null,"closed":true,"resumedAt":1789773978485,"finishedAt":1789773988999,"closeCode":1005}
]
```

Code `1005` is the local indication of a close without a status code, not an application status transmitted on the wire.

### Setup Findings and Reproduction

Codespaces rewrote the WebSocket upgrade's `Host` to `localhost:18765` and `Origin` to `http://localhost:18765`.
The initial exact public-origin check therefore returned 403.
The probe accepts the exact public origin and this exact loopback origin; this is not a production authentication design or proof of the original browser origin.
Any SEA origin policy must account for the trusted proxy boundary without treating a rewritten loopback origin as client identity.

Port visibility updates initially returned 404 because the port was not registered.
Emitting `http://localhost:18765` in the terminal and loading that URL in the embedded browser registered forwarding; the visibility update then succeeded.
Other existing ports, 7070 and 60078, stayed private throughout.
The embedded page was hidden, so Playwright's default animation-frame polling timed out even after the download had finished.
Use timer polling (`polling: 100`) when waiting for results in such a tab.

With exposure approved, an unused port selected, and a compatible `ws` installation available:

```bash
cd /workspaces/FluidFramework-codespaces-webtransport
PROBE_WS_MODULE=/workspaces/FluidFramework/node_modules/.pnpm/ws@8.21.0/node_modules/ws/index.js \
	node rust-service/tests/webtransport-browser/websocketstream-probe.mjs
```

Set `PROBE_PORT` to use a different unused port; 18765 is the default.
Register that port in VS Code, then run `gh codespace ports visibility 18765:public -c "$CODESPACE_NAME"`.
Open the printed HTTPS URL in the integrated browser and accept the normal development-port warning.
Through Playwright, call `page.evaluate(() => window.probe.start("download"))`, wait at least 12 seconds, and capture `window.probe.state()` plus `/state`.
Call `window.probe.resume()` and wait for `done` or `failed` using timer polling.
Repeat with `start("upload")` after the first session has closed, then resume and capture both endpoint results.
Preserve samples before starting the next direction, since the browser sample list resets and the server retains only 90 recent samples.

Cleanup performed: port 18765 was restored to private and verified with `gh codespace ports`; the owned Node server was stopped after both sessions closed.
No public test service remains.
The private forwarded-port registration may remain in VS Code, but its backend is stopped.
No main-checkout changes, commits, pushes, or dependency installations were made.

### Recommendation and Remaining Work

Native `WebSocketStream` is now an experimentally demonstrated forwarding/backpressure option for this Codespaces workflow.
[MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocketStream) lists Chrome/Edge 124+ and marks the API experimental and non-standard.
The [API explainer](https://github.com/ricea/websocketstream-explainer) explains finite buffering, message-level reads, and that write completion is not delivery acknowledgement.
The tested browser is VS Code's Chromium 148, not standalone Chrome or Edge; do not imply a browser matrix was executed.

Next scope decision: implement a bounded SEA adapter using this native API and a matching WebSocket server endpoint.
Preserve independent flow control across SEA's logical streams, message-size bounds, send-direction finish semantics, cancellation, session association, and disconnect cleanup.
Multiple connections may avoid cross-stream blocking but require explicit association; a multiplexed connection needs its own per-stream flow-control design and still shares TCP loss-related head-of-line blocking.
Do not silently fall back to traditional `WebSocket` when `WebSocketStream` is absent.
Document creation, multi-client collaboration, and the generated SEA transport have not been tested over this route.
The original HTTP/3 Codespaces limitation remains open until a supported SEA workflow is implemented.

### Probe Validation

- Both retained `.mjs` files passed `node --check`; editor diagnostics reported no errors.
- Documentation validation passed: 27 roots, 34 READMEs, and 69 local links.
- `git diff --check` passed; a TCP connection check returned `ECONNREFUSED` after shutdown.
- Scoped policy validation still fails the three unchanged TypeScript package checks described above and reports missing required copyright headers on the two new probe scripts.
	The scripts remain uncommitted experimental artifacts, not merge-ready additions.
- No Rust source, registered package, manifest, lockfile, or generated-client build input changed; no Rust or repository-wide build was run for this standalone primitive experiment.