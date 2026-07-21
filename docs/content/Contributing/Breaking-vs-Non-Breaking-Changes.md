# Breaking vs Non-Breaking Changes

## What are breaking and compatible changes?

There are three types of changes which are also reflected in the three semver version parts:

1. Breaking (major): These changes break compatibility in some way with previous major versions. We list out types of breaking changes in subsequent sections.
1. Incremental (minor): These changes are incremental over previous minor versions of the same major version. They affect the API, runtime, or persisted data but in a compatible way.
1. Implementation only/bug fixes (patch): These changes may affect functionality or behavior, but do not have any compatibility considerations for API, runtime, or persisted data compatibility.

## Breaking changes tenets

Breaking changes imply that the consumer of the library is required to make some effort to adapt to the changes being made.
Since the degree of correctness will depend on the users relying on our API, we list out tenets guiding our “breaking” policy:

1. Given that breaking policy generally can vary, we should be explicit what is considered a breaking change, whenever possible.
1. Regardless of its relationship to monorepos and release groups, each fluid framework package should stay true to semantic versioning (major.minor.patch) when it comes to any changes it adopts.
1. Breaking policy should aim for optimal trade-off between Stability and New Functionality. Our development efforts are compat-first, leaning towards New Functionality. However, when in doubt if given change is a breaking change, we should lean towards Stability first.

## Types of breaking changes

### API

API breaking changes involve changing the public API of the framework in a way that may produce compile time errors for a consumer upgrading to the newer version.
For example, adding a required function parameter would be a breaking change because the consumer would need to change any API calls:

```diff
-export function DoAThing(withAParameter: string): string;
+export function DoAThing(withAParameter: string, andAnotherOne: string): string;
```

Not all API breaks are as obvious as the previous example.
For example, transitive breaks can be difficult to identify, especially as type usages become more scattered:

```diff
// @questionable/activities File1.ts
    export interface IEatCrayons {
-       eatCrayon(color: string): void;
+       eatCrayon(crayon: Crayon): void;
    }

// @questionable/people File2.ts
    import { IEatCrayons } from "@questionable/activities";
    export class ArtisticMediaConnoisseurFactory {
        public createCrayonConnoisseur(): IEatCrayons { ... }
    }
```

In this case, a caller of `createCrayonConnoisseur` that makes a call to `eatCrayon` on the returned `IEatCrayons` object would experience an API break even if there was no explicit dependency on `IEatCrayons`. `ArtisticMediaConnoisseurFactory` has received a transitive break from the `IEatCrayons` break.

There are more obscure API breaks that are possible with Typescript as well, but as a heuristic FluidFramework does not consider all such cases in order to balance impact and version changes.

#### Required level of compatibility

API changes are expected to be **at least N/N-2 major version compatible**.
In the case of API removals, the reference version is the major version in which the API is deprecated (compatibility is not applied retroactively).

For an API deprecated in version 2.x.y, it may not be removed until version 4.0.0. Per semver, if the API is not removed in 4.0.0, it may not be removed in a later minor or patch release of 4.x.y, and must then wait until version 5.0.0.

### Runtime

"Runtime" as used here encompasses the loader, driver, container runtime, and data store.

Runtime breaking changes involve changing object compatibility at runtime for cross-version scenarios.
Due to its architecture, different parts of a Fluid application may be running on different versions, and versions within a certain window are expected to remain compatible.
For example, adding an API in one part and using it in another part as part of the same release may be considered incremental from an API perspective, but may be considered breaking from a runtime perspective.
This is because if the calling code calls the new API from an older version where it does not exist, it will lead to a runtime break.
Such a change would need to be staged according to processes described in [Compatibility and Versioning](./Compatibility-and-Versioning.md).

The four parts of the runtime create the following interfaces:

1. Container runtime ⇔ data store
2. Loader ⇔ driver
3. Loader ⇔ container runtime

#### Required level of compatibility

##### Container runtime ⇔ data store

Container runtime and data stores are expected to be **at least N/N-2 major version compatible**.

##### Loader ⇔ driver & Loader ⇔ container runtime

The driver and container runtime are expected to be **compatible back to the LTS (long-term support) version** of the loader.
Currently there is no fixed schedule for loader LTS designation.
As of April 2022, the current LTS version of the loader is 0.45.

### Persisted data

Also referred to as data-at-rest.
Persisted data breaking changes involve changing data formats that are written to disk.
Persisted data is not coupled to code versions, so code that reads or writes the data format must remain compatible with data formats from other versions.

### Consuming "major" changes from other FF packages

We call this out explicitly, as consuming "major" changes can lead to:

- Absorbing semantic changes that consumer may not be aware of.
- Deduping failures if dependency is also directly consumed by a parent package.
- Indirectly breaking API contracts due to re-export of various definitions.

### Additional considerations

Sometimes, it may not be obvious if we are making a breaking change.
In such cases, strive towards Stability (as our tenets state) and follow breaking-change workflow unless you have explicit reason not do so.

Here are some examples:

- Introducing new resources that have relationships with old resources.
- Semantic changes.
- Bug fixes that force consumer to adapt to the changes being made.
- Optimizations (or other under-the-hood changes) that may shift programming paradigm.
- Increased package size.

## Determination of breaking changes

### Developer determination

As part of making any change, the developer should consider how the change impacts compatibility in all relevant areas.
Breaking changes are handled differently within the repo as described in [How to make a change](#how-to-make-a-change).
Most such determinations can be done without manual testing, but developers should ensure that automated validation covers their scenario were someone to make the wrong determination in this step.

### Automated determination

There is automation for detecting if API, runtime, or persisted data compatibility has been broken. [API compatibility checks](./API-Type-Validation.md) run as part of PR validation and warn the developer of a change is breaking.
Runtime compatibility checks run asynchronously in a CI pipeline as defined in the tests in `test-end-to-end-tests`.
Persisted data compatibility is checked as part of snapshot tests which run as part of PR validation.

## How to make a change

### Layer considerations

Note: There is work in progress to obviate the steps in this sub-section.

As an additional consideration, changes to the following packages/groups will require the developer to stage the change as described in the [Compatibility and Versioning](./Compatibility-and-Versioning.md) page.
This is required independently of if the change is breaking or not.

- `@fluidframework/build-common`
- `@fluidframework/eslint-config-fluid`
- `@fluidframework/common-utils`
- `@fluidframework/core-interfaces`
- `@fluidframework/protocol-definitions`
- `@fluidframework/driver-definitions`
- `@fluidframework/container-definitions`
- Server

### Non-breaking

Non-breaking changes may be merged into the `main` branch at anytime.
In the case that a developer attempts to merge a breaking change into `main`, either the PR validation should fail for API or snapshot validation preventing merge, or the runtime compatibility tests will fail later and the change will be backed out.

### Breaking

Breaking changes may only be merged into the `main` branch at designated times (normally prior to a major release).
Runtime compatibility and snapshot validation will both run for changes in order to enforce version compatibility windows.

#### Staging

Some breaking changes can be staged in a way that allows changes to move forward while preserving compatibility.
See [Change Recipes](./Breaking-vs-Non-Breaking-Changes/Change-Recipes.md) for some options.

#### Exceptions

Some changes can be breaking for the packages receiving the change (it affects the package's public API) but not be breaking for the framework as a whole (the change is not exposed in the framework's public API).
Package APIs may be tagged with the [@internal](../Guidelines/Documentation-Guidelines/Documenting-TypeScript/Release-Tags.md#internal) release tag to indicate that they are for framework internal usage only.
Some APIs that can't be tagged `@internal`, but are not to be directly consumed externally may be tagged with the [@system](../Guidelines/Documentation-Guidelines/Documenting-TypeScript/TSDoc-Guidelines.md#system) modifier.
Internal and system APIs may be modified in breaking ways without incurring a breaking version change.
For such changes, the developer is responsible for also verifying it does not affect runtime compatibility.

- For more details on release tags, see [Release Tags](../Guidelines/Documentation-Guidelines/Documenting-TypeScript/Release-Tags.md).

##### [@beta](../Guidelines/Documentation-Guidelines/Documenting-TypeScript/Release-Tags.md#beta) | [@legacy](../Guidelines/Documentation-Guidelines/Documenting-TypeScript/Release-Tags.md#legacy) APIs

APIs tagged with [@beta](../Guidelines/Documentation-Guidelines/Documenting-TypeScript/Release-Tags.md#beta) or [@legacy](../Guidelines/Documentation-Guidelines/Documenting-TypeScript/Release-Tags.md#legacy) may be broken during during beta / legacy breaking minor releases when certain criteria are met.
See [API deprecation](./API-Deprecation.md) and [@beta break process](./Breaking-vs-Non-Breaking-Changes/Beta-Break-Process.md) for details.

## In this section

- [Change Recipes](./Breaking-vs-Non-Breaking-Changes/Change-Recipes.md)
- [Communicating Breaking Changes](./Breaking-vs-Non-Breaking-Changes/Communicating-Breaking-Changes.md)
- [Changesets](./Breaking-vs-Non-Breaking-Changes/Changesets.md)
- [Changesets FAQ](./Breaking-vs-Non-Breaking-Changes/Changesets-FAQ.md)
- [Cross-Client Compatibility](./Breaking-vs-Non-Breaking-Changes/Cross-Client-Compatibility.md)
- [Beta Break Process](./Breaking-vs-Non-Breaking-Changes/Beta-Break-Process.md)
- [Legacy/Alpha Break Process](./Breaking-vs-Non-Breaking-Changes/Legacy-Alpha-Break-Process.md)
