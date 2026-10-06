# Persisted DDS configuration

**Status:** Local prototype. The configuration protocol is opt-in, with an internal adopter in `packages/dds/tree`.

## Summary and agreed requirements

Introduce an opt-in, per-channel configuration protocol, implemented by shared infrastructure rather
than by individual DDSes. Each opted-in DDS has a persisted configuration and a monotonically
increasing configuration revision. Configuration changes on attached channels are explicit compare-and-swap (CAS) ops.
Ordinary DDS ops keep their existing wire format, without a configuration wrapper or revision metadata.

The shared mechanism accepts a configuration change only if its expected revision is current.
It delivers ordinary ops to the DDS even if they were authored before the current configuration.
A configuration change does not inherently invalidate in-flight ops.

The following decisions were clarified for this proposal:

| Topic | Decision |
| --- | --- |
| Barrier semantics | Sequenced CAS, not consensus or a wait for all clients to acknowledge. |
| Ordinary ops authored before a configuration change | Delivered normally, without configuration revision metadata. Any invalidation policy and related events are DDS responsibilities, deferred from this design. |
| Local application | Preserve each DDS's existing optimistic, acknowledgement, and resubmission behavior. Attached configuration changes wait for sequencing; unattached configuration changes apply locally. |
| Configuration values | Full replacement is allowed, including disabling or removing settings. |
| Adoption | A DDS declares stable defaults. New or existing instances start persisting configuration on their first accepted change, or at creation when explicit initial values are supplied. |
| Unloaded DDSes | Preserve lazy loading; validate and replay configuration before exposing the instance. |

"Known to all clients" means clients observing the same prefix of the channel's history derive the
same configuration. It does not mean disconnected clients have current state, or that every client
must instantiate every DDS.

**CAS applies to configuration changes, not ordinary DDS ops.** As with `DocumentSchema`, a
configuration barrier orders a change without imposing a general policy for discarding data ops
authored before it.

## Existing code and implications

| Existing surface | Relevant behavior |
| --- | --- |
| `packages/runtime/container-runtime/src/summary/documentSchema.ts` | `DocumentsSchemaController` maintains persisted, desired, session, and future schemas. Explicit changes compare the proposal's `refSeq` with the current schema's `refSeq`; accepted changes notify `onSchemaChange`. |
| `packages/runtime/container-runtime/src/containerRuntime.ts` | Schema proposals normally accompany outgoing traffic. Runtime pending-state processing precedes DDS delivery. Some runtime features only adopt changed settings on a later load. |
| `packages/runtime/datastore-definitions/src/storage.ts` | `IChannelAttributes` currently contains type, snapshot format version, and optional package version. |
| `packages/runtime/datastore/src/channelContext.ts` | Both attach and ordinary summaries append `.attributes` using `JSON.stringify(channel.attributes)`. Load reads these attributes before calling the channel factory. Snapshot version mismatch currently produces telemetry, not a compatibility barrier. |
| `packages/runtime/datastore/src/remoteChannelContext.ts` | Unloaded channels buffer message collections. Load instantiates the channel, replays buffered messages, then exposes it. Changed channels invalidate their summarizer nodes. |
| `packages/runtime/datastore/src/localChannelContext.ts` | Rehydrated local channels also replay buffered messages. New local channels are constructed before their service endpoints are connected. |
| `packages/runtime/datastore/src/channelDeltaConnection.ts` | Dispatches sequenced messages, resubmission, stashed ops, and rollback through `IDeltaHandler`. Stashed metadata can substitute message contents during delivery. |
| `packages/dds/shared-object-base/src/sharedObject.ts` | `SharedObjectCore` installs delta handlers, decodes handles, and emits op events before/after DDS processing. Existing DDSes commonly implement their own optimistic/reconnect behavior. |

Related guidance: [Schema versioning](SchemaVersioning.md).

Reuse the ordered op stream, channel attributes, existing pending-state machinery, and lazy replay.
Do not instantiate `DocumentsSchemaController` per DDS: its runtime-specific feature lattice,
desired/session distinction, and one-proposal-per-session policy are not the requested semantics.

## Ownership and scope

Put a reusable `ChannelConfigurationController` in `shared-object-base`. It owns configuration
state, CAS decisions, and configuration-request completion tracking.
An internal protocol adapter integrates it with `SharedObjectCore`'s lifecycle.
The primary DDS API is a typed configuration facet in `KernelArgs`, available before the
kernel factory constructs or loads the kernel. It does not require kernel implementations
such as `SharedTreeKernel` to extend `SharedObject`.

The DDS owns the meaning and validation of its configuration, how it reacts to an accepted change,
and how it processes ordinary ops, including optimistic local state and acknowledgements. It does
not implement configuration CAS comparisons, maintain a second configuration store, or interpret
configuration-control ops in its ordinary op handler. If a particular flag should invalidate
in-flight ops, the DDS author must separately design that policy, any reconciliation of optimistic
state, and associated events. The common wrapper supplies neither ordinary-op revision metadata nor that policy.

The datastore runtime continues to own channel routing, summary scheduling, and factory loading.
It validates protocol support before loading a configured channel. Container runtime owns the
document-level compatibility gate described below.

Version 1 supports DDSes using `makeSharedObjectKind`. Adapting a direct `IChannel` implementation
is a separate integration, not permission to bypass the shared controller.

Non-goals are application schema management, general consensus, cross-channel transactions,
ordinary-op invalidation or its reconciliation/event APIs, automatic retries of rejected edits,
asynchronous data migrations during a configuration callback.

### SharedTree history prototype

The production SharedTree implementation declares configuration reader support regardless of its creation policy.
The internal `configuredSharedTree(options, initialConfiguration)` factory accepts an optional second argument of type `Readonly<{ retainHistory?: boolean }>`.
Omit this argument to create unmarked instances with the stable default configuration `{}`.
Loading or summarizing an unmarked instance does not activate persistence; its first accepted configuration change does.
Persisted configuration is the only history retention policy, including on summarizers.
An omitted `retainHistory` means `false`.
This replaces the old `SharedTreeOptions.retainHistory` option; use the second factory argument instead.
Trees without persisted configuration use normal bounded retention and can still load stable existing summaries.

```typescript
import { configuredSharedTree } from "@fluidframework/tree/internal";

// Set these internal container runtime options before creating the Tree.
const runtimeOptions = {
    explicitSchemaControl: true,
    enableSharedObjectConfiguration: true,
};
const kind = configuredSharedTree({}, { retainHistory: false });
const tree = kind.getFactory().create(dataStoreRuntime, "tree");
// In this prototype the per-instance facet is on ISharedTree's package-private kernel surface.
const configuration = (tree as ISharedTree).kernel.configuration;
if (configuration !== undefined) {
    const result = await configuration.requestChange({ retainHistory: true });
    // The shared wrapper, not SharedTree, decides result.status: "applied" or "conflict".
}
```

This runtime option requests document-level support for SharedObject configuration.
It does not configure any DDS instance or require every DDS to support configuration.
Once the document flag is active, omitting the local option does not prevent reading or changing configuration.
Only SharedTree adopts the configuration protocol in production in this prototype.
The internal test/debug type `ISharedTree` in this example is imported from `treeFactory.ts` inside the Tree package.
The creation entry point is exported as internal; the per-instance request surface is not a new public Tree API.
`configuration.on("changed", listener)` and `off` expose the shared synchronous notifications.
Requests from an attached Tree take effect only when sequenced, including requests made while disconnected.
Normal DDS attachment controls this choice: an unbound Tree or a Tree in a detached datastore applies changes locally without an op.
A bound Tree in an attaching or attached datastore submits configuration ops.
Serialization alone does not attach the Tree or change this behavior.
Configured attachment and attached configuration changes require the persisted document flag.
In an existing document, normal outgoing traffic can propose the flag through the desired document schema.
Wait until `isSharedObjectConfigurationEnabled()` reports that it is active; setting the local option does not make the document ready.
If the proposal loses a compare-and-swap race, the flag may remain unavailable for the session; there is no separate activation API or automatic retry.
Attaching before readiness throws an error instead of switching to the legacy protocol.

Enabling waits for the next committed change on the main trunk.
That change becomes the first retained history commit; the configuration op itself is not a Tree commit.
For an attached Tree, the start is the first change sequenced after enable, not an optimistic local change.
A commit qualifies even if it was authored before enable or shares the configuration op's envelope sequence number.
For an unattached Tree, the first local committed change after enable becomes the start.
An identical enabled replacement does not move the start.
Disabling clears the start, and enabling again waits for a new committed change.
Enabling and disabling without an intervening Tree change never creates a start.

The edit-manager summary stores one optional `historyStart` revision reference.
It uses the existing revision codec and refers to a retained main-trunk commit, not the root sentinel.
Loading resolves that reference through the decoded trunk, including the commit's originating session.
There is no separate history summary blob or copy of the configuration revision, barrier sequence, batch index, detached cursor, or collaboration minimum.
The optional field extends the existing edit-manager formats under the configured-channel capability; normal unconfigured summaries keep their existing shape.
A reference to a missing commit or to the root sentinel is rejected, as is a start with retention disabled.
If retention is enabled but no Tree change has followed it, the summary has no start reference.
Reloading that summary still waits for the next committed change, even if older history remains for a local fork or collaboration.
The same rule applies to initially enabled creation and detached serialization, reload, and attachment.

History required for collaboration, local forks, undo, or shared-branch ancestry remains subject to the existing correctness rules.
Such history can precede the archival start and is not backfilled archival coverage.
Disabling resumes normal safe pruning and summary selection; it does not purge required repair data or invalidate branches and revertibles.
After loading, pruning can wait until normal collaboration processing supplies a safe bound.
Re-enabling cannot recover history already removed.
The existing branch-history inspection API can therefore include pre-enable protocol history and is not an archival-history filter.

## Persisted state

Add an optional `configuration` member to the serialized attributes blob.
For a supporting DDS, absence means the stable default configuration at revision zero, without persistent configuration.
For a DDS without a configuration definition, absence keeps its existing protocol and no configuration facet is supplied.

```json
{
  "type": "example-configured-dds",
  "snapshotFormatVersion": "1.0",
  "packageVersion": "3.0.0",
  "configuration": {
    "version": 1,
    "revision": 4,
    "values": {
      "writeFormat": 2,
      "allowReplacement": false
    }
  }
}
```

`version` versions the shared configuration protocol, not the DDS's configuration vocabulary or
its summary format. `revision` is a non-negative safe integer scoped to this channel. New
configured channels start at zero; each successful barrier increments it by one. It never resets,
including when values return to an earlier configuration.

Use a revision counter rather than copying `DocumentSchema.refSeq` literally. Several logical
messages in a grouped runtime message can share an envelope sequence number. A per-channel
counter gives every accepted barrier a distinct identity even in that case. Sequence numbers
remain available for ordering and diagnostics.

`values` is a readonly JSON property bag owned by Fluid Framework code. Nested records and arrays are allowed.
Reuse `ReadonlyJsonTypeWith<never>` from `core-interfaces` for the API value type.
DDS authors must supply values that round-trip through JSON and must not mutate them after submission.
The configuration does not participate in GC and must not contain Fluid handles.

Unlike `DocumentSchema` feature flags, `false` and `null` may be meaningful values. Each DDS
defines their meaning. Removing a key requires omitting it from the replacement bag; no implicit
patch merging, `and`, `or`, or client-local defaults are applied on load.

The protocol trusts this internal contract instead of copying, freezing, or recursively inspecting values.
Serialization uses the normal op and summary paths; failures retain their diagnostic stacks.
The definition's default configuration applies only when persisted configuration is absent.
Explicit `initialConfiguration` values apply only to creation, never to loaded state.
Message-size limits belong to the normal runtime submission path, not the configuration protocol.
DDS authors should keep configuration small; the protocol does not impose a separate size limit,
truncate values, or fall back to defaults.

The DDS-facing `ChannelConfigurationSnapshot` in `shared-object-base` is read-only in-memory state with only `{ revision, values }`.
The facet's `current`, change notifications, and request results expose this state without `version`.
The persisted `ChannelConfigurationSnapshotV1` in `datastore-definitions` has `{ version: 1, revision, values }`, as shown in the attributes above.
Only persisted and wire formats need an encoding version because other releases must read them.
The in-memory API is not an encoding and does not expose that detail.

These types distinguish the internal API from persisted attributes:

```typescript
import type { ReadonlyJsonTypeWith } from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";
import type {
    ChannelConfigurationSnapshotV1,
    IChannelAttributes,
} from "@fluidframework/datastore-definitions/internal";

export type ChannelConfiguration = Readonly<
    Record<string, ReadonlyJsonTypeWith<never>>
>;

export interface ChannelConfigurationSnapshot<
    TConfig extends ChannelConfiguration = ChannelConfiguration,
> {
    readonly revision: number;
    readonly values: TConfig;
}

export interface ConfiguredChannelAttributes extends IChannelAttributes {
    readonly configuration: ChannelConfigurationSnapshotV1;
}
```

Keep the wire-format declaration independently versioned in a dedicated persisted-format module;
the API types here must not make future API refactors silently change the wire format. An internal derived
attributes type avoids requiring every legacy `IChannelAttributes` implementation to change.
An opted-in instance's `attributes.configuration` getter returns `{ version: 1, ...controller.current }`.
The other attributes are preserved. Updating one instance must never mutate `factory.attributes` or another
instance's attributes.
The wrapper copies attributes for configuration-capable instances, before they can add the configuration getter.
This shallow copy keeps the per-instance getter off the shared factory attributes.
The getter is added at configured creation, configured load, or the first accepted replacement.
DDSes without a configuration definition keep the existing attributes behavior.

## Wire protocol and processing

Keep existing container/datastore/channel addressing.
For an opted-in channel, configuration ops have the following shape.
Ordinary DDS ops remain unchanged and unwrapped.

```typescript
import type { ChannelConfigurationValuesV1 } from "./channelConfigurationFormat.js";

export interface ChannelConfigurationMessageV1 {
    readonly version: 1;
    readonly isChannelConfigurationOp: true;
    readonly expectedRevision: number;
    readonly values: ChannelConfigurationValuesV1;
}
```

The factory's configuration definition selects configuration-capable dispatch, including for unmarked instances.
This dispatch uses the presence of an own top-level `isChannelConfigurationOp` property to classify a message as a configuration op.
Any value reserves that property; the configuration parser requires its value to be `true`.
Nested application data can use the same name.
The first accepted configuration op adds the attributes marker before notifying the DDS.
Without a configuration definition, the shared ordinary-op guard rejects the reserved top-level property instead of passing it to an unsupported DDS.

For every incoming logical message on a configured channel, in order:

1. If the reserved own top-level property is absent, decode and deliver the ordinary payload through the normal DDS data-op path.
   Preserve DDS op events, local metadata, and local/remote acknowledgement behavior.
   Add no configuration revision or provenance metadata.
2. Otherwise, parse the configuration op and validate its expected revision as a non-negative safe integer.
   An expected revision less than current is a CAS conflict.
   Consume the op without changing state or calling the DDS configuration callback.
3. If the expected revision equals current, validate the proposed configuration and transition.
   Replace the values, increment the revision, then synchronously notify the active DDS.
4. An expected revision greater than current, an unknown configuration protocol version, or an invalid configuration op is a processing error.
   These checks do not apply to ordinary DDS payloads.

A losing configuration proposal does not require DDS-specific validation of its obsolete values.
A matching-revision proposal that this client cannot understand fails the client; it must not
continue under the previous configuration. Ordinary payload validation remains the DDS's job.
Primitive, array, and object payloads keep their existing shapes.
The shared wrapper neither selects a DDS decoder nor suppresses an ordinary op because it was authored before a configuration change.

Even a successful replacement with identical values advances the revision and calls the
configuration callback. It is still an explicitly requested barrier, but does not invalidate
pending ordinary ops. Reject revision overflow rather than reusing an identity.

Split grouped collections only around configuration ops, preserving contiguous ordinary-op runs.
Deliver each run under the configuration active at that point in the stream.
Configuration callbacks run synchronously before later ordinary ops reach handle decoding or DDS op events.
Grouping must not move a configuration callback across an ordinary op.

### Example

Both clients start at revision 7. A requests configuration X while B submits an ordinary op
and independently requests configuration Y.

| Stream position | Message | Shared-layer result |
| --- | --- | --- |
| 100 | A: configuration, expected revision 7, values X | Applied; configuration is X at revision 8. |
| 101 | B: ordinary op authored while configuration revision 7 was current | Delivered normally on all clients under current configuration X at revision 8, without provenance metadata. B uses its normal local-acknowledgement path. |
| 102 | B: configuration, expected revision 7, values Y | CAS conflict; no callback and no revision change. |
| 103 | A: ordinary op submitted after observing revision 8 | Delivered normally under current configuration X, without provenance metadata. |

If B's ordinary op had sequenced before position 100, the current configuration at delivery
would still have been revision 7. Neither ordering causes the shared layer to discard the op.
The barrier does not undo committed or optimistic edits or drain outstanding submissions.

## DDS-facing internal APIs

All new symbols below are `@internal`; they are not application-facing promises of the existing
`SharedMap`, `SharedString`, or `SharedTree` APIs. API snippets specify contracts, not full class
implementations.

```typescript
import type { IRuntimeMessageCollection } from "@fluidframework/runtime-definitions/internal";

export interface ChannelConfigurationDefinition<
    TConfig extends ChannelConfiguration,
> {
    // Stable values that describe existing behavior on every client.
    readonly defaultConfiguration: TConfig;

    // Pure validation; unknown keys and unsupported values must be rejected.
    readonly isSupported: (values: ChannelConfiguration) => values is TConfig;

    // Pure, deterministic validation of a transition between supported configurations.
    // Throw if this transition cannot safely preserve existing DDS data.
    readonly validateTransition: (previous: TConfig, next: TConfig) => void;
}

export interface ChannelConfigurationAttachedContext {
    readonly source: "sequenced";
    readonly sequenceNumber: number;
    readonly clientSequenceNumber: number;
    readonly messageIndex: number;
    readonly local: boolean;
}

export interface ChannelConfigurationDetachedContext {
    readonly source: "local";
    readonly local: true;
}

export type ChannelConfigurationContext =
    | ChannelConfigurationDetachedContext
    | ChannelConfigurationAttachedContext;

export type ChannelConfigurationChange<TConfig extends ChannelConfiguration> = {
    readonly previous: ChannelConfigurationSnapshot<TConfig>;
    readonly current: ChannelConfigurationSnapshot<TConfig>;
} & ChannelConfigurationContext;

export type ConfigurationChangeResult<TConfig extends ChannelConfiguration> =
    | ({
          readonly status: "applied";
          readonly current: ChannelConfigurationSnapshot<TConfig>;
      } & ChannelConfigurationContext)
    | ({
          readonly status: "conflict";
          readonly current: ChannelConfigurationSnapshot<TConfig>;
      } & ChannelConfigurationAttachedContext);

export type SharedKernelMessageCollection = IRuntimeMessageCollection;

export interface ChannelConfigurationFacet<
    TConfig extends ChannelConfiguration,
> {
    readonly current: ChannelConfigurationSnapshot<TConfig>;
    requestChange(next: TConfig): Promise<ConfigurationChangeResult<TConfig>>;
    on(event: "changed", listener: (change: ChannelConfigurationChange<TConfig>) => void): void;
    off(event: "changed", listener: (change: ChannelConfigurationChange<TConfig>) => void): void;
}
```

`SharedKernelFactory<T, TConfig>.configurationDefinition` declares reader support.
`SharedObjectOptions<T, TConfig>.initialConfiguration` separately opts new instances in.
`KernelArgs<TConfig>.configuration` contains the facet whenever the factory defines configuration.
It is undefined only for DDSes that do not support configuration.
Unmarked instances start with `defaultConfiguration` at revision zero.
The wrapper creates the facet before calling `factory.create` or `factory.loadCore`.
The kernel can read it during construction and register a listener before loading its state.
Existing submission, load, summary, GC, connection, resubmission, stashed-op, and rollback hooks
remain available for ordinary DDS operations.
`messageIndex` is the logical position within the delivered collection, not a globally unique
service position. It can differ after stash reconstruction and must not be persisted as identity.
The channel configuration revision uniquely identifies each accepted barrier,
including when grouped messages share a service sequence number.

### Requesting a configuration change

`requestChange` captures the current revision and replacement values
synchronously at invocation, before any asynchronous work. It validates locally, then submits
one control op if the channel is attached. It never changes attached configuration optimistically.
For an unattached channel, it replaces the authoritative state and synchronously notifies listeners
before returning its promise, without submitting any op or waiting for a connection.
This is a final local change, not an optimistic proposal.
Changes and results distinguish `source: "local"` from `source: "sequenced"`; only sequenced
changes carry service sequence information.
The controller does not read the runtime's message-size limit or add a detached size limit.
Attached proposals use the normal submission path, including its message-size handling.

The shared mechanism, not the DDS, decides and reports `"applied"` or `"conflict"`. The returned
snapshot is the state at processing that result; another change can occur before the caller's
promise continuation runs. There is no automatic merge, retry, or retagging against a newer
revision. A caller wishing to try again must explicitly construct a fresh proposal from the
current state.

Configuration requests reject attempts from read-only clients, a closed instance, or a lifecycle
phase in which submission is prohibited. Ordinary submission retains its existing runtime/DDS
rules. Lack of a current network connection alone does not imply read-only: writable clients may
queue submissions offline. Read-only and summarizer clients still process remote barriers and
ordinary data ops normally.

Multiple requests may be outstanding. Requests made before any barrier is observed have the
same expected revision, so at most one can succeed. The shared layer tracks each completion
using existing pending local-op metadata; completion metadata is not part of the document format.

### Applying changes to a live DDS

The facet is initialized once before kernel construction.
For load it exposes the snapshot's validated configuration, or the definition's defaults when unmarked, not the latest configuration from buffered ops.
Reading that initial snapshot is not a configuration-change notification.
The wrapper distinguishes creation from load, each with optional explicit configuration.
Factory support is separate from these lifecycle states.
The controller validates defaults, creation values, and loaded snapshots in the same way.

The `"changed"` listener runs synchronously for every accepted barrier, local or remote,
including barriers replayed during load. The controller's getter already exposes `current`.
It does not run for conflicts. The next ordinary op cannot reach the DDS until this callback
returns. It also runs for each final local change while unattached.

Validation and the callback's effects on committed state must be deterministic and independent of
local feature gates, connection state, wall-clock time, and local pending requests. A callback may
also update a local view/cache consistently with the DDS's existing optimistic-state model; those
local effects must not change the configuration CAS result or the shared state transition.
Callbacks cannot await work. The wrapper rejects reentrant configuration/data submission from
load or configuration callbacks;
callers may schedule work afterward. This prevents partially reconfigured state from escaping.

The callback can replace codecs, update behavior, or perform deterministic synchronous state
changes. It must not make external side effects or assume it is running only on an interactive
client: replay and summarizers execute it too. Async migrations require a separately designed
protocol, not an async callback.

A callback or receive-side validation failure is a fatal processing failure. Do not catch it and
continue under either configuration. A local validation failure rejects the request without
emitting an op. The getter exposes readonly state; changes must use `requestChange`.

### Ordinary ops and configuration changes

Keep `submitLocalMessage(contents, localOpMetadata)` and the DDS's existing mutation APIs.
The wrapper leaves ordinary messages unchanged and adds no configuration revision metadata. It does not
change when the DDS applies local edits, emits events, resolves its own promises, or reconciles
acknowledgements. There is no shared `"dropped"` result or new acknowledgement-based data API.

`SharedKernel.processMessagesCore` receives the normal `IRuntimeMessageCollection`, with no added fields.
The current configuration is available through the facet's `current`.
An op authored before a configuration change can arrive afterward and is delivered normally.
There is no ordinary-op configuration revision on the wire or in delivered metadata.
A future DDS-specific invalidation design must address local optimistic state, acknowledgements,
and events. This proposal does not add that behavior or prescribe an invalidation API.

The revision identifies configuration history, not an op codec or a full snapshot of earlier
values. The common layer does not retain a revision-to-configuration history. DDSes whose op
encoding depends on configuration must retain their existing format-compatibility mechanisms
(for example, self-describing payloads); receiving a later barrier does not make older payloads
undecodable or dispensable.

There is intentionally no automatic submission queue for a pending configuration proposal.
The current configuration remains unchanged until the barrier is observed.
Callers needing the new behavior wait for the proposal result and re-read
the current configuration before constructing their op.

For example, a summary-only setting need not affect ordinary ops at all:

```typescript
public setSummaryCompression(enabled: boolean): Promise<ConfigurationChangeResult<MyConfig>> {
    return this.configuration.requestChange({
        ...this.configuration.current.values,
        summaryCompression: enabled,
    });
}

private onConfigurationChanged(change: ChannelConfigurationChange<MyConfig>): void {
    this.summaryCompressionEnabled = change.current.values.summaryCompression;
}

public processMessagesCore(messages: SharedKernelMessageCollection): void {
    this.processDataMessages(messages);
}
```

`MyConfig`, the summary setting, and `processDataMessages` are DDS-specific illustrative code.
Here the existing data handler retains its normal optimistic and acknowledgement behavior.
CAS remains entirely in the shared configuration mechanism.

### Shared wrapper integration

Shared objects without a registered protocol use one stateless default protocol.
It forwards ordinary messages and DDS hooks unchanged.
It does nothing for detached submissions or protocol cleanup.
The configured protocol uses the same dispatch interface.

The protocol adapter separates configuration-control traffic from ordinary DDS traffic, forwarding
ordinary message collections to `SharedKernel.processMessagesCore` without added metadata.
It handles configuration requests during resubmission, stashed-op restoration, and rollback,
but delegates ordinary payloads to the DDS's existing hooks.
`submitLocalMessage` remains the ordinary submission entry point.
SharedObject guards ordinary submission, receive, stash, resubmit, and rollback against an own top-level `isChannelConfigurationOp` property.
It throws `DataProcessingError` for any value of this reserved property, even on unconfigured channels, to prevent future collisions.
The configuration controller has a scoped submission bypass only for its genuine proposals.
The guard does not inspect nested application data or impose a DDS payload schema.

Integrate at the `SharedObjectCore` dispatch boundary: configured dispatch identifies configuration ops before
handle decoding and DDS `pre-op`/`op` events.
All ordinary ops, including those authored before a configuration change, use the existing handle serializer and event/error machinery.
Configuration control messages do not become DDS data-op events. Runtime-level raw-op observability may still report
that they sequenced.

Processing errors propagate to the existing `ChannelDeltaConnection` error boundary, including buffered replay.
Internal configuration contracts and invariants use assertions, not `UsageError`, which is for incorrect API use by external consumers.
The existing op-processing boundary converts assertion failures to `DataProcessingError`.
There is no configured-only error wrapper in `SharedObjectCore`.
Configuration callback or validation failures reject pending configuration requests before rethrowing.
Runtime disposal closes outstanding requests for other fatal failures.
Normal rollback and runtime disposal use ordinary errors; a supplied failure is propagated unchanged.
Existing DDS event-listener error handling is unchanged.

## Creation, attachment, load, and summaries

At creation the wrapper uses `SharedObjectOptions.initialConfiguration`, when provided.
Otherwise, a supporting factory uses its stable `defaultConfiguration`.
Loading uses persisted configuration when present and the same stable defaults when absent.
It never uses `initialConfiguration` to replace loaded state.
Reading defaults does not add an attributes marker; the first accepted replacement adds it, including a replacement with identical values.
Once present, the marker remains even when all settings return to defaults.
Reader support remains enabled when deployment policy stops requesting the document flag.

Until attachment, configuration replacements apply locally and immediately through the same
validation and readonly state path. Repeated replacements, including identical values, advance
the revision and notify the active kernel. These changes require neither a control op nor a
document-schema upgrade round trip. An unbound channel in an attached container is also
unattached. After attachment, every replacement requires an actual sequenced barrier;
disconnecting an already-attached channel does not restore local authority.

Unattached channels retain the DDS's existing local-edit and initialization behavior. Local data
included in the initial snapshot must not also be sent as trailing ops. The configuration mechanism
does not introduce a separate local-commit handler or result for ordinary edits.

`SharedObjectCore.isAttached()` chooses between local changes and sequenced proposals, as it does for ordinary DDS ops.
A bound channel in an attaching or attached datastore submits configuration ops, including while disconnected.
An unbound channel or a channel in a detached datastore applies configuration changes locally.
There is no separate publication flag, callback, or submission queue.
The runtime checks type capability before it emits an attach snapshot.
This change does not address the existing attach re-entrancy issue caused by synchronous DDS edits from dirty callbacks during incomplete binding.

Detached serialization does not attach the channel.
Later configuration changes still apply locally, and the actual attach summary includes the latest attributes.
Detached rehydration restores persisted configuration instead of applying new factory defaults.
Interrupted attachment uses the existing runtime pending attachment machinery.

For loading an attached channel:

1. Read attributes and validate the persisted configuration version, shared protocol marker, and revision.
2. Check factory support, construct the controller and DDS, and validate configuration.
3. Initialize configuration-dependent components, then load DDS state from the same snapshot.
4. Replay buffered messages through the controller in original order, including intermediate
   configuration callbacks and normal delivery of ordinary ops without added metadata.
5. Expose the channel only after replay finishes. Also prevent DDS load hooks from submitting
   ops against a partially replayed configuration.

Do not pre-apply the latest configuration and then replay old DDS ops. Those ops may need earlier
configurations to be decoded or applied correctly. Likewise, do not collapse multiple barriers to
their final values: callbacks may have changed persisted DDS state.

Normal and attach summaries write the controller's authoritative revision and values with `version: 1` via the instance's
`attributes`. No pending configuration proposal, local desired configuration, or configuration
request promise is summarized. DDS data follows the existing summary contract, including correct
handling of optimistic/pending state. The persisted configuration and DDS data must represent
the same stream prefix.

A configuration-only accepted op is a summary-relevant change even if the DDS's ordinary data
is unchanged. Preserve channel/datastore summarizer invalidation, so an old whole-channel summary
handle cannot hide changed attributes. A full summary of a changed lazy channel realizes and
replays it before writing; an unchanged lazy channel can retain its previous summary handle.

Removing/disabling a configuration key does not erase historical format requirements. A DDS
must retain decoders for previously written data and reject transitions that cannot preserve
the current stored data. Changing a write format does not automatically convert all existing
data or make an older reader compatible.

## Pending ops, reconnect, and failure semantics

Configuration-control ops use shared CAS bookkeeping. Ordinary ops retain the DDS's existing
pending-state, rebase, acknowledgement, and rollback behavior; adding the configuration protocol
must not replace those paths with identity-only replay.

| Flow | Required behavior |
| --- | --- |
| Disconnect/offline submission after attachment | Retain each configuration proposal's expected revision. Ordinary edits may be optimistic as usual; an offline configuration proposal is not locally activated. |
| Reconnect | Preserve a configuration proposal's expected revision. For ordinary ops, invoke the DDS's normal resubmission/rebase hooks without adding revision metadata. |
| Stashed state | Restore configuration requests without applying their proposed values. Restore ordinary payloads through the DDS's existing `applyStashedOp` behavior, including optimistic state, at the loader's historical replay position. |
| Local acknowledgement | Consume configuration requests in the shared layer. Deliver all ordinary acknowledgements, including ops authored before a configuration change, through the existing DDS path without double application or leaked pending counts. |
| Staging/squashing | Keep configuration barriers distinct and ordered. Ordinary DDS squash remains available; do not combine outputs across configuration/control boundaries. |
| Rollback of unsent staged ops | Cancel configuration requests and reject their live promises. For ordinary ops, run the DDS's normal rollback, including undoing optimistic state. |
| Disposal or fatal failure | Reject outstanding configuration promises explicitly; ordinary promises retain DDS lifecycle handling. If delivery was uncertain, rejection does not assert that the operation can never commit. |

Ordinary transport retries, resubmission, and stashed-op restoration add no configuration revision or provenance metadata.
There is no revision-preservation or `replayRevision` machinery for ordinary ops.
This also applies to one-to-many resubmission and stashed-op reconstruction.
The DDS still owns rebase semantics and payload format compatibility.
Any future invalidation policy must specify how it interacts with that DDS's rebase/squash behavior.

Do not copy `DocumentSchema`'s resubmission behavior for configuration proposals, which may
regenerate a schema proposal. Changing the expected revision during replay could unexpectedly
make a previously losing configuration change succeed. Retain it until the caller explicitly
requests a new proposal.

`ChannelDeltaConnection`'s stashed metadata handling keeps reconstructed ordinary contents and existing local metadata without adding configuration metadata.
Configuration ops must not reach the DDS's `applyStashedOp` at all. Deduplication and
detection of already-acknowledged batches remain the responsibility of existing runtime machinery.

Configuration results resolve after their synchronous change callback completes (or after a CAS
conflict is determined). Promises belong to the live process and are not restored after a reload;
callers cannot recover a historical promise merely by reopening the document. No timeout silently
cancels an op that might already have reached the service.

## Compatibility and rollout

Adding an attributes field alone is unsafe. Old runtimes can ignore it, and an old DDS can load
with its defaults or write a summary that loses the field. The existing snapshot-version warning
is not a sufficient guard.

Use three checks:

1. **Container protocol gate:** `DocumentSchema.runtime.sharedObjectConfiguration: true` requires SharedObject configuration support.
   The flag requires explicit schema control.
   Runtimes that enforce document schemas but do not support this flag fail on it.
2. **Runtime/datastore layer gate:** `supportsSharedObjectConfiguration` in `ILayerCompatDetails.supportedFeatures` advertises protocol support.
   An enabled document requires this feature from its datastore runtimes, including already loaded runtimes when the flag activates.
   Lazy datastores are checked when their runtime is bound, before pending ops are replayed.
   Missing compatibility details do not authorize this protocol.
   Unsupported layers fail with the existing layer-incompatibility error.
   Documents without the flag retain the existing compatibility behavior.
3. **DDS factory gate:** an internal factory capability marker checked before `factory.load`.
   A supported runtime with an older DDS factory must fail predictably rather than load the
   configured channel through the legacy path.

Factory capability:

```typescript
export interface ChannelConfigurationFactory {
    readonly channelConfigurationProtocolVersion?: 1;
}
```

Marker value `1` advertises support, not initial values. The shared wrapper checks support for the
actual DDS configuration before reading DDS state. The marker is a contract for factory-created
instances, not evidence that every configuration value is supported.
The runtime also requires the returned configured instance to have registered its shared controller
before connecting/replaying it; a factory marker alone must not enable a legacy dispatch path.

The flag does not list DDS types or activate configuration on individual channels.
The runtime does not need a startup inventory of supporting DDS types or a second factory registry.
Each DDS independently supplies a configuration definition, or continues without configuration support.

```json
{
  "runtime": {
    "explicitSchemaControl": true,
    "sharedObjectConfiguration": true
  }
}
```

The flag must be active before a configured channel attaches or an attached channel submits its first configuration op.
For a new container, include it in the initial document schema before attachment.
For an existing container, `enableSharedObjectConfiguration: true` requests it through the normal desired schema.
Ordinary outgoing traffic gives the schema controller an opportunity to propose the change.
Wait for an accepted schema change, not just submission of the proposal: the schema CAS can lose.
Once active, the flag applies to all supporting DDSes.

The schema controller keeps its existing one-attempt policy.
If another schema wins without the flag, configuration can remain unavailable for the session.
A later session can propose it again.
There is no automatic retry, separate activation method, or synthetic ordinary op to trigger the proposal.
Disabled schema upgrades remain disabled.

`isSharedObjectConfigurationEnabled()` reports the active document flag.
A missing query does not grant permission.
The runtime advertises `supportsSharedObjectConfiguration` to datastores and exposes this query on their typed context.
Datastores use the existing feature guard to access the query, and forward it to SharedObjects through `IFluidDataStoreRuntimeInternalConfig`.
The query reads live document state, so an accepted schema upgrade becomes visible without recreating the datastore or DDS.
The layer feature describes implementation support within one client, not document activation; its shared feature sets never change when a document enables configuration.
The prototype uses a named feature because supporting and older releases can share a generation.
Once the supporting releases are known, an enabled document can instead require the first fully supporting datastore generation through the existing layer-compatibility check.
After the normal runtime/datastore compatibility floors guarantee support, no configuration-specific support check is needed.
The runtime's package version alone does not establish the datastore's support, since those layers can use different versions.
Document readiness remains separate and must still follow the accepted schema state.
Local configuration edits do not need document readiness, but their snapshots cannot attach without the flag.
Detached rehydration preserves a persisted flag and explicit schema control even when the local option is false or omitted.
The flag stays present when the local option is off or all DDS settings return to defaults.
It protects the shared protocol, not individual settings.

For the prerequisite compatibility PR, register the flag with validation that rejects `true`.
No client in that release can safely process or summarize configured SharedObjects.
Change validation to accept `true` only in the follow-up that adds the SharedObject protocol and preservation checks.
This combined prototype includes that follow-up and accepts the flag.
Keep `enableSharedObjectConfiguration` off by default while reader support is deployed.

Once the first release that supports configured DDSes is known, use it as `minimumSupportedReleaseVersion`.
Wire the internal flag into `containerCompatibility.ts`'s compatibility defaults and validation maps, instead of excluding it from `RuntimeOptionsAffectingDocSchema`.
Use the standard explicit-schema-control requirement.
Validation must prevent enabling writes when `oldestSupportedClient` is below `minimumSupportedReleaseVersion`.
The prerequisite release that rejects the flag is not a supporting release.
Choose default enablement separately; reader support alone must not start writing the new format.
Applications can advance `oldestSupportedClient` after deploying reader support, and document activation then uses the normal schema-upgrade flow.
The prototype currently permits explicit internal opt-in without a release-version check; this is not the production rollout policy.

`oldestSupportedClient` is called `minVersionForCollab` internally.
The persisted minimum-version field produces a warning for older clients; the document schema's feature checks enforce compatibility.
Clients predating document-schema enforcement still need the existing deployment and old-client exclusion strategy.

Supporting factories expose stable defaults on unmarked instances without changing their summaries.
The first accepted configuration replacement activates persistence.
An unsupported SharedObject rejects the first configuration op instead of passing it to its DDS.
Lazy replay must apply activation before exposing or summarizing the channel.
A changed channel cannot reuse a summary handle that omits activation.

This wire format replaces the earlier wrapped prototype.
There is no automatic migration or compatibility with saved pending ops from that prototype.
Normal stable unconfigured summaries remain readable.

Record configuration proposal outcomes and compatibility/processing failures with channel type,
protocol version, revision, and sequencing context. Do not log arbitrary configuration values or
DDS payloads: they may contain application data.
Ordinary ops authored before a configuration change are not errors or drops in this protocol;
DDS-specific invalidation events and telemetry are outside this design.

## Implementation boundaries

| Area | Proposed changes |
| --- | --- |
| `datastore-definitions` | Internal persisted-state/factory capability types, without new required members on legacy channel contracts. |
| `shared-object-base` | Controller and compositional kernel facet; per-instance configuration attributes; configuration-op dispatch and shared reserved-key guards; configuration-request completion tracking; normal DDS attachment state. |
| `datastore` | Factory and attach capability checks; retain lazy replay ordering, ordinary stashed-op handling, and summary invalidation. |
| `container-runtime` | Persisted SharedObject configuration flag requested through normal schema features; propagate readiness; retain the existing one-attempt policy, pending accounting, and ordinary-op replay behavior. |
| Initial adopter | Stable defaults and configuration validation for new and existing DDS instances, with a synchronous change callback. Preserve their existing local mutation, acknowledgement, and ordinary-op lifecycle behavior. |

Share the existing base's serializer, telemetry, error handling, and summary support through
targeted hooks. Do not duplicate the whole `SharedObjectCore` implementation or change the
legacy dispatch path's semantics apart from the shared reserved-key guards. Generated API reports are regenerated through existing build
tasks, never hand-edited.

## Required coverage before enabling the feature

Use controller tests plus existing shared-object, datastore, container-runtime, and end-to-end
test harnesses. The key scenarios are:

| Scenario | Expected result |
| --- | --- |
| Two configuration proposals based on one revision | Exactly one wins, on every client; loser never invokes the change callback. |
| Old data op before versus after a winning barrier | Delivered in both cases without configuration revision metadata; the current configuration reflects stream order and normal data-op events/acknowledgements are preserved. |
| Identical replacement; A-to-B-to-A replacement | Each successful barrier has a distinct revision; returning to earlier values does not reset the configuration revision. |
| Barrier and data ops in one grouped envelope | Preserve logical order and callback boundaries, including shared sequence numbers. |
| Multiple DDSes | Configuration and its revision for one channel do not affect another. |
| Existing local application | Optimistic edits, local events, acknowledgements, and DDS-specific promises behave as before; only attached configuration activation waits for sequencing. |
| Non-invalidating configuration flag | An ordinary op in flight across a flag change reaches the data handler unchanged, without configuration revision metadata. |
| Disable/remove setting | Full replacement persists; no feature-gate/default merging on reload. |
| Configuration callback updates DDS state | Data and configuration summarize/reload consistently; replay reproduces the update. |
| Lazy load with several intervening barriers | Snapshot configuration initializes first; all configuration callbacks and ordinary ops replay in order without ordinary-op revision metadata. |
| Attributes-only change and incremental summary | New configuration cannot be hidden by a stale channel summary handle. |
| New/detached/attaching/rehydrated channel | Normal attachment selects local or sequenced changes; serialization stays local and attachment captures the latest attributes. |
| Reconnect/stashed/already-acked/duplicate batch | Configuration proposals keep their expected revisions; ordinary DDS replay/rebase and local-metadata reconstruction restore optimistic state normally without added configuration metadata, double apply, or leaked pending counts. |
| Staging rollback and disposal | Configuration requests receive explicit cancellation/error outcomes; ordinary DDS squash/rollback remains functional without crossing configuration-op boundaries. |
| Future expected revision, malformed configuration op, unsupported winning config | Predictable failure before dependent state is processed. |
| Ordinary primitive, array, and object payloads | Preserve the existing payload shapes; ordinary validation remains the DDS's responsibility. |
| Reserved own top-level property | Any value identifies a configuration candidate only on configured dispatch; parsing requires `true`. Ordinary submission, receive, stash, resubmit, and rollback reject the property with `DataProcessingError`, even on unconfigured channels. |
| Nested application property with the reserved name | Remains ordinary application data; no configuration dispatch or shared rejection. |
| Unsupported obsolete config in a losing proposal | CAS conflict without attempting DDS-specific interpretation. |
| Supported runtime with unsupported factory | Fail before loading the configured channel or rewriting its summary. |
| Unsupported runtime and first configured attachment | Document-schema capability excludes it before it can process new-protocol data. |
| Optional DDS participation | DDSes without a definition continue ordinary operation and reject configuration ops. Supporting DDSes use defaults before activation. |
| Repeated flag requests | An active flag remains active without another schema proposal, even when the local option is off. |
| Concurrent schema changes | A losing proposal is not retried automatically and does not activate configuration. |
| Existing unmarked channel | Stable defaults at revision zero; no summary marker until the first accepted replacement. Normal stable summaries remain readable. |

The shared mechanism provides persisted configuration and ordered CAS updates
without changing ordinary DDS wire formats or consistency semantics. Attached configuration activation incurs
acknowledgement latency; unattached changes apply locally and ordinary APIs retain their existing behavior. Flags that invalidate
in-flight ops require a separate DDS-authored design, including reconciliation and events, rather
than a universal dropping rule in the common wrapper.
