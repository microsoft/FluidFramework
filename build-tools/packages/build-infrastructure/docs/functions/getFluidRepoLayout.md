[**@fluid-tools/build-infrastructure**](../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../README.md) / getFluidRepoLayout

# Function: getFluidRepoLayout()

```ts
function getFluidRepoLayout(searchPath, noCache): object
```

Search a path for a repo layout config file, and return the parsed config and the path to the config file.

## Parameters

• **searchPath**: `string`

The path to start searching for config files in.

• **noCache**: `boolean` = `false`

If true, the config cache will be cleared and the config will be reloaded.

## Returns

`object`

The loaded repoLayout config and the path to the config file.

### config

```ts
config: IFluidRepoLayout;
```

### configFilePath

```ts
configFilePath: string;
```

## Throws

If a config is not found or if the config version is not supported.

## Defined in

[packages/build-infrastructure/src/config.ts:218](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/config.ts#L218)
