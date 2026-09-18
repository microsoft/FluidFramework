# Persisted DDS configuration

**Status:** Local prototype. The configuration protocol is opt-in, with an internal adopter in `packages/dds/tree`.

## Summary and agreed requirements

Introduce an opt-in, per-channel configuration protocol, implemented by shared infrastructure rather
than by individual DDSes. Each opted-in DDS has a persisted configuration and a monotonically
increasing configuration revision. Configuration changes on attached channels are explicit compare-and-swap (CAS) ops.
Ordinary DDS ops carry the configuration revision captured for their original logical submission.

The shared mechanism accepts a configuration change only if its expected revision is current.
It delivers ordinary ops to the DDS regardless of whether their configuration revision is older
than current, exposing that revision as processing metadata. A configuration change does not
inherently invalidate in-flight ops.

The following decisions were clarified for this proposal:

| Topic | Decision |
| --- | --- |
| Barrier semantics | Sequenced CAS, not consensus or a wait for all clients to acknowledge. |
| Ordinary ops from earlier revisions | Delivered normally, with their configuration revision exposed to the DDS. Any invalidation policy and related events are DDS responsibilities, deferred from this design. |
| Local application | Preserve each DDS's existing optimistic, acknowledgement, and resubmission behavior. Attached configuration changes wait for sequencing; unattached configuration changes apply locally. |
| Configuration values | Full replacement is allowed, including disabling or removing settings. |
| Adoption | Creation-time opt-in for new DDS instances. Migrating existing instances is out of scope. |
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
state, CAS decisions, revision stamping/exposure, and configuration-request completion tracking.
An internal protocol adapter integrates it with `SharedObjectCore`'s lifecycle.
The primary DDS API is a typed configuration facet in `KernelArgs`, available before the
kernel factory constructs or loads the kernel. It does not require kernel implementations
such as `SharedTreeKernel` to extend `SharedObject`.

The DDS owns the meaning and validation of its configuration, how it reacts to an accepted change,
and how it processes ordinary ops, including optimistic local state and acknowledgements. It does
not implement configuration CAS comparisons, maintain a second configuration store, or interpret
configuration-control ops in its ordinary op handler. If a particular flag should invalidate
in-flight ops, the DDS author must separately design that policy, any reconciliation of optimistic
state, and associated events. The common wrapper supplies revision metadata, not that policy.

The datastore runtime continues to own channel routing, summary scheduling, and factory loading.
It validates protocol support before loading a configured channel. Container runtime owns the
document-level compatibility gate described below.

Version 1 supports DDSes using `makeSharedObjectKind`. Adapting a direct `IChannel` implementation
is a separate integration, not permission to bypass the shared controller.

Non-goals are application schema management, general consensus, cross-channel transactions,
ordinary-op invalidation or its reconciliation/event APIs, automatic retries of rejected edits,
migration of existing DDS instances, and asynchronous data migrations during a configuration callback.

### SharedTree history prototype

The production SharedTree implementation declares configuration reader support regardless of its creation policy.
The internal `configuredSharedTree(options, initialConfiguration)` factory accepts an optional second argument of type `Readonly<{ retainHistory?: boolean }>`.
Omit this argument to keep creating legacy instances; an absent attributes marker never migrates automatically.
For marked instances, omitted `retainHistory` means `false`, and the persisted value overrides local `options.retainHistory`, including on summarizers.
Legacy `configuredSharedTree({ retainHistory: true })` behavior is unchanged.

```typescript
import { configuredSharedTree, SharedTreeFactoryType } from "@fluidframework/tree/internal";

// Set these internal container runtime options before creating the Tree.
const runtimeOptions = {
    explicitSchemaControl: true,
    channelConfigurationTypes: [SharedTreeFactoryType],
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

`SharedTreeFactoryType` is the stable type ID `https://graph.microsoft.com/types/tree`.
This runtime option allows new configured Trees, not configured instances of other DDS types.
An empty or omitted type list disables new configured instances but does not prevent reading persisted configured instances.
Only SharedTree adopts the configuration protocol in production in this prototype.
The internal test/debug type `ISharedTree` in this example is imported from `treeFactory.ts` inside the Tree package.
The creation entry point is exported as internal; the per-instance request surface is not a new public Tree API.
`configuration.on("changed", listener)` and `off` expose the shared synchronous notifications.
Published requests take effect only when sequenced, including requests made while disconnected.
Detached or otherwise unpublished requests apply immediately without submitting an op.
Publication requires the Tree type in the persisted document capability set.
In an existing document, normal outgoing traffic can propose adding the Tree type through the desired document schema.
Publish only after `isChannelConfigurationEnabled(SharedTreeFactoryType)` reports that the type is active; setting the local option does not make publication ready.
If the proposal loses a compare-and-swap race, the type may remain unavailable for the session; there is no separate activation API or automatic retry.
Publishing before readiness throws an error instead of switching to the legacy protocol.

Enabling starts history at the accepted barrier, not at the oldest commit retained by the current client.
Tree records the first covered main-trunk sequence number and Tree batch index, together with the enabling configuration revision, in its versioned `HistoryRetention` summary blob.
The index comes from committed trunk processing, not an optimistic local branch or the delivery-local `messageIndex`.
Thus a commit that sequences after enable is retained even if it was authored under an earlier configuration revision, including when it shares the barrier's envelope sequence number.
An identical enabled replacement does not move the start.
Disabling and then enabling starts a new retention epoch and cannot recover history already evicted.

The same metadata preserves the unpublished synthetic sequence cursor, even if trimming leaves no commits in the summary.
This keeps the start stable through detached serialization, reload, further local configuration changes, and attach.
It also preserves the last known collaboration-window minimum, so a configuration-only disable after loading can resume safe pruning without waiting for another Tree edit.
Loading restores the saved start before replay; it never derives a new start from the latest unrelated configuration replacement or from the summarizer's locally retained ancestry.
Missing, unsupported, or inconsistent configured history metadata fails loading rather than silently selecting a different policy.

History required for collaboration, local forks, undo, or shared-branch ancestry remains subject to the existing correctness rules.
Such history can precede the archival start and is not backfilled archival coverage.
Disabling resumes normal safe pruning and summary selection; it does not purge required repair data or invalidate branches and revertibles.
The existing branch-history inspection API can therefore include pre-enable protocol history and is not an archival-history filter.

## Persisted state

Add an optional `configuration` member to the serialized attributes blob. Absence means the
existing channel protocol, not "configuration revision zero."

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

`values` is an immutable, JSON-only property bag. Nested records and arrays are allowed.
Reuse `ReadonlyJsonTypeWith<never>` from `core-interfaces` for the API value type. Runtime validation
must additionally reject non-finite numbers, undefined values, sparse arrays, cycles, custom
serialization, and Fluid handles. The configuration does not participate in GC and must not
contain references disguised as serialized handles.

Unlike `DocumentSchema` feature flags, `false` and `null` may be meaningful values. Each DDS
defines their meaning. Removing a key requires omitting it from the replacement bag; no implicit
patch merging, `and`, `or`, or client-local defaults are applied on load.

Copy and deeply freeze input before retaining or submitting it. Do not rely on TypeScript
`readonly` alone. New factory defaults apply only to creation, never to existing persisted state.
Validate the serialized size against the runtime's supported message limits before submission;
do not truncate configuration or silently fall back to defaults.

These types describe the internal API:

```typescript
import type { ReadonlyJsonTypeWith } from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";
import type { IChannelAttributes } from "@fluidframework/datastore-definitions/internal";

export type ChannelConfiguration = Readonly<
    Record<string, ReadonlyJsonTypeWith<never>>
>;

export interface ChannelConfigurationSnapshot<
    TConfig extends ChannelConfiguration = ChannelConfiguration,
> {
    readonly version: 1;
    readonly revision: number;
    readonly values: TConfig;
}

export interface ConfiguredChannelAttributes extends IChannelAttributes {
    readonly configuration: ChannelConfigurationSnapshot;
}
```

Keep the wire-format declaration independently versioned in a dedicated persisted-format module;
the API aliases here must not make future API refactors silently change the wire format. An internal derived
attributes type avoids requiring every legacy `IChannelAttributes` implementation to change.
An opted-in instance's `attributes` getter returns its current controller snapshot together with
the existing attributes. Updating one instance must never mutate `factory.attributes` or another
instance's attributes.

## Wire protocol and processing

Keep existing container/datastore/channel addressing. For an opted-in channel only, wrap
channel op contents in the following envelope:

```typescript
export type ConfiguredChannelMessage =
    | {
          readonly version: 1;
          readonly kind: "configuration";
          readonly expectedRevision: number;
          readonly values: ChannelConfiguration;
      }
    | {
          readonly version: 1;
          readonly kind: "operation";
          readonly revision: number;
          readonly contents: unknown;
      };
```

The attributes marker selects this protocol. Never infer opt-in by inspecting an arbitrary
legacy DDS payload for a property named `kind` or `version`.

For every incoming logical message, in order:

1. Validate the protocol envelope and its revision as a non-negative safe integer.
2. For a configuration message, an expected revision less than current is a CAS conflict.
   Consume the op without changing state or calling the DDS configuration callback.
3. If the expected revision equals current, validate the proposed configuration and transition.
   Replace the values, increment the revision, then synchronously notify the active DDS.
4. For an ordinary op whose revision is less than or equal to current, decode and deliver its
   contents through the normal DDS data-op path, preserving DDS op events, local metadata, and
   local/remote acknowledgement behavior. Expose the op's configuration revision to the handler.
   Do not discard it or infer its validity from a revision mismatch.
5. A revision greater than current, an unknown protocol version, or an invalid envelope is a
   processing error. These indicate an invalid protocol message, not an earlier-revision op.

A losing configuration proposal does not require DDS-specific validation of its obsolete values.
A matching-revision proposal that this client cannot understand fails the client; it must not
continue under the previous configuration. Ordinary payload validation remains the DDS's job.
The shared wrapper neither selects a DDS decoder nor suppresses an ordinary op based on its
configuration revision.

Even a successful replacement with identical values advances the revision and calls the
configuration callback. It is still an explicitly requested barrier, but does not invalidate
pending ordinary ops. Reject revision overflow rather than reusing an identity.

Process mixed collections one logical message at a time, or split contiguous ordinary-op runs at
every barrier. Deliver each run under the configuration active at that point in the stream,
with each message's own submitted revision. Messages in a run need not all have the same revision.
Grouping must not move a configuration callback across an ordinary op.

### Example

Both clients start at revision 7. A requests configuration X while B submits an ordinary op
and independently requests configuration Y.

| Stream position | Message | Shared-layer result |
| --- | --- | --- |
| 100 | A: configuration, expected revision 7, values X | Applied; configuration is X at revision 8. |
| 101 | B: ordinary op, revision 7 | Delivered normally on all clients with op revision 7 and current configuration revision 8. B uses its normal local-acknowledgement path. |
| 102 | B: configuration, expected revision 7, values Y | CAS conflict; no callback and no revision change. |
| 103 | A: ordinary op submitted after observing revision 8 | Delivered with op revision 8 and current configuration X. |

If B's ordinary op had sequenced before position 100, the current configuration at delivery
would still have been revision 7. Neither ordering causes the shared layer to discard the op.
The barrier does not undo committed or optimistic edits or drain outstanding submissions.

## DDS-facing internal APIs

All new symbols below are `@internal`; they are not application-facing promises of the existing
`SharedMap`, `SharedString`, or `SharedTree` APIs. API snippets specify contracts, not full class
implementations.

```typescript
import type {
    IRuntimeMessageCollection,
    IRuntimeMessagesContent,
} from "@fluidframework/runtime-definitions/internal";

export interface ChannelConfigurationDefinition<
    TConfig extends ChannelConfiguration,
> {
    // Pure validation; unknown keys and unsupported values must be rejected.
    readonly isSupported: (values: ChannelConfiguration) => values is TConfig;

    // Pure, deterministic validation of a transition between supported configurations.
    // Throw if this transition cannot safely preserve existing DDS data.
    readonly validateTransition: (previous: TConfig, next: TConfig) => void;
}

export interface ChannelConfigurationSequencedContext {
    readonly source: "sequenced";
    readonly sequenceNumber: number;
    readonly clientSequenceNumber: number;
    readonly messageIndex: number;
    readonly local: boolean;
}

export type ChannelConfigurationContext =
    | { readonly source: "local"; readonly local: true }
    | ChannelConfigurationSequencedContext;

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
      } & ChannelConfigurationSequencedContext);

export type SharedKernelMessageCollection = Omit<
    IRuntimeMessageCollection,
    "messagesContent"
> & {
    readonly messagesContent: readonly (IRuntimeMessagesContent & {
        readonly configurationRevision?: number;
    })[];
};

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
`KernelArgs<TConfig>.configuration` contains the facet for marked instances and is undefined
for legacy instances. The wrapper creates it before calling `factory.create` or `factory.loadCore`.
The kernel can read it during construction and register a listener before loading its state.
Existing submission, load, summary, GC, connection, resubmission, stashed-op, and rollback hooks
remain available for ordinary DDS operations.
`messageIndex` is the logical position within the delivered collection, not a globally unique
service position. It can differ after stash reconstruction and must not be persisted as identity.
The channel configuration revision uniquely identifies each accepted barrier,
including when grouped messages share a service sequence number.

### Requesting a configuration change

`requestChange` captures the current revision and clones the replacement values
synchronously at invocation, before any asynchronous work. It validates locally, then submits
one control op if the channel is attached. It never changes attached configuration optimistically.
For an unattached channel, it replaces the authoritative state and synchronously notifies listeners
before returning its promise, without submitting any op or waiting for a connection.
This is a final local change, not an optimistic proposal.
Changes and results distinguish `source: "local"` from `source: "sequenced"`; only sequenced
changes carry service sequence information.
Before a service advertises its size limit, unattached configuration uses a conservative
16 KiB serialized UTF-8 bound. A known runtime limit takes precedence.
Submission limits do not constrain persisted snapshot loads, including detached rehydration,
or already-sequenced changes.

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

The facet is initialized once before kernel construction. For load it exposes the snapshot's
validated configuration, not the latest configuration from buffered ops.
Reading that initial snapshot is not a configuration-change notification.

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
emitting an op. The getter is immutable and cannot serve as a second mutation API.

### Ordinary ops and configuration revision metadata

Keep `submitLocalMessage(contents, localOpMetadata)` and the DDS's existing mutation APIs.
The wrapper stamps new ordinary messages with the active configuration revision. It does not
change when the DDS applies local edits, emits events, resolves its own promises, or reconciles
acknowledgements. There is no shared `"dropped"` result or new acknowledgement-based data API.

`SharedKernel.processMessagesCore` receives normal runtime message fields plus
`messages.messagesContent[i].configurationRevision`, copied from that op's envelope. The current
configuration is available through the facet's `current`. For example, the op revision may be 7
while `configuration.current.revision` is 8. Both are meaningful; the wrapper must not replace the
op's revision with current or discard the op because they differ.

The DDS may ignore the metadata for flags that do not affect in-flight ops. A future DDS-specific
invalidation design can use it, but must also address local optimistic state, acknowledgements,
and events. This proposal does not add that behavior or prescribe an invalidation API.

The revision identifies configuration history, not an op codec or a full snapshot of earlier
values. The common layer does not retain a revision-to-configuration history. DDSes whose op
encoding depends on configuration must retain their existing format-compatibility mechanisms
(for example, self-describing payloads); receiving a later barrier does not make older payloads
undecodable or dispensable.

There is intentionally no automatic "new revision" submission queue while a proposal is pending.
An op submitted before the barrier is observed still uses the old revision, even if submitted
after the proposal. Callers needing the new behavior wait for the proposal result and re-read
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
Here the existing data handler can ignore `configurationRevision` and retain its normal optimistic
and acknowledgement behavior. CAS remains entirely in the shared configuration mechanism.

### Shared wrapper integration

Shared objects without a registered protocol use one stateless default protocol.
It forwards ordinary messages and DDS hooks unchanged.
It does nothing for detached submissions or protocol cleanup.
The configured protocol uses the same dispatch interface.

The protocol adapter separates configuration-control traffic from ordinary DDS traffic, forwarding
ordinary message collections to `SharedKernel.processMessagesCore` with revision metadata.
It handles configuration requests during resubmission, stashed-op restoration, and rollback,
but delegates ordinary payloads to the DDS's existing hooks. Guard against unwrapped configured
traffic and double wrapping; `submitLocalMessage` remains the ordinary submission entry point.

Integrate at the `SharedObjectCore` dispatch boundary: inspect control/revision envelopes before
handle decoding and DDS `pre-op`/`op` events. All valid ordinary envelopes, including those from
earlier revisions, use the existing handle serializer and event/error machinery. Config control
messages do not become DDS data-op events. Runtime-level raw-op observability may still report
that they sequenced.

Processing errors propagate to the existing `ChannelDeltaConnection` error boundary, including buffered replay.
There is no configured-only error wrapper in `SharedObjectCore`.
Configuration callback or validation failures reject pending configuration requests before rethrowing.
Runtime disposal closes outstanding requests for other fatal failures.
Existing DDS event-listener error handling is unchanged.

## Creation, attachment, load, and summaries

At creation the wrapper uses `SharedObjectOptions.initialConfiguration`, when provided.
Loading obtains configuration exclusively from persisted attributes. A supporting factory
loads both marked and unmarked channels: absent markers select the legacy protocol, and
present markers require supported, valid configuration. Never turn a legacy channel into a
configured one by applying current factory defaults. Reader support remains enabled even
when deployment policy stops creating new configured channels.

Until attachment, configuration replacements apply locally and immediately through the same
validation and immutable state path. Repeated replacements, including identical values, advance
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

1. Read attributes and validate the shared protocol marker and revision.
2. Check factory support, construct the controller and DDS, and validate configuration.
3. Initialize configuration-dependent components, then load DDS state from the same snapshot.
4. Replay buffered messages through the controller in original order, including intermediate
   configuration callbacks and delivery of ordinary ops with their original revision metadata.
5. Expose the channel only after replay finishes. Also prevent DDS load hooks from submitting
   ops against a partially replayed configuration.

Do not pre-apply the latest configuration and then replay old DDS ops. Those ops may need earlier
configurations to be decoded or applied correctly. Likewise, do not collapse multiple barriers to
their final values: callbacks may have changed persisted DDS state.

Normal and attach summaries write the controller's authoritative snapshot via the instance's
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
pending-state, rebase, acknowledgement, and rollback behavior; adding a configuration wrapper
must not replace those paths with identity-only replay.

| Flow | Required behavior |
| --- | --- |
| Disconnect/offline submission after attachment | Retain pending revision metadata. Ordinary edits may be optimistic as usual; an offline configuration proposal is not locally activated. |
| Reconnect | Preserve a configuration proposal's expected revision. For ordinary ops, invoke the DDS's normal resubmission/rebase hooks and preserve revision metadata through the wrapper. |
| Stashed state | Restore configuration requests without applying their proposed values. Restore ordinary payloads through the DDS's existing `applyStashedOp` behavior, including optimistic state, at the loader's historical replay position. |
| Local acknowledgement | Consume configuration requests in the shared layer. Deliver all ordinary acknowledgements, including earlier-revision ops, through the existing DDS path without double application or leaked pending counts. |
| Staging/squashing | Keep configuration barriers distinct and ordered. Ordinary DDS squash remains available within a revision; do not combine outputs across configuration/control boundaries. |
| Rollback of unsent staged ops | Cancel configuration requests and reject their live promises. For ordinary ops, run the DDS's normal rollback, including undoing optimistic state. |
| Disposal or fatal failure | Reject outstanding configuration promises explicitly; ordinary promises retain DDS lifecycle handling. If delivery was uncertain, rejection does not assert that the operation can never commit. |

For ordinary ops, preserve the revision captured for the original logical submission during
transport retries and DDS resubmission/restoration. The wrapper supplies that revision as the
default for messages produced by the corresponding DDS hook, rather than stamping the receiver's
current revision. This also covers one-to-many resubmission or stashed-op reconstruction. New
logical edits outside replay capture the current revision normally.

This metadata is submission provenance, not a promise that a DDS rebase leaves the payload bytes
unchanged. The DDS still owns rebase semantics and payload format compatibility. The wrapper must
not discard, accept, or reinterpret reconstructed data based on the preserved revision. Any future
invalidation policy must specify how it interacts with that DDS's rebase/squash behavior.

Do not copy `DocumentSchema`'s resubmission behavior for configuration proposals, which may
regenerate a schema proposal. Changing the expected revision during replay could unexpectedly
make a previously losing configuration change succeed. Retain it until the caller explicitly
requests a new proposal.

Update the integration with `ChannelDeltaConnection`'s stashed metadata handling so reconstructed
ordinary contents retain their configuration revision alongside existing local metadata.
Configuration envelopes must not reach the DDS's `applyStashedOp` at all. Deduplication and
detection of already-acknowledged batches remain the responsibility of existing runtime machinery.

Configuration results resolve after their synchronous change callback completes (or after a CAS
conflict is determined). Promises belong to the live process and are not restored after a reload;
callers cannot recover a historical promise merely by reopening the document. No timeout silently
cancels an op that might already have reached the service.

## Compatibility and rollout

Adding an attributes field alone is unsafe. Old runtimes can ignore it, and an old DDS can load
with its defaults or write a summary that loses the field. The existing snapshot-version warning
is not a sufficient guard.

Use two checks:

1. **Container protocol gate:** `DocumentSchema.runtime.channelConfiguration` is an additive
   set of DDS type identifiers, stored as a JSON string array. Each entry requires readers to
   understand this protocol for that type. A nonempty set requires explicit schema control.
   Runtimes that understand document-schema enforcement but not this property fail on it.
2. **DDS factory gate:** an internal factory capability marker checked before `factory.load`.
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

Type identifiers are the exact stable `factory.type` / `attributes.type` strings, not instance IDs.
The runtime does not import DDS implementations or keep a second factory registry. This allows
each DDS type to roll out independently. For example, the following uses illustrative type IDs,
not built-in DDS types:

```json
{
  "runtime": {
    "explicitSchemaControl": true,
    "channelConfiguration": [
      "https://example.com/types/a",
      "https://example.com/types/b"
    ]
  }
}
```

New requested sets and unions that add members remove duplicates and use stable ordering.
An empty requested set is treated as absent. When a union adds no members, the property handler keeps
the persisted array identity so equivalent, reordered, duplicate, or subset requests do not cause a schema proposal.
An existing persisted array need not be rewritten just to normalize its ordering.
The earlier prototype boolean is not supported and has no wildcard meaning.

The channel's type must be in the active document set before a configured channel can be attached.
For a new container, include requested types in the initial document schema before attachment.
For an existing container, `channelConfigurationTypes` requests additions through the normal desired
schema. Ordinary outgoing traffic gives the schema controller an opportunity to propose the change.
Attachment is allowed only after a sequenced schema change activates that type, not merely because
it was requested. An active type A does not permit attaching type B.

The schema controller keeps its existing one-attempt policy. If another schema wins without
adding a requested type, that type may remain unavailable for the rest of the session. A later
session can propose the missing type while retaining the observed members. The runtime does
not retry the upgrade automatically or provide a separate activation method. It does not create
an ordinary edit just to trigger a schema proposal. Disabled schema upgrades remain disabled.
Attempting to attach a configured channel while its type is unavailable throws an error;
it does not silently switch the channel to the legacy protocol.

New-instance creation requires `isChannelConfigurationCreationEnabled(type)`; attachment additionally
requires `isChannelConfigurationEnabled(type)`. These optional internal runtime queries return
booleans; a missing query does not grant permission. Creation uses the local requested type list.
Attachment and reads use persisted membership, even when the local list omits that type.
Local configuration edits do not require document readiness. These datastore-runtime queries keep
DDS packages independent of the container runtime implementation. Loading a configured detached
snapshot preserves all persisted type memberships and explicit schema control even when the local
requested list is empty, omitted, or a subset.

Ship protocol readers and the new wrapper dark first. Gate creation by deployment policy, with no
behavioral changes to existing DDSes. The internal runtime option
`channelConfigurationTypes?: readonly string[]` supplies the local creation allow-list and requested
document additions. Nonempty lists require `explicitSchemaControl: true`. For example, a deployment
may request only `["https://example.com/types/a"]`; it cannot create configured instances of type B.
`minVersionForCollab` is useful rollout guidance, but its
current warning alone is not enforcement. Clients predating document-schema enforcement require
the existing deployment/old-client exclusion strategy; the new field cannot retroactively make
them safe.

Persisted type memberships stay sticky even when local creation is disabled or all current DDS
settings are disabled. They protect the wrapper protocol and historical summaries/ops, not individual
configuration values. Neither a DDS configuration barrier nor a package rollback removes a member.
Existing unmarked instances remain legacy even when their type is in the document set.

Record configuration proposal outcomes and compatibility/processing failures with channel type,
protocol version, revision, and sequencing context. Do not log arbitrary configuration values or
DDS payloads: they may contain application data. Earlier-revision ordinary ops are not errors or
drops in this protocol; DDS-specific invalidation events and telemetry are outside this design.

## Implementation boundaries

| Area | Proposed changes |
| --- | --- |
| `datastore-definitions` | Internal persisted-state/factory capability types, without new required members on legacy channel contracts. |
| `shared-object-base` | Controller and compositional kernel facet; immutable per-instance attributes; control-op dispatch and ordinary-op revision metadata; configuration-request completion tracking; normal DDS attachment state. |
| `datastore` | Factory and attach capability checks; retain lazy replay ordering; align stashed-envelope handling and summary invalidation. |
| `container-runtime` | Additive persisted type set requested through normal schema features; propagate per-type readiness; retain the existing one-attempt policy, pending accounting, and ordinary-op replay behavior. |
| Initial adopter | New opt-in DDS instances with configuration validation and a synchronous change callback. Preserve their existing local mutation, acknowledgement, and ordinary-op lifecycle behavior. |

Share the existing base's serializer, telemetry, error handling, and summary support through
targeted hooks. Do not duplicate the whole `SharedObjectCore` implementation or change the
legacy dispatch path's semantics. Generated API reports are regenerated through existing build
tasks, never hand-edited.

## Required coverage before enabling the feature

Use controller tests plus existing shared-object, datastore, container-runtime, and end-to-end
test harnesses. The key scenarios are:

| Scenario | Expected result |
| --- | --- |
| Two configuration proposals based on one revision | Exactly one wins, on every client; loser never invokes the change callback. |
| Old data op before versus after a winning barrier | Delivered in both cases with the submitted revision; the current configuration reflects stream order and normal data-op events/acknowledgements are preserved. |
| Identical replacement; A-to-B-to-A replacement | Each successful barrier has a distinct revision; returning to earlier values does not erase an op's revision provenance. |
| Barrier and data ops in one grouped envelope | Preserve logical order and callback boundaries, including shared sequence numbers. |
| Multiple DDSes | Configuration and revision metadata for one channel do not affect another. |
| Existing local application | Optimistic edits, local events, acknowledgements, and DDS-specific promises behave as before; only attached configuration activation waits for sequencing. |
| Non-invalidating configuration flag | An ordinary op in flight across a flag change reaches the data handler unchanged, with its earlier configuration revision. |
| Disable/remove setting | Full replacement persists; no feature-gate/default merging on reload. |
| Configuration callback updates DDS state | Data and configuration summarize/reload consistently; replay reproduces the update. |
| Lazy load with several intervening barriers | Snapshot configuration initializes first; all configuration callbacks and ordinary ops replay in order with their revision metadata. |
| Attributes-only change and incremental summary | New configuration cannot be hidden by a stale channel summary handle. |
| New/detached/attaching/rehydrated channel | Normal attachment selects local or sequenced changes; serialization stays local and attachment captures the latest attributes. |
| Reconnect/stashed/already-acked/duplicate batch | Revision provenance survives DDS replay/rebase and local-metadata reconstruction; optimistic state is restored normally, with no double apply or leaked pending count. |
| Staging rollback and disposal | Configuration requests receive explicit cancellation/error outcomes; ordinary DDS squash/rollback remains functional without crossing revision boundaries. |
| Future revision, malformed input, unsupported winning config | Predictable failure before dependent state is processed. |
| Unsupported obsolete config in a losing proposal | CAS conflict without attempting DDS-specific interpretation. |
| Supported runtime with unsupported factory | Fail before loading the configured channel or rewriting its summary. |
| Unsupported runtime and first configured attachment | Document-schema capability excludes it before it can process new-protocol data. |
| Independent type rollouts | Creation and attachment check the exact type; enabling A does not enable B. |
| Equivalent type requests | Reordered, duplicate, subset, empty, and absent requests do not cause a schema proposal when no members are added. |
| Concurrent type additions | A losing proposal is not retried automatically; later proposals retain all observed persisted members. |
| Legacy document/channel | No opt-in, no new envelopes, and no changes to existing behavior. |

The shared mechanism provides persisted configuration, ordered CAS updates, and op revision
metadata without changing ordinary DDS consistency semantics. Attached configuration activation incurs
acknowledgement latency; unattached changes apply locally and ordinary APIs retain their existing behavior. Flags that invalidate
in-flight ops require a separate DDS-authored design, including reconciliation and events, rather
than a universal dropping rule in the common wrapper.
