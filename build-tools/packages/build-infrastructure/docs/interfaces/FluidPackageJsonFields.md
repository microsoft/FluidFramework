[**@fluid-tools/build-infrastructure**](../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../README.md) / FluidPackageJsonFields

# Interface: FluidPackageJsonFields

Extra package.json fields used by pnpm.
See [https://pnpm.io/package_json](https://pnpm.io/package_json).

## Properties

### pnpm?

```ts
optional pnpm: object;
```

Configuration for pnpm.
See [https://pnpm.io/package_json](https://pnpm.io/package_json).

#### overrides?

```ts
optional overrides: Record<string, string>;
```

Instruct pnpm to override any dependency in the dependency graph.
See [https://pnpm.io/package_json#pnpmoverrides](https://pnpm.io/package_json#pnpmoverrides)

#### Defined in

[packages/build-infrastructure/src/types.ts:20](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L20)
