/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RestrictiveStringRecord } from "../../util/index.js";
import {
	type NodeKind,
	type TreeNodeSchemaClass,
	type ImplicitAllowedTypes,
	type WithType,
	normalizeAllowedTypes,
	isTreeNode,
} from "../core/index.js";
// These imports prevent a large number of type references in the API reports from showing up as *_2.
/* eslint-disable unused-imports/no-unused-imports, @typescript-eslint/no-unused-vars, import-x/no-duplicates */
import {
	type FieldProps,
	type FieldSchemaAlpha,
	type FieldPropsAlpha,
	type FieldKind,
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
	type FieldSchema,
	getDefaultProvider,
	createFieldSchema,
	type DefaultProvider,
} from "../fieldSchema.js";
import type { LeafSchema } from "../leafNodeSchema.js";
import {
	type ArrayNodeCustomizableSchema,
	type ArrayNodeCustomizableSchemaAlpha,
	arraySchema,
	type MapNodeCustomizableSchema,
	mapSchema,
	type ObjectNodeSchema,
	type ObjectNodeSchemaWorkaround,
	objectSchema,
	type RecordNodeCustomizableSchema,
	recordSchema,
} from "../node-kinds/index.js";
import type { SchemaType, SimpleObjectNodeSchema } from "../simpleSchema.js";
import type { SimpleLeafNodeSchema } from "../simpleSchema.js";
import { unhydratedFlexTreeFromInsertableNode } from "../unhydratedFlexTreeFromInsertable.js";

import {
	defaultSchemaFactoryObjectOptions,
	scoped,
	type NodeSchemaOptionsAlpha,
	type ObjectSchemaOptionsAlpha,
	type ScopedSchemaName,
} from "./schemaFactory.js";
import { SchemaFactoryBeta } from "./schemaFactoryBeta.js";
import { schemaStatics } from "./schemaStatics.js";
import { TreeBeta } from "./treeBeta.js";
import type {
	ArrayNodeCustomizableSchemaUnsafe,
	FieldSchemaAlphaUnsafe,
	InsertableObjectFromSchemaRecordAlphaUnsafe,
	MapNodeCustomizableSchemaUnsafe,
	System_Unsafe,
	TreeRecordNodeUnsafe,
	Unenforced,
} from "./typesUnsafe.js";
/* eslint-enable unused-imports/no-unused-imports, @typescript-eslint/no-unused-vars, import-x/no-duplicates */

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
 * Stateless APIs exposed via {@link SchemaFactoryBeta} as both instance properties and as statics.
 * @see {@link SchemaStatics} for why this is useful.
 * @system @sealed @alpha
 */
export interface SchemaStaticsAlpha {
	/**
	 * Creates a field schema with a default value. Fields with defaults (whether required or optional) are recognized by the type system as optional in constructors,
	 * allowing them to be omitted when creating new nodes.
	 *
	 * @param fieldSchema - The field schema to add a default to (e.g., `factory.required(factory.string)` or `factory.optional(factory.number)`)
	 * @param defaultValue - A {@link NodeProvider} specifying the default value.
	 *
	 * @example
	 * ```typescript
	 * const MySchema = factory.objectAlpha("MyObject", {
	 *     // Provide values directly
	 *     name: factory.withDefault(factory.required(factory.string), "untitled"),
	 *     count: factory.withDefault(factory.required(factory.number), 0),
	 *     metadata: factory.withDefault(factory.optional(Metadata), new Metadata({ version: 1 })),
	 *
	 *     // Use generator functions for dynamic values
	 *     timestamp: factory.withDefault(factory.required(factory.number), () => Date.now()),
	 *     id: factory.withDefault(factory.required(factory.string), () => crypto.randomUUID()),
	 * });
	 *
	 * const obj1 = new MySchema({}); // All defaults applied
	 * const obj2 = new MySchema({ name: "custom" }); // name="custom", other defaults applied
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
	 * {@link SchemaStaticsAlpha.withDefault} except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of {@link SchemaStaticsAlpha.withDefault} has fewer type constraints to work around TypeScript limitations, see {@link Unenforced}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
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
			insertableValue = TreeBeta.clone(insertableValue as any);
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

const schemaStaticsAlpha: SchemaStaticsAlpha = {
	withDefault,

	withDefaultRecursive: withDefault as SchemaStaticsAlpha["withDefaultRecursive"],
};

/**
 * {@link SchemaFactory} with additional alpha APIs.
 *
 * @alpha
 * @privateRemarks
 * When building schema, when `options` is not provided, `TCustomMetadata` is inferred as `unknown`.
 * If desired, this could be made to infer `undefined` instead by adding overloads for everything,
 * but currently it is not worth the maintenance overhead as there is no use case which this is known to be helpful for.
 */
export class SchemaFactoryAlpha<
	out TScope extends string | undefined = string | undefined,
	TName extends number | string = string,
> extends SchemaFactoryBeta<TScope, TName> {
	/**
	 * Define a {@link TreeNodeSchemaClass} for a {@link TreeObjectNode}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param fields - Schema for fields of the object node's schema. Defines what children can be placed under each key.
	 * @param options - Additional options for the schema.
	 */
	public objectAlpha<
		const Name extends TName,
		const T extends RestrictiveStringRecord<ImplicitFieldSchema>,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		fields: T,
		options?: ObjectSchemaOptionsAlpha<TCustomMetadata>,
	): ObjectNodeSchemaWorkaround<ScopedSchemaName<TScope, Name>, T, true, TCustomMetadata> {
		return objectSchema(scoped<TScope, TName, Name>(this, name), fields, true, {
			...defaultSchemaFactoryObjectOptions,
			...options,
		});
	}

	/**
	 * {@inheritdoc SchemaFactory.objectRecursive}
	 */
	public override objectRecursive<
		const Name extends TName,
		const T extends RestrictiveStringRecord<System_Unsafe.ImplicitFieldSchemaUnsafe>,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		t: T,
		options?: ObjectSchemaOptionsAlpha<TCustomMetadata>,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Object,
		System_Unsafe.TreeObjectNodeUnsafe<T, ScopedSchemaName<TScope, Name>>,
		object & System_Unsafe.InsertableObjectFromSchemaRecordUnsafe<T>,
		false,
		T,
		never,
		TCustomMetadata
	> &
		SimpleObjectNodeSchema<SchemaType.View, TCustomMetadata> &
		// We can't just use non generic `ObjectNodeSchema` here since "Base constructors must all have the same return type".
		// We also can't just use generic `ObjectNodeSchema` here and not `TreeNodeSchemaClass` since that doesn't work with unsafe recursive types.
		// ObjectNodeSchema<
		// 	ScopedSchemaName<TScope, Name>,
		// 	//  T & RestrictiveStringRecord<ImplicitFieldSchema> would be nice to use here, but it breaks the recursive type self references.
		// 	RestrictiveStringRecord<ImplicitFieldSchema>,
		// 	false,
		// 	TCustomMetadata
		// >
		Pick<ObjectNodeSchema, "fields"> {
		// TODO: syntax highting is vs code is broken here. Don't trust it. Use the compiler instead.
		type TScopedName = ScopedSchemaName<TScope, Name>;
		return this.objectAlpha(
			name,
			t as T & RestrictiveStringRecord<ImplicitFieldSchema>,
			options,
		) as unknown as TreeNodeSchemaClass<
			TScopedName,
			NodeKind.Object,
			System_Unsafe.TreeObjectNodeUnsafe<T, TScopedName>,
			object & System_Unsafe.InsertableObjectFromSchemaRecordUnsafe<T>,
			false,
			T,
			never,
			TCustomMetadata
		> &
			ObjectNodeSchema<
				ScopedSchemaName<TScope, Name>,
				RestrictiveStringRecord<ImplicitFieldSchema>,
				false,
				TCustomMetadata
			>;
	}

	/**
	 * Alpha version of {@link SchemaFactory.objectRecursive} that supports field defaults via {@link SchemaStaticsAlpha.withDefaultRecursive}.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * Use this instead of {@link SchemaFactory.objectRecursive} when fields use {@link SchemaStaticsAlpha.withDefaultRecursive}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 */
	public objectRecursiveAlpha<
		const Name extends TName,
		const T extends RestrictiveStringRecord<System_Unsafe.ImplicitFieldSchemaUnsafe>,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		t: T,
		options?: ObjectSchemaOptionsAlpha<TCustomMetadata>,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Object,
		System_Unsafe.TreeObjectNodeUnsafe<T, ScopedSchemaName<TScope, Name>>,
		object & InsertableObjectFromSchemaRecordAlphaUnsafe<T>,
		false,
		T,
		never,
		TCustomMetadata
	> &
		SimpleObjectNodeSchema<SchemaType.View, TCustomMetadata> &
		Pick<ObjectNodeSchema, "fields"> {
		type TScopedName = ScopedSchemaName<TScope, Name>;
		return this.objectAlpha(
			name,
			t as T & RestrictiveStringRecord<ImplicitFieldSchema>,
			options,
		) as unknown as TreeNodeSchemaClass<
			TScopedName,
			NodeKind.Object,
			System_Unsafe.TreeObjectNodeUnsafe<T, TScopedName>,
			object & InsertableObjectFromSchemaRecordAlphaUnsafe<T>,
			false,
			T,
			never,
			TCustomMetadata
		> &
			ObjectNodeSchema<
				ScopedSchemaName<TScope, Name>,
				RestrictiveStringRecord<ImplicitFieldSchema>,
				false,
				TCustomMetadata
			>;
	}

	/**
	 * {@inheritDoc SchemaStatics.leaves}
	 */
	public static override readonly leaves = schemaStatics.leaves;

	/**
	 * {@inheritDoc SchemaStatics.optional}
	 */
	public static override readonly optional = schemaStatics.optional;

	/**
	 * {@inheritDoc SchemaStatics.required}
	 */
	public static override readonly required = schemaStatics.required;

	/**
	 * {@inheritDoc SchemaStatics.optionalRecursive}
	 */
	public static override readonly optionalRecursive = schemaStatics.optionalRecursive;

	/**
	 * {@inheritDoc SchemaStatics.requiredRecursive}
	 */
	public static override readonly requiredRecursive = schemaStatics.requiredRecursive;

	/**
	 * Like {@link SchemaFactory.identifier} but static and a factory function that can be provided {@link FieldProps}.
	 */
	public static readonly identifier = schemaStatics.identifier;

	/**
	 * {@inheritDoc SchemaStatics.leaves}
	 */
	public override readonly leaves = schemaStatics.leaves;

	/**
	 * {@inheritDoc SchemaStatics.optional}
	 */
	public override readonly optional = schemaStatics.optional;

	/**
	 * {@inheritDoc SchemaStatics.required}
	 */
	public override readonly required = schemaStatics.required;

	/**
	 * {@inheritDoc SchemaStatics.optionalRecursive}
	 */
	public override readonly optionalRecursive = schemaStatics.optionalRecursive;

	/**
	 * {@inheritDoc SchemaStatics.requiredRecursive}
	 */
	public override readonly requiredRecursive = schemaStatics.requiredRecursive;

	/**
	 * {@inheritdoc SchemaStaticsAlpha.withDefault}
	 */
	public readonly withDefault = schemaStaticsAlpha.withDefault;

	/**
	 * {@inheritdoc SchemaStaticsAlpha.withDefault}
	 */
	public static readonly withDefault = schemaStaticsAlpha.withDefault;

	/**
	 * {@inheritdoc SchemaStaticsAlpha.withDefault}
	 */
	public readonly withDefaultRecursive = schemaStaticsAlpha.withDefaultRecursive;

	/**
	 * {@inheritdoc SchemaStaticsAlpha.withDefault}
	 */
	public static readonly withDefaultRecursive = schemaStaticsAlpha.withDefaultRecursive;

	/**
	 * Define a {@link TreeNodeSchema} for a {@link TreeMapNodeAlpha}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param allowedTypes - The types that may appear as values in the map.
	 * @param options - Additional options for the schema.
	 *
	 * @example
	 * ```typescript
	 * class NamedMap extends factory.map("name", factory.number, {
	 * 	metadata: { description: "A map of numbers" }
	 * }) {}
	 * ```
	 */
	public mapAlpha<
		Name extends TName,
		const T extends ImplicitAllowedTypes,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		allowedTypes: T,
		options?: NodeSchemaOptionsAlpha<TCustomMetadata>,
	): MapNodeCustomizableSchema<ScopedSchemaName<TScope, Name>, T, true, TCustomMetadata> {
		return mapSchema(
			scoped<TScope, TName, Name>(this, name),
			allowedTypes,
			true,
			true,
			options,
		);
	}

	/**
	 * {@inheritDoc SchemaFactory.objectRecursive}
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public override mapRecursive<
		Name extends TName,
		const T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
		const TCustomMetadata = unknown,
	>(name: Name, allowedTypes: T, options?: NodeSchemaOptionsAlpha<TCustomMetadata>) {
		return this.mapAlpha(
			name,
			allowedTypes as T & ImplicitAllowedTypes,
			options,
		) as unknown as MapNodeCustomizableSchemaUnsafe<
			ScopedSchemaName<TScope, Name>,
			T,
			TCustomMetadata
		>;
	}

	/**
	 * Define a {@link TreeNodeSchemaClass} for a {@link (TreeArrayNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param allowedTypes - The types that may appear in the array.
	 * @param options - Additional options for the schema.
	 *
	 * @example
	 * ```typescript
	 * class NamedArray extends factory.arrayAlpha("name", factory.number) {}
	 * ```
	 */
	public arrayAlpha<
		const Name extends TName,
		const T extends ImplicitAllowedTypes,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		allowedTypes: T,
		options?: NodeSchemaOptionsAlpha<TCustomMetadata>,
	): ArrayNodeCustomizableSchemaAlpha<
		ScopedSchemaName<TScope, Name>,
		T,
		true,
		TCustomMetadata
	> {
		return arraySchema(
			scoped<TScope, TName, Name>(this, name),
			allowedTypes,
			true,
			true,
			options ?? {},
		) as unknown as ArrayNodeCustomizableSchemaAlpha<
			ScopedSchemaName<TScope, Name>,
			T,
			true,
			TCustomMetadata
		>;
	}

	/**
	 * {@link SchemaFactory.arrayRecursive} but with support for some alpha features.
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public override arrayRecursive<
		const Name extends TName,
		const T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
		const TCustomMetadata = unknown,
	>(name: Name, allowedTypes: T, options?: NodeSchemaOptionsAlpha<TCustomMetadata>) {
		return this.arrayAlpha(
			name,
			allowedTypes as T & ImplicitAllowedTypes,
			options,
		) as unknown as ArrayNodeCustomizableSchemaUnsafe<
			ScopedSchemaName<TScope, Name>,
			T,
			TCustomMetadata
		>;
	}

	/**
	 * Define (and add to this library) a {@link TreeNodeSchemaClass} for a {@link (TreeRecordNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param allowedTypes - The types that may appear in the record.
	 * @param options - Additional options for the schema.
	 *
	 * @example
	 * ```typescript
	 * class NamedRecord extends factory.recordAlpha("name", factory.number) {}
	 * ```
	 */
	public recordAlpha<
		const Name extends TName,
		const T extends ImplicitAllowedTypes,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		allowedTypes: T,
		options?: NodeSchemaOptionsAlpha<TCustomMetadata>,
	): RecordNodeCustomizableSchema<ScopedSchemaName<TScope, Name>, T, true, TCustomMetadata> {
		return recordSchema({
			identifier: scoped<TScope, TName, Name>(this, name),
			info: allowedTypes,
			customizable: true,
			implicitlyConstructable: true,
			nodeOptions: options,
		});
	}

	/**
	 * {@link SchemaFactoryBeta.(record:2)} except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of `SchemaFactory.record` uses the same workarounds as {@link SchemaFactory.objectRecursive}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public override recordRecursive<
		Name extends TName,
		const T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
		const TCustomMetadata = unknown,
	>(name: Name, allowedTypes: T, options?: NodeSchemaOptionsAlpha<TCustomMetadata>) {
		const RecordSchema = recordSchema({
			identifier: scoped<TScope, TName, Name>(this, name),
			info: allowedTypes as T & ImplicitAllowedTypes,
			customizable: true,
			// Setting this to true seems to work ok currently, but not for other node kinds.
			// Supporting this could be fragile and might break other future changes, so it's being kept as false for now.
			implicitlyConstructable: false,
			nodeOptions: options,
		});

		return RecordSchema as TreeNodeSchemaClass<
			/* Name */ ScopedSchemaName<TScope, Name>,
			/* Kind */ NodeKind.Record,
			/* TNode */ TreeRecordNodeUnsafe<T> &
				WithType<ScopedSchemaName<TScope, Name>, NodeKind.Record>,
			/* TInsertable */ {
				// Ideally this would be
				// RestrictiveStringRecord<InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>>,
				// but doing so breaks recursive types.
				// Instead we do a less nice version:
				readonly [P in string]: System_Unsafe.InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>;
			},
			/* ImplicitlyConstructable */ false,
			/* Info */ T,
			/* TConstructorExtra */ undefined,
			/* TCustomMetadata */ TCustomMetadata
		>;
	}

	/**
	 * {@inheritDoc SchemaFactoryBeta.scopedFactory}
	 */
	public scopedFactoryAlpha<
		const T extends TName,
		TNameInner extends number | string = string,
	>(name: T): SchemaFactoryAlpha<ScopedSchemaName<TScope, T>, TNameInner> {
		return new SchemaFactoryAlpha(scoped<TScope, TName, T>(this, name));
	}
}
