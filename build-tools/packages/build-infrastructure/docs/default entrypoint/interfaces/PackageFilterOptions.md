[**@fluid-tools/build-infrastructure**](../../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../../README.md) / [default entrypoint](../README.md) / PackageFilterOptions

# Interface: PackageFilterOptions

The criteria that should be used for filtering package-like objects from a collection.

## Properties

### private

```ts
private: undefined | boolean;
```

If set, filters private packages in/out.

#### Defined in

[packages/build-infrastructure/src/filter.ts:117](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/filter.ts#L117)

***

### scope?

```ts
optional scope: string[];
```

If set, filters IN packages whose scope matches the strings provided.

#### Defined in

[packages/build-infrastructure/src/filter.ts:107](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/filter.ts#L107)

***

### skipScope?

```ts
optional skipScope: string[];
```

If set, filters OUT packages whose scope matches the strings provided.

#### Defined in

[packages/build-infrastructure/src/filter.ts:112](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/filter.ts#L112)
