/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "@fluidframework/core-utils/internal";

import { DiscriminatedUnionDispatcher } from "../../codec/index.js";
import {
	type JsonCompatibleReadOnlyObject,
	type MakeNominal,
	brand,
	invertMap,
} from "../../util/index.js";

import {
	type FieldKey,
	type FieldKindIdentifier,
	type FieldSchemaFormat as FieldSchemaFormatV1,
	PersistedValueSchema,
	type TreeNodeSchemaDataFormat as TreeNodeSchemaDataFormatV1,
	type TreeNodeSchemaIdentifier,
} from "./formatV1.js";
import type {
	FieldSchemaFormat as FieldSchemaFormatV2,
	PersistedMetadataFormat,
	TreeNodeSchemaUnionFormat,
	TreeNodeSchemaDataFormat as TreeNodeSchemaDataFormatV2,
} from "./formatV2.js";
import type { Multiplicity } from "./multiplicity.js";

/**
 * The format version for the schema.
 */
export enum SchemaVersion {
	v1 = 1,
	/**
	 * Adds persisted metadata to the node schema and field schema.
	 */
	v2 = 2,
}

type FieldSchemaFormat = FieldSchemaFormatV1 | FieldSchemaFormatV2;

/**
 * Schema for what {@link TreeLeafValue} is allowed on a Leaf node.
 * @privateRemarks
 * See also {@link TreeValue}.
 * If further stabilizing this,
 * consider the implications of how this might prevent adding of new leaf types in the future.
 * Maybe add a disclaimer that it might be extended like on {@link NodeKind}?
 * @alpha
 */
export enum ValueSchema {
	Number,
	String,
	Boolean,
	FluidHandle,
	Null,
}

/**
 * Set of allowed tree types.
 * Providing multiple values here allows polymorphism, tagged union style.
 *
 * In the future, this could be extended to allow inlining a TreeNodeStoredSchema here
 * (or some similar structural schema system).
 * For structural types which could go here, there are a few interesting options:
 *
 * - Allow replacing the whole set with a structural type for terminal / non-tree data,
 * and use this as a replacement for values on the tree nodes.
 *
 * - Allow expression structural constraints for child trees, for example requiring specific traits
 * (ex: via TreeNodeStoredSchema), instead of by type.
 *
 * There are two ways this could work:
 *
 * - Constrain the child nodes based on their shape:
 * this makes schema safe editing difficult because nodes would incur extra editing constraints to prevent them
 * from going out of schema based on their location in such a field.
 *
 * - Constrain the types allowed based on which types guarantee their data will always meet the constraints.
 *
 * Care would need to be taken to make sure this is sound for the schema updating mechanisms.
 */
export type TreeTypeSet = ReadonlySet<TreeNodeSchemaIdentifier>;

/**
 * Declarative portion of a Field Kind.
 *
 * @remarks
 * Enough info about a field kind to know if a given tree is is schema.
 */
export interface FieldKindData {
	readonly identifier: FieldKindIdentifier;
	readonly multiplicity: Multiplicity;
}

/**
 * Everything needed to define what it means for a tree to be in schema.
 */
export interface SchemaAndPolicy {
	readonly schema: StoredSchemaCollection;
	readonly policy: SchemaPolicy;
}

/**
 * Extra data needed to interpret stored schema.
 * @remarks
 * This contains information that describes the semantics of things which can be referenced in stored schema.
 * For example, field kind identifiers refer to specific field kinds, which imply specific rules around what is valid in a given field (the multiplicity).
 * This structure provides such information, allowing it to be possible to determine if a given tree complies with a particular stored schema.
 *
 * TODO: AB#43546
 * Some additional data which is not needed to define compatibility with a given stored schema is currently included here, and should be removed.
 */
export interface SchemaPolicy {
	/**
	 * Policy information about FieldKinds:
	 * This is typically stored as code, not in documents, and defines how to handle fields based on their kind.
	 * It is assumed that all users of a document will have exactly the same FieldKind policies,
	 * though older applications might be missing some,
	 * and will be unable to process any changes that use those FieldKinds.
	 */
	readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindData>;

	/**
	 * If true, new content inserted into the tree should be validated against the stored schema.
	 * @remarks
	 * TODO: AB#43546: This is not information used to interpret the stored schema: this configuration should be moved elsewhere.
	 */
	readonly validateSchema: boolean;

	/**
	 * Whether to allow a document to be opened when a particular stored schema (identified by `identifier`)
	 * contains optional fields that are not known to the view schema.
	 *
	 * @privateRemarks
	 * Plumbing this in via `SchemaPolicy` avoids needing to walk the view schema representation repeatedly in places
	 * that need it (schema validation, view vs stored compatibility checks).
	 *
	 * TODO: AB#43546
	 * This is not information used to interpret the stored schema: it is instead about view schema, and how compatible they are with a stored schema.
	 * SchemaCompatibilityTester should be updated to not store this table in here, and then this field should be removed.
	 */
	allowUnknownOptionalFields(identifier: TreeNodeSchemaIdentifier): boolean;
}

/**
 * Schema for a field.
 * Object implementing this interface should never be modified.
 */
export interface TreeFieldStoredSchema {
	readonly kind: FieldKindIdentifier;

	/**
	 * The set of allowed child types.
	 * If not specified, types are unconstrained.
	 */
	readonly types: TreeTypeSet;

	/**
	 * Portion of the metadata which can be persisted.
	 * @remarks
	 * Discarded when encoding to {@link SchemaFormatVersion.V1}.
	 * @privateRemarks
	 * This field corresponds to the `metadata` field in the persisted schema format.
	 */
	readonly persistedMetadata: JsonCompatibleReadOnlyObject | undefined;
}

/**
 * Identifier used for the FieldKind for fields which must be empty.
 *
 * @remarks
 * This mainly show up in:
 *
 * 1. The root default field for documents.
 *
 * 2. The schema used for out of schema fields (which thus must be empty/not exist) on object and leaf nodes.
 */
export const forbiddenFieldKindIdentifier = "Forbidden";

/**
 * A schema for empty fields (fields which must always be empty).
 * There are multiple ways this could be encoded, but this is the most explicit.
 */
export const storedEmptyFieldSchema: TreeFieldStoredSchema = {
	// This kind requires the field to be empty.
	kind: brand(forbiddenFieldKindIdentifier),
	// This type set also forces the field to be empty not not allowing any types as all.
	types: new Set(),
	persistedMetadata: undefined,
};

/**
 * Identifier used for the FieldKind for fields of type identifier.
 */
export const identifierFieldKindIdentifier = "Identifier";

export abstract class TreeNodeStoredSchema {
	protected _typeCheck!: MakeNominal;

	/**
	 * Constructor for a TreeNodeStoredSchema.
	 * @param metadata - Persisted metadata for this node schema.
	 */
	public constructor(public readonly metadata: PersistedMetadataFormat | undefined) {}

	/**
	 * Encode in the v1 schema format.
	 */
	public abstract encodeV1(): TreeNodeSchemaDataFormatV1;

	/**
	 * Encode in the v2 schema format.
	 * @remarks Post-condition: if metadata was specified on the input schema, it will be present in the output.
	 */
	public abstract encodeV2(): TreeNodeSchemaDataFormatV2;

	/**
	 * Returns the schema for the provided field.
	 */
	public abstract getFieldSchema(field: FieldKey): TreeFieldStoredSchema;
}

export class ObjectNodeStoredSchema extends TreeNodeStoredSchema {
	/**
	 * @param objectNodeFields -
	 * Schema for fields with keys scoped to this TreeNodeStoredSchema.
	 * This refers to the TreeFieldStoredSchema directly
	 * (as opposed to just supporting FieldSchemaIdentifier and having a central FieldKey -\> TreeFieldStoredSchema map).
	 * This allows us short friendly field keys which can be ergonomically used as field names in code.
	 * It also interoperates well with mapFields being used as a map with arbitrary data as keys.
	 */
	public constructor(
		public readonly objectNodeFields: ReadonlyMap<FieldKey, TreeFieldStoredSchema>,
		metadata?: PersistedMetadataFormat | undefined,
	) {
		super(metadata);
	}

	public override encodeV1(): TreeNodeSchemaDataFormatV1 {
		const fieldsObject: Record<string, FieldSchemaFormat> =
			this.encodeFieldsObject(encodeFieldSchemaV1);

		return {
			object: fieldsObject,
		};
	}

	public override encodeV2(): TreeNodeSchemaDataFormatV2 {
		const fieldsObject: Record<string, FieldSchemaFormat> =
			this.encodeFieldsObject(encodeFieldSchemaV2);
		const kind = { object: fieldsObject };

		return { kind, metadata: this.metadata };
	}

	public override getFieldSchema(field: FieldKey): TreeFieldStoredSchema {
		return this.objectNodeFields.get(field) ?? storedEmptyFieldSchema;
	}

	private encodeFieldsObject(
		encodeFieldSchema: (storedFieldSchema: TreeFieldStoredSchema) => FieldSchemaFormat,
	): Record<string, FieldSchemaFormat> {
		const fieldsObject: Record<string, FieldSchemaFormat> = Object.create(null);
		// Sort fields to ensure output is identical for for equivalent schema (since field order is not considered significant).
		// This makes comparing schema easier, and ensures chunk reuse for schema summaries isn't needlessly broken.
		for (const key of [...this.objectNodeFields.keys()].sort()) {
			Object.defineProperty(fieldsObject, key, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: encodeFieldSchema(
					this.objectNodeFields.get(key) ?? fail(0xae7 /* missing field */),
				),
			});
		}
		return fieldsObject;
	}
}

export class MapNodeStoredSchema extends TreeNodeStoredSchema {
	/**
	 * @param mapFields -
	 * Allows using the fields as a map, with the keys being
	 * FieldKeys and the values being constrained by this TreeFieldStoredSchema.
	 * Usually `FieldKind.Value` should NOT be used here
	 * since no nodes can ever be in schema if you use `FieldKind.Value` here
	 * (that would require infinite children).
	 */
	public constructor(
		public readonly mapFields: TreeFieldStoredSchema,
		metadata?: PersistedMetadataFormat | undefined,
	) {
		super(metadata);
	}

	public override encodeV1(): TreeNodeSchemaDataFormatV1 {
		return {
			map: encodeFieldSchemaV1(this.mapFields),
		};
	}

	public override encodeV2(): TreeNodeSchemaDataFormatV2 {
		const kind = { map: encodeFieldSchemaV2(this.mapFields) };
		return { kind, metadata: this.metadata };
	}

	public override getFieldSchema(field: FieldKey): TreeFieldStoredSchema {
		return this.mapFields;
	}
}

export class LeafNodeStoredSchema extends TreeNodeStoredSchema {
	/**
	 * @param leafValue -
	 * There are several approaches for how to store actual data in the tree
	 * (special node types, special field contents, data on nodes etc.)
	 * as well as several options about how the data should be modeled at this level
	 * (byte sequence? javascript type? json?),
	 * as well as options for how much of this would be exposed in the schema language
	 * (ex: would all nodes with values be special built-ins, or could any schema add them?)
	 * A simple easy to do in javascript approach is taken here:
	 * this is not intended to be a suggestion of what approach to take, or what to expose in the schema language.
	 * This is simply one approach that can work for modeling them in the internal schema representation.
	 */
	public constructor(public readonly leafValue: ValueSchema) {
		// No metadata for leaf nodes.
		super(undefined);
	}

	public override encodeV1(): TreeNodeSchemaDataFormatV1 {
		return {
			leaf: encodeValueSchema(this.leafValue),
		};
	}

	public override encodeV2(): TreeNodeSchemaDataFormatV2 {
		return {
			// No metadata for leaf nodes, so don't emit a metadata field.
			kind: {
				leaf: encodeValueSchema(this.leafValue),
			},
		};
	}

	public override getFieldSchema(field: FieldKey): TreeFieldStoredSchema {
		return storedEmptyFieldSchema;
	}
}

/**
 * Decoder wrapper function for {@link TreeNodeStoredSchema} implementations.
 * Curries the constructor so that the caller can inject metadata.
 */
type StoredSchemaDecoder = (
	metadata: PersistedMetadataFormat | undefined,
) => TreeNodeStoredSchema;

export const storedSchemaDecodeDispatcher: DiscriminatedUnionDispatcher<
	TreeNodeSchemaUnionFormat,
	[],
	StoredSchemaDecoder
> = new DiscriminatedUnionDispatcher({
	leaf: (data: PersistedValueSchema) => (metadata) =>
		new LeafNodeStoredSchema(decodeValueSchema(data)),
	object: (data: Record<TreeNodeSchemaIdentifier, FieldSchemaFormat>) => (metadata) => {
		const map = new Map();
		for (const [key, value] of Object.entries(data)) {
			map.set(key, decodeFieldSchema(value));
		}
		return new ObjectNodeStoredSchema(map, metadata);
	},
	map: (data: FieldSchemaFormat) => (metadata) =>
		new MapNodeStoredSchema(decodeFieldSchema(data), metadata),
});

const valueSchemaEncode = new Map([
	[ValueSchema.Number, PersistedValueSchema.Number],
	[ValueSchema.String, PersistedValueSchema.String],
	[ValueSchema.Boolean, PersistedValueSchema.Boolean],
	[ValueSchema.FluidHandle, PersistedValueSchema.FluidHandle],
	[ValueSchema.Null, PersistedValueSchema.Null],
]);

const valueSchemaDecode = invertMap(valueSchemaEncode);

function encodeValueSchema(inMemory: ValueSchema): PersistedValueSchema {
	return valueSchemaEncode.get(inMemory) ?? fail(0xae8 /* missing PersistedValueSchema */);
}

function decodeValueSchema(inMemory: PersistedValueSchema): ValueSchema {
	return valueSchemaDecode.get(inMemory) ?? fail(0xae9 /* missing ValueSchema */);
}

export function encodeFieldSchemaV1(schema: TreeFieldStoredSchema): FieldSchemaFormatV1 {
	return {
		kind: schema.kind,
		// Types are sorted by identifier to improve stability of persisted data to increase chance of schema blob reuse.
		types: [...schema.types].sort(),
	};
}

export function encodeFieldSchemaV2(schema: TreeFieldStoredSchema): FieldSchemaFormatV2 {
	const fieldSchema: FieldSchemaFormatV1 = encodeFieldSchemaV1(schema);

	// Omit metadata from the output if it is undefined
	return schema.persistedMetadata !== undefined
		? { ...fieldSchema, metadata: schema.persistedMetadata }
		: { ...fieldSchema };
}

export function decodeFieldSchema(schema: FieldSchemaFormatV2): TreeFieldStoredSchema {
	const out: TreeFieldStoredSchema = {
		// TODO: maybe provide actual FieldKind objects here, error on unrecognized kinds.
		kind: schema.kind,
		types: new Set(schema.types),
		persistedMetadata: schema.metadata,
	};
	return out;
}

/**
 * Document schema data that can be stored in a document.
 *
 * @remarks
 * Note: the owner of this may modify it over time:
 * thus if needing to hand onto a specific version, make a copy.
 */
export interface TreeStoredSchema extends StoredSchemaCollection {
	/**
	 * Schema for the root field which contains the whole tree.
	 */
	readonly rootFieldSchema: TreeFieldStoredSchema;
}

/**
 * Collection of TreeNodeSchema data that can be stored in a document.
 *
 * @remarks
 * Note: the owner of this may modify it over time:
 * thus if needing to hang onto a specific version, make a copy.
 */
export interface StoredSchemaCollection {
	/**
	 * {@inheritdoc StoredSchemaCollection}
	 */
	readonly nodeSchema: ReadonlyMap<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>;
}
