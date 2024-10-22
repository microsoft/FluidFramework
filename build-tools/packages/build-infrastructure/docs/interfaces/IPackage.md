[**@fluid-tools/build-infrastructure**](../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../README.md) / IPackage

# Interface: IPackage\<J\>

A common type representing an npm package. A custom type can be used for the package.json schema, which is useful
when the package.json has custom keys/values.

## Extends

- [`Installable`](Installable.md).[`Reloadable`](Reloadable.md)

## Type Parameters

• **J** *extends* [`PackageJson`](../type-aliases/PackageJson.md) = [`PackageJson`](../type-aliases/PackageJson.md)

The package.json type to use. This type must extend the [PackageJson](../type-aliases/PackageJson.md) type defined in this
package.

## Properties

### combinedDependencies

```ts
combinedDependencies: Generator<PackageDependency, void, unknown>;
```

A generator that returns each dependency and the kind of dependency (dev, peer, etc.) for all of the package's
dependencies. This is useful to iterate overall all dependencies of the package.

#### Defined in

[packages/build-infrastructure/src/types.ts:422](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L422)

***

### directory

```ts
readonly directory: string;
```

The absolute path to the directory containing the package (that is, the directory that contains the package.json
for the package).

#### Defined in

[packages/build-infrastructure/src/types.ts:353](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L353)

***

### isReleaseGroupRoot

```ts
isReleaseGroupRoot: boolean;
```

Whether the package is a release group root package or not. A release group may not have a root package, but if it
does, it will only have one.

#### Defined in

[packages/build-infrastructure/src/types.ts:400](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L400)

***

### isWorkspaceRoot

```ts
readonly isWorkspaceRoot: boolean;
```

Whether the package is a workspace root package or not. A workspace will only have one root package.

#### Defined in

[packages/build-infrastructure/src/types.ts:389](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L389)

***

### name

```ts
readonly name: PackageName;
```

The name of the package

#### Defined in

[packages/build-infrastructure/src/types.ts:341](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L341)

***

### nameColored

```ts
readonly nameColored: string;
```

The name of the package color-coded with ANSI color codes for terminal output. The package name will always have
the same color.

#### Defined in

[packages/build-infrastructure/src/types.ts:347](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L347)

***

### packageJson

```ts
packageJson: J;
```

The package.json contents of the package.

#### Defined in

[packages/build-infrastructure/src/types.ts:358](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L358)

***

### packageJsonFilePath

```ts
readonly packageJsonFilePath: string;
```

The absolute path to the package.json file for this package.

#### Defined in

[packages/build-infrastructure/src/types.ts:405](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L405)

***

### packageManager

```ts
readonly packageManager: IPackageManager;
```

The package manager used to manage this package.

#### Defined in

[packages/build-infrastructure/src/types.ts:368](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L368)

***

### private

```ts
readonly private: boolean;
```

`true` if the package is private; `false` otherwise. This is similar to the field in package.json, but always
returns a boolean value. If the package.json is missing the `private` field, this will return false.

#### Defined in

[packages/build-infrastructure/src/types.ts:379](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L379)

***

### releaseGroup

```ts
releaseGroup: ReleaseGroupName;
```

The name of the release group that this package belongs to.

#### Defined in

[packages/build-infrastructure/src/types.ts:394](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L394)

***

### version

```ts
readonly version: string;
```

The version of the package. This is the same as `packageJson.version`.

#### Defined in

[packages/build-infrastructure/src/types.ts:373](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L373)

***

### workspace

```ts
readonly workspace: IWorkspace;
```

The workspace that this package belongs to.

#### Defined in

[packages/build-infrastructure/src/types.ts:384](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L384)

## Methods

### checkInstall()

```ts
checkInstall(): Promise<boolean>
```

Returns `true` if the item is installed. If this returns `false`, then the `install` function can be called to
install.

#### Returns

`Promise`\<`boolean`\>

#### Inherited from

[`Installable`](Installable.md).[`checkInstall`](Installable.md#checkinstall)

#### Defined in

[packages/build-infrastructure/src/types.ts:120](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L120)

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

#### Defined in

[packages/build-infrastructure/src/types.ts:411](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L411)

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

#### Inherited from

[`Installable`](Installable.md).[`install`](Installable.md#install)

#### Defined in

[packages/build-infrastructure/src/types.ts:128](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L128)

***

### reload()

```ts
reload(): void
```

#### Returns

`void`

#### Inherited from

[`Reloadable`](Reloadable.md).[`reload`](Reloadable.md#reload)

#### Defined in

[packages/build-infrastructure/src/types.ts:135](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L135)

***

### savePackageJson()

```ts
savePackageJson(): Promise<void>
```

Saves any changes to the packageJson property to the package.json file on disk.

#### Returns

`Promise`\<`void`\>

#### Defined in

[packages/build-infrastructure/src/types.ts:416](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L416)

***

### toString()

```ts
toString(): string
```

Returns a string representation of an object.

#### Returns

`string`

#### Defined in

[packages/build-infrastructure/src/types.ts:423](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L423)
