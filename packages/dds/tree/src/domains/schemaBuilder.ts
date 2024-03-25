/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	Any,
	FieldKinds,
	FlexFieldKind,
	FlexFieldNodeSchema,
	FlexFieldSchema,
	FlexImplicitAllowedTypes,
	FlexImplicitFieldSchema,
	FlexMapFieldSchema,
	FlexMapNodeSchema,
	FlexObjectNodeSchema,
	FlexTreeNodeSchema,
	NormalizeAllowedTypes,
	NormalizeField,
	SchemaBuilderBase,
	SchemaBuilderOptions,
	TreeNodeSchemaBase,
	Unenforced,
	normalizeField,
} from "../feature-libraries/index.js";
import { RestrictiveReadonlyRecord, getOrCreate, isAny, requireFalse } from "../util/index.js";
import { leaf } from "./leafDomain.js";

/**
 * Builds schema libraries, and the schema within them.
 *
 * @remarks
 * Fields, when inferred from {@link FlexImplicitFieldSchema}, default to the `Required` {@link FlexFieldKind} (except for in Maps, which default to `Optional`).
 * Implicitly includes `leaf` schema library by default.
 *
 * This type has some built in defaults which impact compatibility.
 * This includes which {@link FlexFieldKind}s it uses.
 * To ensure that these defaults can be updated without compatibility issues,
 * this class is versioned: the number in its name indicates its compatibility,
 * and if its defaults are changed to ones that would not be compatible with a version of the application using the previous versions,
 * this number will be updated to make it impossible for an app to implicitly do a compatibility breaking change by updating this package.
 * Major package version updates are allowed to break API compatibility, but must not break content compatibility unless a corresponding code change is made in the app to opt in.
 *
 * @privateRemarks
 * TODO: Maybe rename to DefaultSchemaBuilder1 because of the versioning implications above.
 * Same applies to SchemaBuilder.
 * TODO: figure out a way to link `leaf` above without breaking API Extractor.
 * @sealed
 * @deprecated Users of this class should either use {@link SchemaBuilderBase} and explicitly work with {@link FlexFieldSchema}, or use SchemaFactory and work at its higher level of abstraction.
 */
export class SchemaBuilder<
	TScope extends string = string,
	TName extends string | number = string,
> extends SchemaBuilderBase<TScope, typeof FieldKinds.required, TName> {
	private readonly structuralTypes: Map<string, FlexTreeNodeSchema> = new Map();

	public constructor(options: SchemaBuilderOptions<TScope>) {
		super(FieldKinds.required, {
			...options,
			libraries: [...(options.libraries ?? []), leaf.library],
		});
	}

	public override objectRecursive<
		const Name extends TName,
		const T extends Unenforced<RestrictiveReadonlyRecord<string, FlexImplicitFieldSchema>>,
	>(name: Name, t: T) {
		return this.object(
			name,
			t as unknown as RestrictiveReadonlyRecord<string, FlexImplicitFieldSchema>,
		) as unknown as FlexObjectNodeSchema<`${TScope}.${Name}`, T>;
	}

	/**
	 * Define (and add to this library if not already present) a structurally typed {@link FlexFieldNodeSchema} for a {@link (TreeListNode:interface)}.
	 *
	 * @remarks
	 * The {@link TreeNodeSchemaIdentifier} for this List is defined as a function of the provided types.
	 * It is still scoped to this SchemaBuilder, but multiple calls with the same arguments will return the same schema object, providing somewhat structural typing.
	 * This does not support recursive types.
	 *
	 * If using these structurally named lists, other types in this schema builder should avoid names of the form `List<${string}>`.
	 *
	 * @privateRemarks
	 * The name produced at the type level here is not as specific as it could be, however doing type level sorting and escaping is a real mess.
	 * There are cases where not having this full type provided will be less than ideal since TypeScript's structural types.
	 * For example attempts to narrow unions of structural lists by name won't work.
	 * Planned future changes to move to a class based schema system as well as factor function based node construction should mostly avoid these issues,
	 * though there may still be some problematic cases even after that work is done.
	 */
	public list<const T extends FlexTreeNodeSchema | Any | readonly FlexTreeNodeSchema[]>(
		allowedTypes: T,
	): FlexFieldNodeSchema<
		`${TScope}.List<${string}>`,
		FlexFieldSchema<typeof FieldKinds.sequence, NormalizeAllowedTypes<T>>
	>;

	/**
	 * Define (and add to this library) a {@link FlexFieldNodeSchema} for a {@link (TreeListNode:interface)}.
	 *
	 * The name must be unique among all TreeNodeSchema in the the document schema.
	 */
	public list<Name extends TName, const T extends FlexImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	): FlexFieldNodeSchema<
		`${TScope}.${Name}`,
		FlexFieldSchema<typeof FieldKinds.sequence, NormalizeAllowedTypes<T>>
	>;

	public list<const T extends FlexImplicitAllowedTypes>(
		nameOrAllowedTypes:
			| TName
			| ((T & FlexTreeNodeSchema) | Any | readonly FlexTreeNodeSchema[]),
		allowedTypes?: T,
	): FlexFieldNodeSchema<
		`${TScope}.${string}`,
		FlexFieldSchema<typeof FieldKinds.sequence, NormalizeAllowedTypes<T>>
	> {
		if (allowedTypes === undefined) {
			const types = nameOrAllowedTypes as
				| (T & FlexTreeNodeSchema)
				| Any
				| readonly FlexTreeNodeSchema[];
			const fullName = structuralName("List", types);
			return getOrCreate(this.structuralTypes, fullName, () =>
				this.namedList(fullName, nameOrAllowedTypes as T),
			) as FlexFieldNodeSchema<
				`${TScope}.${string}`,
				FlexFieldSchema<typeof FieldKinds.sequence, NormalizeAllowedTypes<T>>
			>;
		}
		return this.namedList(nameOrAllowedTypes as TName, allowedTypes);
	}

	/**
	 * Define (and add to this library) a {@link FlexFieldNodeSchema} for a {@link (TreeListNode:interface)}.
	 *
	 * The name must be unique among all TreeNodeSchema in the the document schema.
	 *
	 * @privateRemarks
	 * TODO: If A custom "List" API is added as a subtype of {@link FieldNode}, this would opt into that.
	 */
	private namedList<Name extends TName | string, const T extends FlexImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	): FlexFieldNodeSchema<
		`${TScope}.${Name}`,
		FlexFieldSchema<typeof FieldKinds.sequence, NormalizeAllowedTypes<T>>
	> {
		const schema = FlexFieldNodeSchema.create(
			this,
			this.scoped(name as TName & Name),
			this.sequence(allowedTypes),
		);
		this.addNodeSchema(schema);
		return schema;
	}

	/**
	 * Define (and add to this library if not already present) a structurally typed {@link FlexMapNodeSchema} for a {@link TreeMapNode}.
	 *
	 * @remarks
	 * The {@link TreeNodeSchemaIdentifier} for this Map is defined as a function of the provided types.
	 * It is still scoped to this SchemaBuilder, but multiple calls with the same arguments will return the same schema object, providing somewhat structural typing.
	 * This does not support recursive types.
	 *
	 * If using these structurally named maps, other types in this schema builder should avoid names of the form `Map<${string}>`.
	 *
	 * @privateRemarks
	 * See note on list.
	 */
	public override map<const T extends FlexTreeNodeSchema | Any | readonly FlexTreeNodeSchema[]>(
		allowedTypes: T,
	): FlexMapNodeSchema<`${TScope}.Map<${string}>`, NormalizeField<T, typeof FieldKinds.optional>>;

	/**
	 * Define (and add to this library) a {@link FlexMapNodeSchema} for a {@link TreeMapNode}.
	 */
	public override map<
		Name extends TName,
		const T extends FlexMapFieldSchema | FlexImplicitAllowedTypes,
	>(
		name: Name,
		fieldSchema: T,
	): FlexMapNodeSchema<`${TScope}.${Name}`, NormalizeField<T, typeof FieldKinds.optional>>;

	public override map<const T extends FlexMapFieldSchema | FlexImplicitAllowedTypes>(
		nameOrAllowedTypes:
			| TName
			| ((T & FlexTreeNodeSchema) | Any | readonly FlexTreeNodeSchema[]),
		allowedTypes?: T,
	): FlexMapNodeSchema<`${TScope}.${string}`, NormalizeField<T, typeof FieldKinds.optional>> {
		if (allowedTypes === undefined) {
			const types = nameOrAllowedTypes as
				| (T & FlexTreeNodeSchema)
				| Any
				| readonly FlexTreeNodeSchema[];
			const fullName = structuralName("Map", types);
			return getOrCreate(
				this.structuralTypes,
				fullName,
				() =>
					super.map(
						fullName as TName,
						normalizeField(nameOrAllowedTypes as T, FieldKinds.optional),
					) as FlexTreeNodeSchema,
			) as FlexMapNodeSchema<
				`${TScope}.${string}`,
				NormalizeField<T, typeof FieldKinds.optional>
			>;
		}
		return super.map(
			nameOrAllowedTypes as TName,
			normalizeField(allowedTypes, FieldKinds.optional),
		);
	}

	/**
	 * Define a schema for an {@link FieldKinds.optional|optional field}.
	 * @remarks
	 * Shorthand or passing `FieldKinds.optional` to {@link FlexFieldSchema.create}.
	 *
	 * This method is also available as an instance method on {@link SchemaBuilder}.
	 */
	public static optional = fieldHelper(FieldKinds.optional);

	/**
	 * Define a schema for an {@link FieldKinds.optional|optional field}.
	 * @remarks
	 * Shorthand or passing `FieldKinds.optional` to {@link FlexFieldSchema.create}.
	 *
	 * Since this creates a {@link FlexFieldSchema} (and not a {@link FlexTreeNodeSchema}), the resulting schema is structurally typed, and not impacted by the {@link SchemaBuilderBase.scope}:
	 * therefore this method is the same as the static version.
	 */
	public readonly optional = SchemaBuilder.optional;

	/**
	 * Define a schema for a {@link FieldKinds.required|required field}.
	 * @remarks
	 * Shorthand or passing `FieldKinds.required` to {@link FlexFieldSchema.create}.
	 *
	 * This method is also available as an instance method on {@link SchemaBuilder}.
	 */
	public static required = fieldHelper(FieldKinds.required);

	/**
	 * Define a schema for a {@link FieldKinds.required|required field}.
	 * @remarks
	 * Shorthand or passing `FieldKinds.required` to {@link FlexFieldSchema.create}.
	 * Note that `FieldKinds.required` is the current default field kind, so APIs accepting {@link FlexImplicitFieldSchema}
	 * can be passed the `allowedTypes` and will implicitly wrap it up in a {@link FieldKinds.required|required field}.
	 *
	 * Since this creates a {@link FlexFieldSchema} (and not a {@link FlexTreeNodeSchema}), the resulting schema is structurally typed, and not impacted by the {@link SchemaBuilderBase.scope}:
	 * therefore this method is the same as the static version.
	 */
	public readonly required = SchemaBuilder.required;

	/**
	 * Define a schema for a {@link FieldKinds.sequence|sequence field}.
	 * @remarks
	 * Shorthand or passing `FieldKinds.sequence` to {@link FlexFieldSchema.create}.
	 *
	 * This method is also available as an instance method on {@link SchemaBuilder}
	 */
	public static sequence = fieldHelper(FieldKinds.sequence);

	/**
	 * Define a schema for a {@link FieldKinds.sequence|sequence field}.
	 * @remarks
	 * Shorthand or passing `FieldKinds.sequence` to {@link FlexFieldSchema.create}.
	 *
	 * Since this creates a {@link FlexFieldSchema} (and not a {@link FlexTreeNodeSchema}), the resulting schema is structurally typed, and not impacted by the {@link SchemaBuilderBase.scope}:
	 * therefore this method is the same as the static version.
	 */
	public readonly sequence = SchemaBuilder.sequence;

	/**
	 * {@link leaf.number}
	 */
	public readonly number = leaf.number;

	/**
	 * {@link leaf.boolean}
	 */
	public readonly boolean = leaf.boolean;

	/**
	 * {@link leaf.string}
	 */
	public readonly string = leaf.string;

	/**
	 * {@link leaf.handle}
	 */
	public readonly handle = leaf.handle;

	/**
	 * {@link leaf.null}
	 */
	public readonly null = leaf.null;
}

/**
 * Returns a wrapper around SchemaBuilder.field for a specific FieldKind.
 */
function fieldHelper<Kind extends FlexFieldKind>(kind: Kind) {
	return <const T extends FlexImplicitAllowedTypes>(
		allowedTypes: T,
	): FlexFieldSchema<Kind, NormalizeAllowedTypes<T>> => SchemaBuilder.field(kind, allowedTypes);
}

export function structuralName<const T extends string>(
	collectionName: T,
	allowedTypes: FlexTreeNodeSchema | Any | readonly FlexTreeNodeSchema[],
): `${T}<${string}>` {
	let inner: string;
	if (allowedTypes === Any) {
		inner = "Any";
	} else if (allowedTypes instanceof TreeNodeSchemaBase) {
		return structuralName(collectionName, [allowedTypes]);
	} else {
		assert(Array.isArray(allowedTypes), 0x7c7 /* Types should be an array */);
		const names = allowedTypes.map((t): string => {
			// Ensure that lazy types (functions) don't slip through here.
			assert(t instanceof TreeNodeSchemaBase, 0x7c8 /* invalid type provided */);
			// TypeScript should know `t.name` is a string (from the extends constraint on TreeNodeSchema's name), but the linter objects.
			// @ts-expect-error: Apparently TypeScript also fails to apply this constraint for some reason and is giving any:
			type _check = requireFalse<isAny<typeof t.name>>;
			// Adding `as string` here would silence the linter, but make this code less type safe (since if this became not a string, it would still build).
			// Thus we explicitly check that this satisfies string.
			// This would best be done by appending `satisfies string`, but the linter also rejects this.
			// Therefor introducing a variable to do the same thing as `satisfies string` but such that the linter can understand:
			const name: string = t.name;
			// Just incase the compiler and linter really are onto something and this might sometimes not be a string, validate it:
			assert(typeof name === "string", 0x7c9 /* Name should be a string */);
			return name;
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
