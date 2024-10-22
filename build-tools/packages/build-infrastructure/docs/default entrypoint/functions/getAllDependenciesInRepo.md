[**@fluid-tools/build-infrastructure**](../../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../../README.md) / [default entrypoint](../README.md) / getAllDependenciesInRepo

# Function: getAllDependenciesInRepo()

```ts
function getAllDependenciesInRepo(repo, packages): object
```

## Parameters

• **repo**: [`IFluidRepo`](../interfaces/IFluidRepo.md)\<[`IPackage`](../interfaces/IPackage.md)\<`object`\>\>

• **packages**: [`IPackage`](../interfaces/IPackage.md)\<`object`\>[]

## Returns

`object`

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

[packages/build-infrastructure/src/fluidRepo.ts:177](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/fluidRepo.ts#L177)
