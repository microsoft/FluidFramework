/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { leaf } from "../domains";
import {
	FieldKind,
	FieldKinds,
	FieldSchema,
	ImplicitAllowedTypes,
	NormalizeAllowedTypes,
	SchemaBuilderBase,
	SchemaBuilderOptions,
} from "../feature-libraries";

/**
 * Builds schema libraries, and the schema within them.
 *
 * @remarks
 * Fields, when inferred from {@link ImplicitFieldSchema}, default to the `Required` {@link FieldKind}.
 * Implicitly includes `leaf` schema library by default.
 *
 * This type has some built in defaults which impact compatibility.
 * This includes which {@link FieldKind}s it uses.
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
 * @sealed @alpha
 */
export class SchemaBuilder<TScope extends string = string> extends SchemaBuilderBase<
	TScope,
	typeof FieldKinds.required
> {
	public constructor(options: SchemaBuilderOptions<TScope>) {
		super(FieldKinds.required, {
			...options,
			libraries: [...(options.libraries ?? []), leaf.library],
		});
	}

	/**
	 * Define a schema for an {@link OptionalField}.
	 * @remarks
	 * Shorthand or passing `FieldKinds.optional` to {@link FieldSchema.create}.
	 *
	 * This method is also available as an instance method on {@link SchemaBuilder}
	 */
	public static optional = fieldHelper(FieldKinds.optional);

	/**
	 * Define a schema for an {@link OptionalField}.
	 * @remarks
	 * Shorthand or passing `FieldKinds.optional` to {@link FieldSchema.create}.
	 *
	 * Since this creates a {@link FieldSchema} (and not a {@link TreeSchema}), the resulting schema is structurally typed, and not impacted by the {@link SchemaBuilderBase.scope}:
	 * therefore this method is the same as the static version.
	 */
	public readonly optional = SchemaBuilder.optional;

	/**
	 * Define a schema for an {@link RequiredField}.
	 * @remarks
	 * Shorthand or passing `FieldKinds.required` to {@link FieldSchema.create}.
	 *
	 * This method is also available as an instance method on {@link SchemaBuilder}
	 */
	public static required = fieldHelper(FieldKinds.required);

	/**
	 * Define a schema for a {@link RequiredField}.
	 * @remarks
	 * Shorthand or passing `FieldKinds.required` to {@link FieldSchema.create}.
	 * Note that `FieldKinds.required` is the current default field kind, so APIs accepting {@link ImplicitFieldSchema}
	 * can be passed the `allowedTypes` and will implicitly wrap it up in a {@link RequiredField}.
	 *
	 * Since this creates a {@link FieldSchema} (and not a {@link TreeSchema}), the resulting schema is structurally typed, and not impacted by the {@link SchemaBuilderBase.scope}:
	 * therefore this method is the same as the static version.
	 */
	public readonly required = SchemaBuilder.required;

	/**
	 * Define a schema for a {@link Sequence}.
	 * @remarks
	 * Shorthand or passing `FieldKinds.sequence` to {@link FieldSchema.create}.
	 *
	 * This method is also available as an instance method on {@link SchemaBuilder}
	 */
	public static sequence = fieldHelper(FieldKinds.sequence);

	/**
	 * Define a schema for a {@link Sequence}.
	 * @remarks
	 * Shorthand or passing `FieldKinds.sequence` to {@link FieldSchema.create}.
	 *
	 * Since this creates a {@link FieldSchema} (and not a {@link TreeSchema}), the resulting schema is structurally typed, and not impacted by the {@link SchemaBuilderBase.scope}:
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
function fieldHelper<Kind extends FieldKind>(kind: Kind) {
	return <const T extends ImplicitAllowedTypes>(
		allowedTypes: T,
	): FieldSchema<Kind, NormalizeAllowedTypes<T>> => SchemaBuilder.field(kind, allowedTypes);
}
