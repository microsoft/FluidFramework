# Garbage Collection: Advanced configuration for early adopters

_For a technical overview of Garbage Collection, start with [GarbageCollection.md](./garbageCollection.md)_

GC Sweep is not yet enabled by default, and until that time early adopters have several configuration options available
for how to enable and monitor GC.

## Techniques used for configuration

There are two ways configuration can be injected into the Fluid Framework which are used for GC, referred to by name throughout this document:

1.  **"GC Options"**: `ContainerRuntime.loadRuntime` takes an options value of type `IContainerRuntimeOptions`.
    This type includes a sub-object `gcOptions`, for GC-specific options.
2.  **"Config Settings"**: The `Loader`'s constructor takes in `ILoaderProps`, which includes `configProvider?: IConfigProviderBase`
    This configProvider can be used to inject config settings.

Typically GC Options are used for more "official" and stable configuration, whereas Config Settings provide a mechanism
for apps to override settings easily, e.g. by backing their `IConfigProviderBase` with a configuration/flighting service.
Additionally, FF will fallback to reading from Local/Session Storage if the provider doesn't mention a particular Config Setting,
making it convenient to override these while debugging.

## What's on by default

GC Mark Phase is enabled by default, as explained above. This includes marking objects that are ready to be deleted as **Tombstones**.
FF will log an informational event if/when a Tombstoned object is loaded - a scenario that would represent data loss if Sweep were enabled.
The eventName for the Tombstone log ends with `GC_Tombstone_DataStore_Requested`.

There's a similar event logged long before an object is Tombstoned. Ater only 7 days (configurable), an unreferenced object is considered
"Inactive", and FF will log if an Inactive object is loaded as well.
The eventName for the Inactive log ends with `InactiveObject_Loaded`.

### Configuring InactiveObject timeout

The default timeout for an unreferenced object to become "Inactive" is 7 days. This is intended to be long enough such that
it's very unlikely to hit a legitimate case where an object is revived within the same session it was deleted (e.g. delete then undo).
Based on your application's user experience, you may choose to shorten this timeout to get an earlier signal (but beware of false positives).

To override the default InactiveObject timeout, use either the `inactiveTimeoutMs` GC Option or the
`Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs` Config Setting.

## Enabling Tombstone Enforcement

By default, GC is marking objects as Tombstoned, but merely logging if they're used after that point.
You can enable enforcement of Tombstone objects to simulate real Sweep while having the peace of mind
that the data is not yet deleted from the user's file, and can be recovered.

To cause the Fluid Framework to fail when loading a Tombstoned object (via `handle.get()` as described above),
use this Config Setting:

```ts
"Fluid.GarbageCollection.ThrowOnTombstoneLoad": true
```

### In case of emergency: Setting the gcTombstoneGeneration

GC includes a mechanism for Tombstone by which all new documents may be stamped with a "Generation" number,
and if set then Tombstone is only enforceable for documents of the latest Generation. This number is specified
via the `gcTombstoneGeneration` GC Option, and will not change over the lifetime of a given document.

In case a bug is released that is found to cause GC errors, a bump to the gcTombstoneGeneration can be incuded
with the fix, which will prevent any user pain for those potentially affected documents that were exposed to the bug.

If gcTombstoneGeneration is unset, Tombstone enforcement will be enabled/disabled as otherwise configured.
In other words, until you start using this, Tombstone enforcement will apply to all documents.

### Advanced "Back door": Recovering and reviving Tombstoned objects

If your application has Tombstone enabled and your users are encountering Tombstones - even at the point where
Tombstone enforcement is enabled - there is a way to still access these objects to recover them and property
reference them ("revival"). However, please understand that this is an advanced and unsupported path that may
be immediately deprecated at any time.

As mentioned above, bumping the gcTombstoneGeneration will free up impacted documents, but that's a permanent
mitigation - those documents will never be exposed to GC Tombstone or Sweep.

If there's a particular codepath in your application where objects being loaded may be Tombstoned,
you may use this advanced "back door" to recover them and then properly reference them, thus restoring the document.

When a Tombstoned object (via `handle.get()`) fails to load, the 404 response error object has an `underlyingResponseHeaders` with the
`isTombstoned` flag set to true: i.e. `error.underlyingResponseHeaders?.isTombstoned === true`. In this case,
you may turn around and use `IContainerRuntime.resolveHandle` with `allowTombstone: true` in `IRequest.headers` to request
the object again - this time it will succeed.

To be very clear once again - This path uses deprecated APIs (`resolveHandle`) and comes with no guarantees of support.

### Full Tombstone mode

Even with `ThrowOnTombstoneLoad` set to true, changes to a Tombstoned object will be allowed (this is required for the
advanced recovery options to work).

To instruct FF to treat Tombstoned objects as if they are truly not present in the document,
use this Config Setting:

```ts
"Fluid.GarbageCollection.ThrowOnTombstoneUsage": true
```

### Tombstones and the Summarizer Client

Note: The Summarizer client will _never_ throw on usage or load of a Tombstoned object.

## Enabling Sweep

The following configuration is required for Sweep to be enabled for a given document:

-   GC Option `gcSweepGeneration` must be set, and the persisted value must match the current value in the code
-   Each of these two Config Settings must be set to `true` in the session:
    -   `Fluid.GarbageCollection.Test.SweepDataStores`
    -   `Fluid.GarbageCollection.Test.SweepAttachmentBlobs`

### Differences between gcSweepGeneration and gcTombstoneGeneration

`gcSweepGeneration` is persisted and immutable in the document, just like `gcTombstoneGeneration`.
However, behavior differs in a few important ways.

For Tombstone, if `gcTombstoneGeneration` is not set, Tombstone enforcement will be **enabled**.
For Sweep however, if `gcSweepGeneration` is not set, Tombstone enforcement will be **disabled**.

This means that until the `gcSweepGeneration` GC Option is set, _no existing document will be eligible for Sweep, ever_.
So all documents created since the most recent bump to the gcSweepGeneration will have Sweep enabled.
Note that if `gcSweepGeneration` is set and matches, Tombstone Mode is off for the session and `gcTombstoneGeneration` is ignored.

Lastly, there is a special case when `gcSweepGeneration === 0`: Any document with `gcTombstoneGeneration: 0` will
be eligible for Sweep as well. This was done for historical reasons due to circumstances during GC's development.

## Advanced Configurations

There are a handful of other configuration options/settings that can be used to tweak GC's behavior,
mostly for testing. Please refer to the function [`generateGCConfigs` in gcConfigs.ts](.\gcConfigs.ts)
for the full story.

Examples of available advanced configuration include:

-   Disabling GC permanently for new files
-   Overriding GC Mark/Sweep enablement for this session:
    -   Disabling running GC Mark and/or Sweep phases for this session
    -   Forcing GC Mark and/or Sweep to run for this session even if otherwise it would be disabled
    -   Disabling Tombstone Mode (don't even mark objects as Tombstones)
-   Overriding Session Expiry for new files (or disabling it altogether, which will also disable Tombstone/Sweep)
-   Overriding the Sweep Timeout, _independent of Session Expiry_, so use with care (for testing purposes only - data loss could occur)
-   Running in "Test Mode", where objects are deleted as soon as they're unreferenced
-   Force "Full GC" to run, which ignores incremental optimizations based on previously computed GC Data
-   Treat InactiveObjects like Tombstones: throw an error on load (with the same back door to follow-up with a successful request)
