# Decision 0026: Bind Streams to Session Incarnations

Status: accepted
Date: 2026-09-24
Iteration: none; user-requested follow-up to completed iteration 0018
Owners: user, coordinator
Supersedes: [0023: Defer Stream Incarnation Binding](0023-defer-stream-incarnation-binding.md)
Superseded by: none

## Context

After the iteration 0018 closeout and an explanation of the reproduced stale-author defect, the user requested its repair.
The connection validated a stream's token at opening but routed later operations and author cleanup through its mutable current session.
Opening a replacement session therefore transferred authority to an old stream.
The original real-QUIC reproducer failed again on baseline `8bd1e64ebfa426d00deea3321540ac2db7e6c6d0`: session 1's author stream received `EventCommitted` under replacement session 2.

## Decision Drivers

Prevent cross-session authority and cleanup, preserve existing same-connection replacement and wire compatibility, and cover author, content, and snapshot roles through both network listeners.
Keep completed iteration records as historical evidence rather than rewriting their deferred disposition.

## Options and Evidence

- Bind once at stream admission and retain the original session dispatcher. The built-in host already creates a fixed `SessionDispatcher` for each session.
- Forbid session replacement on a physical connection. This would change existing behavior rather than repair its ownership.
- Recheck the token on every operation. This would add mutable routing and validation to each request and still require separately scoped cleanup.

The first option reuses the existing fixed-session dispatcher without a new wire field, per-request token, or replacement restriction.

## Decision

Add required `SeaConnectionService::bind_session` admission.
The built-in connection validates the token and captures the corresponding session service while holding its session lock.
The shared transport dispatcher binds author, content, and snapshot openings before starting their operation loops.
Every subsequent request and cleanup uses that captured service, never a later connection session.
Rejected bindings send an error without entering a session cleanup path.
The binding holds a weak reference to the connection's session registry.
On author closure or failure it removes that registry entry only if the stored dispatcher is the same admitted dispatcher.
This preserves immediate token revocation and avoids reconnect grace for already-closed membership without clearing replacement authority.
Event streams already retain their original recovery stream; signals retain their separate one-registration-per-connection policy.

## Consequences

Replacing a session still closes the previous session and issues fresh authority, including when selecting another document.
Subsequent old-session operations reject or their streams end, while already-admitted operations retain the original session's settlement semantics.
Stale stream closure cannot close replacement membership or revoke replacement snapshot participation.
Custom Rust hosts must implement the new binding method and return a permanently scoped dispatcher, not a mutable connection router.
The composition fixture returns itself only because its dispatcher is permanently bound to one session.
The protocol and client APIs do not change.
Native post-opening client frame deadlines remain separately deferred by Decision 0025.

## Validation and Follow-Up

- `replaced_event_authority_cannot_be_used_by_an_old_author_stream` is enabled in the normal server suite and now requires a `Rejected` response. It failed before repair and passed afterward over real QUIC.
- `bound_stream_operations_and_cleanup_cannot_reach_a_replacement_session` tests same-document and different-document replacements, stale-token rejection, old author/content/snapshot operations, and independent membership/registration cleanup.
- `logical_stream_dispatch_and_cleanup_keep_the_admitted_session` controls replacement after opening and checks all three transport roles. It covers author EOF, explicit close, truncated input, response-write failure, and rejected bindings without timing sleeps.
- `closing_bound_authority_revokes_its_token_without_reconnect_grace` guards token revocation and prompt physical cleanup after explicit close or author error. It failed against the initial fixed-dispatcher-only repair and passed after conditional registry removal was added.
- The server all-feature suite passed 42 library tests plus two binary tests; its one ignored browser fixture remains owned by the real browser harness.
- All 12 composition tests passed after adapting their fixed-session host.
- Final run `binding-native-2026-09-24T02-46-57.604Z` passed all seven canonical/documentation/policy commands: format, strict workspace/all-target/all-feature Clippy, warnings-as-errors rustdoc, all-target build, all-feature/all-target tests, documentation links, and scoped policy.
- `binding-full-2026-09-24T02-47-32.683Z` passed `bash test.sh`, including the generated consumers, enabled authority regressions, Node suites, and real Chromium scenarios. All 13 parsed browser evidence records passed, including physical connection release.
- `binding-build-2026-09-24T02-52-12.936Z` passed repository-root `pnpm build:fast`.
- The coordinator directly verified the final result manifests, command exits, checkout identity, nonempty logs except successful format output, and browser evidence. Shared Rust and pnpm lockfiles are unchanged.

Revisit if stream admission, session replacement, custom-host dispatch, or cleanup ownership changes.
