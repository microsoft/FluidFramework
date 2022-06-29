---
title: Fluid Framework pre-v1.0
aliases:
  - /updates/pre1.0/
summary: |
  Releases Notes for changes that came before v1.0.
---

## 0.59

The 0.59 release contains internal changes to the Framework.

### Breaking changes

*No breaking changes.*

### Other notable changes

*No notable changes.*

## 0.58

The 0.58 release contains internal changes to the Framework.

### Breaking changes

*No breaking changes.*

### Other notable changes

*No notable changes.*

## 0.57

### Breaking changes

*No breaking changes.*

### Other notable changes

#### The behavior of containers' isDirty flag has changed
Container is now considered dirty if it's not attached or it is attached but has pending ops. Check https://fluidframework.com/docs/build/containers/#isdirty for further details.

## 0.56

### Breaking changes

#### wait() methods removed from map and directory

The `wait()` methods on `ISharedMap` and `IDirectory` have been deprecated and will be removed in an upcoming release.  To wait for a change to a key, you can replicate this functionality with a helper function that listens to the change events.

```ts
const directoryWait = async <T = any>(directory: IDirectory, key: string): Promise<T> => {
    const maybeValue = directory.get<T>(key);
    if (maybeValue !== undefined) {
        return maybeValue;
    }

    return new Promise((resolve) => {
        const handler = (changed: IValueChanged) => {
            if (changed.key === key) {
                directory.off("containedValueChanged", handler);
                const value = directory.get<T>(changed.key);
                if (value === undefined) {
                    throw new Error("Unexpected containedValueChanged result");
                }
                resolve(value);
            }
        };
        directory.on("containedValueChanged", handler);
    });
};

const foo = await directoryWait<Foo>(this.root, fooKey);

const mapWait = async <T = any>(map: ISharedMap, key: string): Promise<T> => {
    const maybeValue = map.get<T>(key);
    if (maybeValue !== undefined) {
        return maybeValue;
    }

    return new Promise((resolve) => {
        const handler = (changed: IValueChanged) => {
            if (changed.key === key) {
                map.off("valueChanged", handler);
                const value = map.get<T>(changed.key);
                if (value === undefined) {
                    throw new Error("Unexpected valueChanged result");
                }
                resolve(value);
            }
        };
        map.on("valueChanged", handler);
    });
};

const bar = await mapWait<Bar>(someSharedMap, barKey);
```

As-written above, these promises will silently remain pending forever if the key is never set (similar to current `wait()` functionality).  For production use, consider adding timeouts, telemetry, or other failure flow support to detect and handle failure cases appropriately.

### Other notable changes

*No notable changes.*

## 0.55

The 0.55 release contains internal changes to the Framework.

### Breaking changes

*No breaking changes.*

### Other notable changes

*No notable changes.*

## 0.54

### Breaking changes

#### `SharedNumberSequence` and `SharedObjectSequence` deprecated

The `SharedNumberSequence` and `SharedObjectSequence` have been deprecated and are not recommended for use.  To discuss future plans to support scenarios involving sequences of objects, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526).

Additionally, `useSyncedArray()` from `@fluid-experimental/react` has been removed, as it depended on the `SharedObjectArray`.

### Other notable changes

*No notable changes.*

## 0.53

The 0.53 release contains internal changes to the Framework.

### Breaking changes

*No breaking changes.*

### Other notable changes

*No notable changes.*

## 0.52

The 0.52 release contains internal changes to the Framework.

### Breaking changes

*No breaking changes.*

### Other notable changes

*No notable changes.*


## 0.51

The 0.51 release removes registers from the sequence DDSes.

**Update 0.51.1:** The update addresses this issue: {{< issue 8239 >}} -- fix(r11s-driver): don't return latest for cached snapshot id

**Update 0.51.2:** The update addresses this issue: {{< issue 8329 >}} -- Revert #7917 - Used attachGraph instead of bindToContext to bind and attach data store runtime

---

The 0.51 release removes *registers* from the sequence DDSes. The sequence DDSes provided cut/copy/paste functionality
that built on a register concept.  These features were never fully implemented and have been removed.

### Breaking changes

- {{< issue 7647 >}} -- Remove register functionality from merge-tree and sequence.

### Other notable changes

*No notable changes.*

## 0.50

The 0.50 release contains internal changes to the Framework.

### Breaking changes

*No breaking changes.*

### Other notable changes

- {{< apiref IFluidContainer >}}s have a new property,
  [isDirty]({{< relref "IFluidContainer.md#fluid-framework-ifluidcontainer-isdirty-PropertySignature" >}}), which will be true if
  the container has outstanding operations that have not been acknowledged by the Fluid service. Using this property
  correctly can help prevent data loss due to service connectivity issues ({{< issue 7891 >}}).

  See [isDirty in the Fluid container documentation]({{< relref "containers.md#isdirty" >}}) for more information.

## 0.49

The 0.49 release contains internal changes to the Framework. There are no changes to the public API or behavior.

### Breaking changes

*No breaking changes.*

### Other notable changes

*No notable changes.*

## 0.48

The 0.48 release is focused on clarifying the primary Fluid Framework public API, which is primarily exposed through the `fluid-framework` library.

**Update 0.48.1:** The update addresses this issue: {{< issue 7570 >}} -- `AzureClient` fails when running in local
mode.

**Update 0.48.2:** The update addresses this issue: {{< issue 7596 >}} -- Add sequence number telemetry to deltamanager.

**Update 0.48.3:** The update addresses these issues:

- {{< issue 7647 >}} -- Remove nav param from sharelink set in resolved url.
- {{< issue 7646 >}} -- Add loadMode options in container load end telemetry.

**Update 0.48.4:** The update addresses this issue: {{< issue 7661 >}} -- Restore forward compatibility for container
rehydration.

**Update 0.48.5:** The update addresses this issue: {{< issue 7693 >}} -- Properly log websocket errors.

---

The 0.48 release is focused on clarifying the primary Fluid Framework public API, which is primarily exposed through the
`fluid-framework` library. For more information Fluid's public API see [Packages]({{< relref "packages.md" >}}).

### Breaking changes

#### SignalManager and Signaler classes moved

The `SignalManager` and `Signaler` classes have been moved to the `@fluid-experimental/data-objects` package to
better reflect their experimental state. If you use these classes, you can add a dependency on the
`@fluid-experimental/data-objects` package and import the classes from there.

### Other notable changes

- The published {{< apiref "fluid-framework" >}} package now publishes ESNext modules ({{< issue 7474 >}}).
- Various APIs in the {{< apiref "azure-client" >}} and {{< apiref "tinylicious-client" >}} now return {{< apiref
  "IFluidContainer" >}}s instead of {{< apiref "FluidContainer" >}}s. This change should have no effect to developers
  since the runtime object is the same ({{< issue 7457 >}}).
