[**@fluid-tools/build-infrastructure**](../../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../../README.md) / [default entrypoint](../README.md) / filterPackages

# Function: filterPackages()

```ts
function filterPackages<T>(packages, filters): Promise<T[]>
```

Filters a list of packages by the filter criteria.

## Type Parameters

• **T** *extends* [`FilterablePackage`](../interfaces/FilterablePackage.md)

The type of the package-like objects being filtered.

## Parameters

• **packages**: `T`[]

An array of packages to be filtered.

• **filters**: [`PackageFilterOptions`](../interfaces/PackageFilterOptions.md)

The filter criteria to filter the packages by.

## Returns

`Promise`\<`T`[]\>

An array containing only the filtered items.

## Defined in

[packages/build-infrastructure/src/filter.ts:249](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/filter.ts#L249)
