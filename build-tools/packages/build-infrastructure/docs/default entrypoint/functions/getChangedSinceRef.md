[**@fluid-tools/build-infrastructure**](../../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../../README.md) / [default entrypoint](../README.md) / getChangedSinceRef

# Function: getChangedSinceRef()

```ts
function getChangedSinceRef<P>(
   fluidRepo, 
   ref, 
remote?): Promise<object>
```

Gets the changed files, directories, release groups, and packages since the given ref.

Returned paths are relative to the Fluid repo root.

## Type Parameters

• **P** *extends* [`IPackage`](../interfaces/IPackage.md)\<`object`\>

## Parameters

• **fluidRepo**: [`IFluidRepo`](../interfaces/IFluidRepo.md)\<`P`\>

The Fluid repo.

• **ref**: `string`

The ref to compare against.

• **remote?**: `string`

The remote to compare against.

## Returns

`Promise`\<`object`\>

An object containing the changed files, directories, release groups, workspaces, and packages. Note that a
package may appear in multiple groups. That is, if a single package in a release group is changed, the releaseGroups
value will contain that group, and the packages value will contain only the single package. Also, if two packages are
changed, each within separate release groups, the packages value will contain both packages, and the releaseGroups
value will contain both release groups.

### dirs

```ts
dirs: string[];
```

### files

```ts
files: string[];
```

### packages

```ts
packages: IPackage[];
```

### releaseGroups

```ts
releaseGroups: IReleaseGroup[];
```

### workspaces

```ts
workspaces: IWorkspace[];
```

## Defined in

[packages/build-infrastructure/src/git.ts:95](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/git.ts#L95)
