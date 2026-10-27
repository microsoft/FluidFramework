/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ImplicitAllowedTypes,
	normalizeAllowedTypes,
	isTreeNode,
	createSchemaUpgrade,
} from "../core/index.js";
import {
	type FieldSchemaAlpha,
	type FieldPropsAlpha,
	FieldKind,
	type InsertableTreeFieldFromImplicitField,
	type FieldSchema,
	getDefaultProvider,
	createFieldSchema,
	type DefaultProvider,
} from "../fieldSchema.js";
import { unhydratedFlexTreeFromInsertableNode } from "../unhydratedFlexTreeFromInsertable.js";

import { cloneTree } from "./cloneTree.js";
import type { FieldSchemaAlphaUnsafe, System_Unsafe, Unenforced } from "./typesUnsafe.js";

/**
 * A provider for values in tree nodes.
 *
 * @remarks
 * This type represents two ways to provide node values:
 *
 * 1. **A value**: Provide any value directly (number, string, object, array, etc.). When a value is provided,
 * the data is copied for each use to ensure independence between instances. The value must be of an allowed type for the field.
 *
 * 2. **A generator function**: A function that returns a value. The function is called each time a default is needed,
 * allowing for dynamic defaults or explicit control over value creation. The return value must be of an allowed type for the field.
 *
 * Values should be preferred over generator functions when possible, as they are simpler and more efficient.
 * Generator functions should be used when the default value needs to be dynamic or when it is not possible to provide a value directly.
 *
 * See {@link SchemaStaticsAlpha.withDefault} for the primary API that uses this type.
 *
 * @example
 * ```typescript
 * // Provide a value directly
 * factory.withDefault(factory.required(factory.string), "default")
 * factory.withDefault(factory.optional(Person), new Person({ name: "Guest" }))
 *
 * // Use a generator function
 * factory.withDefault(factory.required(factory.string), () => crypto.randomUUID())
 * factory.withDefault(factory.optional(Person), () => new Person({ name: "Guest" }))
 * ```
 *
 * @alpha @sealed
 */
export type NodeProvider<T> = T | (() => T);

/**
 * Stateless APIs exposed via {@link SchemaFactoryAlpha} as both instance properties and as statics.
 * @see {@link SchemaStatics} for why this is useful.
 * @system @sealed @alpha
 */
export interface SchemaStaticsAlpha {
	/**
	 * Creates a field schema with a default value.
	 *
	 * @remarks
	 * Fields with defaults are optional in constructors, allowing them to be omitted when creating new nodes.
	 * This works with both {@link SchemaStatics.required | required} and {@link SchemaStatics.optional | optional} fields:
	 *
	 * - **Required fields with defaults**: The field is always present in the tree, but can be omitted from the constructor.
	 * The default value is used when the field is not provided.
	 *
	 * - **Optional fields with defaults**: Optional fields already default to `undefined`, but `withDefault` lets you
	 * specify a different default value.
	 *
	 * The default value can be provided in two ways (see {@link NodeProvider}):
	 *
	 * 1. **A value**: The value is deep-copied for each use, ensuring independence between instances.
	 * Prefer this when the default is a fixed value.
	 *
	 * 2. **A generator function**: A function called each time a default is needed. Use this for dynamic defaults
	 * (e.g., timestamps, UUIDs) or when explicit control over value creation is required.
	 *
	 * Defaults are evaluated eagerly during node construction.
	 *
	 * For recursive schemas, use {@link SchemaStaticsAlpha.withDefaultRecursive} instead.
	 *
	 * See the {@link https://fluidframework.com/docs/data-structures/tree/schema-definition/default-field-values | Default Field Values documentation}
	 * for a comprehensive guide with additional examples.
	 *
	 * @param fieldSchema - The field schema to add a default to (e.g., `factory.required(factory.string)` or `factory.optional(factory.number)`)
	 * @param defaultValue - A {@link NodeProvider} specifying the default value.
	 *
	 * @example
	 * A schema with a mix of required, defaulted, and dynamic fields:
	 * ```typescript
	 * const factory = new SchemaFactoryAlpha("example");
	 *
	 * class Task extends factory.objectAlpha("Task", {
	 *     // No default — must always be provided in the constructor
	 *     title: factory.required(factory.string),
	 *
	 *     // Required field with a static default
	 *     status: factory.withDefault(factory.required(factory.string), "todo"),
	 *
	 *     // Optional field with a custom default (instead of `undefined`)
	 *     priority: factory.withDefault(factory.optional(factory.number), 0),
	 *
	 *     // Dynamic default using a generator function
	 *     createdAt: factory.withDefault(factory.required(factory.number), () => Date.now()),
	 * }) {}
	 *
	 * // Only `title` is required in the constructor; the rest use their defaults
	 * const task = new Task({ title: "Write docs" });
	 * // task.status === "todo"
	 * // task.priority === 0
	 * // task.createdAt is set to the current timestamp
	 *
	 * // Defaults can be overridden by providing explicit values
	 * const urgentTask = new Task({ title: "Fix bug", status: "in-progress", priority: 1 });
	 * ```
	 *
	 * @privateRemarks
	 * This function wraps an existing field schema and adds a default value provider to it.
	 * The default value will be used when constructing nodes if the field is not explicitly provided or set to `undefined`.
	 *
	 * Defaults are evaluated eagerly during node construction, unlike identifier defaults which require context.
	 */
	readonly withDefault: <
		Kind extends FieldKind,
		Types extends ImplicitAllowedTypes,
		TCustomMetadata = unknown,
	>(
		fieldSchema: FieldSchema<Kind, Types, TCustomMetadata>,
		defaultValue: NodeProvider<InsertableTreeFieldFromImplicitField<FieldSchema<Kind, Types>>>,
	) => FieldSchemaAlpha<
		Kind,
		Types,
		TCustomMetadata,
		FieldPropsAlpha<TCustomMetadata> & { defaultProvider: DefaultProvider }
	>;
	/**
	 * Creates a field schema that is Optional in the view but behaves as Required in the stored schema
	 * during the rollout period of an optional-field migration.
	 *
	 * @remarks
	 * Use this to incrementally migrate a required field to optional without a coordinated deployment.
	 * The migration path is:
	 *
	 * 1. Start with `sf.required(T)` — all clients require the field.
	 * 2. Deploy `sf.stagedOptional(T)` — new clients can read documents where the field is present or absent, but the stored schema stays Required (so old clients are unaffected). Setting the field to `undefined` is rejected because the stored schema still declares the field as required.
	 * 3. Deploy `sf.optional(T)` once all clients support the staged optional field — the stored schema becomes Optional and the field can be cleared.
	 *
	 * Analogous to {@link SchemaStaticsBeta.staged} for allowed types, but for field optionality.
	 *
	 * @param t - The types allowed under the field.
	 * @param props - Optional properties to associate with the field.
	 *
	 * @typeParam TCustomMetadata - Custom metadata properties to associate with the field.
	 * See {@link FieldSchemaMetadata.custom}.
	 */
	readonly stagedOptional: <
		const T extends ImplicitAllowedTypes,
		const TCustomMetadata = unknown,
	>(
		t: T,
		props?: Omit<
			FieldPropsAlpha<TCustomMetadata>,
			"defaultProvider" | "stagedOptionalUpgrade"
		>,
	) => FieldSchemaAlpha<
		FieldKind.Optional,
		T,
		TCustomMetadata,
		FieldPropsAlpha<TCustomMetadata>
	>;
	/**
	 * {@link SchemaStaticsAlpha.stagedOptional} except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of {@link SchemaStaticsAlpha.stagedOptional} has fewer type constraints to work around TypeScript limitations, see {@link Unenforced}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 */
	readonly stagedOptionalRecursive: <
		const T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
		const TCustomMetadata = unknown,
	>(
		t: T,
		props?: Omit<
			FieldPropsAlpha<TCustomMetadata>,
			"defaultProvider" | "stagedOptionalUpgrade"
		>,
	) => FieldSchemaAlphaUnsafe<
		FieldKind.Optional,
		T,
		TCustomMetadata,
		FieldPropsAlpha<TCustomMetadata>
	>;

	/**
	 * {@link SchemaStaticsAlpha.withDefault} except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of {@link SchemaStaticsAlpha.withDefault} has fewer type constraints to work around TypeScript limitations, see {@link Unenforced}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 *
	 * See the {@link https://fluidframework.com/docs/data-structures/tree/schema-definition/default-field-values#recursive-types | Default Field Values — Recursive Types documentation}
	 * for usage examples and guidance on avoiding infinite recursion with recursive defaults.
	 */
	withDefaultRecursive: <
		Kind extends FieldKind,
		Types extends System_Unsafe.ImplicitAllowedTypesUnsafe,
		TCustomMetadata = unknown,
	>(
		fieldSchema: System_Unsafe.FieldSchemaUnsafe<Kind, Types, TCustomMetadata>,
		defaultValue: Unenforced<
			NodeProvider<
				System_Unsafe.InsertableTreeFieldFromImplicitFieldUnsafe<
					System_Unsafe.FieldSchemaUnsafe<Kind, Types>
				>
			>
		>,
	) => FieldSchemaAlphaUnsafe<
		Kind,
		Types,
		TCustomMetadata,
		FieldPropsAlpha<TCustomMetadata> & { defaultProvider: DefaultProvider }
	>;
}

const withDefault = <
	Kind extends FieldKind,
	Types extends ImplicitAllowedTypes,
	TCustomMetadata = unknown,
>(
	fieldSchema: FieldSchema<Kind, Types, TCustomMetadata>,
	defaultValue: NodeProvider<InsertableTreeFieldFromImplicitField<FieldSchema<Kind, Types>>>,
): FieldSchemaAlpha<
	Kind,
	Types,
	TCustomMetadata,
	FieldPropsAlpha<TCustomMetadata> & { defaultProvider: DefaultProvider }
> => {
	const typedFieldSchema = fieldSchema as FieldSchemaAlpha<Kind, Types, TCustomMetadata>;

	// create the default provider function, it is called eagerly during node construction
	const defaultProvider = getDefaultProvider(() => {
		// Resolve the value: if it's a function, call it; otherwise use it directly
		let insertableValue =
			typeof defaultValue === "function" ? (defaultValue as () => unknown)() : defaultValue;

		// If the value is an already-constructed TreeNode (e.g., from a generator function that
		// returns the same instance repeatedly), clone it to ensure each use gets a fresh instance.
		// This prevents multi-parenting errors.
		if (isTreeNode(insertableValue)) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			insertableValue = cloneTree(insertableValue as any);
		}

		// For optional fields with an undefined default, return an empty array (no value).
		if (insertableValue === undefined) {
			return [];
		}

		// Convert the insertable value to an unhydrated flex tree.
		// For insertable data, this creates a fresh tree structure.
		const allowedTypeSet = normalizeAllowedTypes(typedFieldSchema.allowedTypes).evaluateSet();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return [unhydratedFlexTreeFromInsertableNode(insertableValue as any, allowedTypeSet)];
	});

	// create a new field schema with the default provider
	const propsWithDefault = {
		...typedFieldSchema.props,
		defaultProvider,
	};

	return createFieldSchema(
		typedFieldSchema.kind,
		typedFieldSchema.allowedTypes,
		propsWithDefault,
	);
};

const stagedOptional = <const T extends ImplicitAllowedTypes, const TCustomMetadata = unknown>(
	t: T,
	props?: Omit<FieldPropsAlpha<TCustomMetadata>, "defaultProvider" | "stagedOptionalUpgrade">,
): FieldSchemaAlpha<
	FieldKind.Optional,
	T,
	TCustomMetadata,
	FieldPropsAlpha<TCustomMetadata>
> => {
	return createFieldSchema(FieldKind.Optional, t, {
		defaultProvider: getDefaultProvider(() => []),
		...props,
		stagedOptionalUpgrade: createSchemaUpgrade(),
	});
};

export const schemaStaticsAlpha: SchemaStaticsAlpha = {
	withDefault,
	withDefaultRecursive: withDefault as SchemaStaticsAlpha["withDefaultRecursive"],
	stagedOptional,
	stagedOptionalRecursive: stagedOptional as SchemaStaticsAlpha["stagedOptionalRecursive"],
};
