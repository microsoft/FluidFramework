[**@fluid-tools/build-infrastructure**](../../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../../README.md) / [default entrypoint](../README.md) / PackageSelectionCriteria

# Interface: PackageSelectionCriteria

The criteria that should be used for selecting package-like objects from a collection.

## Properties

### changedSinceBranch?

```ts
optional changedSinceBranch: string;
```

If set, only selects packages that have changes when compared with the branch of this name.

#### Defined in

[packages/build-infrastructure/src/filter.ts:73](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/filter.ts#L73)

***

### directory?

```ts
optional directory: string;
```

If set, only selects the single package in this directory.

#### Defined in

[packages/build-infrastructure/src/filter.ts:68](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/filter.ts#L68)

***

### releaseGroupRoots

```ts
releaseGroupRoots: string[];
```

An array of release groups whose root packages are selected. Only the roots of each release group will be included.
Rootless release groups will never be selected with this criteria.

The reserved string "\*" will select all packages when included in one of the criteria. If used, the "\*" value is
expected to be the only item in the selection array.

#### Defined in

[packages/build-infrastructure/src/filter.ts:63](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/filter.ts#L63)

***

### releaseGroups

```ts
releaseGroups: string[];
```

An array of release groups whose packages are selected. All packages in the release group _except_ the root package
will be selected. To include release group roots, use the `releaseGroupRoots` property.

Values should either be complete release group names or micromatch glob strings. To select all release groups, use
`"*"`. See https://www.npmjs.com/package/micromatch?activeTab=readme#extended-globbing for more details.

Workspace names will be compared against all globs - if any match, the workspace will be selected.

#### Defined in

[packages/build-infrastructure/src/filter.ts:54](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/filter.ts#L54)

***

### workspaceRoots

```ts
workspaceRoots: string[];
```

An array of workspaces whose root packages are selected. Only the roots of each workspace will be included.

Values should either be complete workspace names or micromatch glob strings. To select all workspaces, use `"*"`.
See https://www.npmjs.com/package/micromatch?activeTab=readme#extended-globbing for more details.

Workspace names will be compared against all globs - if any match, the workspace will be selected.

#### Defined in

[packages/build-infrastructure/src/filter.ts:43](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/filter.ts#L43)

***

### workspaces

```ts
workspaces: string[];
```

An array of workspaces whose packages are selected. All packages in the workspace _except_ the root package
will be selected. To include workspace roots, use the `workspaceRoots` property.

Values should either be complete workspace names or micromatch glob strings. To select all workspaces, use `"*"`.
See https://www.npmjs.com/package/micromatch?activeTab=readme#extended-globbing for more details.

Workspace names will be compared against all globs - if any match, the workspace will be selected.

#### Defined in

[packages/build-infrastructure/src/filter.ts:33](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/filter.ts#L33)
