[**@fluid-tools/build-infrastructure**](../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../README.md) / WorkspaceDefinition

# Interface: WorkspaceDefinition

The definition of a workspace ih configuration.

## Properties

### directory

```ts
directory: string;
```

The root directory of the workspace. This folder should contain a workspace config file (e.g. pnpm-workspace.yaml).

#### Defined in

[packages/build-infrastructure/src/config.ts:58](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/config.ts#L58)

***

### releaseGroups

```ts
releaseGroups: object;
```

Definitions of the release groups within the workspace.

#### Index Signature

 \[`name`: `string`\]: [`ReleaseGroupDefinition`](ReleaseGroupDefinition.md)

#### Defined in

[packages/build-infrastructure/src/config.ts:63](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/config.ts#L63)
