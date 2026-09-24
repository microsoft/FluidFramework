# Decision 0027: Native Request and Frame Deadlines

Status: accepted
Date: 2026-09-24
Iteration: lightweight follow-up to 0018
Owners: user, coordinator
Supersedes: [0025: Native Timeout Scope](0025-native-timeout-scope.md)
Superseded by: none

## Context

Decision 0025 corrected the timeout documentation but deferred post-opening enforcement.
The user authorized a focused repair that bounds native operations without timing out healthy idle subscriptions.

## Decision Drivers

Stalled peers must not hold finite operations indefinitely.
Partial-frame cancellation must preserve framing and deadline ownership.
Timeouts must not permit stale-response reuse or automatic replay of potentially committed mutations.

## Options and Evidence

Timing every byte read independently would let trickled bytes renew the budget and would terminate healthy idle subscriptions.
Timing only outer session methods would miss independently consumed streams and lose partial-frame clocks when subscription pumps select another operation.
The shared framed-stream owner can retain decoder state and absolute deadlines together while the native transport supplies the configured duration.

## Decision

Use one native budget for each connection attempt, logical-stream opening, and finite request.
Openings include their handshake, including initial snapshot coordination and signal membership.
Finite requests retain their original budget through the matching completion, regardless of interleaved notifications.
Monitored content reads release the request budget after the first response.
Idle subscriptions have no request deadline; an observed incomplete frame has a separate absolute completion deadline that survives receive cancellation.
Complete buffered subscription frames remain consumable after application pauses.

Timeout cancels the owning stream and makes it unusable.
Append, membership-append, and snapshot-publication timeouts are classified as ambiguous without automatic retries.
The wire protocol and browser timeout policy are unchanged.

## Consequences

Native clients enforce their own deadlines independently of server behavior.
Finite streamed content requests include consumer pauses in their budget; application-side queueing and mutex acquisition are not timed.
Custom native transports may opt in through the default-disabled transport timeout method.
Framing and timeout state remain internal to the existing typed logical streams.

## Validation and Follow-Up

Controlled-clock tests in `sea-webtransport::client::deadline_tests` cover all stream openings, blocked admission/writes/finish, partial-frame trickling and cancelled receive futures, finite completion, interleaved notifications, ambiguous appends, terminal reuse, and healthy subscriptions.
A real QUIC test opens a native session against a controlled peer, withholds a content response, and verifies both the timeout and peer-observed stream reset.
Disabling deadline enforcement made the focused finite-request budget test fail at its timeout assertion; restoring enforcement passed.

The first aggregate browser run exposed a close-handshake regression: requiring transport half-close success could reject an acknowledged protocol `Close` after the peer stopped receiving.
A controlled stalled-finish test reproduced the unnecessary wait.
Author close now waits for the protocol acknowledgement without requiring a transport half-close, and the focused regression passes.
That failed aggregate also contained container-connection timeouts; their exact cause was not established by the later passing run.

Final validation passed the canonical workspace format, strict Clippy, rustdoc, build, test, documentation, and scoped policy gates, the complete generated/Node/Chromium suite, and repository-root `pnpm build:fast`.
The transport crate has 47 passing tests, including 13 added deadline and close-handshake regressions.
The complete suite produced 13 passing browser evidence records.
Shared lockfiles are unchanged.
