# Isolated declarations

This document covers TypeScript's `isolatedDeclarations` option, its use in optimizing large TypeScript builds, and the complications that arise in such setups when using SharedTree schema.

The approaches described in this document can be applied to other TypeScript types that are problematic for use with `isolatedDeclarations`: only some minor details are actually specific to SharedTree schema.

## TypeScript background

Official documentation for [TypeScript's isolatedDeclarations](https://www.typescriptlang.org/tsconfig/#isolatedDeclarations).

Added in TypeScript 5.5: [TypeScript: Documentation - TypeScript 5.5](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html#isolated-declarations).

Important for this document is that `isolatedDeclarations` requires that the types of all exported values be determinable without reading any imported files or parsing expressions.
Specifically, type inference cannot depend on the types of expressions or contents of other files (beyond referring to types imported from them).
This means that:

- It's possible to emit a `.d.ts` file as a pure function of the input file, without reading any other imported files.
- The logic needed to do this `.d.ts` emission is relatively simple and practical to implement in third-party tools.

This means it's possible for a build system to compile all required `.d.ts` files in parallel, without any need to respect dependency order between projects.
Once that is done, all the projects can be type checked in parallel.

This prevents the dependency graph from delaying parts of the build, and can greatly speed up builds with long project dependency chains.

One way to do the first pass (which generates `.d.ts` files) is with the TypeScript compiler, using the following options (requiring at least TypeScript 5.6 for these specific options):

```jsonc
{
	"compilerOptions": {
		// Enable `.d.ts` generation.
		"declaration": true,
		// Skip JavaScript emissions: it can be done later.
		"emitDeclarationOnly": true,
		// Skip type checking: this is done in the second pass instead.
		"noCheck": true,

		// Optional: Limit TypeScript to handling simple cases which other tools could also handle.
		// If compatible with this option,
		// typically a faster tool than the TypeScript compiler (like oxc) would be used.
		// If using such a tool, only the second pass would use the TypeScript compiler,
		// and it would use this option instead.
		"isolatedDeclarations": true,

		// Optional: Omit `@internal` APIs from `.d.ts` files.
		"stripInternal": true,
		// ... Your project will require additional project specific options
	}
}
```

The second pass can then run full type checking (with `noEmit` if using a separate operation to emit the JavaScript files).

Such builds can further be sped up by using a faster third-party tool for the first pass like [oxc's isolatedDeclaration API](https://oxc.rs/docs/guide/usage/transformer/isolated-declarations.html).

## SharedTree schema background

For SharedTree, we require both runtime and compile-time types for schema, and want an easy way to derive the runtime and compile-time types for the TreeNodes from those.

TypeScript provides a few ways to declare both at once without having to repeat it in the code (once as an expression, and once as a type).

- Using the type of an expression, and its value.
- Using a specific language feature that does both at once, like `class` or `enum`

SharedTree schema use both of these tools together, using `class`. In this example, consider a class named `Foo`:

- The class `Foo` is the schema:
  - The expression `Foo` is the schema.
  When the user needs to refer to a node type at runtime, they use the schema to do so.
  - The type of the schema is `typeof Foo`: this is usually inferred when passing the schema into something, but occasionally explicitly stated.
- The type `Foo` is the node:
  - The type named `Foo` is the node type, avoiding the need to add an extra declaration.
  - This type comes from the non-static members of the class/schema `Foo`, and can be extended with additional class members to express type and runtime data together.

To support recursive schema, schema are occasionally referenced as `() => Foo` to allow forward references.

To avoid limitations in TypeScript `.d.ts` emission for recursive schema — and to get better IntelliSense and error messages — schema must use explicitly named types (like a class or interface) rather than simple `type` declarations.

The portion of the class that directly works with the underlying tree content is generated via `SchemaFactory` so we can control the API for building it and intercept all access to data as needed.
This also allows common functionality to be shared across all schema classes (such as static implementations of the various schema interfaces for schema reflection, and centralized control of schema scopes and other settings).

## `isolatedDeclarations` and tree schema

`isolatedDeclarations` bans exporting values whose types depend on the types of expressions.

This includes base classes when the base class expression is not simply a single identifier referring to a value with an explicit type.

Thus when both runtime and compile-time data are needed about something, the trick of using an expression and its type is no longer valid.

### Recommended approach:

This assumes the tooling in question is already:

- building a monorepo or large collection of TypeScript projects (often one package per project, but this is not a requirement).
- using `isolatedDeclarations`.
- having a separate "emit" phase (for emitting `.d.ts` files) and "type check" phase of the TypeScript build.
- running all projects' "emit" phase in parallel.
- wanting to use SharedTree schema in a way that makes it hard to keep this setup.

To add SharedTree schema to such a setup:

- Factor your code to minimize the need to export schema from both files and projects.
- For schema that are file-exported but not project-exported, mark them as `@internal` and use `stripInternal`.
  - If inconsistent tagging becomes a problem (package-exported types accidentally referencing tagged types causing type errors that are hard to diagnose), use API Extractor as a linter to validate tagging is done consistently.
- For projects that still export schema, pick one of:
    1. Simplify the exported types as much as is practical, including using tools like `eraseSchemaDetails`, and specify the simplified types explicitly.
       (Recommended if this is easy to do)
    2. Remove `isolatedDeclarations`, and do the `.d.ts` emission using the TypeScript compiler, keeping the separate emit and type-check passes.
       This might require delaying this emission until some or all of the dependencies of the project have had their types emitted.
       This does not require any new dependencies for the full type-checking phase (that can still be fully parallel), nor delaying `.d.ts` emission for projects that reference this one (assuming they still use `isolatedDeclarations`).
       If picking this option, you likely also want to refactor the code to minimize the size and dependencies of the impacted package.
       (Recommended when option 1 isn't straightforward, and the project in question isn't exceptionally slow to emit `.d.ts` files using TypeScript using the options listed at the top of this document)
    3. Explicitly pre-generate the `.d.ts` files.
       As a last resort (other than disabling the optimized build setup), the `.d.ts` files can be generated the same as the above option. However, instead of generating them during the emit phase, generate them with a separate command and commit them to the repo. During the type check phase of the build, error if they are out of date.
       (Recommended when the above options (1 and 2) are not suitable)

### Mitigations:

An exhaustive list of things that can be done to mitigate issues related to use of SharedTree schema with `isolatedDeclarations`.
The recommendations above use a subset of these approaches.

1. Reduce the pain of having to restate types from expressions:
    - Add types that mirror the runtime APIs, making it practical (and supported — no `@system` types or unnamable types) to express any type explicitly without relying on inferred expression types. SharedTree tries to provide such types, but more may be helpful.
    - Export fewer types:
        - Put the code that uses a schema in the same file as the schema (often inside its class as an implementation of an interface for that class)
        - Type-erase the complex types (which include the actual shared tree fields and similar) before exporting them. See `eraseSchemaDetails()`
        - If applying mitigation 2 (below), the relevant scopes for minimizing exports change accordingly.
2. Reduce where the rules of `isolatedDeclarations` apply:
    - Split up packages or add more tsconfig files within them to allow finer-grained scoping of this option.
    - If the goal of using `isolatedDeclarations` is to reduce the critical path for type checking packages, then realistically this restriction only needs to apply to types transitively reachable from package exports, not all module exports. Some ways to achieve this:
        - Use `stripInternal`, then mark offending non-package-exported APIs with `@internal`. Optionally use [API Extractor](https://api-extractor.com/) to ensure types reachable from the non-`@internal` types are not tagged `@internal`.
        - Get TypeScript to add such an option. It would be nice if TypeScript had a way to restrict the `.d.ts` emission it does to only things reachable from an entry point (or set of entry points) or (as an alternative feature) limit it to types directly in some entry point (and error for referenced types not included in that entry point). If TypeScript had such a feature, it would help with lots of things and would pair well with an option for only applying `isolatedDeclarations` restrictions to types that are included in the entry points. We would also need to confirm the third-party tool being used to generate the `.d.ts` file also could work in these cases.
        - Use a tool other than TypeScript to enforce `isolatedDeclarations` in a way that reflects your actual needs. For example, whatever tool is actually generating package `.d.ts` files, ensure it does not object to code that violates this rule if it's not package-exported (similar to above), then use that tool itself to enforce the code will work for it rather than also having TypeScript enforce it. Might pair well with a lint rule to flag incompatible exported types (which could be suppressed for non-package-exported ones).

### Solutions:

An exhaustive list of things that can be done to fix issues related to use of SharedTree schema with `isolatedDeclarations`.
The recommendations above use a subset of these approaches.

- Don't use `isolatedDeclarations` for the tsconfigs that contain files that export schema.
  - This could be parts of packages, or whole packages. Applying this to portions of packages that contain no package-exported types might handle some use cases well.
  - You can still do a two-pass build, with the first pass just emitting `.d.ts` files. For projects exporting SharedTree schema, do this using TypeScript instead of a third-party tool, and ensure that the dependencies of these projects have their types emitted first (in dependency order). The second type-checking pass can still be fully parallel.
- Handwrite all those types, duplicating the data expressed in the expressions (ideally paired with the above mitigations to make this less painful).
- Use a code generator to produce the needed types. The TypeScript compiler with `emitDeclarationOnly` is such a tool.
  - This can replace the non-TypeScript tool previously used to emit `.d.ts` files for these cases.
  - This could generate code that is used by whatever tool would process the TypeScript to emit the `.d.ts`, instead of the developer-written source files.
  - The files emitted could either be generated as needed (possibly slowing down the processing of dependencies), committed as part of the code (similar to if they were handwritten), or published alongside the code through some other mechanism (like via a package that contains them already generated, as is normal for TypeScript packages).
- Replace SharedTree's schema language with one that avoids this problem by expressing everything as class members directly without any typed expressions or expression-based inheritance (this would likely be a mess, with many limitations and poor error reporting, but is technically possible).
