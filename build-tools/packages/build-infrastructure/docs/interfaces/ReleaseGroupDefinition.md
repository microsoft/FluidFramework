[**@fluid-tools/build-infrastructure**](../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../README.md) / ReleaseGroupDefinition

# Interface: ReleaseGroupDefinition

The definition of a release group ih configuration.

## Properties

### adoPipelineUrl?

```ts
optional adoPipelineUrl: string;
```

A URL to the ADO CI pipeline that builds the release group.

#### Defined in

[packages/build-infrastructure/src/config.ts:104](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/config.ts#L104)

***

### exclude?

```ts
optional exclude: string[];
```

An array of scopes or package names that should be excluded. Exclusions are applied AFTER inclusions, so
this can be used to exclude specific packages in a certain scope.

#### Defined in

[packages/build-infrastructure/src/config.ts:87](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/config.ts#L87)

***

### include

```ts
include: string[];
```

An array of scopes or package names that should be included in the release group. Each package must
belong to a single release group.

To include all packages, set this value to a single element: `["*"]`.

#### Defined in

[packages/build-infrastructure/src/config.ts:81](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/config.ts#L81)

***

### rootPackageName?

```ts
optional rootPackageName: string;
```

The name of the package that should be considered the root package for the release group. If not provided, the
release group is considered "rootless."

#### Remarks

A release group may have a "root package" that is part of the workspace but fills a similar role to the
workspace-root package: it is a convenient place to store release-group-wide scripts as opposed to workspace-wide
scripts.

#### Defined in

[packages/build-infrastructure/src/config.ts:99](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/config.ts#L99)
