[**@fluid-tools/build-infrastructure**](../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../README.md) / IFluidRepoLayout

# Interface: IFluidRepoLayout

Top-most configuration for repo layout settings.

## Properties

### repoLayout?

```ts
optional repoLayout: object;
```

The layout of repo into workspaces and release groups.

#### workspaces

```ts
workspaces: object;
```

##### Index Signature

 \[`name`: `string`\]: [`WorkspaceDefinition`](WorkspaceDefinition.md)

#### Defined in

[packages/build-infrastructure/src/config.ts:41](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/config.ts#L41)

***

### ~~repoPackages?~~

```ts
optional repoPackages: IFluidBuildDirs;
```

**BACK-COMPAT ONLY**

A mapping of package or release group names to metadata about the package or release group.

#### Deprecated

Use the repoLayout property instead.

#### Defined in

[packages/build-infrastructure/src/config.ts:36](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/config.ts#L36)

***

### version

```ts
version: 1;
```

The version of the config.

#### Defined in

[packages/build-infrastructure/src/config.ts:27](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/config.ts#L27)
