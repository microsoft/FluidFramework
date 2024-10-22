[**@fluid-tools/build-infrastructure**](../../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../../README.md) / [default entrypoint](../README.md) / FluidRepoBase

# Class: FluidRepoBase\<P\>

A Fluid repo organizes a collection of npm packages into workspaces and release groups. A Fluid repo can contain
multiple workspaces, and a workspace can in turn contain multiple release groups. Both workspaces and release groups
represent ways to organize packages in the repo, but their purpose and function are different.

See [IWorkspace](../interfaces/IWorkspace.md) and [IReleaseGroup](../interfaces/IReleaseGroup.md) for more details.

## Type Parameters

• **P** *extends* [`IPackage`](../interfaces/IPackage.md)

The type of [IPackage](../interfaces/IPackage.md) the repo uses. This can be any type that implements [IPackage](../interfaces/IPackage.md).

## Implements

- [`IFluidRepo`](../interfaces/IFluidRepo.md)\<`P`\>

## Constructors

### new FluidRepoBase()

```ts
new FluidRepoBase<P>(searchPath, upstreamRemotePartialUrl?): FluidRepoBase<P>
```

#### Parameters

• **searchPath**: `string`

The path that should be searched for a repo layout config file.

• **upstreamRemotePartialUrl?**: `string`

#### Returns

[`FluidRepoBase`](FluidRepoBase.md)\<`P`\>

#### Defined in

[packages/build-infrastructure/src/fluidRepo.ts:40](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/fluidRepo.ts#L40)

## Properties

### configFilePath

```ts
readonly configFilePath: string;
```

#### Defined in

[packages/build-infrastructure/src/fluidRepo.ts:33](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/fluidRepo.ts#L33)

***

### configuration

```ts
readonly configuration: IFluidRepoLayout;
```

The layout configuration for the repo.

#### Implementation of

[`IFluidRepo`](../interfaces/IFluidRepo.md).[`configuration`](../interfaces/IFluidRepo.md#configuration)

#### Defined in

[packages/build-infrastructure/src/fluidRepo.ts:31](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/fluidRepo.ts#L31)

***

### root

```ts
readonly root: string;
```

The absolute path to the root of the FluidRepo. This is the path where the config file is located.

#### Implementation of

[`IFluidRepo`](../interfaces/IFluidRepo.md).[`root`](../interfaces/IFluidRepo.md#root)

#### Defined in

[packages/build-infrastructure/src/fluidRepo.ts:29](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/fluidRepo.ts#L29)

***

### upstreamRemotePartialUrl?

```ts
readonly optional upstreamRemotePartialUrl: string;
```

A partial URL to the upstream (remote) repo. This can be set to the name of the repo on GitHub. For example,
"microsoft/FluidFramework".

#### Implementation of

[`IFluidRepo`](../interfaces/IFluidRepo.md).[`upstreamRemotePartialUrl`](../interfaces/IFluidRepo.md#upstreamremotepartialurl)

#### Defined in

[packages/build-infrastructure/src/fluidRepo.ts:42](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/fluidRepo.ts#L42)

## Accessors

### packages

```ts
get packages(): Map<PackageName, P>
```

A map of all packages in the Fluid repo.

#### Returns

`Map`\<[`PackageName`](../type-aliases/PackageName.md), `P`\>

A map of all packages in the Fluid repo.

#### Implementation of

[`IFluidRepo`](../interfaces/IFluidRepo.md).[`packages`](../interfaces/IFluidRepo.md#packages)

#### Defined in

[packages/build-infrastructure/src/fluidRepo.ts:93](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/fluidRepo.ts#L93)

***

### releaseGroups

```ts
get releaseGroups(): Map<ReleaseGroupName, IReleaseGroup>
```

A map of all release groups in the Fluid repo.

#### Returns

`Map`\<[`ReleaseGroupName`](../type-aliases/ReleaseGroupName.md), [`IReleaseGroup`](../interfaces/IReleaseGroup.md)\>

A map of all release groups in the Fluid repo.

#### Implementation of

[`IFluidRepo`](../interfaces/IFluidRepo.md).[`releaseGroups`](../interfaces/IFluidRepo.md#releasegroups)

#### Defined in

[packages/build-infrastructure/src/fluidRepo.ts:89](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/fluidRepo.ts#L89)

***

### workspaces

```ts
get workspaces(): Map<WorkspaceName, IWorkspace>
```

A map of all workspaces in the Fluid repo.

#### Returns

`Map`\<[`WorkspaceName`](../type-aliases/WorkspaceName.md), [`IWorkspace`](../interfaces/IWorkspace.md)\>

A map of all workspaces in the Fluid repo.

#### Implementation of

[`IFluidRepo`](../interfaces/IFluidRepo.md).[`workspaces`](../interfaces/IFluidRepo.md#workspaces)

#### Defined in

[packages/build-infrastructure/src/fluidRepo.ts:84](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/fluidRepo.ts#L84)

## Methods

### getGitRepository()

```ts
getGitRepository(): Promise<Readonly<SimpleGit>>
```

If the FluidRepo is within a Git repository, this function will return a SimpleGit instance rooted at the root of
the Git repository. If the FluidRepo is _not_ within a Git repository, this function will throw a
[NotInGitRepository](NotInGitRepository.md) error.

#### Returns

`Promise`\<`Readonly`\<`SimpleGit`\>\>

#### Throws

A [NotInGitRepository](NotInGitRepository.md) error if the path is not within a Git repository.

#### Implementation of

[`IFluidRepo`](../interfaces/IFluidRepo.md).[`getGitRepository`](../interfaces/IFluidRepo.md#getgitrepository)

#### Defined in

[packages/build-infrastructure/src/fluidRepo.ts:128](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/fluidRepo.ts#L128)

***

### getPackageReleaseGroup()

```ts
getPackageReleaseGroup(pkg): Readonly<IReleaseGroup>
```

Returns the [IReleaseGroup](../interfaces/IReleaseGroup.md) associated with a package.

#### Parameters

• **pkg**: `Readonly`\<`P`\>

#### Returns

`Readonly`\<[`IReleaseGroup`](../interfaces/IReleaseGroup.md)\>

#### Implementation of

[`IFluidRepo`](../interfaces/IFluidRepo.md).[`getPackageReleaseGroup`](../interfaces/IFluidRepo.md#getpackagereleasegroup)

#### Defined in

[packages/build-infrastructure/src/fluidRepo.ts:145](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/fluidRepo.ts#L145)

***

### getPackageWorkspace()

```ts
getPackageWorkspace(pkg): Readonly<IWorkspace>
```

Returns the [IWorkspace](../interfaces/IWorkspace.md) associated with a package.

#### Parameters

• **pkg**: `Readonly`\<`P`\>

#### Returns

`Readonly`\<[`IWorkspace`](../interfaces/IWorkspace.md)\>

#### Implementation of

[`IFluidRepo`](../interfaces/IFluidRepo.md).[`getPackageWorkspace`](../interfaces/IFluidRepo.md#getpackageworkspace)

#### Defined in

[packages/build-infrastructure/src/fluidRepo.ts:154](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/fluidRepo.ts#L154)

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

#### Implementation of

[`IFluidRepo`](../interfaces/IFluidRepo.md).[`relativeToRepo`](../interfaces/IFluidRepo.md#relativetorepo)

#### Defined in

[packages/build-infrastructure/src/fluidRepo.ts:114](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/fluidRepo.ts#L114)

***

### reload()

```ts
reload(): void
```

#### Returns

`void`

#### Implementation of

[`IFluidRepo`](../interfaces/IFluidRepo.md).[`reload`](../interfaces/IFluidRepo.md#reload)

#### Defined in

[packages/build-infrastructure/src/fluidRepo.ts:119](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/fluidRepo.ts#L119)
