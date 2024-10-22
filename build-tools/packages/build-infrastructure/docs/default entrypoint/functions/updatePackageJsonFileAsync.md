[**@fluid-tools/build-infrastructure**](../../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../../README.md) / [default entrypoint](../README.md) / updatePackageJsonFileAsync

# Function: updatePackageJsonFileAsync()

```ts
function updatePackageJsonFileAsync<J>(packagePath, packageTransformer): Promise<void>
```

Reads the contents of package.json, applies a transform function to it, then writes
the results back to the source file.

## Type Parameters

• **J** *extends* `object` = `object`

## Parameters

• **packagePath**: `string`

A path to a package.json file or a folder containing one. If the
path is a directory, the package.json from that directory will be used.

• **packageTransformer**

A function that will be executed on the package.json
contents before writing it back to the file.

## Returns

`Promise`\<`void`\>

## Remarks

The package.json is always sorted using sort-package-json.

## Defined in

[packages/build-infrastructure/src/packageJsonUtils.ts:82](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/packageJsonUtils.ts#L82)
