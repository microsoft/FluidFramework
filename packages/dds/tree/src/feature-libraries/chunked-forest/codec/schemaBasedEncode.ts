/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase, fail } from "@fluidframework/core-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";

import {
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	type StoredSchemaCollection,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type FieldKey,
	type ITreeCursorSynchronous,
	ValueSchema,
	Multiplicity,
	identifierFieldKindIdentifier,
	type SchemaPolicy,
	type Value,
	forEachField,
	forEachNode,
} from "../../../core/index.js";
import {
	brand,
	compareStrings,
	createTupleComparator,
	getOrCreate,
	newTupleBTree,
	oneFromIterable,
	type TupleBTree,
} from "../../../util/index.js";

import type { IncrementalEncoder } from "./codecs.js";
import {
	AnyShape,
	EncoderContext,
	type BufferFormat,
	type FieldEncoder,
	type FieldEncodeBuilder,
	type FieldEncoderPolicy,
	type KeyedFieldEncoder,
	type NodeEncoder,
	type NodeEncodeBuilder,
	type NodeEncoderPolicy,
	type Shape,
	anyNodeEncoder,
	asFieldEncoder,
	compressedEncode,
	incrementalFieldEncoder,
} from "./compressedEncode.js";
import type { FieldBatch } from "./fieldBatch.js";
import {
	type EncodedFieldBatchV1,
	type EncodedFieldBatchV1OrV2,
	type EncodedFieldBatchV2,
	type EncodedFieldBatchVTextExperimental,
	type EncodedIncrementalFieldBatch,
	type EncodedValueShape,
	FieldBatchFormatVersion,
	SpecialField,
} from "./format/index.js";
import { defaultIncrementalEncodingPolicy } from "./incrementalEncodingPolicy.js";
import { NodeShapeBasedEncoder, SpecializedNodeShapeEncoder } from "./nodeEncoder.js";

/**
 * Encode data from `fieldBatch` in into an `EncodedChunk` using {@link FieldBatchFormatVersion.v1}.
 * @remarks See {@link schemaCompressedEncode} for more details.
 * This version does not support incremental encoding.
 */
export function schemaCompressedEncodeV1(
	schema: StoredSchemaCollection,
	policy: SchemaPolicy,
	fieldBatch: FieldBatch,
	idCompressor: IIdCompressor,
	_incrementalEncoder: IncrementalEncoder | undefined,
	isSummary: boolean,
): EncodedFieldBatchV1 {
	const encoded: EncodedFieldBatchV1OrV2 = schemaCompressedEncode(
		schema,
		policy,
		fieldBatch,
		idCompressor,
		undefined /* incrementalEncoder */,
		brand(FieldBatchFormatVersion.v1),
		isSummary,
	);
	// Since incrementalEncoder was not provided, no V2 features should be used, and this cast should be safe.
	return encoded as EncodedFieldBatchV1;
}

/**
 * Encode data from `fieldBatch` in into an `EncodedChunk` using {@link FieldBatchFormatVersion.v2}.
 * @remarks See {@link schemaCompressedEncode} for more details.
 * Incremental encoding is supported from this version onwards.
 */
export function schemaCompressedEncodeV2(
	schema: StoredSchemaCollection,
	policy: SchemaPolicy,
	fieldBatch: FieldBatch,
	idCompressor: IIdCompressor,
	incrementalEncoder: IncrementalEncoder | undefined,
	isSummary: boolean,
): EncodedFieldBatchV2 {
	return schemaCompressedEncode(
		schema,
		policy,
		fieldBatch,
		idCompressor,
		incrementalEncoder,
		brand(FieldBatchFormatVersion.v2),
		isSummary,
	);
}

/**
 * Encode data from `fieldBatch` in into an `EncodedChunk`.
 * @remarks
 * If `incrementalEncoder` is provided,
 * fields that support incremental encoding will encode their chunks separately via the `incrementalEncoder`.
 * See {@link IncrementalEncoder} for more details.
 *
 * Optimized for encoded size and encoding performance.
 * TODO: This function should eventually also take in the root FieldSchema to more efficiently compress the nodes.
 */
function schemaCompressedEncode(
	schema: StoredSchemaCollection,
	policy: SchemaPolicy,
	fieldBatch: FieldBatch,
	idCompressor: IIdCompressor,
	incrementalEncoder: IncrementalEncoder | undefined,
	version: FieldBatchFormatVersion,
	isSummary: boolean,
): EncodedFieldBatchV1OrV2 {
	return compressedEncode(
		fieldBatch,
		buildContext(schema, policy, idCompressor, incrementalEncoder, version, isSummary),
	);
}

export function buildContext(
	storedSchema: StoredSchemaCollection,
	policy: SchemaPolicy,
	idCompressor: IIdCompressor,
	incrementalEncoder: IncrementalEncoder | undefined,
	version: FieldBatchFormatVersion,
	isSummary: boolean,
): EncoderContext {
	const context: EncoderContext = new EncoderContext(
		(fieldBuilder: FieldEncodeBuilder, schemaName: TreeNodeSchemaIdentifier) =>
			getNodeEncoder(fieldBuilder, storedSchema, schemaName, incrementalEncoder),
		(nodeBuilder: NodeEncodeBuilder, fieldSchema: TreeFieldStoredSchema) =>
			getFieldEncoder(nodeBuilder, fieldSchema, context, storedSchema),
		policy.fieldKinds,
		idCompressor,
		incrementalEncoder,
		version,
		isSummary,
	);
	return context;
}

/**
 * Selects an encoder to use to encode fields.
 */
export function getFieldEncoder(
	nodeBuilder: NodeEncodeBuilder,
	field: TreeFieldStoredSchema,
	context: EncoderContext,
	storedSchema: StoredSchemaCollection,
): FieldEncoder {
	const kind = context.fieldShapes.get(field.kind) ?? fail(0xb52 /* missing FieldKind */);
	const type = oneFromIterable(field.types);
	const nodeEncoder =
		type === undefined ? anyNodeEncoder : nodeBuilder.nodeEncoderFromSchema(type);
	if (kind.multiplicity === Multiplicity.Single) {
		if (field.kind === identifierFieldKindIdentifier) {
			assert(type !== undefined, 0x999 /* field type must be defined in identifier field */);
			const nodeSchema = storedSchema.nodeSchema.get(type);
			assert(nodeSchema !== undefined, 0x99a /* nodeSchema must be defined */);
			assert(
				nodeSchema instanceof LeafNodeStoredSchema,
				0x99b /* nodeSchema must be LeafNodeStoredSchema */,
			);
			assert(
				nodeSchema.leafValue === ValueSchema.String,
				0x99c /* identifier field can only be type string */,
			);
			const identifierNodeEncoder = new NodeShapeBasedEncoder(
				type,
				SpecialField.Identifier,
				[],
				undefined,
			);
			return asFieldEncoder(identifierNodeEncoder);
		}
		return asFieldEncoder(nodeEncoder);
	} else {
		return context.nestedArrayEncoder(nodeEncoder);
	}
}

/**
 * Selects an encoder to use to encode nodes.
 */
export function getNodeEncoder(
	fieldBuilder: FieldEncodeBuilder,
	storedSchema: StoredSchemaCollection,
	schemaName: TreeNodeSchemaIdentifier,
	incrementalEncoder?: IncrementalEncoder,
): NodeShapeBasedEncoder {
	const shouldEncodeIncrementally =
		incrementalEncoder?.shouldEncodeIncrementally ?? defaultIncrementalEncodingPolicy;
	const schema =
		storedSchema.nodeSchema.get(schemaName) ?? fail(0xb53 /* missing node schema */);

	// This handles both object and array nodes.
	if (schema instanceof ObjectNodeStoredSchema) {
		// TODO:Performance:
		// consider moving some optional and sequence fields to extra fields if they are commonly empty
		// to reduce encoded size.
		const objectNodeFields: KeyedFieldEncoder[] = [];
		for (const [key, field] of schema.objectNodeFields ?? []) {
			const fieldEncoder = shouldEncodeIncrementally(schemaName, key)
				? incrementalFieldEncoder
				: fieldBuilder.fieldEncoderFromSchema(field);
			objectNodeFields.push({
				key,
				encoder: fieldEncoder,
			});
		}

		const shape = new NodeShapeBasedEncoder(schemaName, false, objectNodeFields, undefined);
		return shape;
	}
	if (schema instanceof LeafNodeStoredSchema) {
		const shape = new NodeShapeBasedEncoder(
			schemaName,
			valueShapeFromSchema(schema.leafValue),
			[],
			undefined,
		);
		return shape;
	}

	// This handles both maps and record nodes.
	if (schema instanceof MapNodeStoredSchema) {
		const fieldEncoder = shouldEncodeIncrementally(schemaName)
			? incrementalFieldEncoder
			: fieldBuilder.fieldEncoderFromSchema(schema.mapFields);
		const shape = new NodeShapeBasedEncoder(schemaName, false, [], fieldEncoder);
		return shape;
	}
	fail(0xb54 /* unsupported node kind */);
}

function valueShapeFromSchema(schema: ValueSchema | undefined): undefined | EncodedValueShape {
	switch (schema) {
		case undefined: {
			return false;
		}
		case ValueSchema.Number:
		case ValueSchema.String:
		case ValueSchema.Boolean:
		case ValueSchema.FluidHandle: {
			return true;
		}
		case ValueSchema.Null: {
			return [null];
		}
		default: {
			unreachableCase(schema);
		}
	}
}

// #region VText

/**
 * The VText format: a format that removes repeated field values from the data array.
 *
 * @remarks
 * This region adds specialized node shapes to the codec. A specialized shape keeps one or more
 * field values as constants in the shape. A node that uses a specialized shape does not keep
 * those values in the data array. See {@link SpecializedNodeShapeEncoder}.
 *
 * This region defines these terms. The other comments in this region use these terms and do not
 * define them again.
 *
 * - **Batch**: the data of one {@link compressedEncode} call. An incremental sub-chunk is a
 * separate batch.
 * - **Specializable field**: a required field of an ObjectNode with one boolean, string, or
 * number value. See {@link SpecializableField}.
 * - **Node group**: a group of nodes of one type that have equal values in all their
 * specializable fields. See {@link NodeGroupCounts}.
 * - **Select a field**: use a specializable field to put nodes into node groups. See
 * {@link SpecializationDecision.selectedFieldIndices}.
 * - **Specialize a node group**: make a specialized shape that keeps the selected field values of
 * a node group as constants. Nodes that use this shape do not keep those values in the data
 * array.
 * - **Dispatch token**: an index that a node writes before its data. A node writes a dispatch
 * token only when its type can use more than one shape. See {@link dispatchTokenBytes}.
 *
 * The VText format is experimental. This region keeps its code separate from the v1 and v2 code
 * above it.
 */

/**
 * Encodes data from `fieldBatch` into an `EncodedChunk`.
 * @remarks
 * This function uses {@link FieldBatchFormatVersion.vTextExperimental}. This format can use
 * specialized node shapes ('f'). See {@link SpecializedNodeShapeEncoder}.
 *
 * {@link chooseSpecialization} decides which node groups to specialize. It uses an estimate of the
 * saved bytes. It does not use a fixed minimum count.
 */
export function schemaCompressedEncodeVTextExperimental(
	schema: StoredSchemaCollection,
	policy: SchemaPolicy,
	fieldBatch: FieldBatch,
	idCompressor: IIdCompressor,
	incrementalEncoder: IncrementalEncoder | undefined,
	isSummary: boolean,
): EncodedFieldBatchVTextExperimental {
	const cache = new Map<TreeNodeSchemaIdentifier, readonly SpecializableField[]>();
	return encodeBatchVText(fieldBatch, {
		storedSchema: schema,
		policy,
		idCompressor,
		incrementalEncoder,
		isSummary,
		specializableFieldsOf: (type) =>
			getOrCreate(cache, type, () =>
				findSpecializableFields(schema, policy, incrementalEncoder, type),
			),
	});
}

/**
 * The inputs of one VText encode. These inputs are the same for all batches of the encode.
 */
interface VTextEncodeOptions {
	readonly storedSchema: StoredSchemaCollection;
	readonly policy: SchemaPolicy;
	readonly idCompressor: IIdCompressor;
	readonly incrementalEncoder: IncrementalEncoder | undefined;
	readonly isSummary: boolean;
	/**
	 * Returns the specializable fields of a node type, in a fixed order. Returns an empty array if
	 * the type has no specializable fields.
	 */
	readonly specializableFieldsOf: (
		type: TreeNodeSchemaIdentifier,
	) => readonly SpecializableField[];
}

/**
 * Encodes one batch in the VText format.
 * @remarks
 * This function does four steps. Each step has its own input and output:
 *
 * 1. {@link collectBatchCounts} counts the node groups of each node type. It returns read-only
 * {@link BatchCounts}. This step only counts. It cannot access a decision.
 *
 * 2. {@link decideBatchSpecializations} gives the counts of each node type to
 * {@link chooseSpecialization}. It returns read-only {@link BatchSpecializations}. These are plain
 * values. They contain no encoders.
 *
 * 3. {@link buildBatchContext} changes the decisions into an {@link EncoderContext}. In this
 * context, each node type has one fixed encoder. See {@link nodeEncoderFromDecision}.
 *
 * 4. {@link compressedEncode} encodes the batch with that context.
 *
 * An incremental sub-chunk does the four steps again, with its own counts. See
 * {@link EncoderContext.encodeIncrementalChunk}.
 */
function encodeBatchVText(
	fieldBatch: FieldBatch,
	options: VTextEncodeOptions,
): EncodedFieldBatchV1OrV2 {
	const counts = collectBatchCounts(fieldBatch, options);
	const decisions = decideBatchSpecializations(counts, options.specializableFieldsOf);
	return compressedEncode(fieldBatch, buildBatchContext(decisions, options));
}

/**
 * Records the node group of each node in `fieldBatch` that has specializable fields.
 *
 * @remarks
 * This is step 1 of {@link encodeBatchVText}. This function reads each node one time. It only
 * counts. It cannot access a specialization decision.
 *
 * This function does not count the nodes in incremental fields. Those nodes are in a separate
 * batch, which has its own counts. The outer batch does not encode those nodes. Thus they must not
 * change the counts of the outer batch.
 */
function collectBatchCounts(fieldBatch: FieldBatch, options: VTextEncodeOptions): BatchCounts {
	const counts: MutableBatchCounts = new Map();
	for (const cursor of fieldBatch) {
		forEachNode(cursor, () => {
			countNodeAndDescendants(cursor, options, counts);
		});
	}
	return counts;
}

/**
 * Counts the current node and all nodes below it.
 *
 * @remarks
 * This function reads nodes at all depths. Each ObjectNode can be part of a node group.
 *
 * The node group key of a node uses only the leaf values of that node. Thus the order in which
 * this function reads the nodes does not change the result, and one pass is sufficient.
 *
 * This function does not read incremental fields.
 *
 * TODO: The node group key could also include values other than leaf values, such as the shape
 * of a sub-object field. Then the key of a node would depend on the decisions for its
 * descendants, so one pass would no longer be sufficient.
 */
function countNodeAndDescendants(
	cursor: ITreeCursorSynchronous,
	options: VTextEncodeOptions,
	counts: MutableBatchCounts,
): void {
	const shouldEncodeIncrementally = options.incrementalEncoder?.shouldEncodeIncrementally;
	const nodeType: TreeNodeSchemaIdentifier = cursor.type;
	const schema = options.storedSchema.nodeSchema.get(nodeType);
	if (schema instanceof ObjectNodeStoredSchema) {
		// Object/Array: per-field policy decision. The cursor's field key is the object field
		// key for objects. For arrays, the field key is "". The contract accepts both forms.
		forEachField(cursor, () => {
			if (shouldEncodeIncrementally?.(nodeType, cursor.getFieldKey()) === true) {
				return;
			}
			forEachNode(cursor, () => {
				countNodeAndDescendants(cursor, options, counts);
			});
		});
	} else if (schema instanceof MapNodeStoredSchema) {
		// Map/Record: per-node policy decision; the contract requires fieldKey to be undefined.
		// Mirrors the single shouldEncodeIncrementally(schemaName) call in getNodeEncoder.
		if (shouldEncodeIncrementally?.(nodeType) === true) {
			return;
		}
		forEachField(cursor, () => {
			forEachNode(cursor, () => {
				countNodeAndDescendants(cursor, options, counts);
			});
		});
	}
	const fields = options.specializableFieldsOf(nodeType);
	if (fields.length > 0) {
		const values = readSpecializableValues(cursor, fields);
		const nodeGroups = getOrCreate(counts, nodeType, () => newNodeGroupMap<NodeGroupTally>());
		const existing = nodeGroups.get(values);
		if (existing === undefined) {
			nodeGroups.set(values, { count: 1, values });
		} else {
			existing.count += 1;
		}
	}
}

/**
 * The {@link EncoderContext} of one VText batch.
 * @remarks
 * The node encoders of this context do not change during the batch. This class changes only one
 * behavior: it encodes each incremental sub-chunk as a new batch, with its own counts and
 * decisions.
 */
class VTextEncoderContext extends EncoderContext {
	public constructor(
		nodeEncoderFromPolicy: NodeEncoderPolicy,
		fieldEncoderFromPolicy: FieldEncoderPolicy,
		private readonly options: VTextEncodeOptions,
	) {
		super(
			nodeEncoderFromPolicy,
			fieldEncoderFromPolicy,
			options.policy.fieldKinds,
			options.idCompressor,
			options.incrementalEncoder,
			brand(FieldBatchFormatVersion.vTextExperimental),
			options.isSummary,
		);
	}

	public override encodeIncrementalChunk(
		fieldBatch: FieldBatch,
	): EncodedIncrementalFieldBatch {
		return encodeBatchVText(fieldBatch, this.options);
	}
}

/**
 * Makes the {@link EncoderContext} of one batch from the decisions of the batch.
 * @remarks
 * This is step 3 of {@link encodeBatchVText}. A node type that has no decision uses its base
 * encoder from {@link getNodeEncoder}.
 */
function buildBatchContext(
	decisions: BatchSpecializations,
	options: VTextEncodeOptions,
): EncoderContext {
	const { storedSchema, incrementalEncoder } = options;
	const context: VTextEncoderContext = new VTextEncoderContext(
		(fieldBuilder: FieldEncodeBuilder, schemaName: TreeNodeSchemaIdentifier) => {
			const base = getNodeEncoder(fieldBuilder, storedSchema, schemaName, incrementalEncoder);
			const decision = decisions.get(schemaName);
			return decision === undefined
				? base
				: nodeEncoderFromDecision(base, options.specializableFieldsOf(schemaName), decision);
		},
		(nodeBuilder: NodeEncodeBuilder, fieldSchema: TreeFieldStoredSchema) =>
			getFieldEncoder(nodeBuilder, fieldSchema, context, storedSchema),
		options,
	);
	return context;
}

/**
 * Finds the specializable fields of a node type.
 * @remarks
 * This function sorts the result by field key. A node group key has one value for each field, in
 * this order. Thus this order must be the same for all nodes of the type.
 */
function findSpecializableFields(
	storedSchema: StoredSchemaCollection,
	policy: SchemaPolicy,
	incrementalEncoder: IncrementalEncoder | undefined,
	schemaName: TreeNodeSchemaIdentifier,
): readonly SpecializableField[] {
	const schema = storedSchema.nodeSchema.get(schemaName) ?? fail("missing node schema");

	const specializableFields: SpecializableField[] = [];
	if (schema instanceof ObjectNodeStoredSchema) {
		for (const [key, field] of schema.objectNodeFields ?? []) {
			if (policy.fieldKinds.get(field.kind)?.multiplicity !== Multiplicity.Single) {
				continue;
			}
			// Identifier fields must keep the base SpecialField.Identifier encoding (id-compressor
			// op-space normalization)
			if (field.kind === identifierFieldKindIdentifier) {
				continue;
			}
			// Do not specialize a field that the incremental policy encodes out-of-band. If this
			// code specialized the value of that field, it would override the decision of the caller.
			if (incrementalEncoder?.shouldEncodeIncrementally?.(schemaName, key) === true) {
				continue;
			}
			const type = oneFromIterable(field.types);
			if (type === undefined) {
				// A field with more than one allowed type is not a specializable leaf.
				continue;
			}
			const nodeSchema = storedSchema.nodeSchema.get(type);
			if (
				nodeSchema instanceof LeafNodeStoredSchema &&
				(nodeSchema.leafValue === ValueSchema.Boolean ||
					nodeSchema.leafValue === ValueSchema.String ||
					nodeSchema.leafValue === ValueSchema.Number)
			) {
				specializableFields.push({ key, leafType: type });
			}
		}
	}

	specializableFields.sort((left, right) => compareStrings(left.key, right.key));
	return specializableFields;
}

/**
 * Estimated bytes of the dispatch token of one instance.
 * @remarks
 * Each instance of a node type pays this cost when the type uses `numShapes` shapes through
 * {@link AnyShape}. Because of this cost, the specialization of a node group with a low gain can
 * make the output larger.
 *
 * The token is a number, so its width increases with the number of shapes. The `+ 2` is for the
 * delimiter of the token. It is also for the global shape table, which is larger than the shapes
 * of this type. Thus a small number of specialized node groups costs little. A large number of
 * specialized node groups with a low gain costs more than it saves.
 *
 * This function and the constants below estimate the size of the encoded JSON. They do not give
 * exact byte counts. The size tests give the correct values. These estimates are set so that the
 * specialization decisions agree with the real encoder output in those tests.
 */
function dispatchTokenBytes(numShapes: number): number {
	return String(Math.max(1, numShapes) - 1).length + 2;
}

/**
 * Estimated bytes of the wrapper of a specialized ('f') shape: its `base` field and the frame of
 * its `fields`.
 */
const specializedShapeWrapperBytes = 16;

/**
 * Estimated bytes that each overridden field adds to a specialized shape: its
 * `[keyRef, shapeRef]` entry.
 */
const overrideFieldBytes = 6;

/**
 * Estimated bytes of the `{ c: { type, value } }` frame of one constant leaf shape.
 * @remarks
 * This constant does not include the bytes of the value. {@link valueByteEstimate} counts them.
 */
const constantLeafShapeWrapperBytes = 24;

/**
 * Estimated bytes of the separator after a value in the data array.
 * @remarks
 * When the encoder specializes a field, each instance does not write the value or its separator.
 * Thus each instance saves {@link valueByteEstimate} plus this constant. This is most important
 * for nodes with many specialized fields. For example, a specialized 3-coordinate point does not
 * write three values and three separators.
 */
const dataSeparatorBytes = 1;

/**
 * Estimated inline data bytes of a leaf value.
 * @remarks
 * Strings include their quotes in this estimate. Numbers and booleans use their literal length.
 */
function valueByteEstimate(value: Value): number {
	switch (typeof value) {
		case "string": {
			return value.length + 2;
		}
		case "number": {
			return String(value).length;
		}
		case "boolean": {
			return 1;
		}
		default: {
			return fail("specializable leaf value must be string, number, or boolean");
		}
	}
}

/**
 * A specializable field.
 * @remarks
 * This is a single-valued boolean, string, or number leaf field of an ObjectNode. A specialized
 * shape can keep the value of this field as a constant. See {@link SpecializedNodeShapeEncoder}.
 */
interface SpecializableField {
	readonly key: FieldKey;
	readonly leafType: TreeNodeSchemaIdentifier;
}

/**
 * The value of a {@link SpecializableField}.
 */
export type SpecializableValue = boolean | number | string;

/**
 * Identifies a node group by its leaf values.
 * @remarks
 * Nodes of one type that have equal values in the same specializable fields have equal node group
 * keys. Nodes with equal node group keys can use one {@link SpecializedNodeShapeEncoder}.
 *
 * A node group key is a tuple with one value for each field, in a fixed field order. All keys in
 * one {@link NodeGroupMap} have the same length. Each field has one leaf type. Thus values at the
 * same index always have the same type, and {@link compareNodeGroupKeys} can compare them
 * directly.
 */
export type NodeGroupKey = readonly SpecializableValue[];

/**
 * Compares two {@link NodeGroupKey}s one element at a time.
 */
const compareNodeGroupKeys = createTupleComparator<NodeGroupKey>();

/**
 * A map with {@link NodeGroupKey} keys.
 */
export type NodeGroupMap<V> = TupleBTree<NodeGroupKey, V>;

/**
 * The read-only part of {@link NodeGroupMap}.
 */
export interface ReadonlyNodeGroupMap<V> {
	readonly size: number;
	get(key: NodeGroupKey): V | undefined;
	values(): IterableIterator<V>;
	entries(): IterableIterator<[NodeGroupKey, V]>;
}

/**
 * Makes an empty {@link NodeGroupMap}.
 */
export function newNodeGroupMap<V>(): NodeGroupMap<V> {
	return newTupleBTree<NodeGroupKey, V>(compareNodeGroupKeys);
}

/**
 * The data that the count pass records for one node group.
 * @remarks
 * This data is the number of nodes in the node group and the values of their specializable
 * fields. {@link chooseSpecialization} uses these values to select fields and to choose node
 * groups. Because this data contains the values, the later steps do not read a cursor again.
 */
export interface NodeGroupCounts {
	/** The number of nodes in the node group. */
	readonly count: number;
	/** The values of all specializable fields, in the sorted field order of the type. */
	readonly values: NodeGroupKey;
}

/**
 * A {@link NodeGroupCounts} that the count pass can change.
 */
interface NodeGroupTally extends NodeGroupCounts {
	count: number;
}

/**
 * A node group that uses only the selected fields.
 * @remarks
 * The nodes in this group have equal values in all selected fields. Their other fields can have
 * different values. One specialized shape is for one such group.
 */
interface SelectedNodeGroupCounts {
	/** The number of nodes in the group. */
	readonly count: number;
	/** The values of the selected fields, in the order of the selected fields. */
	readonly selectedValues: NodeGroupKey;
}

/**
 * The data that the count pass ({@link collectBatchCounts}) records for one batch.
 * @remarks
 * For each node type that has nodes in the batch, this map holds all node groups of that type.
 * Each key is the node group key of all specializable fields. This data is read-only. It contains
 * no decisions.
 */
type BatchCounts = ReadonlyMap<
	TreeNodeSchemaIdentifier,
	ReadonlyNodeGroupMap<NodeGroupCounts>
>;

/**
 * The {@link BatchCounts} that the count pass changes while it counts.
 */
type MutableBatchCounts = Map<TreeNodeSchemaIdentifier, NodeGroupMap<NodeGroupTally>>;

/**
 * The specialization decisions for one batch.
 * @remarks
 * This map holds one {@link SpecializationDecision} for each node type that has nodes in the
 * batch. {@link decideBatchSpecializations} makes this map from {@link BatchCounts}. It is
 * read-only.
 */
type BatchSpecializations = ReadonlyMap<TreeNodeSchemaIdentifier, SpecializationDecision>;

/**
 * Makes the specialization decision of each node type in a batch from the counts of the batch.
 * @remarks
 * This is step 2 of {@link encodeBatchVText}.
 */
function decideBatchSpecializations(
	counts: BatchCounts,
	specializableFieldsOf: (type: TreeNodeSchemaIdentifier) => readonly SpecializableField[],
): BatchSpecializations {
	const decisions = new Map<TreeNodeSchemaIdentifier, SpecializationDecision>();
	for (const [type, nodeGroups] of counts) {
		decisions.set(type, chooseSpecialization(specializableFieldsOf(type).length, nodeGroups));
	}
	return decisions;
}

/**
 * The decision of {@link chooseSpecialization} for one node type in one batch.
 * @remarks
 * This is a plain value. It contains no encoders. {@link nodeEncoderFromDecision} makes the
 * encoders from it.
 */
export interface SpecializationDecision {
	/** The indices of the selected fields in the specializable fields of the type. */
	readonly selectedFieldIndices: readonly number[];
	/** The selected field values of each specialized node group, in the order of the selected fields. */
	readonly specializedGroups: readonly NodeGroupKey[];
	/**
	 * True if the instances of the type use more than one shape. In that case, each instance
	 * writes a dispatch token.
	 * @remarks
	 * If this is false, all instances use one shape. This is the shape of the one specialized node
	 * group, or the base shape if the decision specializes no node group.
	 */
	readonly polymorphic: boolean;
}

/**
 * The decision that specializes no node group.
 */
const noSpecialization: SpecializationDecision = {
	selectedFieldIndices: [],
	specializedGroups: [],
	polymorphic: false,
};

/**
 * The distinct-value count of each specializable field.
 * @remarks
 * This function computes each count in one pass over the node groups. `fieldCount` is the
 * number of specializable fields. It sets the length of the returned array.
 */
function distinctValueCounts(
	fieldCount: number,
	nodeGroups: ReadonlyNodeGroupMap<NodeGroupCounts>,
): number[] {
	const seen = Array.from({ length: fieldCount }, () => new Set<SpecializableValue>());
	for (const nodeGroup of nodeGroups.values()) {
		for (const [index, distinct] of seen.entries()) {
			distinct.add(nodeGroup.values[index] ?? fail("field index out of range"));
		}
	}
	return seen.map((distinct) => distinct.size);
}

/** Returns `selected` without the field that has the most distinct values. */
function withoutMostDistinctValues(
	selected: readonly number[],
	distinctValueCount: readonly number[],
): number[] {
	let worst = -1;
	let worstDistinctValueCount = -1;
	for (const index of selected) {
		const fieldDistinctValueCount = distinctValueCount[index] ?? 0;
		if (fieldDistinctValueCount > worstDistinctValueCount) {
			worstDistinctValueCount = fieldDistinctValueCount;
			worst = index;
		}
	}
	return selected.filter((index) => index !== worst);
}

/**
 * Returns the values of the `selected` fields, in the order of `selected`.
 */
function selectValues(values: NodeGroupKey, selected: readonly number[]): NodeGroupKey {
	return selected.map(
		(fieldIndex) => values[fieldIndex] ?? fail("selected field index out of range"),
	);
}

/**
 * Re-groups the whole-node node groups into node groups keyed only by the selected fields.
 * @remarks
 * This function sums the counts for nodes that agree on the selected fields but differ on
 * other fields.
 */
function buildSelectedNodeGroups(
	nodeGroups: ReadonlyNodeGroupMap<NodeGroupCounts>,
	selected: readonly number[],
): ReadonlyNodeGroupMap<SelectedNodeGroupCounts> {
	const selectedNodeGroups = newNodeGroupMap<{
		count: number;
		selectedValues: NodeGroupKey;
	}>();
	for (const nodeGroup of nodeGroups.values()) {
		const values = selectValues(nodeGroup.values, selected);
		const existing = selectedNodeGroups.get(values);
		if (existing === undefined) {
			selectedNodeGroups.set(values, { count: nodeGroup.count, selectedValues: values });
		} else {
			existing.count += nodeGroup.count;
		}
	}
	return selectedNodeGroups;
}

/**
 * Estimated bytes that the specialization of one selected node group saves. This estimate does
 * not include the dispatch token cost.
 * @remarks
 * This is the data that each instance does not write, multiplied by the number of instances,
 * minus the cost of the specialized shape. For each selected field, an instance does not write the
 * value or its separator.
 */
function nodeGroupMarginalGain(nodeGroup: SelectedNodeGroupCounts): number {
	let perInstanceSaving = 0;
	let shapeCost = specializedShapeWrapperBytes;
	for (const value of nodeGroup.selectedValues) {
		const valueBytes = valueByteEstimate(value);
		perInstanceSaving += valueBytes + dataSeparatorBytes;
		shapeCost += overrideFieldBytes + constantLeafShapeWrapperBytes + valueBytes;
	}
	return nodeGroup.count * perInstanceSaving - shapeCost;
}

/**
 * Chooses the node groups to specialize.
 * @remarks
 * If no specialization saves bytes, this function returns no node groups.
 *
 * When the encoder specializes a node group, the type can become polymorphic. Then each instance
 * of the type writes a dispatch token. This function compares the saved bytes with the cost of the
 * shapes and the cost of the dispatch tokens.
 *
 * If one node group contains all instances, the type is not polymorphic. No instance writes a
 * dispatch token. If many node groups each save a small number of bytes, their total can be less
 * than the dispatch token cost. In that case, this function specializes no node group.
 */
function specializeNodeGroups(
	selectedNodeGroups: ReadonlyNodeGroupMap<SelectedNodeGroupCounts>,
): { specializedGroups: NodeGroupKey[]; polymorphic: boolean } {
	if (selectedNodeGroups.size === 1) {
		const nodeGroup =
			oneFromIterable(selectedNodeGroups.values()) ?? fail("size-1 map has one entry");
		if (nodeGroupMarginalGain(nodeGroup) > 0) {
			// All instances use one shape. The type is not polymorphic. No instance writes a
			// dispatch token.
			return { specializedGroups: [nodeGroup.selectedValues], polymorphic: false };
		}
	} else if (selectedNodeGroups.size > 1) {
		let totalInstances = 0;
		let summedMarginal = 0;
		const candidates: NodeGroupKey[] = [];
		for (const nodeGroup of selectedNodeGroups.values()) {
			totalInstances += nodeGroup.count;
			const marginal = nodeGroupMarginalGain(nodeGroup);
			if (marginal > 0) {
				summedMarginal += marginal;
				candidates.push(nodeGroup.selectedValues);
			}
		}
		// If this code specializes a node group here, the type becomes polymorphic, and all
		// instances write a dispatch token. The type uses one shape for each specialized node
		// group. It also uses the base shape if a node group is not specialized. The width of the
		// dispatch token increases with the number of shapes.
		const distinctShapes =
			candidates.length + (candidates.length < selectedNodeGroups.size ? 1 : 0);
		if (summedMarginal - totalInstances * dispatchTokenBytes(distinctShapes) > 0) {
			return { specializedGroups: candidates, polymorphic: true };
		}
	}
	return { specializedGroups: [], polymorphic: false };
}

/**
 * Chooses the selected fields and the node groups to specialize.
 * @remarks
 * This function removes fields one at a time. First, it selects all fields that have a repeated
 * value. Then, if no specialization saves bytes, it removes the selected field that has the most
 * different values, and tries again. Thus uniform data gets specialized shapes on the first try,
 * and mixed data can get specialized shapes on a later try.
 *
 * This function gets read-only counts and returns a plain decision. It does not use an encoder, a
 * cursor, or a schema. Thus it is a pure function, and a test can call it directly with counts that
 * the test makes.
 *
 * TODO: This method does not always find the best decision. A slower search could try all
 * combinations of selected fields.
 */
export function chooseSpecialization(
	fieldCount: number,
	nodeGroups: ReadonlyNodeGroupMap<NodeGroupCounts>,
): SpecializationDecision {
	let totalInstances = 0;
	for (const nodeGroup of nodeGroups.values()) {
		totalInstances += nodeGroup.count;
	}
	const distinctValueCount = distinctValueCounts(fieldCount, nodeGroups);
	// Drop fields with no repeated value up front. Such a field can never form a reusable
	// node group. It can only split one node group into more, smaller node groups.
	let selected = Array.from({ length: fieldCount }, (_field, index) => index).filter(
		(index) => (distinctValueCount[index] ?? 0) < totalInstances,
	);

	while (selected.length > 0) {
		const result = specializeNodeGroups(buildSelectedNodeGroups(nodeGroups, selected));
		if (result.specializedGroups.length > 0) {
			return { selectedFieldIndices: selected, ...result };
		}
		// No specialization saves bytes with these fields. Remove the field with the most
		// different values, and try again.
		selected = withoutMostDistinctValues(selected, distinctValueCount);
	}
	return noSpecialization;
}

/**
 * Makes the node encoder of a node type from its decision.
 * @remarks
 * This is part of step 3 of {@link encodeBatchVText}. The result is one of these encoders:
 *
 * - `base`, if the decision specializes no node group.
 *
 * - The {@link SpecializedNodeShapeEncoder} of the one specialized node group, if the decision is
 * not polymorphic. The parent refers to this shape directly. No instance writes a dispatch token.
 *
 * - A {@link SpecializedShapeDispatchEncoder}, if the decision is polymorphic.
 */
function nodeEncoderFromDecision(
	base: NodeShapeBasedEncoder,
	fields: readonly SpecializableField[],
	decision: SpecializationDecision,
): NodeEncoder {
	// Fields with the same leaf type and value use one constant encoder. Thus they use one shape.
	const constantEncoders = new Map<
		TreeNodeSchemaIdentifier,
		Map<SpecializableValue, NodeShapeBasedEncoder>
	>();
	const specializedEncoders = newNodeGroupMap<SpecializedNodeShapeEncoder>();
	for (const values of decision.specializedGroups) {
		specializedEncoders.set(
			values,
			createSpecialized(base, fields, decision.selectedFieldIndices, values, constantEncoders),
		);
	}

	if (decision.polymorphic) {
		return new SpecializedShapeDispatchEncoder(
			base,
			fields,
			decision.selectedFieldIndices,
			specializedEncoders,
		);
	}
	return oneFromIterable(specializedEncoders.values()) ?? base;
}

/**
 * Makes an `f` shape that keeps the selected values of a node group as constants.
 * @remarks
 * Each selected field gets a constant {@link NodeShapeBasedEncoder}. This function gets it from
 * `constantEncoders` by leaf type and value. The nodes of the node group write no data for a
 * selected field. The other fields use the variable encoders of the base shape.
 *
 * `selected` holds indices into `fields`. `values` holds the value of each selected field, in the
 * order of `selected`.
 */
function createSpecialized(
	base: NodeShapeBasedEncoder,
	fields: readonly SpecializableField[],
	selected: readonly number[],
	values: NodeGroupKey,
	constantEncoders: Map<
		TreeNodeSchemaIdentifier,
		Map<SpecializableValue, NodeShapeBasedEncoder>
	>,
): SpecializedNodeShapeEncoder {
	const overrides: KeyedFieldEncoder[] = selected.map((fieldIndex, selectedIndex) => {
		const field = fields[fieldIndex] ?? fail("selected field index out of range");
		const value = values[selectedIndex] ?? fail("selected value index out of range");
		const nodeEncoder = getOrCreate(
			getOrCreate(constantEncoders, field.leafType, () => new Map()),
			value,
			() => new NodeShapeBasedEncoder(field.leafType, [value], [], undefined),
		);
		return { key: field.key, encoder: asFieldEncoder(nodeEncoder) };
	});
	return new SpecializedNodeShapeEncoder(base, overrides);
}

/**
 * Reads the specializable field values of a node, in the order of `fields`.
 * @remarks
 * `fields` contains only required, single-valued leaf fields. Thus each field contains exactly one
 * node.
 */
function readSpecializableValues(
	cursor: ITreeCursorSynchronous,
	fields: readonly SpecializableField[],
): NodeGroupKey {
	const values: SpecializableValue[] = [];
	for (const field of fields) {
		cursor.enterField(brand(field.key));
		assert(cursor.getFieldLength() === 1, "specializable field must contain exactly one node");
		cursor.firstNode();
		const value = cursor.value;
		assert(
			typeof value === "boolean" || typeof value === "number" || typeof value === "string",
			"specializable field value must be a boolean, number, or string",
		);
		values.push(value);
		cursor.exitNode();
		cursor.exitField();
	}
	return values;
}

/**
 * Encodes the instances of a polymorphic node type.
 * @remarks
 * The shape of this encoder is {@link AnyShape}. Each instance writes a dispatch token. Then it
 * writes its data with its own shape. This is the specialized shape of its selected node group, or
 * `base` if that node group is not specialized.
 *
 * The constructor gets all shapes. The shapes do not change after that. See
 * {@link nodeEncoderFromDecision}.
 */
class SpecializedShapeDispatchEncoder implements NodeEncoder {
	public readonly shape: Shape = AnyShape.instance;

	public constructor(
		private readonly base: NodeShapeBasedEncoder,
		private readonly fields: readonly SpecializableField[],
		private readonly selectedFieldIndices: readonly number[],
		private readonly specializedEncoders: ReadonlyNodeGroupMap<SpecializedNodeShapeEncoder>,
	) {}

	public encodeNode(
		cursor: ITreeCursorSynchronous,
		context: EncoderContext,
		outputBuffer: BufferFormat,
	): void {
		const selectedValues = selectValues(
			readSpecializableValues(cursor, this.fields),
			this.selectedFieldIndices,
		);
		const shape = this.specializedEncoders.get(selectedValues) ?? this.base;
		AnyShape.encodeNode(cursor, context, outputBuffer, shape);
	}
}

// #endregion
