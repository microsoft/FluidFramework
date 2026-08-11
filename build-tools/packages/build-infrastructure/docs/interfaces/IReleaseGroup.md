[**@fluid-tools/build-infrastructure**](../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../README.md) / IReleaseGroup

# Interface: IReleaseGroup

A release group is a collection of packages that are versioned and released together. All packages within a release
group will have the same version, and all packages will be released at the same time.

Release groups are not involved in dependency management. They are used for versioning and releasing packages only.
Workspaces, on the other hand, are used to manage dependencies and interdependencies. See [IWorkspace](IWorkspace.md) for more
information.

## Extends

- [`Reloadable`](Reloadable.md)

## Properties

### adoPipelineUrl?

```ts
readonly optional adoPipelineUrl: string;
```

An optional ADO pipeline URL for the CI pipeline that builds the release group.

#### Defined in

[packages/build-infrastructure/src/types.ts:243](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L243)

***

### name

```ts
readonly name: ReleaseGroupName;
```

The name of the release group. All release groups must have unique names.

#### Defined in

[packages/build-infrastructure/src/types.ts:211](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L211)

***

### packages

```ts
readonly packages: IPackage<object>[];
```

An array of all packages in the release group.

#### Defined in

[packages/build-infrastructure/src/types.ts:226](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L226)

***

### releaseGroupDependencies

```ts
readonly releaseGroupDependencies: IReleaseGroup[];
```

An array of all the release groups that the release group depends on. If any package in a release group has any
dependency on a package in another release group within the same workspace, then the first release group depends
on the second.

#### Defined in

[packages/build-infrastructure/src/types.ts:238](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L238)

***

### rootPackage?

```ts
readonly optional rootPackage: IPackage<object>;
```

The package that is the release group root, if one exists.

#### Type declaration

##### author?

```ts
optional author: Person;
```

##### bin?

```ts
optional bin: string | Partial<Record<string, string>>;
```

The executable files that should be installed into the `PATH`.

##### browser?

```ts
optional browser: string | Partial<Record<string, string | false>>;
```

A hint to JavaScript bundlers or component tools when packaging modules for client side use.

##### bugs?

```ts
optional bugs: BugsLocation;
```

The URL to the package's issue tracker and/or the email address to which issues should be reported.

##### bundledDependencies?

```ts
optional bundledDependencies: string[];
```

Package names that are bundled when the package is published.

##### bundleDependencies?

```ts
optional bundleDependencies: string[];
```

Alias of `bundledDependencies`.

##### config?

```ts
optional config: Record<string, unknown>;
```

Is used to set configuration parameters used in package scripts that persist across upgrades.

##### contributors?

```ts
optional contributors: Person[];
```

A list of people who contributed to the package.

##### cpu?

```ts
optional cpu: LiteralUnion<
  | "arm"
  | "arm64"
  | "ia32"
  | "mips"
  | "mipsel"
  | "ppc"
  | "ppc64"
  | "s390"
  | "s390x"
  | "x64"
  | "x32"
  | "!arm"
  | "!arm64"
  | "!ia32"
  | "!mips"
  | "!mipsel"
  | "!ppc"
  | "!ppc64"
  | "!s390"
  | "!s390x"
  | "!x32"
  | "!x64", string>[];
```

CPU architectures the module runs on.

##### dependencies?

```ts
optional dependencies: Partial<Record<string, string>>;
```

The dependencies of the package.

##### description?

```ts
optional description: string;
```

Package description, listed in `npm search`.

##### devDependencies?

```ts
optional devDependencies: Partial<Record<string, string>>;
```

Additional tooling dependencies that are not required for the package to work. Usually test, build, or documentation tooling.

##### directories?

```ts
optional directories: DirectoryLocations;
```

Indicates the structure of the package.

##### engines?

```ts
optional engines: object;
```

Engines that this package runs on.

##### ~~engineStrict?~~

```ts
optional engineStrict: boolean;
```

###### Deprecated

##### esnext?

```ts
optional esnext: string | object;
```

A module ID with untranspiled code that is the primary entry point to the program.

##### exports?

```ts
optional exports: Exports;
```

Subpath exports to define entry points of the package.

[Read more.](https://nodejs.org/api/packages.html#subpath-exports)

##### files?

```ts
optional files: string[];
```

The files included in the package.

##### flat?

```ts
optional flat: boolean;
```

If your package only allows one version of a given dependency, and you’d like to enforce the same behavior as `yarn install --flat` on the command-line, set this to `true`.

Note that if your `package.json` contains `"flat": true` and other packages depend on yours (e.g. you are building a library rather than an app), those other packages will also need `"flat": true` in their `package.json` or be installed with `yarn install --flat` on the command-line.

##### funding?

```ts
optional funding: string | object;
```

Describes and notifies consumers of a package's monetary support information.

[Read more.](https://github.com/npm/rfcs/blob/latest/accepted/0017-add-funding-support.md)

##### homepage?

```ts
optional homepage: LiteralUnion<".", string>;
```

The URL to the package's homepage.

##### imports?

```ts
optional imports: Imports;
```

Subpath imports to define internal package import maps that only apply to import specifiers from within the package itself.

[Read more.](https://nodejs.org/api/packages.html#subpath-imports)

##### jspm?

```ts
optional jspm: PackageJson;
```

JSPM configuration.

##### keywords?

```ts
optional keywords: string[];
```

Keywords associated with package, listed in `npm search`.

##### license?

```ts
optional license: string;
```

The license for the package.

##### licenses?

```ts
optional licenses: object[];
```

The licenses for the package.

##### main?

```ts
optional main: string;
```

The module ID that is the primary entry point to the program.

##### maintainers?

```ts
optional maintainers: Person[];
```

A list of people who maintain the package.

##### man?

```ts
optional man: string | string[];
```

Filenames to put in place for the `man` program to find.

##### module?

```ts
optional module: string;
```

An ECMAScript module ID that is the primary entry point to the program.

##### name

```ts
name: string;
```

The name of the package.

##### optionalDependencies?

```ts
optional optionalDependencies: Partial<Record<string, string>>;
```

Dependencies that are skipped if they fail to install.

##### os?

```ts
optional os: LiteralUnion<
  | "aix"
  | "darwin"
  | "freebsd"
  | "linux"
  | "openbsd"
  | "sunos"
  | "win32"
  | "!aix"
  | "!darwin"
  | "!freebsd"
  | "!linux"
  | "!openbsd"
  | "!sunos"
  | "!win32", string>[];
```

Operating systems the module runs on.

##### peerDependencies?

```ts
optional peerDependencies: Partial<Record<string, string>>;
```

Dependencies that will usually be required by the package user directly or via another dependency.

##### peerDependenciesMeta?

```ts
optional peerDependenciesMeta: Partial<Record<string, object>>;
```

Indicate peer dependencies that are optional.

##### pnpm?

```ts
optional pnpm: object;
```

Configuration for pnpm.
See [https://pnpm.io/package_json](https://pnpm.io/package_json).

##### pnpm.overrides?

```ts
optional overrides: Record<string, string>;
```

Instruct pnpm to override any dependency in the dependency graph.
See [https://pnpm.io/package_json#pnpmoverrides](https://pnpm.io/package_json#pnpmoverrides)

##### ~~preferGlobal?~~

```ts
optional preferGlobal: boolean;
```

If set to `true`, a warning will be shown if package is installed locally. Useful if the package is primarily a command-line application that should be installed globally.

###### Deprecated

##### private?

```ts
optional private: boolean;
```

If set to `true`, then npm will refuse to publish it.

##### publishConfig?

```ts
optional publishConfig: PublishConfig;
```

A set of config values that will be used at publish-time. It's especially handy to set the tag, registry or access, to ensure that a given package is not tagged with 'latest', published to the global public registry or that a scoped module is private by default.

##### repository?

```ts
optional repository: string | object;
```

Location for the code repository.

##### resolutions?

```ts
optional resolutions: Partial<Record<string, string>>;
```

Selective version resolutions. Allows the definition of custom package versions inside dependencies without manual edits in the `yarn.lock` file.

##### scripts

```ts
scripts: Scripts;
```

Script commands that are run at various times in the lifecycle of the package. The key is the lifecycle event, and the value is the command to run at that point.

##### sideEffects?

```ts
optional sideEffects: boolean | string[];
```

Denote which files in your project are "pure" and therefore safe for Webpack to prune if unused.

[Read more.](https://webpack.js.org/guides/tree-shaking/)

##### type?

```ts
optional type: "module" | "commonjs";
```

Resolution algorithm for importing ".js" files from the package's scope.

[Read more.](https://nodejs.org/api/esm.html#esm_package_json_type_field)

##### types?

```ts
optional types: string;
```

Location of the bundled TypeScript declaration file.

##### typesVersions?

```ts
optional typesVersions: Partial<Record<string, Partial<Record<string, string[]>>>>;
```

Version selection map of TypeScript.

##### typings?

```ts
optional typings: string;
```

Location of the bundled TypeScript declaration file. Alias of `types`.

##### version

```ts
version: string;
```

Package version, parseable by [`node-semver`](https://github.com/npm/node-semver).

##### workspaces?

```ts
optional workspaces: string[] | WorkspaceConfig;
```

Used to configure [Yarn workspaces](https://classic.yarnpkg.com/docs/workspaces/).

Workspaces allow you to manage multiple packages within the same repository in such a way that you only need to run `yarn install` once to install all of them in a single pass.

Please note that the top-level `private` property of `package.json` **must** be set to `true` in order to use workspaces.

#### Defined in

[packages/build-infrastructure/src/types.ts:221](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L221)

***

### version

```ts
readonly version: string;
```

The version of the release group.

#### Defined in

[packages/build-infrastructure/src/types.ts:216](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L216)

***

### workspace

```ts
readonly workspace: IWorkspace;
```

The workspace that the release group belongs to.

#### Defined in

[packages/build-infrastructure/src/types.ts:231](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L231)

## Methods

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

### toString()

```ts
toString(): string
```

Returns a string representation of an object.

#### Returns

`string`

#### Defined in

[packages/build-infrastructure/src/types.ts:245](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L245)
