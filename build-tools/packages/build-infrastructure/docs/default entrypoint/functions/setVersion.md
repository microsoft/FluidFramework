[**@fluid-tools/build-infrastructure**](../../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../../README.md) / [default entrypoint](../README.md) / setVersion

# Function: setVersion()

```ts
function setVersion<J>(packages, version): Promise<void>
```

Sets the version of a group of packages.

Note that any loaded objects such as an IFluidRepo instance may need to be reloaded after calling this function.

## Type Parameters

• **J** *extends* `object`

## Parameters

• **packages**: [`IPackage`](../interfaces/IPackage.md)\<`object`\>[]

An array of objects whose version should be updated.

• **version**: `SemVer`

The version to set.

## Returns

`Promise`\<`void`\>

## Defined in

[packages/build-infrastructure/src/versions.ts:21](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/versions.ts#L21)
