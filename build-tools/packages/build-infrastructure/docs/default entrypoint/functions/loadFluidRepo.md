[**@fluid-tools/build-infrastructure**](../../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../../README.md) / [default entrypoint](../README.md) / loadFluidRepo

# Function: loadFluidRepo()

```ts
function loadFluidRepo<P>(searchPath, upstreamRemotePartialUrl?): IFluidRepo<P>
```

Searches for a Fluid repo config file and loads the repo layout from the config if found.

## Type Parameters

• **P** *extends* [`IPackage`](../interfaces/IPackage.md)\<`object`\>

## Parameters

• **searchPath**: `string`

The path to start searching for a Fluid repo config.

• **upstreamRemotePartialUrl?**: `string`

A partial URL to the upstream repo. This is used to find the local git remote that
corresponds to the upstream repo.

## Returns

[`IFluidRepo`](../interfaces/IFluidRepo.md)\<`P`\>

The loaded Fluid repo.

## Defined in

[packages/build-infrastructure/src/fluidRepo.ts:169](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/fluidRepo.ts#L169)
