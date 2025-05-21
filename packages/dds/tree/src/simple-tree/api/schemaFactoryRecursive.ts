/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RestrictiveStringRecord } from "../../util/index.js";
import type { NodeKind, TreeNodeSchema, WithType, TreeNode } from "../core/index.js";
import type { InsertableObjectFromSchemaRecord } from "../objectNode.js";
import {
	type FieldKind,
	type FieldProps,
	createFieldSchema,
	type ImplicitAllowedTypes,
	type ImplicitFieldSchema,
	type InsertableTreeNodeFromImplicitAllowedTypes,
} from "../schemaTypes.js";

import type { FieldSchemaAlphaUnsafe, System_Unsafe } from "./typesUnsafe.js";

export function createFieldSchemaUnsafe<
	Kind extends FieldKind,
	Types extends System_Unsafe.ImplicitAllowedTypesUnsafe,
	TCustomMetadata = unknown,
>(
	kind: Kind,
	allowedTypes: Types,
	props?: FieldProps<TCustomMetadata>,
): FieldSchemaAlphaUnsafe<Kind, Types, TCustomMetadata> {
	// At runtime, we still want this to be a FieldSchema instance, but we can't satisfy its extends clause, so just return it as an FieldSchemaUnsafe
	return createFieldSchema(
		kind,
		allowedTypes as ImplicitAllowedTypes & Types,
		props,
	) as FieldSchemaAlphaUnsafe<Kind, Types, TCustomMetadata>;
}

/**
 * Compile time check for validity of a recursive schema.
 * This type also serves as a central location for documenting the requirements and issues related to recursive schema.
 *
 * @example
 * ```typescript
 * class Test extends sf.arrayRecursive("Test", [() => Test]) {}
 * {
 *     type _check = ValidateRecursiveSchema<typeof Test>;
 * }
 * ```
 * @remarks
 * In this context recursive schema are defined as all {@link FieldSchema} and {@link TreeNodeSchema} schema which are part of a cycle such that walking down through each {@link TreeNodeSchemaCore.childTypes} the given starting schema can be reached again.
 * Schema referencing the recursive schema and schema they reference that are not part of a cycle are not considered recursive.
 *
 * TypeScript puts a lot of limitations on the typing of recursive schema.
 * To help avoid running into these limitations and thus getting schema that do not type check (or only type checks sometimes!),
 * {@link SchemaFactory} provides APIs (postfixed with `Recursive`) for writing recursive schema.
 * These APIs when combined with the patterns documented below should ensure that the schema provide robust type checking.
 * These special patterns (other than {@link LazyItem} forward references which are not recursion specific)
 * are not required for correct runtime behavior: they exist entirely to mitigate TypeScript type checking limitations and bugs.
 * Ideally TypeScript's type checker would be able to handle all of these cases and more, removing the need for recursive type specific guidance, rules and APIs.
 * Currently however there are open issues preventing this:
 * {@link https://github.com/microsoft/TypeScript/issues/59550 | 1},
 * {@link https://github.com/microsoft/TypeScript/issues/55832 | 2},
 * {@link https://github.com/microsoft/TypeScript/issues/55758 | 3}.
 * Note that the proposed resolution to some of these issues is for the compiler to error rather than allow the case,
 * so even if these are all resolved the recursive type workarounds may still be needed.
 *
 * # Patterns
 *
 * Below are patterns for how to use recursive schema.
 *
 * ## General Patterns
 *
 * When defining a recursive {@link TreeNodeSchema}, use the `*Recursive` {@link SchemaFactory} methods.
 * The returned class should be used as the base class for the recursive schema, which should then be passed to {@link ValidateRecursiveSchema}.
 *
 * Using {@link ValidateRecursiveSchema} will provide compile error for some of the cases of malformed schema.
 * This can be used to help mitigate the issue that recursive schema definitions are {@link Unenforced}.
 * If an issue is encountered where a mistake in a recursive schema is made which produces an invalid schema but is not rejected by this checker,
 * it should be considered a bug and this should be updated to handle that case (or have a disclaimer added to these docs that it misses that case).
 *
 * The non-recursive versions of the schema building methods will run into several issues when used recursively.
 * Consider the following example:
 *
 * ```typescript
 * const Test = sf.array(Test); // Bad
 * ```
 *
 * This has several issues:
 *
 * 1. It is a structurally named schema.
 * Structurally named schema derive their name from the names of their child types, which is not possible when the type is recursive since its name would include itself.
 * Instead a name must be explicitly provided.
 *
 * 2. The schema accesses itself before it's defined.
 * This would be a runtime error if the TypeScript compiler allowed it.
 * This can be fixed by wrapping the type in a function, which also requires explicitly listing the allowed types in an array (`[() => Test]`).
 *
 * 3. TypeScript fails to infer the recursive type and falls back to `any` with this warning or error (depending on the compiler configuration):
 * `'Test' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.ts(7022)`.
 * This issue is what the specialized recursive schema building methods fix.
 * This fix comes at a cost: to make the recursive cases work, the `extends` clauses had to be removed.
 * This means that mistakes declaring recursive schema often don't give compile errors in the schema.
 * Additionally support for implicit construction had to be disabled.
 * This means that new nested {@link Unhydrated} nodes can not be created like `new Test([[]])`.
 * Instead the nested nodes must be created explicitly using the construction like`new Test([new Test([])])`.
 *
 * 4. It is using "POJO" mode since it's not explicitly declaring a new class.
 * This means that the generated d.ts files for the schema replace recursive references with `any`, breaking use of recursive schema across compilation boundaries.
 * This is fixed by explicitly creating a class which extends the returned schema.
 *
 * All together, the fixed version looks like:
 * ```typescript
 * class Test extends sf.arrayRecursive("Test", [() => Test]) {} // Good
 * ```
 *
 * Be very careful when declaring recursive schema.
 * Due to the removed extends clauses, subtle mistakes will compile just fine but cause strange errors when the schema is used.
 *
 * For example if a reference to a schema is malformed (in this case boxed inside an object):
 *
 * ```typescript
 * class Test extends sf.arrayRecursive("Test", [() => ({ Test })]) {} // Bad
 * ```
 * This schema will still compile, and some (but not all) usages of it may look like they work correctly while other usages will produce generally unintelligible compile errors.
 * This issue can be partially mitigated using {@link ValidateRecursiveSchema}:
 *
 * ```typescript
 * class Test extends sf.arrayRecursive("Test", [() => ({ Test })]) {} // Bad
 * {
 *     type _check = ValidateRecursiveSchema<typeof Test>; // Reports compile error due to invalid schema above.
 * }
 * ```
 *
 * If your TypeScript configuration objects to this patten due to the unused local, you can use {@link allowUnused} to suppress the error:
 *
 * ```typescript
 * class Test extends sf.arrayRecursive("Test", [() => ({ Test })]) {} // Bad
 * allowUnused<ValidateRecursiveSchema<typeof Test>>(); // Reports compile error due to invalid schema above.
 * ```
 *
 * ## Object Schema
 *
 * When defining fields, if the fields is part of the recursive cycle, use the `*Recursive` {@link SchemaFactory} methods for defining the {@link FieldSchema}.
 *
 * ## Array Schema
 *
 * See {@link FixRecursiveArraySchema} for array specific details.
 *
 * @privateRemarks
 * There are probably mistakes this misses: it's hard to guess all the wrong things people will accidentally do and defend against them.
 * Hopefully over time this can grow toward being robust, at least for common mistakes.
 *
 * This check duplicates logic that ideally would be entirely decided by the actual schema building methods.
 * Therefore changes to those methods may require updating `ValidateRecursiveSchema`.
 *
 * TODO: this currently does not reject `any`, but ideally should.
 * @public
 */
export type ValidateRecursiveSchema<
	// Recursive types should always be using TreeNodeSchemaClass (not TreeNodeSchemaNonClass) as thats part of the requirements for the type to work across compilation boundaries correctly.
	T extends ValidateRecursiveSchemaTemplate<T>,
> = true;

/**
 * Validation logic used by {@link ValidateRecursiveSchema}.
 * @system @public
 */
export type ValidateRecursiveSchemaTemplate<T extends TreeNodeSchema> = TreeNodeSchema<
	// Name: This validator places no restrictions on the name other than that it's a string (as required by TreeNodeSchemaClass).
	string,
	// NodeKind: These are the NodeKinds which currently can be used recursively.
	NodeKind.Array | NodeKind.Map | NodeKind.Object,
	// TNode: The produced node API. This is pretty minimal validation: more could be added if similar to how TInsertable works below if needed.
	TreeNode & WithType<T["identifier"], T["kind"]>,
	// TInsertable: What can be passed to the constructor. This should be enough to catch most issues with incorrect schema.
	// These match whats defined in the recursive methods on `SchemaFactory` except they do not use `Unenforced`.
	{
		[NodeKind.Object]: T["info"] extends RestrictiveStringRecord<ImplicitFieldSchema>
			? InsertableObjectFromSchemaRecord<T["info"]>
			: unknown;
		[NodeKind.Array]: T["info"] extends ImplicitAllowedTypes
			? Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T["info"]>>
			: unknown;
		[NodeKind.Map]: T["info"] extends ImplicitAllowedTypes
			? Iterable<[string, InsertableTreeNodeFromImplicitAllowedTypes<T["info"]>]>
			: unknown;
		[NodeKind.Leaf]: unknown;
	}[T["kind"]],
	// ImplicitlyConstructable: recursive types are currently not implicitly constructable.
	false,
	// Info: What's passed to the method to create the schema. Constraining these here should be about as effective as if the actual constraints existed on the actual method itself.
	{
		[NodeKind.Object]: RestrictiveStringRecord<ImplicitFieldSchema>;
		[NodeKind.Array]: ImplicitAllowedTypes;
		[NodeKind.Map]: ImplicitAllowedTypes;
		[NodeKind.Leaf]: unknown;
	}[T["kind"]]
>;

/**
 * Workaround for "Type instantiation is excessively deep and possibly infinite.ts" errors.
 * @remarks
 *
 * Generally this workaround should be avoided if possible,
 * especially for exported types, as it is likely to result in issues when exporting or importing schema where the user will be forced to use the workaround as well.
 * This is particularly problematic since in some cases it may not be possible for the user to replicate the pattern.
 * Additionally, which cases hit these limits may vary based on TypeScript version and implementation details of this library.
 *
 * This workaround is provided and documented as a last resort to be able to keep an app compiling.
 * Future version of SharedTree should provide schema type erasure functionality as a better alternative for most cases.
 *
 * When TypeScript gives the error "Error (TS2589) Type instantiation is excessively deep and possibly infinite." on the invocation of `ValidateRecursiveSchema`
 * for a large schema, it can sometimes be worked around by repeating the usage of the type multiple times.
 * This works because the TypeScript compiler caches some of the intermediate results from the first usage, and thus can get further on the second.
 *
 * This utility can be referenced when applying this pattern.
 * For recursive types this can be used directly:
 *
 * ```typescript
 * {
 *     // @ts-expect-error Recursion limit
 *     type _check1 = FixRecursiveRecursionLimit<typeof LargeType>;
 *     type _check2 = FixRecursiveRecursionLimit<typeof LargeType>;
 *     type _check3 = ValidateRecursiveSchemaTemplate<typeof LargeType>;
 * }
 * ```
 *
 * For non-recursive types, they can be ported to the more flexible recursive APIs and use the pattern above.
 *
 * Non-recursive types can also use this workaround by making a duplicate copy of the problematic schema written using the recursive APIs.
 * Then this pattern can be applied to the duplicate copy.
 *
 * ```typescript
 * // Workaround TypeScript recursion limit
 * 	{
 * 		class LargeUnionObjectNode_Fix extends schema.objectRecursive("ObjectNode", {
 * 			x: largeUnion,
 * 		}) {}
 *
 * 		// @ts-expect-error Recursion limit
 * 		allowUnused<FixRecursiveRecursionLimit<typeof LargeUnionObjectNode_Fix>>();
 * 		allowUnused<FixRecursiveRecursionLimit<typeof LargeUnionObjectNode_Fix>>();
 * 		allowUnused<ValidateRecursiveSchema<typeof LargeUnionObjectNode_Fix>>();
 * 		}
 *
 * 	// Fails to compile without the above workaround.
 * 	class LargeUnionObjectNode extends schema.object("ObjectNode", { x: largeUnion }) {}
 * ```
 * @privateRemarks
 * Using this is real sketchy, and leads to a lot of issues (errors which depend on how the schema is compiled, making different build setups produce different results and complicating exports).
 * This is being kept as internal for now: if a customer really needs it, we have this as a documented workaround, but it would be much better to find an alternative solution before using this one.
 * This uses ValidateRecursiveSchemaTemplate since it was found to evaluate enough of the type to work.
 * @internal
 */
export type FixRecursiveRecursionLimit<T extends TreeNodeSchema> =
	T extends ValidateRecursiveSchemaTemplate<T> ? undefined : undefined;

/**
 * Does nothing with the provided value, but appears to use it to make unused locals warnings and errors go away.
 *
 * @remarks
 * When TypeScript is configured with "noUnusedLocals", it will produce an error if a local variable is declared but never used.
 * When you want to have this check enabled, but not follow it for a specific variable, you can pass the type or value to this function.
 *
 * Instead of using this, consider disabling "noUnusedLocals" in your tsconfig.json file, and enabling a similar check via a linter.
 * This will allow you to still have the check, but have more control over it, for example being able to suppress it, or enable patterns like allowing unused locals with an "_" prefix.
 * @alpha
 */
export function allowUnused<T>(t?: T): void {}

/**
 * Workaround for fixing errors resulting from an issue with recursive ArrayNode schema exports.
 * @remarks
 * Importing a recursive ArrayNode schema via a d.ts file can produce an error like
 * `error TS2310: Type 'RecursiveArray' recursively references itself as a base type.`
 * if using a tsconfig with `"skipLibCheck": false`.
 *
 * This error occurs due to the TypeScript compiler splitting the class definition into two separate declarations in the d.ts file (one for the base, and one for the actual class).
 * For unknown reasons, splitting the class declaration in this way breaks the recursive type handling, leading to the mentioned error.
 *
 * This type always evaluates to `undefined` to ensure the dummy export (which doesn't exist at runtime) is typed correctly.
 *
 * {@link https://github.com/microsoft/TypeScript/issues/59550|TypeScript Issue 59550} tracks a suggestion which would make this workaround unnecessary.
 *
 * @example Usage
 * Since recursive type handling in TypeScript is order dependent, putting just the right kind of usages of the type before the declarations can cause it to not hit this error.
 * For the case of ArrayNodes, this can be done via usage that looks like this:
 *
 * This example should use a doc comment to ensure the workaround comment shows up in the intellisense for the dummy export,
 * however doing so is impossible due to how this example is included in a doc comment.
 * ```typescript
 *  // Workaround to avoid
 *  // `error TS2310: Type 'RecursiveArray' recursively references itself as a base type.` in the d.ts file.
 * export declare type _RecursiveArrayWorkaround = FixRecursiveArraySchema<typeof RecursiveArray>;
 * export class RecursiveArray extends schema.arrayRecursive("RA", [() => RecursiveArray]) {}
 * {
 * 	type _check = ValidateRecursiveSchema<typeof RecursiveArray>;
 * }
 * ```
 *
 * @alpha
 */
export type FixRecursiveArraySchema<T> = T extends TreeNodeSchema ? undefined : undefined;
