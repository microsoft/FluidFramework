[**@fluid-tools/build-infrastructure**](../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../README.md) / PackageDependency

# Interface: PackageDependency

Information about a package dependency. That is, en extry in the "dependencies", "devDependencies", or
"peerDependencies" fields in package.json.

## Properties

### depKind

```ts
depKind: "prod" | "dev" | "peer";
```

The kind of dependency, based on the field that the dependency comes from.

- prod corresponds to the dependencies field.
- dev corresponds to the devDependencies field.
- peer corresponds to the peerDependencies field.

#### Defined in

[packages/build-infrastructure/src/types.ts:320](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L320)

***

### name

```ts
name: PackageName;
```

The name of the dependency.

#### Defined in

[packages/build-infrastructure/src/types.ts:306](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L306)

***

### version

```ts
version: string;
```

The version or version range of the dependency.

#### Defined in

[packages/build-infrastructure/src/types.ts:311](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/types.ts#L311)
