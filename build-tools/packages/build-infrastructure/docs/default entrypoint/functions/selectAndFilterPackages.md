[**@fluid-tools/build-infrastructure**](../../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../../README.md) / [default entrypoint](../README.md) / selectAndFilterPackages

# Function: selectAndFilterPackages()

```ts
function selectAndFilterPackages<P>(
   fluidRepo, 
   selection, 
filter?): Promise<object>
```

Selects packages from the Fluid repo based on the selection criteria. The selected packages will be filtered by the
filter criteria if provided.

## Type Parameters

• **P** *extends* [`IPackage`](../interfaces/IPackage.md)\<`object`\>

## Parameters

• **fluidRepo**: [`IFluidRepo`](../interfaces/IFluidRepo.md)\<`P`\>

The Fluid repo.

• **selection**: [`PackageSelectionCriteria`](../interfaces/PackageSelectionCriteria.md)

The selection criteria to use to select packages.

• **filter?**: [`PackageFilterOptions`](../interfaces/PackageFilterOptions.md)

An optional filter criteria to filter selected packages by.

## Returns

`Promise`\<`object`\>

An object containing the selected packages and the filtered packages.

### filtered

```ts
filtered: P[];
```

### selected

```ts
selected: P[];
```

## Defined in

[packages/build-infrastructure/src/filter.ts:219](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/filter.ts#L219)
