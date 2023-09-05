## Garbage Collection: Advanced configuration for early adopters

GC Sweep is not yet enabled by default, and until that time early adopters have several configuration options available
for how to enable and monitor GC.

### What's on by default

GC Mark Phase is enabled by default, as explained above. This includes marking objects that are ready to be deleted as **Tombstones**.
FF will log an informational event if/when a Tombstoned object is loaded - a scenario that would represent data loss if Sweep were enabled.
The eventName for the Tombstone log ends with `GC_Tombstone_DataStore_Requested`.

There's a similar event logged long before an object is Tombstoned - after only 7 days (configurable), an unreferenced object is considered
"Inactive", and FF will log if an Inactive object is loaded as well.
The eventName for the Inactive log ends with `InactiveObject_Loaded`.

#### Configuring InactiveObject timeout

The default timeout for an unreferenced object to become "Inactive" is 7 days. This is intended to be long enough such that
it's very unlikely to hit a legitimate case where an object is revived within the same session it was deleted (e.g. delete then undo).
Based on your application's user experience, you may choose to shorten this timeout to get an earlier signal (but beware of false positives).

To override the default InactiveObject timeout, set `gcOptions.inactiveTimeoutMs` on the `IContainerRuntimeOptions` passed to `ContainerRuntime.loadRuntime`.

### Enabling Tombstone

By default, GC is marking objects as Tombstoned, but merely logging if they're used after that point.
You can enable enforcement of Tombstone objects to simulate real Sweep while having the peace of mind
that the data is not yet deleted from the user's file, and can be recovered.

To cause the Fluid Framework to fail when loading a Tombstoned object (via `handle.get()` as described above),
set this setting in the `configProvider` on the `ILoaderProps` specified when creating the Loader:

```ts
"Fluid.GarbageCollection.ThrowOnTombstoneLoad": true
```

#### In case of emergency: Setting the GcTombstoneGeneration

GC includes a mechanism for Tombstone by which all new documents may be stamped with a "Generation" number,
and if set then Tombstone is only enforceable for documents of the latest Generation. This number is specified
on `IContainerRuntimeOptions`, under `gcOptions.gcTombstoneGeneration`.

In case a bug is released that is found to cause GC errors, a bump to the GcTombstoneGeneration can be incuded
with the fix, which will prevent any user pain for those potentially affected documents that were exposed to the bug.

If GcTombstoneGeneration is unset, Tombstone enforcement will be enabled/disabled as otherwise configured.
In other words, until you start using it Tombstone enforcement will apply to all documents.

#### Advanced "Back door": Recovering and reviving Tombstoned objects

If your application has Tombstone enabled and your users are encountering Tombstones - even at the point where
Tombstone enforcement is enabled - there is a way to still access these objects to recover them and property
reference them ("revival"). However, please understand that this is an advanced and unsupported path that may
be immediately deprecated at any time.

As mentioned above, bumping the GcTombstoneGeneration will free up impacted documents, but that's a permanent
mitigation - those documents will never be exposed to GC Tombstone or Sweep.

If there's a particular codepath in your application where objects being loaded may be Tombstoned,
you may use this advanced "back door" to recover them and then properly reference them, thus restoring the document.

When a Tombstoned object (via `handle.get()`) fails to load, the 404 response error object has a `underlyingResponseHeaders` with the
`isTombstoned` flag set to true: i.e. `error.underlyingResponseHeaders?.isTombstoned === true`. In this case,
you may turn around and use `IContainerRuntime.resolveHandle` with `allowTombstone: true` in `IRequest.headers` to request
the object again - this time it will succeed.

To be very clear once again- This path uses deprecated APIs (`resolveHandle`) and comes with no guarantees of support.

#### Full Tombstone mode

Even with `ThrowOnTombstoneLoad` set to true, changes to a Tombstoned object will be allowed (this is required for the
advanced recovery options to work).

To instruct FF to treat Tombstoned objects as if they are truly not present in the Container,
set this setting in the `configProvider` on the `ILoaderProps` specified when creating the Loader:

```ts
"Fluid.GarbageCollection.ThrowOnTombstoneUsage": true
```

### Enabling Sweep

#### DRAFT NOTES

-   Enabling Sweep
    -   GcSweepGeneration must be set
    -   Some options must be set (I have that task to change the defaults)
    -   What if Tombstone is also enabled - Sweep wins I assume?
-   Move all this to `gcAdvancedConfiguration.md` and put only these two things in this file:
    -   How to enable Tombstone enforcement (the two settings)
    -   How to enable Sweep

Questions

-   If you bump GcTombstoneGeneration to 1 but GcSweepGeneration is at 0, what happens?
