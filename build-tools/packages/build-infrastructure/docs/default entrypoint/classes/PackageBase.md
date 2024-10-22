[**@fluid-tools/build-infrastructure**](../../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../../README.md) / [default entrypoint](../README.md) / PackageBase

# Class: `abstract` PackageBase\<J, TAddProps\>

A common type representing an npm package. A custom type can be used for the package.json schema, which is useful
when the package.json has custom keys/values.

## Type Parameters

• **J** *extends* [`PackageJson`](../type-aliases/PackageJson.md) = [`PackageJson`](../type-aliases/PackageJson.md)

The package.json type to use. This type must extend the [PackageJson](../type-aliases/PackageJson.md) type defined in this
package.

• **TAddProps** *extends* [`AdditionalPackageProps`](../type-aliases/AdditionalPackageProps.md) = `undefined`

## Implements

- [`IPackage`](../interfaces/IPackage.md)\<`J`\>

## Constructors

### new PackageBase()

```ts
new PackageBase<J, TAddProps>(
   packageJsonFilePath, 
   packageManager, 
   workspace, 
   isWorkspaceRoot, 
   releaseGroup, 
   isReleaseGroupRoot, 
additionalProperties?): PackageBase<J, TAddProps>
```

Create a new package from a package.json file. **Prefer the .load method to calling the contructor directly.**

#### Parameters

• **packageJsonFilePath**: `string`

The path to a package.json file.

• **packageManager**: [`IPackageManager`](../interfaces/IPackageManager.md)

The package manager used by the workspace.

• **workspace**: [`IWorkspace`](../interfaces/IWorkspace.md)

• **isWorkspaceRoot**: `boolean`

Set to true if this package is the root of a workspace.

• **releaseGroup**: [`ReleaseGroupName`](../type-aliases/ReleaseGroupName.md)

• **isReleaseGroupRoot**: `boolean`

• **additionalProperties?**: `TAddProps`

An object with additional properties that should be added to the class. This is
useful to augment the package class with additional properties.

#### Returns

[`PackageBase`](PackageBase.md)\<`J`, `TAddProps`\>

#### Defined in

[packages/build-infrastructure/src/package.ts:72](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/package.ts#L72)

## Properties

### isReleaseGroupRoot

```ts
isReleaseGroupRoot: boolean;
```

Whether the package is a release group root package or not. A release group may not have a root package, but if it
does, it will only have one.

#### Implementation of

[`IPackage`](../interfaces/IPackage.md).[`isReleaseGroupRoot`](../interfaces/IPackage.md#isreleasegrouproot)

#### Defined in

[packages/build-infrastructure/src/package.ts:78](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/package.ts#L78)

***

### isWorkspaceRoot

```ts
readonly isWorkspaceRoot: boolean;
```

Set to true if this package is the root of a workspace.

#### Implementation of

[`IPackage`](../interfaces/IPackage.md).[`isWorkspaceRoot`](../interfaces/IPackage.md#isworkspaceroot)

#### Defined in

[packages/build-infrastructure/src/package.ts:76](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/package.ts#L76)

***

### packageJsonFilePath

```ts
readonly packageJsonFilePath: string;
```

The path to a package.json file.

#### Implementation of

[`IPackage`](../interfaces/IPackage.md).[`packageJsonFilePath`](../interfaces/IPackage.md#packagejsonfilepath)

#### Defined in

[packages/build-infrastructure/src/package.ts:73](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/package.ts#L73)

***

### packageManager

```ts
readonly packageManager: IPackageManager;
```

The package manager used by the workspace.

#### Implementation of

[`IPackage`](../interfaces/IPackage.md).[`packageManager`](../interfaces/IPackage.md#packagemanager)

#### Defined in

[packages/build-infrastructure/src/package.ts:74](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/package.ts#L74)

***

### releaseGroup

```ts
readonly releaseGroup: ReleaseGroupName;
```

The name of the release group that this package belongs to.

#### Implementation of

[`IPackage`](../interfaces/IPackage.md).[`releaseGroup`](../interfaces/IPackage.md#releasegroup)

#### Defined in

[packages/build-infrastructure/src/package.ts:77](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/package.ts#L77)

***

### workspace

```ts
readonly workspace: IWorkspace;
```

The workspace that this package belongs to.

#### Implementation of

[`IPackage`](../interfaces/IPackage.md).[`workspace`](../interfaces/IPackage.md#workspace)

#### Defined in

[packages/build-infrastructure/src/package.ts:75](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/package.ts#L75)

## Accessors

### combinedDependencies

```ts
get combinedDependencies(): Generator<PackageDependency, void, unknown>
```

A generator that returns each dependency and the kind of dependency (dev, peer, etc.) for all of the package's
dependencies. This is useful to iterate overall all dependencies of the package.

#### Returns

`Generator`\<[`PackageDependency`](../interfaces/PackageDependency.md), `void`, `unknown`\>

A generator that returns each dependency and the kind of dependency (dev, peer, etc.) for all of the package's
dependencies. This is useful to iterate overall all dependencies of the package.

#### Implementation of

[`IPackage`](../interfaces/IPackage.md).[`combinedDependencies`](../interfaces/IPackage.md#combineddependencies)

#### Defined in

[packages/build-infrastructure/src/package.ts:88](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/package.ts#L88)

***

### directory

```ts
get directory(): string
```

The absolute path to the directory containing the package (that is, the directory that contains the package.json
for the package).

#### Returns

`string`

The absolute path to the directory containing the package (that is, the directory that contains the package.json
for the package).

#### Implementation of

[`IPackage`](../interfaces/IPackage.md).[`directory`](../interfaces/IPackage.md#directory)

#### Defined in

[packages/build-infrastructure/src/package.ts:92](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/package.ts#L92)

***

### name

```ts
get name(): PackageName
```

The name of the package including the scope.

#### Returns

[`PackageName`](../type-aliases/PackageName.md)

The name of the package

#### Implementation of

[`IPackage`](../interfaces/IPackage.md).[`name`](../interfaces/IPackage.md#name)

#### Defined in

[packages/build-infrastructure/src/package.ts:99](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/package.ts#L99)

***

### nameColored

```ts
get nameColored(): string
```

The name of the package with a color for terminal output.

#### Returns

`string`

The name of the package color-coded with ANSI color codes for terminal output. The package name will always have
the same color.

#### Implementation of

[`IPackage`](../interfaces/IPackage.md).[`nameColored`](../interfaces/IPackage.md#namecolored)

#### Defined in

[packages/build-infrastructure/src/package.ts:106](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/package.ts#L106)

***

### packageJson

```ts
get packageJson(): J
```

The package.json contents of the package.

#### Returns

`J`

The package.json contents of the package.

#### Implementation of

[`IPackage`](../interfaces/IPackage.md).[`packageJson`](../interfaces/IPackage.md#packagejson)

#### Defined in

[packages/build-infrastructure/src/package.ts:110](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/package.ts#L110)

***

### private

```ts
get private(): boolean
```

`true` if the package is private; `false` otherwise. This is similar to the field in package.json, but always
returns a boolean value. If the package.json is missing the `private` field, this will return false.

#### Returns

`boolean`

`true` if the package is private; `false` otherwise. This is similar to the field in package.json, but always
returns a boolean value. If the package.json is missing the `private` field, this will return false.

#### Implementation of

[`IPackage`](../interfaces/IPackage.md).[`private`](../interfaces/IPackage.md#private)

#### Defined in

[packages/build-infrastructure/src/package.ts:114](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/package.ts#L114)

***

### version

```ts
get version(): string
```

The version of the package. This is the same as `packageJson.version`.

#### Returns

`string`

The version of the package. This is the same as `packageJson.version`.

#### Implementation of

[`IPackage`](../interfaces/IPackage.md).[`version`](../interfaces/IPackage.md#version)

#### Defined in

[packages/build-infrastructure/src/package.ts:118](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/package.ts#L118)

## Methods

### checkInstall()

```ts
checkInstall(print): Promise<boolean>
```

Returns `true` if the item is installed. If this returns `false`, then the `install` function can be called to
install.

#### Parameters

• **print**: `boolean` = `true`

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`IPackage`](../interfaces/IPackage.md).[`checkInstall`](../interfaces/IPackage.md#checkinstall)

#### Defined in

[packages/build-infrastructure/src/package.ts:138](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/package.ts#L138)

***

### getScript()

```ts
getScript(name): undefined | string
```

Returns the value of a script in the package's package.json, or undefined if a script with the provided key is not
found.

#### Parameters

• **name**: `string`

#### Returns

`undefined` \| `string`

#### Implementation of

[`IPackage`](../interfaces/IPackage.md).[`getScript`](../interfaces/IPackage.md#getscript)

#### Defined in

[packages/build-infrastructure/src/package.ts:134](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/package.ts#L134)

***

### install()

```ts
install(updateLockfile): Promise<boolean>
```

Installs the dependencies for all packages in this package's workspace.

#### Parameters

• **updateLockfile**: `boolean`

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`IPackage`](../interfaces/IPackage.md).[`install`](../interfaces/IPackage.md#install)

#### Defined in

[packages/build-infrastructure/src/package.ts:170](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/package.ts#L170)

***

### reload()

```ts
reload(): void
```

#### Returns

`void`

#### Implementation of

[`IPackage`](../interfaces/IPackage.md).[`reload`](../interfaces/IPackage.md#reload)

#### Defined in

[packages/build-infrastructure/src/package.ts:126](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/package.ts#L126)

***

### savePackageJson()

```ts
savePackageJson(): Promise<void>
```

Saves any changes to the packageJson property to the package.json file on disk.

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`IPackage`](../interfaces/IPackage.md).[`savePackageJson`](../interfaces/IPackage.md#savepackagejson)

#### Defined in

[packages/build-infrastructure/src/package.ts:122](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/package.ts#L122)

***

### toString()

```ts
toString(): string
```

Returns a string representation of an object.

#### Returns

`string`

#### Implementation of

[`IPackage`](../interfaces/IPackage.md).[`toString`](../interfaces/IPackage.md#tostring)

#### Defined in

[packages/build-infrastructure/src/package.ts:130](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/package.ts#L130)
