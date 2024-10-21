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

#### Defined in

[packages/build-infrastructure/src/types.ts:263](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L263)

***

### name

```ts
readonly name: PackageManagerName;
```

#### Defined in

[packages/build-infrastructure/src/types.ts:262](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L262)

## Methods

### installCommand()

```ts
installCommand(updateLockfile): string
```

#### Parameters

• **updateLockfile**: `boolean`

#### Returns

`string`

#### Defined in

[packages/build-infrastructure/src/types.ts:264](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L264)
