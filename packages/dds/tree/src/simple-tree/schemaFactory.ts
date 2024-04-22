/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { TreeValue } from "../core/index.js";
import {
	FlexTreeNode,
	Unenforced,
	isFlexTreeNode,
	isLazy,
	markEager,
} from "../feature-libraries/index.js";
import { RestrictiveReadonlyRecord, getOrCreate, isReadonlyArray } from "../util/index.js";

import {
	booleanSchema,
	handleSchema,
	nullSchema,
	numberSchema,
	stringSchema,
} from "./leafNodeSchema.js";
import { isTreeNode } from "./proxies.js";
import { tryGetSimpleNodeSchema } from "./schemaCaching.js";
import {
	FieldKind,
	FieldSchema,
	ImplicitAllowedTypes,
	ImplicitFieldSchema,
	InsertableTreeNodeFromImplicitAllowedTypes,
	NodeKind,
	TreeNodeSchema,
	TreeNodeSchemaClass,
	WithType,
	type,
	type FieldProps,
	createFieldSchema,
} from "./schemaTypes.js";
import { TreeArrayNode, arraySchema } from "./arrayNode.js";
import { TreeNode } from "./types.js";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import { InsertableObjectFromSchemaRecord, TreeObjectNode, objectSchema } from "./objectNode.js";
import { TreeMapNode, mapSchema } from "./mapNode.js";
import {
	InsertableObjectFromSchemaRecordUnsafe,
	InsertableTreeNodeFromImplicitAllowedTypesUnsafe,
	TreeArrayNodeUnsafe,
	TreeMapNodeUnsafe,
	TreeObjectNodeUnsafe,
} from "./typesUnsafe.js";
import { createFieldSchemaUnsafe } from "./schemaFactoryRecursive.js";

/**
 * Gets the leaf domain schema compatible with a given {@link TreeValue}.
 */
export function schemaFromValue(value: TreeValue): TreeNodeSchema {
	switch (typeof value) {
		case "boolean":
			return booleanSchema;
		case "number":
			return numberSchema;
		case "string":
			return stringSchema;
		case "object": {
			if (value === null) {
				return nullSchema;
			}
			assert(isFluidHandle(value), 0x87e /* invalid TreeValue */);
			return handleSchema;
		}
		default:
			unreachableCase(value);
	}
}

/**
 * The name of a schema produced by {@link SchemaFactory}, including its optional scope prefix.
 *
 * @public
 */
export type ScopedSchemaName<
	TScope extends string | undefined,
	TName extends number | string,
> = TScope extends undefined ? `${TName}` : `${TScope}.${TName}`;
// > = `${TScope extends undefined ? "" : `${TScope}.`}${TName}`;

// TODO:
// SchemaFactory.array references should link to the correct overloads, however the syntax for this does not seems to work currently for methods unless the they are not qualified with the class.
// API-Extractor requires such links to be qualified with the class, so it can't work.
// Since linking the overload set as a whole also doesn't work, these have been made non-links for now.
/**
 * Creates various types of {@link TreeNodeSchema|schema} for {@link TreeNode}s.
 *
 * @typeParam TScope - Scope added as a prefix to the name of every schema produced by this factory.
 * @typeParam TName - Type of names used to identify each schema produced in this factory.
 * Typically this is just `string` but it is also possible to use `string` or `number` based enums if you prefer to identify your types that way.
 *
 * @remarks
 * All schema produced by this factory get a {@link TreeNodeSchemaCore.identifier|unique identifier} by {@link ScopedSchemaName|combining} the {@link SchemaFactory.scope} with the schema's `Name`.
 * The `Name` part may be explicitly provided as a parameter, or inferred as a structural combination of the provided types.
 * The APIs which use this second approach, structural naming, also deduplicate all equivalent calls.
 * Therefor two calls to `array(allowedTypes)` with the same allowedTypes will return the same {@link TreeNodeSchema} instance.
 * On the other hand, two calls to `array(name, allowedTypes)` will always return different {@link TreeNodeSchema} instances
 * and it is an error to use both in the same tree (since their identifiers are not unique).
 *
 * Note:
 * POJO stands for Plain Old JavaScript Object.
 * This means an object that works like a `{}` style object literal.
 * In this case it means the prototype is `Object.prototype` and acts like a set of key value pairs (data, not methods).
 * The usage below generalizes this to include array and map like objects as well.
 *
 * There are two ways to use these APIs:
 * |                     | Customizable | POJO Emulation |
 * | ------------------- | ------------ |--------------- |
 * | Declaration         | `class X extends schemaFactory.object("x", {}) {}` | `const X = schemaFactory.object("x", {}); type X = NodeFromSchema<typeof X>; `
 * | Allows adding "local" (non-persisted) members | Yes. Members (including methods) can be added to class.        | No. Attempting to set non-field members will error. |
 * | Prototype | The user defined class | `Object.prototype`, `Map.prototype` or `Array.prototype` depending on node kind |
 * | Structurally named Schema | Not Supported | Supported |
 * | Explicitly named Objects | Supported | Supported |
 * | Explicitly named Maps and Arrays | Supported: Both declaration approaches can be used | Not Supported |
 * | node.js assert.deepEqual | Compares like class instances: equal to other nodes of the same type with the same content, including custom local fields. | Compares like plain objects: equal to plain JavaScript objects with the same fields, and other nodes with the same fields, even if the types are different. |
 * | IntelliSense | Shows and links to user defined class by name: `X` | Shows internal type generation logic: `object & TreeNode & ObjectFromSchemaRecord<{}> & WithType<"test.x">` |
 * | Recursion | Supported with special declaration patterns. | Unsupported: Generated d.ts files replace recursive references with `any`, breaking use of recursive schema across compilation boundaries |
 *
 * Note that while "POJO Emulation" nodes act a lot like POJO objects, they are not true POJO objects:
 *
 * - Adding new arbitrary fields will error, as well some cases of invalid edits.
 *
 * - They are implemented using proxies.
 *
 * - They have state that is not exposed via enumerable own properties, including a {@link TreeNodeSchema}.
 * This makes libraries like node.js `assert.deepEqual` fail to detect differences in type.
 *
 * - Assigning members has side effects (in this case editing the persisted/shared tree).
 *
 * - Not all operations implied by the prototype will work correctly: stick to the APIs explicitly declared in the TypeScript types.
 *
 * @privateRemarks
 * It's perfectly possible to make `POJO Emulation` mode (or even just hiding the prototype) selectable even when using the custom user class declaration syntax.
 * When doing this, it's still possible to make `instanceof` perform correctly.
 * Allowing (or banning) custom/out-of-schema properties on the class is also possible in both modes: it could be orthogonal.
 * Also for consistency, if keeping the current approach to detecting `POJO Emulation` mode it might make sense to make explicitly named Maps and Arrays do the detection the same as how object does it.
 *
 * @sealed @public
 */
export class SchemaFactory<
	out TScope extends string | undefined = string | undefined,
	TName extends number | string = string,
> {
	private readonly structuralTypes: Map<string, TreeNodeSchema> = new Map();

	/**
	 * @param scope - Prefix appended to the identifiers of all {@link TreeNodeSchema} produced by this builder.
	 * Use of [Reverse domain name notation](https://en.wikipedia.org/wiki/Reverse_domain_name_notation) or a UUIDv4 is recommended to avoid collisions.
	 * You may opt out of using a scope by passing `undefined`, but note that this increases the risk of collisions.
	 */
	public constructor(public readonly scope: TScope) {}

	private scoped<Name extends TName | string>(name: Name): ScopedSchemaName<TScope, Name> {
		return (this.scope === undefined ? `${name}` : `${this.scope}.${name}`) as ScopedSchemaName<
			TScope,
			Name
		>;
	}

	/**
	 * {@link TreeNodeSchema} for holding a JavaScript `string`.
	 *
	 * @remarks
	 * Strings containing unpaired UTF-16 surrogate pair code units may not be handled correctly.
	 *
	 * These limitations come from the use of UTF-8 encoding of the strings, which requires them to be valid unicode.
	 * JavaScript does not make this requirement for its strings so not all possible JavaScript strings are supported.
	 * @privateRemarks
	 * TODO:
	 * We should be much more clear about what happens if you use problematic values.
	 * We should validate and/or normalize them when inserting content.
	 */
	public readonly string = stringSchema;

	/**
	 * {@link TreeNodeSchema} for holding a JavaScript `number`.
	 *
	 * @remarks
	 * The number is a [double-precision 64-bit binary format IEEE 754](https://en.wikipedia.org/wiki/Double-precision_floating-point_format) value, however there are some exceptions:
	 * - `NaN`, and the infinities are converted to `null` (and may therefore only be used where `null` is allowed by the schema).
	 * - `-0` may be converted to `0` in some cases.
	 *
	 * These limitations match the limitations of JSON.
	 * @privateRemarks
	 * TODO:
	 * We should be much more clear about what happens if you use problematic values.
	 * We should validate and/or normalize them when inserting content.
	 */
	public readonly number = numberSchema;

	/**
	 * {@link TreeNodeSchema} for holding a boolean.
	 */
	public readonly boolean = booleanSchema;

	/**
	 * {@link TreeNodeSchema} for JavaScript `null`.
	 *
	 * @remarks
	 * There are good [reasons to avoid using null](https://www.npmjs.com/package/%40rushstack/eslint-plugin#rushstackno-new-null) in JavaScript, however sometimes it is desired.
	 * This {@link TreeNodeSchema} node provides the option to include nulls in trees when desired.
	 * Unless directly inter-operating with existing data using null, consider other approaches, like wrapping the value in an optional field, or using a more specifically named empty object node.
	 */
	public readonly null = nullSchema;

	/**
	 * {@link TreeNodeSchema} for holding an {@link @fluidframework/core-interfaces#(IFluidHandle:interface)}.
	 */
	public readonly handle = handleSchema;

	/**
	 * Construct a class that provides the common parts all TreeNodeSchemaClass share.
	 * More specific schema extend this class.
	 */
	private nodeSchema<
		const Name extends TName | string,
		const TKind extends NodeKind,
		T,
		const TImplicitlyConstructable extends boolean,
	>(
		name: Name,
		kind: TKind,
		t: T,
		implicitlyConstructable: TImplicitlyConstructable,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		TKind,
		TreeNode & WithType<ScopedSchemaName<TScope, Name>>,
		FlexTreeNode | unknown,
		TImplicitlyConstructable,
		T
	> {
		const identifier = this.scoped(name);
		class schema extends TreeNode implements WithType<ScopedSchemaName<TScope, Name>> {
			public static readonly identifier = identifier;
			public static readonly kind = kind;
			public static readonly info = t;
			public static readonly implicitlyConstructable: TImplicitlyConstructable =
				implicitlyConstructable;
			/**
			 * This constructor only does validation of the input, and should be passed the argument from the derived type unchanged.
			 * It is up to the derived type to actually do something with this value.
			 */
			public constructor(input: FlexTreeNode | unknown) {
				super();
				// Currently this just does validation. All other logic is in the subclass.
				if (isFlexTreeNode(input)) {
					assert(
						tryGetSimpleNodeSchema(input.schema) === this.constructor,
						0x83b /* building node with wrong schema */,
					);
				}

				if (isTreeNode(input)) {
					// TODO: update this once we have better support for deep-copying and move operations.
					throw new UsageError(
						"Existing nodes may not be used as the constructor parameter for a new node. The existing node may be used directly instead of creating a new one, used as a child of the new node (if it has not yet been inserted into the tree). If the desired result is copying the provided node, it must be deep copied (since any child node would be parented under both the new and old nodes). Currently no API is provided to make deep copies, but it can be done manually with object spreads - for example `new Foo({...oldFoo})` will work if all fields of `oldFoo` are leaf nodes.",
					);
				}
			}

			public get [type](): ScopedSchemaName<TScope, Name> {
				return identifier;
			}
		}
		// Class objects are functions (callable), so we need a strong way to distinguish between `schema` and `() => schema` when used as a `LazyItem`.
		markEager(schema);
		return schema;
	}

	/**
	 * Define a {@link TreeNodeSchema} for a {@link TreeObjectNode}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param fields - Schema for fields of the object node's schema. Defines what children can be placed under each key.
	 */
	public object<
		const Name extends TName,
		const T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
	>(
		name: Name,
		fields: T,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Object,
		TreeObjectNode<T, ScopedSchemaName<TScope, Name>>,
		object & InsertableObjectFromSchemaRecord<T>,
		true,
		T
	> {
		return objectSchema(this.nodeSchema(name, NodeKind.Object, fields, true));
	}

	/**
	 * Define a structurally typed {@link TreeNodeSchema} for a {@link TreeMapNode}.
	 *
	 * @remarks
	 * The unique identifier for this Map is defined as a function of the provided types.
	 * It is still scoped to this SchemaBuilder, but multiple calls with the same arguments will return the same schema object, providing somewhat structural typing.
	 * This does not support recursive types.
	 *
	 * If using these structurally named maps, other types in this schema builder should avoid names of the form `Map<${string}>`.
	 *
	 * @example
	 * The returned schema should be used as a schema directly:
	 * ```typescript
	 * const MyMap = factory.map(factory.number);
	 * type MyMap = NodeFromSchema<typeof MyMap>;
	 * ```
	 * Or inline:
	 * ```typescript
	 * factory.object("Foo", {myMap: factory.map(factory.number)});
	 * ```
	 * @privateRemarks
	 * See note on array.
	 */
	public map<const T extends TreeNodeSchema | readonly TreeNodeSchema[]>(
		allowedTypes: T,
	): TreeNodeSchema<
		ScopedSchemaName<TScope, `Map<${string}>`>,
		NodeKind.Map,
		TreeMapNode<T> & WithType<ScopedSchemaName<TScope, `Map<${string}>`>>,
		Iterable<[string, InsertableTreeNodeFromImplicitAllowedTypes<T>]>,
		true,
		T
	>;

	/**
	 * Define a {@link TreeNodeSchema} for a {@link TreeMapNode}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 *
	 * @example
	 * ```typescript
	 * class NamedMap extends factory.map("name", factory.number) {}
	 * ```
	 */
	public map<Name extends TName, const T extends ImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Map,
		TreeMapNode<T> & WithType<ScopedSchemaName<TScope, Name>>,
		Iterable<[string, InsertableTreeNodeFromImplicitAllowedTypes<T>]>,
		true,
		T
	>;

	public map<const T extends ImplicitAllowedTypes>(
		nameOrAllowedTypes: TName | ((T & TreeNodeSchema) | readonly TreeNodeSchema[]),
		allowedTypes?: T,
	): TreeNodeSchema<
		string,
		NodeKind.Map,
		TreeMapNode<T>,
		Iterable<[string, InsertableTreeNodeFromImplicitAllowedTypes<T>]>,
		true,
		T
	> {
		if (allowedTypes === undefined) {
			const types = nameOrAllowedTypes as (T & TreeNodeSchema) | readonly TreeNodeSchema[];
			const fullName = structuralName("Map", types);
			return getOrCreate(
				this.structuralTypes,
				fullName,
				() =>
					this.namedMap(
						fullName as TName,
						nameOrAllowedTypes as T,
						false,
						true,
					) as TreeNodeSchema,
			) as TreeNodeSchemaClass<
				string,
				NodeKind.Map,
				TreeMapNode<T>,
				Iterable<[string, InsertableTreeNodeFromImplicitAllowedTypes<T>]>,
				true,
				T
			>;
		}
		return this.namedMap(nameOrAllowedTypes as TName, allowedTypes, true, true);
	}

	/**
	 * Define a {@link TreeNodeSchema} for a {@link (TreeMapNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 */
	private namedMap<
		Name extends TName | string,
		const T extends ImplicitAllowedTypes,
		const ImplicitlyConstructable extends boolean,
	>(
		name: Name,
		allowedTypes: T,
		customizable: boolean,
		implicitlyConstructable: ImplicitlyConstructable,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Map,
		TreeMapNode<T> & WithType<ScopedSchemaName<TScope, Name>>,
		Iterable<[string, InsertableTreeNodeFromImplicitAllowedTypes<T>]>,
		ImplicitlyConstructable,
		T
	> {
		return mapSchema(
			this.nodeSchema(name, NodeKind.Map, allowedTypes, implicitlyConstructable),
			// The current policy is customizable nodes don't get fake prototypes.
			!customizable,
		);
	}

	/**
	 * Define a structurally typed {@link TreeNodeSchema} for a {@link (TreeArrayNode:interface)}.
	 *
	 * @remarks
	 * The identifier for this Array is defined as a function of the provided types.
	 * It is still scoped to this SchemaFactory, but multiple calls with the same arguments will return the same schema object, providing somewhat structural typing.
	 * This does not support recursive types.
	 *
	 * If using these structurally named arrays, other types in this schema builder should avoid names of the form `Array<${string}>`.
	 *
	 * @example
	 * The returned schema should be used as a schema directly:
	 * ```typescript
	 * const MyArray = factory.array(factory.number);
	 * type MyArray = NodeFromSchema<typeof MyArray>;
	 * ```
	 * Or inline:
	 * ```typescript
	 * factory.object("Foo", {myArray: factory.array(factory.number)});
	 * ```
	 * @privateRemarks
	 * The name produced at the type level here is not as specific as it could be, however doing type level sorting and escaping is a real mess.
	 * There are cases where not having this full type provided will be less than ideal since TypeScript's structural types.
	 * For example attempts to narrow unions of structural arrays by name won't work.
	 * Planned future changes to move to a class based schema system as well as factor function based node construction should mostly avoid these issues,
	 * though there may still be some problematic cases even after that work is done.
	 *
	 * The return value is a class, but its the type is intentionally not specific enough to indicate it is a class.
	 * This prevents callers of this from sub-classing it, which is unlikely to work well (due to the ease of accidentally giving two different calls o this different subclasses)
	 * when working with structural typing.
	 *
	 * {@label STRUCTURAL}
	 */
	public array<const T extends TreeNodeSchema | readonly TreeNodeSchema[]>(
		allowedTypes: T,
	): TreeNodeSchema<
		ScopedSchemaName<TScope, `Array<${string}>`>,
		NodeKind.Array,
		TreeArrayNode<T> & WithType<ScopedSchemaName<TScope, `Array<${string}>`>>,
		Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
		true,
		T
	>;

	/**
	 * Define (and add to this library) a {@link TreeNodeSchemaClass} for a {@link (TreeArrayNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 *
	 * @example
	 * ```typescript
	 * class NamedArray extends factory.array("name", factory.number) {}
	 * ```
	 *
	 * {@label NAMED}
	 */
	public array<const Name extends TName, const T extends ImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Array,
		TreeArrayNode<T> & WithType<ScopedSchemaName<TScope, Name>>,
		Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
		true,
		T
	>;

	public array<const T extends ImplicitAllowedTypes>(
		nameOrAllowedTypes: TName | ((T & TreeNodeSchema) | readonly TreeNodeSchema[]),
		allowedTypes?: T,
	): TreeNodeSchema<
		ScopedSchemaName<TScope, string>,
		NodeKind.Array,
		TreeArrayNode<T>,
		Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
		true,
		T
	> {
		if (allowedTypes === undefined) {
			const types = nameOrAllowedTypes as (T & TreeNodeSchema) | readonly TreeNodeSchema[];
			const fullName = structuralName("Array", types);
			return getOrCreate(this.structuralTypes, fullName, () =>
				this.namedArray(fullName, nameOrAllowedTypes as T, false, true),
			) as TreeNodeSchemaClass<
				ScopedSchemaName<TScope, string>,
				NodeKind.Array,
				TreeArrayNode<T>,
				Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
				true,
				T
			>;
		}
		return this.namedArray(nameOrAllowedTypes as TName, allowedTypes, true, true);
	}

	/**
	 * Define a {@link TreeNodeSchema} for a {@link (TreeArrayNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 *
	 * @remarks
	 * This is not intended to be used directly, use the overload of `array` which takes a name instead.
	 * This is only public to work around a compiler limitation.
	 */
	private namedArray<
		Name extends TName | string,
		const T extends ImplicitAllowedTypes,
		const ImplicitlyConstructable extends boolean,
	>(
		name: Name,
		allowedTypes: T,
		customizable: boolean,
		implicitlyConstructable: ImplicitlyConstructable,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Array,
		TreeArrayNode<T> & WithType<ScopedSchemaName<TScope, string>>,
		Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
		ImplicitlyConstructable,
		T
	> {
		return arraySchema(
			this.nodeSchema(name, NodeKind.Array, allowedTypes, implicitlyConstructable),
			customizable,
		);
	}

	/**
	 * Make a field optional instead of the default, which is required.
	 *
	 * @param t - The types allowed under the field.
	 * @param props - Optional properties to associate with the field.
	 */
	public optional<const T extends ImplicitAllowedTypes>(
		t: T,
		props?: FieldProps,
	): FieldSchema<FieldKind.Optional, T> {
		return createFieldSchema(FieldKind.Optional, t, props);
	}

	/**
	 * Make a field explicitly required.
	 *
	 * @param t - The types allowed under the field.
	 * @param props - Optional properties to associate with the field.
	 *
	 * @remarks
	 * Fields are required by default, but this API can be used to make the required nature explicit in the schema,
	 * and allows associating custom {@link FieldProps | properties} with the field.
	 */
	public required<const T extends ImplicitAllowedTypes>(
		t: T,
		props?: FieldProps,
	): FieldSchema<FieldKind.Required, T> {
		return createFieldSchema(FieldKind.Required, t, props);
	}

	/**
	 * {@link SchemaFactory.optional} except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of {@link SchemaFactory.optional} has fewer type constraints to work around TypeScript limitations, see {@link Unenforced}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 */
	public optionalRecursive<const T extends Unenforced<ImplicitAllowedTypes>>(
		t: T,
		props?: FieldProps,
	) {
		return createFieldSchemaUnsafe(FieldKind.Optional, t, props);
	}

	/**
	 * {@link SchemaFactory.required} except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of {@link SchemaFactory.required} has fewer type constraints to work around TypeScript limitations, see {@link Unenforced}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 */
	public requiredRecursive<const T extends Unenforced<ImplicitAllowedTypes>>(
		t: T,
		props?: FieldProps,
	) {
		return createFieldSchemaUnsafe(FieldKind.Required, t, props);
	}

	/**
	 * Make a field of type identifier instead of the default which is required.
	 */
	public get identifier(): FieldSchema<FieldKind.Identifier> {
		return createFieldSchema(FieldKind.Identifier, this.string);
	}

	/**
	 * {@link SchemaFactory.object} except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of {@link SchemaFactory.object} has fewer type constraints to work around TypeScript limitations, see {@link Unenforced}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 *
	 * Additionally `ImplicitlyConstructable` is disabled (forcing use of constructor) to avoid
	 * `error TS2589: Type instantiation is excessively deep and possibly infinite.`
	 * which otherwise gets reported at sometimes incorrect source locations that vary based on incremental builds.
	 */
	public objectRecursive<
		const Name extends TName,
		const T extends Unenforced<RestrictiveReadonlyRecord<string, ImplicitFieldSchema>>,
	>(name: Name, t: T) {
		type TScopedName = ScopedSchemaName<TScope, Name>;
		return this.object(
			name,
			t as T & RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
		) as unknown as TreeNodeSchemaClass<
			TScopedName,
			NodeKind.Object,
			TreeObjectNodeUnsafe<T, TScopedName>,
			object & InsertableObjectFromSchemaRecordUnsafe<T>,
			false,
			T
		>;
	}

	/**
	 * `SchemaFactory.array` except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of `SchemaFactory.array` uses the same workarounds as {@link SchemaFactory.objectRecursive}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 */
	public arrayRecursive<
		const Name extends TName,
		const T extends Unenforced<ImplicitAllowedTypes>,
	>(name: Name, allowedTypes: T) {
		class RecursiveArray extends this.namedArray(
			name,
			allowedTypes as T & ImplicitAllowedTypes,
			true,
			false,
		) {
			public constructor(
				data:
					| Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T & ImplicitAllowedTypes>>
					| FlexTreeNode,
			) {
				if (isFlexTreeNode(data)) {
					super(data as any);
				} else {
					super(data);
				}
			}
		}

		return RecursiveArray as TreeNodeSchemaClass<
			ScopedSchemaName<TScope, Name>,
			NodeKind.Array,
			TreeArrayNodeUnsafe<T> & WithType<ScopedSchemaName<TScope, Name>>,
			{
				/**
				 * Iterator for the iterable of content for this node.
				 * @privateRemarks
				 * Wrapping the constructor parameter for recursive arrays and maps in an inlined object type avoids (for unknown reasons)
				 * the following compile error when declaring the recursive schema:
				 * `Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.`
				 * To benefit from this without impacting the API, the definition of `Iterable` has been inlined as such an object.
				 *
				 * If this workaround is kept, ideally this comment would be deduplicated with the other instance of it.
				 * Unfortunately attempts to do this failed to avoid the compile error this was introduced to solve.
				 */
				[Symbol.iterator](): Iterator<InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>>;
			},
			false,
			T
		>;
	}

	/**
	 * `SchemaFactory.map` except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of `SchemaFactory.map` uses the same workarounds as {@link SchemaFactory.objectRecursive}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 */
	public mapRecursive<Name extends TName, const T extends Unenforced<ImplicitAllowedTypes>>(
		name: Name,
		allowedTypes: T,
	) {
		class MapSchema extends this.namedMap(
			name,
			allowedTypes as T & ImplicitAllowedTypes,
			true,
			false,
		) {
			public constructor(
				data:
					| Iterable<
							[
								string,
								InsertableTreeNodeFromImplicitAllowedTypes<
									T & ImplicitAllowedTypes
								>,
							]
					  >
					| FlexTreeNode,
			) {
				if (isFlexTreeNode(data)) {
					super(data as any);
				} else {
					super(new Map(data));
				}
			}
		}

		return MapSchema as TreeNodeSchemaClass<
			ScopedSchemaName<TScope, Name>,
			NodeKind.Map,
			TreeMapNodeUnsafe<T> & WithType<ScopedSchemaName<TScope, Name>>,
			{
				/**
				 * Iterator for the iterable of content for this node.
				 * @privateRemarks
				 * Wrapping the constructor parameter for recursive arrays and maps in an inlined object type avoids (for unknown reasons)
				 * the following compile error when declaring the recursive schema:
				 * `Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.`
				 * To benefit from this without impacting the API, the definition of `Iterable` has been inlined as such an object.
				 *
				 * If this workaround is kept, ideally this comment would be deduplicated with the other instance of it.
				 * Unfortunately attempts to do this failed to avoid the compile error this was introduced to solve.
				 */
				[Symbol.iterator](): Iterator<
					[string, InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>]
				>;
			},
			false,
			T
		>;
	}
}

export function structuralName<const T extends string>(
	collectionName: T,
	allowedTypes: TreeNodeSchema | readonly TreeNodeSchema[],
): `${T}<${string}>` {
	let inner: string;
	if (!isReadonlyArray(allowedTypes)) {
		return structuralName(collectionName, [allowedTypes]);
	} else {
		const names = allowedTypes.map((t): string => {
			// Ensure that lazy types (functions) don't slip through here.
			assert(!isLazy(t), 0x83d /* invalid type provided */);
			return t.identifier;
		});
		// Ensure name is order independent
		names.sort();
		// Ensure name can't have collisions by quoting and escaping any quotes in the names of types.
		// Using JSON is a simple way to accomplish this.
		// The outer `[]` around the result are also needed so that a single type name "Any" would not collide with the "any" case above.
		inner = JSON.stringify(names);
	}
	return `${collectionName}<${inner}>`;
}
