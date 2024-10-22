[**@fluid-tools/build-infrastructure**](../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../README.md) / IFluidBuildDir

# Interface: ~~IFluidBuildDir~~

Configures a package or release group

## Deprecated

Use repoLayout and associated types instead.

## Properties

### ~~directory~~

```ts
directory: string;
```

The path to the package. For release groups this should be the path to the root of the release group.

#### Defined in

[packages/build-infrastructure/src/config.ts:128](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/config.ts#L128)

***

### ~~ignoredDirs?~~

```ts
optional ignoredDirs: string[];
```

An array of paths under `directory` that should be ignored.

#### Deprecated

This field is unused in all known configs and is ignored by the back-compat loading code.

#### Defined in

[packages/build-infrastructure/src/config.ts:135](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/config.ts#L135)
