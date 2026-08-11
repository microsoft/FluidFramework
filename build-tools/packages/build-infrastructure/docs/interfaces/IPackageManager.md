[**@fluid-tools/build-infrastructure**](../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../README.md) / IPackageManager

# Interface: IPackageManager

A package manager, such as "npm" or "pnpm".

## Properties

### lockfileName

```ts
readonly lockfileName: string;
```

The name of the lockfile used by the package manager.

#### Defined in

[packages/build-infrastructure/src/types.ts:285](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L285)

***

### name

```ts
readonly name: PackageManagerName;
```

The name of the package manager.

#### Defined in

[packages/build-infrastructure/src/types.ts:280](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L280)

## Methods

### installCommand()

```ts
installCommand(updateLockfile): string
```

Returns an install command that can be used to install dependencies using this package manager.

#### Parameters

• **updateLockfile**: `boolean`

If `true`, then the returned command will include flags or arguments necessary to update
the lockfile during install. If `false`, such flags or arguments should be omitted. Note that the command will
_not_ include the package manager name istself. For example, the `npm` package manager will return the string
`"install"`, not `"npm install"`.

#### Returns

`string`

#### Defined in

[packages/build-infrastructure/src/types.ts:295](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L295)
