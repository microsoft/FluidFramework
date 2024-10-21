[**@fluid-tools/build-infrastructure**](../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../README.md) / IFluidRepo

# Interface: IFluidRepo\<P\>

A Fluid repo organizes a collection of npm packages into workspaces and release groups. A Fluid repo can contain
multiple workspaces, and a workspace can in turn contain multiple release groups. Both workspaces and release groups
represent ways to organize packages in the repo, but their purpose and function are different.

See [IWorkspace](IWorkspace.md) and [IReleaseGroup](IReleaseGroup.md) for more details.

## Extends

- [`Reloadable`](Reloadable.md)

## Type Parameters

• **P** *extends* [`IPackage`](IPackage.md) = [`IPackage`](IPackage.md)

## Properties

### configuration

```ts
configuration: IFluidRepoLayout;
```

The layout configuration for the repo.

#### Defined in

[packages/build-infrastructure/src/types.ts:67](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L67)

***

### packages

```ts
packages: Map<PackageName, P>;
```

A map of all packages in the Fluid repo.

#### Defined in

[packages/build-infrastructure/src/types.ts:56](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L56)

***

### releaseGroups

```ts
releaseGroups: Map<ReleaseGroupName, IReleaseGroup>;
```

A map of all release groups in the Fluid repo.

#### Defined in

[packages/build-infrastructure/src/types.ts:51](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L51)

***

### root

```ts
root: string;
```

The absolute path to the root of the IFluidRepo. This is the path where the config file is located.

#### Defined in

[packages/build-infrastructure/src/types.ts:41](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L41)

***

### upstreamRemotePartialUrl?

```ts
optional upstreamRemotePartialUrl: string;
```

A partial URL to the upstream (remote) repo. This can be set to the name of the repo on GitHub. For example,
"microsoft/FluidFramework".

#### Defined in

[packages/build-infrastructure/src/types.ts:62](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L62)

***

### workspaces

```ts
workspaces: Map<WorkspaceName, IWorkspace>;
```

A map of all workspaces in the Fluid repo.

#### Defined in

[packages/build-infrastructure/src/types.ts:46](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L46)

## Methods

### getGitRepository()

```ts
getGitRepository(): Promise<Readonly<SimpleGit>>
```

If the FluidRepo is within a Git repository, this function will return a SimpleGit instance rooted at the root of
the Git repository. If the FluidRepo is _not_ within a Git repository, this function will throw a
[NotInGitRepository](../classes/NotInGitRepository.md) error.

#### Returns

`Promise`\<`Readonly`\<`SimpleGit`\>\>

#### Throws

A [NotInGitRepository](../classes/NotInGitRepository.md) error if the path is not within a Git repository.

#### Defined in

[packages/build-infrastructure/src/types.ts:84](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L84)

***

### getPackageReleaseGroup()

```ts
getPackageReleaseGroup(pkg): Readonly<IReleaseGroup>
```

Returns the [IReleaseGroup](IReleaseGroup.md) associated with a package.

#### Parameters

• **pkg**: `Readonly`\<`P`\>

#### Returns

`Readonly`\<[`IReleaseGroup`](IReleaseGroup.md)\>

#### Defined in

[packages/build-infrastructure/src/types.ts:89](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L89)

***

### getPackageWorkspace()

```ts
getPackageWorkspace(pkg): Readonly<IWorkspace>
```

Returns the [IWorkspace](IWorkspace.md) associated with a package.

#### Parameters

• **pkg**: `Readonly`\<`P`\>

#### Returns

`Readonly`\<[`IWorkspace`](IWorkspace.md)\>

#### Defined in

[packages/build-infrastructure/src/types.ts:94](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L94)

***

### relativeToRepo()

```ts
relativeToRepo(p): string
```

Transforms an absolute path to a path relative to the FluidRepo root.

#### Parameters

• **p**: `string`

The path to make relative to the FluidRepo root.

#### Returns

`string`

the relative path.

#### Defined in

[packages/build-infrastructure/src/types.ts:75](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L75)

***

### reload()

```ts
reload(): void
```

#### Returns

`void`

#### Inherited from

[`Reloadable`](Reloadable.md).[`reload`](Reloadable.md#reload)

#### Defined in

[packages/build-infrastructure/src/types.ts:120](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L120)
