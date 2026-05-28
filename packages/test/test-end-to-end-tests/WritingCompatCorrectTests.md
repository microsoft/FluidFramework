# Writing Compat-Correct Tests

This document explains how to write Fluid Framework end-to-end tests that correctly exercise compatibility across versions. Tests that bypass these patterns may silently pass under the current version and break when run against older or cross-client compat configurations.

If you arrived here from an ESLint `@typescript-eslint/no-restricted-imports` error — typically of the form
_"`'@fluidframework/<pkg>/internal'` import is restricted from being used by a pattern. Rather than import this Fluid package directly, use the 'apis' argument of describeCompat."_
or _"`<Name>` import from `'@fluidframework/<pkg>/internal'` is restricted from being used by a pattern. Use `apis.<layer>.<Name>` from describeCompat instead."_ — this is the doc to read.

## Why this matters

`describeCompat` parameterizes a test suite over a **compatibility matrix**: the same test runs against multiple combinations of Loader / Container Runtime / Data Runtime / DDS package versions. The compat matrix is what catches version-skew bugs before they reach production.

The matrix only works if the test code uses the **version-aware factories and classes** that `describeCompat` provides via its `apis` argument. A statically imported `SharedMap` (for example) is fixed to the current version. When the matrix tries to run the test against an older container-runtime + older Data Runtime combination, that test still uses the current-version `SharedMap` — silently testing only the current version under the guise of the older config.

For background on the compat matrix itself, see [test-version-utils's README.md](../test-version-utils/README.md) and [Compatibility.md](../../../docs/content/docs/deep/compatibility.md).

## Using `apis`

`describeCompat`'s callback receives `apis` as its second argument. **Use it for every value reference to a compat-versioned type** — never import these statically. Destructure what you need at the top of the callback so the rest of the test body reads naturally:

```ts
describeCompat("My Test", "FullCompat", (getTestObjectProvider, apis) => {
    const { SharedMap, SharedString } = apis.dds;
    const { DataObject, DataObjectFactory } = apis.dataRuntime;
    const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;
    const { Loader } = apis.loader;
    // ...
});
```

The `apis` object is organized by layer:

| Path | What's there |
|---|---|
| `apis.dds.*` | DDS factory classes: `SharedMap`, `SharedDirectory`, `SharedCell`, `SharedCounter`, `SharedMatrix`, `SharedString`, `SharedTree`, `ConsensusQueue`, `ConsensusRegisterCollection`, `SparseMatrix`, `SharedArray`, `SharedSignal` |
| `apis.dataRuntime.*` | `DataObject`, `DataObjectFactory`, `FluidDataStoreRuntime`, `TestFluidObjectFactory` |
| `apis.dataRuntime.packages.<pkg>` | Less common APIs by package: `cell`, `counter`, `datastore`, `map`, `matrix`, `orderedCollection`, `registerCollection`, `sequence`, `sequenceDeprecated`, `agentScheduler`, `tree` |
| `apis.containerRuntime.*` | `ContainerRuntime`, `BaseContainerRuntimeFactory`, `ContainerRuntimeFactoryWithDefaultDataStore` |
| `apis.loader.*` | `Loader` |

`apis.<layer-name>.packages.<package-name>` (package names are unscoped and camelCased) holds less common exports such as helper functions and constants. Keep in mind that if these APIs change over time, tests depending on them will either need to have a reduced compat matrix or include back-compat logic. See `"Change contents of dds, then rehydrate and then check summary"` for an example of such a test.

### ❌ Static import — DON'T

```ts
import { SharedString, createOverlappingIntervalsIndex } from "@fluidframework/sequence";

const registry: ChannelFactoryRegistry = [["sharedString", SharedString.getFactory()]];
const testContainerConfig: ITestContainerConfig = {
    fluidDataObjectType: DataObjectFactoryType.Test,
    registry,
};

describeCompat("SharedString", "FullCompat", (getTestObjectProvider) => {
    // ...
    it("supports collaborative text with intervals", async () => {
        const container1 = await provider.makeTestContainer(testContainerConfig);
        const dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
        const sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);
        const overlapping = createOverlappingIntervalsIndex(sharedString1);
    });
});
```

The factory registered in `testContainerConfig` is fixed to the current version even when the compat matrix tries to run this test against an older Data Runtime. The test silently passes against a version it didn't actually exercise.

### ✅ Through `apis` — DO

```ts
describeCompat("SharedString", "FullCompat", (getTestObjectProvider, apis) => {
    const { SharedString } = apis.dds;
    const { createOverlappingIntervalsIndex } = apis.dataRuntime.packages.sequence;

    // Note that `SharedString` below is equivalent to `apis.dds.SharedString` — it can be used as
    // if you had imported it from @fluidframework/sequence, but it will be the version under test.
    const registry: ChannelFactoryRegistry = [["sharedString", SharedString.getFactory()]];
    const testContainerConfig: ITestContainerConfig = {
        fluidDataObjectType: DataObjectFactoryType.Test,
        registry,
    };

    let provider: ITestObjectProvider;
    beforeEach(() => {
        provider = getTestObjectProvider();
    });

    it("supports collaborative text", async () => {
        const container1 = await provider.makeTestContainer(testContainerConfig);
        const dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
        const sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);
        const overlapping = createOverlappingIntervalsIndex(sharedString1);
    });
});
```

### DDS factories in a registry

```ts
describeCompat("Map test", "FullCompat", (getTestObjectProvider, apis) => {
    const { SharedMap } = apis.dds;
    const registry: ChannelFactoryRegistry = [["map", SharedMap.getFactory()]];
    // ...
});
```

### Extending a DataObject

```ts
describeCompat("Custom data object", "FullCompat", (getTestObjectProvider, apis) => {
    const { DataObject, DataObjectFactory } = apis.dataRuntime;

    class MyDataObject extends DataObject {
        protected async initializingFirstTime(): Promise<void> {
            // ...
        }
    }

    const factory = new DataObjectFactory({ type: "my-data-object", ctor: MyDataObject });
    // ...
});
```

### Building a container runtime factory

```ts
describeCompat("Runtime factory test", "FullCompat", (getTestObjectProvider, apis) => {
    const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;
    const { DataObject, DataObjectFactory } = apis.dataRuntime;

    // ... build dataObjectFactory ...

    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
        defaultFactory: dataObjectFactory,
        registryEntries: [[dataObjectFactory.type, Promise.resolve(dataObjectFactory)]],
    });
});
```

### Creating a Loader

```ts
describeCompat("Loader test", "NoCompat", (getTestObjectProvider, apis) => {
    const { Loader } = apis.loader;
    const provider = getTestObjectProvider();
    const loader = new Loader({
        urlResolver: provider.urlResolver,
        documentServiceFactory: provider.documentServiceFactory,
        codeLoader: /* ... */,
    });
});
```

### SharedTree schema and tree utilities

`SchemaFactory`, `TreeViewConfiguration`, and `configuredSharedTree` are exported through `apis.dataRuntime.packages.tree`. The default `SharedTree` factory is available as `apis.dds.SharedTree`, but most tests need `configuredSharedTree` so they can opt into specific behavior (shared branches, identifier handling, etc.). The returned object is a drop-in replacement for `SharedTree` and stays compat-versioned because `configuredSharedTree` itself is reached through `apis`:

```ts
describeCompat("Tree test", "FullCompat", (getTestObjectProvider, apis) => {
    const { SchemaFactory, TreeViewConfiguration, configuredSharedTree } =
        apis.dataRuntime.packages.tree;

    const SharedTree = configuredSharedTree({
        healUnresolvableIdentifiersOnDecode: false,
        enableSharedBranches: true,
    });

    const sf = new SchemaFactory("test");
    class Root extends sf.object("Root", { id: sf.identifier }) {}
    const treeConfig = new TreeViewConfiguration({ schema: Root });
    // Register SharedTree.getFactory() in your data store / channel registry as usual.
});
```

### Type-only references

If your code needs to refer to a DDS's type (e.g. to annotate the type of a variable or function parameter), use `import type` freely — it has no runtime effect and the lint rule allows it:

```ts
import type { ISharedMap, SharedDirectory } from "@fluidframework/map/internal";
import type { SharedString } from "@fluidframework/sequence";
import type { TreeView } from "@fluidframework/tree";

function insert(str: SharedString): void {
    str.insertText(0, "hello");
}

describeCompat("Map", "FullCompat", (getTestObjectProvider, apis) => {
    const { SharedDirectory } = apis.dds;  // value comes from apis
    // The `SharedDirectory` type-import above is fine — both names coexist in different namespaces.
});
```

## Cross-client compat tests

In **CrossClientCompat** mode (one of the configs run by `FullCompat`), the client that creates the container **will be a different version** than the client that loads it. That is the whole point of the mode.

The test infrastructure handles most of this for you automatically: when `provider.makeTestContainer(...)` is called, the provider configures the loader, drivers, and other internal plumbing with the create-side versions; when `provider.loadTestContainer(...)` is called, it configures them with the load-side versions. **You only need to think about cross-client compat for the objects you pass to these APIs yourself.** Factories you put into a `ChannelFactoryRegistry`, a `DataObjectFactory`, or a custom `Loader` are *your* responsibility — they must match the side of the operation they're being used on.

`apis` provides paired entries for this: each layer has a `…ForLoading` counterpart that contains the load-side version. When the test is not running cross-client, the `…ForLoading` entries are `undefined`, so a `??` fallback to the create-side keeps single-client modes correct:

```ts
const ddsForLoading = apis.ddsForLoading ?? apis.dds;
const dataRuntimeForLoading = apis.dataRuntimeForLoading ?? apis.dataRuntime;
const containerRuntimeForLoading = apis.containerRuntimeForLoading ?? apis.containerRuntime;
const loaderForLoading = apis.loaderForLoading ?? apis.loader;
```

### Pattern: separate create and load configs

The most common shape — a test that calls both `makeTestContainer` and `loadTestContainer`:

```ts
describeCompat("Map", "FullCompat", (getTestObjectProvider, apis) => {
    const { SharedMap } = apis.dds;
    // For cross-client compat: load-side may be a different version than create-side.
    const ddsForLoading = apis.ddsForLoading ?? apis.dds;

    const createRegistry: ChannelFactoryRegistry = [["map", SharedMap.getFactory()]];
    const loadRegistry: ChannelFactoryRegistry = [
        ["map", ddsForLoading.SharedMap.getFactory()],
    ];

    const createContainerConfig: ITestContainerConfig = {
        fluidDataObjectType: DataObjectFactoryType.Test,
        registry: createRegistry,
    };
    const loadContainerConfig: ITestContainerConfig = {
        fluidDataObjectType: DataObjectFactoryType.Test,
        registry: loadRegistry,
    };

    it("syncs the map", async () => {
        const provider = getTestObjectProvider();
        const container1 = await provider.makeTestContainer(createContainerConfig);   // CREATE — create-side factory
        const container2 = await provider.loadTestContainer(loadContainerConfig);     // LOAD  — load-side factory
        // ...
    });
});
```

### Pattern: two `Loader` instances

For tests that drive the lifecycle directly with `provider.makeTestLoader(...)` and `loader.resolve(...)` rather than `make/loadTestContainer`:

```ts
describeCompat("Attach lifecycle", "FullCompat", (getTestObjectProvider, apis) => {
    const { SharedString } = apis.dds;
    const SharedStringForLoading = (apis.ddsForLoading ?? apis.dds).SharedString;

    it("survives attach order permutations", async () => {
        const provider = getTestObjectProvider();
        const createRegistry: [string | undefined, IChannelFactory][] = [
            ["sharedString", SharedString.getFactory()],
        ];
        const loadRegistry: [string | undefined, IChannelFactory][] = [
            ["sharedString", SharedStringForLoading.getFactory()],
        ];
        const initLoader = provider.makeTestLoader({ registry: createRegistry });
        const validationLoader = provider.makeTestLoader({ registry: loadRegistry });

        // initLoader.createDetachedContainer(...) → attach → close
        // validationLoader.resolve({ url: ... }) → verify state
    });
});
```

## Handling recently-added APIs

Some `apis.dds.*` entries (notably `SharedArray`, `SharedSignal`, and `SharedTree`) may be undefined when running against older compat versions whose Data Runtime didn't expose them. There are two valid strategies:

### Option A: Gate the test on the version (preferred when the test *is* about compat)

If the test exists to exercise compat behavior of the API itself, it shouldn't fabricate the API for versions that never had it. Skip those configs explicitly using `apis.mode` and the version on `apis.dataRuntime` / `apis.dataRuntimeForLoading`. See [`treeCompat.spec.ts`](./src/test/treeCompat.spec.ts) for the established pattern:

```ts
import { lt } from "semver";

describeCompat("My SharedTree compat test", "FullCompat", (getTestObjectProvider, apis) => {
    beforeEach(function () {
        // SharedTree was added in version 2.0.0 — skip cross-client configs whose
        // create or load version predates that.
        if (apis.mode === "CrossClientCompat") {
            const version = apis.dataRuntime.version;
            const versionForLoading = apis.dataRuntimeForLoading?.version;
            assert(versionForLoading !== undefined, "versionForLoading must be defined in cross-client");
            if (lt(version, "2.0.0") || lt(versionForLoading, "2.0.0")) {
                this.skip();
            }
        }
    });

    // The test body can now safely assume apis.dds.SharedTree / apis.dataRuntime.packages.tree.* exist.
});
```

This keeps the compat matrix honest: a config that genuinely couldn't run the test gets `skip()` instead of being silently rerouted to current-version code.

### Option B: Fall back to the current-version import (when the test is *not* about compat of this API)

If the API is incidental to what the test exercises — e.g., the test uses a `SharedTree` only as a vehicle to test something else and would behave identically against any version — fall back to the current-version import via a destructuring default:

```ts
// At top of file (the disable + comment documents the override):
// Used only as a fallback for older compat versions where apis.dds.SharedTree may be undefined.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { SharedTree as SharedTreeCurrent } from "@fluidframework/tree/internal";

describeCompat("Some other behavior", "FullCompat", (getTestObjectProvider, apis) => {
    const { SharedTree = SharedTreeCurrent } = apis.dds;
    // When apis.dds.SharedTree is defined, the compat version is used; otherwise the
    // current-version import is substituted so the test can still run on older configs.
});
```

Don't use this pattern if you're trying to verify the API's behavior against the compat version — substituting the current version silently changes what's being tested. When in doubt, prefer Option A.

## The lint rule

This package's [`eslint.config.mts`](./eslint.config.mts) enforces the patterns above via `@typescript-eslint/no-restricted-imports`. Two kinds of restriction:

- **Blanket** — every value export from the package goes through `apis`. Applies to:
  `@fluidframework/cell`, `@fluidframework/counter`, `@fluidframework/map`, `@fluidframework/matrix`, `@fluidframework/ordered-collection`, `@fluidframework/register-collection`, `@fluidframework/sequence`, `@fluid-experimental/sequence-deprecated`, `@fluidframework/datastore`. The `/internal` entry points are also covered.

- **Targeted** (`importNames`) — only a subset of the package is compat-versioned; other exports are free to import directly:
  | Package | Compat-versioned (restricted) | Free to import |
  |---|---|---|
  | `@fluidframework/aqueduct` | `DataObject`, `DataObjectFactory`, `BaseContainerRuntimeFactory`, `ContainerRuntimeFactoryWithDefaultDataStore` | `TreeDataObject`, `TreeDataObjectFactory`, `PureDataObjectFactory`, … |
  | `@fluidframework/container-loader` | `Loader` | `ConnectionState`, `LoaderHeader`, `ILoaderProps`, `waitContainerToCatchUp`, … |
  | `@fluidframework/container-runtime` | `ContainerRuntime` | `IContainerRuntimeOptions`, `CompressionAlgorithms`, `DefaultSummaryConfiguration`, `ContainerMessageType`, `IGCRuntimeOptions`, `ISummarizer`, … |
  | `@fluidframework/tree` | `SharedTree`, `SchemaFactory`, `TreeViewConfiguration`, `configuredSharedTree` | `ITree`, `TreeView`, `ITreeAlpha`, … (all type exports) |

**Type-only imports are always allowed** (`allowTypeImports: true`). If you only need a name for type annotations, convert to `import type { X } from "..."` and you're done.

**Exempt directories** (no enforcement):

- `src/test/benchmark/**` — benchmarks measure the current version's performance.
- `src/test/migration-shim/**` — these tests intentionally target the current new `SharedTree` (the migration destination).

## Overriding the lint rule

The lint rule allows targeted overrides via `eslint-disable` with a comment explaining intent. The convention is one-line `eslint-disable-next-line` immediately above the import, prefaced by a short reason. Cases where this is appropriate:

- **Migration target imports** — when the test specifically tests migration to (or compat with) the *current* version's API and substituting an older version would defeat the test. See [`migration-shim/`](./src/test/migration-shim) for the directory-level exemption.
- **`describeInstallVersions` helpers** — `describeInstallVersions` doesn't provide `apis`. Files that use both `describeCompat` and `describeInstallVersions` may need a fallback import (see [`compression.spec.ts`](./src/test/compression.spec.ts) and [`legacyChunking.spec.ts`](./src/test/legacyChunking.spec.ts)). Tracked by AB#6558.
- **Tests of compat infrastructure itself** — e.g., [`layerCompat.spec.ts`](./src/test/layerCompat.spec.ts) imports `dataStoreCompatDetailsForRuntime` directly because the layer-compat plumbing is what's under test.
- **Fallback aliases for recently-added DDSes** — `import { SharedTree as SharedTreeCurrent } from "..."` for the destructuring-default fallback pattern shown above.

For multi-line imports, use a block disable:

```ts
/* eslint-disable @typescript-eslint/no-restricted-imports */
import {
    SomeName,
    AnotherName,
} from "@fluidframework/aqueduct/internal";
/* eslint-enable @typescript-eslint/no-restricted-imports */
```

Always include a `//` or `/* */` comment above the disable explaining **why**.

## Quick checklist

- [ ] Did I touch a value import from a compat-versioned package? → Use `apis.*`.
- [ ] Did I only need it for type annotation? → `import type { ... }` is fine.
- [ ] Does the test both create and load containers? → Two configs (`createContainerConfig` + `loadContainerConfig`) with `apis.dds` and `apis.ddsForLoading ?? apis.dds`.
- [ ] Did I touch `SharedTree`/`SharedArray`/`SharedSignal`? → Consider the `= XCurrent` destructuring-default fallback.
- [ ] Adding an `eslint-disable`? → One-line reason comment above it, or block disable for multi-line imports.
