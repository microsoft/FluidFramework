[**@fluid-tools/build-infrastructure**](../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../README.md) / PackageJson

# Type Alias: PackageJson

```ts
type PackageJson: SetRequired<StandardPackageJson & FluidPackageJsonFields, "name" | "scripts" | "version">;
```

All known package.json fields including those that are specific to build-infrastructure.
The `name`, `scripts`, and `version` fields are required, unlike standard package.json.

## Defined in

[packages/build-infrastructure/src/types.ts:33](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L33)
