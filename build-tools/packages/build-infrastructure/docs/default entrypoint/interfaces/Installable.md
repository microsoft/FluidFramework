[**@fluid-tools/build-infrastructure**](../../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../../README.md) / [default entrypoint](../README.md) / Installable

# Interface: Installable

A common interface for installable things, like packages, release groups, and workspaces.

## Extended by

- [`IPackage`](IPackage.md)
- [`IWorkspace`](IWorkspace.md)

## Methods

### checkInstall()

```ts
checkInstall(): Promise<boolean>
```

Returns `true` if the item is installed. If this returns `false`, then the `install` function can be called to
install.

#### Returns

`Promise`\<`boolean`\>

#### Defined in

[packages/build-infrastructure/src/types.ts:105](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L105)

***

### install()

```ts
install(updateLockfile): Promise<boolean>
```

Installs the item.

#### Parameters

• **updateLockfile**: `boolean`

If true, the lockfile will be updated. Otherwise, the lockfile will not be updated. This
may cause the installation to fail.

#### Returns

`Promise`\<`boolean`\>

#### Defined in

[packages/build-infrastructure/src/types.ts:113](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L113)
