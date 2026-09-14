# Change Recipes

This is a collection of some patterns that can be used to manage changes that will eventually be or would otherwise be breaking.

## Moving API to internal

Deprecating an API in order to change it to be `@internal` may be handled without the internal usages appearing deprecated (requiring `no-deprecated` lint disables).
Since standard API separation is generated from a single file, a split is required with a re-tagged API to make this work.

1. Apply the `@deprecated` tag to the original API. It is important to keep the original tags in place to make it clear that API is externally exposed.
1. Create a new `internal.ts` source next to `index.ts` that re-exports everything: `export * from "./index.js";`.
1. Add a new named export copying the API. Import original renamed and exported as copy.
1. Change package.json export for `/internal` to `internal.*` instead of `index.*`.
1. As needed, apply policy required changes. Try `pnpm policy-check:fix`.

Example: [PR 23332: Making ContainerRuntime externally deprecated](https://github.com/microsoft/FluidFramework/pull/23332/files#diff-4e1dfb5e1cc08edebf8dcfd1786e7260e9604694c965bdfa6c9d88aad8b20ba6) - see files under packages/runtime/container-runtime

## Manipulating a Class or Enum

Classes and enums are both values and types and the type of (`typeof`) the value is not the same as the type.
To clone a class or enum fully, both a type and value should be cloned.

### Example

[packages/runtime/container-runtime/src/internal.ts](https://github.com/microsoft/FluidFramework/blob/1503238fb1a163449ab48a78ee400520f0c3c9fc/packages/runtime/container-runtime/src/internal.ts) of PR 23332 avoids `@deprecated` for `/internal` version of `ContainerRuntime`.

```typescript
import { ContainerRuntime as ContainerRuntimeClass } from "./containerRuntime.js";
export type ContainerRuntime = ContainerRuntimeClass;
export const ContainerRuntime = ContainerRuntimeClass;
```

## Manipulating a Namespace

There is no known simple way to clone a namespace.
To clone a namespace it needs redeclared member by member.
So it may be advantageous to only resurface the minimal members when needed.
(`api-extractor` may insist in a large "internal" namespace be exposed, but for `/internal` uses only tiny number of set actually needs surfaced.)

Example: TODO - use jason-ha's pending core-interfaces reorg for Presence infrastructure

## Converting a Class to an Interface-Constructor Pair

Classes exposed outside of a package often lead to undesired maintenance burdens complicating change and evolution.
When a class does not have _protected_ members including transitive ones from `extends` specification, then an essentially type equivalent interface and new function may be substituted.

> **Warning** The replacement `interface` will not provide exact type checking protections that the original `class` afforded. If the class was not already `@sealed`, then understand if any customer may have had reason to inherit the class.

1. Add replacement exported interface using original class name.
    1. `extends` the interface by all `implements` specifications.
    1. Copy declaration of all class public members not covered by `extends` (above) into the interface.
    1. Be sure the interface is `@sealed` even if original class was not.
1. Rename the class and extend from the interface.
1. Add an exported `const` variable using original class name.
    1. Type as a union of
        1. `new` function using class constructor's parameters and returning the interface
        1. object declaration containing public static class members
    1. Assign to it the renamed class.
1. If class had any static members that had original class types and accessed private members, there will need to be a cast (`as`) to renamed class.

### Example

Before

```typescript
export interface A {
	value: number;
}

export class B implements A {
	public readonly id: string = "instanceOfB";
	private readonly shh = 98;
	public constructor(public value: number) {}
	public static readPrivate(bThis: B): number {
		return bThis.shh;
	}
}
```

After

```typescript
export interface A {
	value: number;
}

// Step 1
/** @sealed */
export interface B extends A {
	readonly id: string;
}

// Step 2
class BImpl implements B {
	public readonly id = "instanceOfB";
	private readonly shh = 98;
	public constructor(public value: number) {}
	public static readPrivate(bThis: B): number {
		return (bThis as BImpl).shh; // Step 4
	}
}

// Step 3
export const B: (new (value: number) => B) & {
	readPrivate: (bThis: B) => number;
} = BImpl;
```
