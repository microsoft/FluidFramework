/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldKinds,
	FlexFieldKind,
	FlexFieldNodeSchema,
	FlexFieldSchema,
	FlexImplicitAllowedTypes,
	FlexImplicitFieldSchema,
	FlexObjectNodeSchema,
	NormalizeAllowedTypes,
	SchemaBuilderBase,
	SchemaBuilderOptions,
	Unenforced,
} from "../feature-libraries/index.js";
import { RestrictiveReadonlyRecord } from "../util/index.js";

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
	public constructor(options: SchemaBuilderOptions<TScope>) {
		super(FieldKinds.required, {
			...options,
			libraries: [...(options.libraries ?? []), leaf.library],
		});
	}

	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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
	 * Define (and add to this library) a {@link FlexFieldNodeSchema} for a {@link Sequence}.
	 *
	 * The name must be unique among all TreeNodeSchema in the the document schema.
	 */
	public list<Name extends TName, const T extends FlexImplicitAllowedTypes>(
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
	 * Define a schema for an {@link FieldKinds.optional|optional field}.
	 * @remarks
	 * Shorthand for passing `FieldKinds.optional` to {@link FlexFieldSchema.create}.
	 *
	 * This method is also available as an instance method on {@link SchemaBuilder}.
	 */
	public static optional = fieldHelper(FieldKinds.optional);

	/**
	 * Define a schema for an {@link FieldKinds.optional|optional field}.
	 * @remarks
	 * Shorthand for passing `FieldKinds.optional` to {@link FlexFieldSchema.create}.
	 *
	 * Since this creates a {@link FlexFieldSchema} (and not a {@link FlexTreeNodeSchema}), the resulting schema is structurally typed, and not impacted by the {@link SchemaBuilderBase.scope}:
	 * therefore this method is the same as the static version.
	 */
	public readonly optional = SchemaBuilder.optional;

	/**
	 * Define a schema for a {@link FieldKinds.required|required field}.
	 * @remarks
	 * Shorthand for passing `FieldKinds.required` to {@link FlexFieldSchema.create}.
	 *
	 * This method is also available as an instance method on {@link SchemaBuilder}.
	 */
	public static required = fieldHelper(FieldKinds.required);

	/**
	 * Define a schema for a {@link FieldKinds.required|required field}.
	 * @remarks
	 * Shorthand for passing `FieldKinds.required` to {@link FlexFieldSchema.create}.
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
	 * Shorthand for passing `FieldKinds.sequence` to {@link FlexFieldSchema.create}.
	 *
	 * This method is also available as an instance method on {@link SchemaBuilder}
	 */
	public static sequence = fieldHelper(FieldKinds.sequence);

	/**
	 * Define a schema for a {@link FieldKinds.sequence|sequence field}.
	 * @remarks
	 * Shorthand for passing `FieldKinds.sequence` to {@link FlexFieldSchema.create}.
	 *
	 * Since this creates a {@link FlexFieldSchema} (and not a {@link FlexTreeNodeSchema}), the resulting schema is structurally typed, and not impacted by the {@link SchemaBuilderBase.scope}:
	 * therefore this method is the same as the static version.
	 */
	public readonly sequence = SchemaBuilder.sequence;

	/**
	 * Define a schema for an {@link FieldKinds.identifier|identifier field}.
	 * @remarks
	 * Shorthand for passing `FieldKinds.identifier` to {@link TreeFieldSchema.create}.
	 *
	 * This method is also available as an instance method on {@link SchemaBuilder}
	 */
	public static identifier = fieldHelper(FieldKinds.identifier);

	/**
	 * Define a schema for a {@link FieldKinds.identifier|identifier field}.
	 * @remarks
	 * Shorthand for passing `FieldKinds.identifier` to {@link TreeFieldSchema.create}.
	 *
	 * Since this creates a {@link TreeFieldSchema} (and not a {@link FlexTreeNodeSchema}), the resulting schema is structurally typed, and not impacted by the {@link SchemaBuilderBase.scope}:
	 * therefore this method is the same as the static version.
	 */
	public readonly identifier = SchemaBuilder.identifier;
}

/**
 * Returns a wrapper around SchemaBuilder.field for a specific FieldKind.
 */
function fieldHelper<Kind extends FlexFieldKind>(kind: Kind) {
	return <const T extends FlexImplicitAllowedTypes>(
		allowedTypes: T,
	): FlexFieldSchema<Kind, NormalizeAllowedTypes<T>> => SchemaBuilder.field(kind, allowedTypes);
}
