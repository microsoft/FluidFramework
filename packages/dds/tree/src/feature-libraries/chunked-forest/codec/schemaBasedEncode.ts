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
	type FieldKindData,
	type FieldKindIdentifier,
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
	type Brand,
	brand,
	compareStrings,
	getLast,
	oneFromIterable,
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
	type EncodedValueShape,
	FieldBatchFormatVersion,
	SpecialField,
} from "./format/index.js";
import {
	defaultIncrementalEncodingPolicy,
	type IncrementalEncodingPolicy,
} from "./incrementalEncodingPolicy.js";
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
 * The VText format: an encoding that removes repeated field values from the data array.
 *
 * @remarks
 * This region adds specialized node shapes to the codec. A specialized shape stores one or more
 * field values as constants in the shape itself. A node that uses a specialized shape does not
 * store those values in the data array. See {@link SpecializedNodeShapeEncoder}.
 *
 * This region defines five terms. Every other comment in this region uses these terms without
 * defining them again.
 *
 * - **Specializable field**: a required field of an ObjectNode with one boolean, string, or
 * number value. See {@link SpecializableField}.
 * - **Node group**: a group of same-type nodes with equal values in all their specializable
 * fields. See {@link NodeGroupCounts}.
 * - **Select a field**: choose one specializable field as part of the test that groups nodes
 * into node groups. See {@link FoldDecision.selectedFieldIndices}.
 * - **Fold a node group**: build a specialized shape that stores a node group's selected field
 * values as constants. Nodes that use this shape do not store those values in the data array.
 * - **Dispatch token**: an index that a node writes before its data. A node writes a dispatch
 * token only when its type can use more than one shape. See {@link dispatchTokenBytes}.
 *
 * The VText format is still experimental. This region keeps its code apart from the plain v1 and
 * v2 code above it.
 */

/**
 * Encodes data from `fieldBatch` into an `EncodedChunk`.
 * @remarks
 * This function uses {@link FieldBatchFormatVersion.vTextExperimental}. It turns on the
 * specialized node shape ('f') optimization. See {@link SpecializedNodeShapeEncoder}.
 *
 * {@link chooseSelectedFold} decides which node groups to fold. It uses an estimated byte-gain
 * rule. There is no fixed occurrence threshold.
 */
export function schemaCompressedEncodeVTextExperimental(
	schema: StoredSchemaCollection,
	policy: SchemaPolicy,
	fieldBatch: FieldBatch,
	idCompressor: IIdCompressor,
	incrementalEncoder: IncrementalEncoder | undefined,
	isSummary: boolean,
): EncodedFieldBatchVTextExperimental {
	const context = buildContextVText(
		schema,
		policy,
		idCompressor,
		incrementalEncoder,
		brand(FieldBatchFormatVersion.vTextExperimental),
		isSummary,
	);
	return compressedEncode(fieldBatch, context);
}

/**
 * Single pass across every node in `fieldBatch`. For any node whose encoder is a
 * {@link VTextObjectNodeEncoder}, records its tuple occurrence.
 *
 * @remarks
 * Called as pass 1 of the VText two-pass encode. Pass 2 ({@link compressedEncode}) uses the
 * recorded counts to decide which tuples should use specialized shapes.
 *
 * Incremental fields are skipped. Their sub-chunks get their own count pass when
 * {@link compressedEncode} is invoked recursively, so counting them here would inflate
 * the outer batch's totals with nodes the outer batch does not actually emit.
 */
function countVTextSpecializationCandidates(
	fieldBatch: FieldBatch,
	context: EncoderContext,
	storedSchema: StoredSchemaCollection,
	batch: VTextBatchState,
): void {
	const shouldEncodeIncrementally = context.incrementalEncoder?.shouldEncodeIncrementally;
	for (const cursor of fieldBatch) {
		forEachNode(cursor, () => {
			countNodeAndDescendants(cursor, context, storedSchema, shouldEncodeIncrementally, batch);
		});
	}
}

/**
 * Recursively counts the current node and its descendants for VText specialization.
 *
 * @remarks
 * This function visits every node at every depth. Any ObjectNode can be a node group candidate.
 *
 * A node's node group key depends only on its own leaf values. Traversal order does not change
 * the result. One pass is enough. No count depends on another node's count.
 *
 * This function skips incremental fields.
 */
function countNodeAndDescendants(
	cursor: ITreeCursorSynchronous,
	context: EncoderContext,
	storedSchema: StoredSchemaCollection,
	shouldEncodeIncrementally: IncrementalEncodingPolicy | undefined,
	batch: VTextBatchState,
): void {
	const nodeType: TreeNodeSchemaIdentifier = cursor.type;
	const schema = storedSchema.nodeSchema.get(nodeType);
	if (schema instanceof ObjectNodeStoredSchema) {
		// Object/Array: per-field policy decision. The cursor's field key is the object field
		// key for objects. For arrays, the field key is "". The contract accepts both forms.
		forEachField(cursor, () => {
			if (shouldEncodeIncrementally?.(nodeType, cursor.getFieldKey()) === true) {
				return;
			}
			forEachNode(cursor, () => {
				countNodeAndDescendants(
					cursor,
					context,
					storedSchema,
					shouldEncodeIncrementally,
					batch,
				);
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
				countNodeAndDescendants(
					cursor,
					context,
					storedSchema,
					shouldEncodeIncrementally,
					batch,
				);
			});
		});
	}
	const encoder = context.nodeEncoderFromSchema(nodeType);
	if (encoder instanceof VTextObjectNodeEncoder) {
		encoder.countNode(cursor, batch);
	}
}

/**
 * {@link EncoderContext} for the VText format. Owns the per-batch node group state and runs
 * the counting pass at the start of each batch.
 *
 * @remarks
 * This class keeps a stack of {@link VTextBatchState} objects, one for each
 * {@link compressedEncode} call in progress. {@link beginBatch} runs the counting pass and
 * pushes a fresh state onto the stack. {@link endBatch} pops it off.
 *
 * The stack scopes node group decisions to each batch. A single field could not do this,
 * because a recursive incremental sub-chunk encode runs its own nested {@link compressedEncode}
 * call while the outer batch is still in progress.
 */
class VTextEncoderContext extends EncoderContext {
	private readonly batchStack: VTextBatchState[] = [];

	public constructor(
		nodeEncoderFromPolicy: NodeEncoderPolicy,
		fieldEncoderFromPolicy: FieldEncoderPolicy,
		fieldShapes: ReadonlyMap<FieldKindIdentifier, FieldKindData>,
		idCompressor: IIdCompressor,
		incrementalEncoder: IncrementalEncoder | undefined,
		version: FieldBatchFormatVersion,
		isSummary: boolean,
		private readonly storedSchema: StoredSchemaCollection,
	) {
		super(
			nodeEncoderFromPolicy,
			fieldEncoderFromPolicy,
			fieldShapes,
			idCompressor,
			incrementalEncoder,
			version,
			isSummary,
		);
	}

	public override beginBatch(fieldBatch: FieldBatch): void {
		const batch = new VTextBatchState();
		countVTextSpecializationCandidates(fieldBatch, this, this.storedSchema, batch);
		this.batchStack.push(batch);
	}

	public override endBatch(): void {
		this.batchStack.pop();
	}

	/**
	 * The {@link VTextBatchState} for the innermost in-progress {@link compressedEncode} call.
	 */
	public currentBatch(): VTextBatchState {
		const batch = getLast(this.batchStack);
		assert(batch !== undefined, "VText encode requires an active batch state");
		return batch;
	}
}

/**
 * Like {@link buildContext}. This function uses the VText-specific node encoder policy. That
 * policy produces {@link SpecializedNodeShapeEncoder} shapes through a {@link VTextEncoderContext}.
 */
function buildContextVText(
	storedSchema: StoredSchemaCollection,
	policy: SchemaPolicy,
	idCompressor: IIdCompressor,
	incrementalEncoder: IncrementalEncoder | undefined,
	version: FieldBatchFormatVersion,
	isSummary: boolean,
): EncoderContext {
	const context: VTextEncoderContext = new VTextEncoderContext(
		(fieldBuilder: FieldEncodeBuilder, schemaName: TreeNodeSchemaIdentifier) =>
			getNodeEncoderVText(
				fieldBuilder,
				storedSchema,
				schemaName,
				incrementalEncoder,
				context,
				() => context.currentBatch(),
			),
		(nodeBuilder: NodeEncodeBuilder, fieldSchema: TreeFieldStoredSchema) =>
			getFieldEncoder(nodeBuilder, fieldSchema, context, storedSchema),
		policy.fieldKinds,
		idCompressor,
		incrementalEncoder,
		version,
		isSummary,
		storedSchema,
	);
	return context;
}

/**
 * Like {@link getNodeEncoder}. This function also applies VText node group wrapping.
 * @remarks
 * This function wraps ObjectNodes that have required, single-valued fields in a
 * {@link VTextObjectNodeEncoder}. That wrapper lets those fields fold into specialized shapes.
 */
function getNodeEncoderVText(
	fieldBuilder: FieldEncodeBuilder,
	storedSchema: StoredSchemaCollection,
	schemaName: TreeNodeSchemaIdentifier,
	incrementalEncoder: IncrementalEncoder | undefined,
	context: EncoderContext,
	currentBatch: () => VTextBatchState,
): NodeEncoder {
	const baseEncoder = getNodeEncoder(
		fieldBuilder,
		storedSchema,
		schemaName,
		incrementalEncoder,
	);

	const schema = storedSchema.nodeSchema.get(schemaName) ?? fail("missing node schema");

	const specializableFields: SpecializableField[] = [];
	if (schema instanceof ObjectNodeStoredSchema) {
		for (const [key, field] of schema.objectNodeFields ?? []) {
			if (context.fieldShapes.get(field.kind)?.multiplicity !== Multiplicity.Single) {
				continue;
			}
			// Identifier fields must keep the base SpecialField.Identifier encoding (id-compressor
			// op-space normalization)
			if (field.kind === identifierFieldKindIdentifier) {
				continue;
			}
			// Defer to the caller's incremental policy: if a field is meant to be encoded
			// out-of-band, constant-folding its value into a specialized shape would silently
			// override that decision.
			if (incrementalEncoder?.shouldEncodeIncrementally?.(schemaName, key) === true) {
				continue;
			}
			const type = oneFromIterable(field.types);
			if (type === undefined) {
				// Polymorphic field (multiple allowed types): not a constant-foldable leaf.
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
			// Sub-object fields are not folded. Nested ("subShape") folding was tried and removed.
			// It measured net-negative on the test corpus, and it needed a multi-pass counting
			// loop. A node with sub-object fields can still fold on its own leaf fields, if it has
			// any.
		}
	}

	if (specializableFields.length === 0) {
		return baseEncoder;
	}

	// The node group key concatenates field values in this array's order. This order must stay
	// the same across all nodes of this type, so that keys compare correctly. Sort by field key
	// to fix the order.
	specializableFields.sort((a, b) => compareStrings(a.key, b.key));

	assert(
		baseEncoder instanceof NodeShapeBasedEncoder,
		"VText node encoder policy expects NodeShapeBasedEncoder as base",
	);
	return new VTextObjectNodeEncoder(baseEncoder, specializableFields, currentBatch);
}

/**
 * Estimated bytes of the per-instance dispatch token.
 * @remarks
 * Every instance pays this cost once its node type resolves to `numShapes` shapes through
 * {@link AnyShape}. This cost is what makes folding a low-value node group a net loss.
 *
 * The token is a number, so its width grows with the shape count. The `+ 2` covers the token's
 * delimiter and the fact that the index points into the larger global shape table, not just this
 * type's shapes. Because of this, a few node groups fold cheaply, but many marginal node groups
 * do not.
 *
 * This constant and the shape-cost constants below estimate the encoded JSON wire size. They are
 * not exact byte counts. The size tests are the ground truth. These estimates are calibrated so
 * the fold decision matches the real encoder output on those tests.
 */
function dispatchTokenBytes(numShapes: number): number {
	return String(Math.max(1, numShapes) - 1).length + 2;
}

/**
 * Estimated serialized bytes of a specialized ('f') shape's own wrapper: its `base` field plus
 * its `fields` framing.
 */
const specializedShapeWrapperBytes = 16;

/**
 * Estimated serialized bytes added per overridden field in a specialized shape: its
 * `[keyRef, shapeRef]` entry.
 */
const overrideFieldBytes = 6;

/**
 * Estimated bytes of one constant leaf shape's `{ c: { type, value } }` framing.
 * @remarks
 * {@link valueByteEstimate} counts the value's own bytes separately. This constant does not
 * include them.
 */
const constantLeafShapeWrapperBytes = 24;

/**
 * Estimated bytes of a value's separator in the flat data array.
 * @remarks
 * Folding a field removes the value's characters and its separator. The per-instance saving is
 * {@link valueByteEstimate} plus this constant. This matters most for nodes with several folded
 * fields. For example, folding a 3-coordinate point removes three values and three separators.
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
 * This is a single-valued boolean, string, or number leaf field of an ObjectNode. This field's
 * value can fold into a {@link SpecializedNodeShapeEncoder}.
 */
interface SpecializableField {
	readonly key: FieldKey;
	readonly leafType: TreeNodeSchemaIdentifier;
}

/**
 * Encodes a leaf value to a string suitable for use as a Map key. Strings, numbers, and
 * booleans are unambiguous when prefixed with their type tag.
 */
function valueKey(value: Value): string {
	const valueType = typeof value;
	assert(
		valueType === "string" || valueType === "number" || valueType === "boolean",
		"valueKey only supports primitive leaf values",
	);
	return `${valueType}:${value as string | number | boolean}`;
}

/**
 * Identifies a node group by its leaf values.
 * @remarks
 * Same-typed nodes that share equal values in the same set of specializable fields have equal
 * node group keys. Nodes with equal node group keys can share one
 * {@link SpecializedNodeShapeEncoder}.
 *
 * A node group key is a string made from one length-prefixed {@link valueKey} segment per
 * field.
 */
type NodeGroupKey = Brand<string, "tree.NodeGroupKey">;

/**
 * What the count pass records about one whole-node node group.
 * @remarks
 * This includes how many nodes are in the node group, and the node group's specializable field
 * values. {@link chooseSelectedFold} uses the stored values to choose which fields to select and
 * to build the folded shapes. Storing the values here means the fold step does not need to walk
 * a cursor again.
 */
interface NodeGroupCounts {
	count: number;
	/** Every specializable-field leaf value, in the encoder's sorted field order. */
	readonly values: readonly Value[];
}

/**
 * A node group over the chosen selected fields only.
 * @remarks
 * Nodes in a selected node group agree on every selected field. Their non-selected fields may
 * differ. This is the unit that folds into one specialized shape.
 */
interface SelectedNodeGroupCounts {
	count: number;
	/** The selected-field leaf values, in selected-field order. */
	readonly selectedValues: readonly Value[];
}

/**
 * Per-encoder bookkeeping for one batch.
 * @remarks
 * The count pass fills the `nodeGroups` map. This class derives the `decision` field from that
 * map lazily: only once, and only on first access during the encoding pass.
 */
interface BatchCounts {
	/** Every whole-node node group observed in the batch, keyed by its all-fields node group key. */
	readonly nodeGroups: Map<NodeGroupKey, NodeGroupCounts>;
	/** The fold decision. This field is computed once, lazily, on first access during the encoding pass. */
	decision?: FoldDecision;
}

/** What {@link chooseSelectedFold} decides for one batch. */
interface FoldDecision {
	/** Indices into `specializableFields` chosen for selection. */
	readonly selectedFieldIndices: readonly number[];
	/** Specialized shapes for the folded selected node groups, keyed by their selected-field node group key. */
	readonly foldedEncoders: ReadonlyMap<NodeGroupKey, SpecializedNodeShapeEncoder>;
	/** The shape the parent declares for this node type: a single shape, or {@link AnyShape}. */
	readonly declared: DeclaredShape;
}

/**
 * The shape declared for a node type in a batch: a single concrete shape when monomorphic (it is
 * itself a {@link NodeEncoder}), or {@link AnyShape} when instances span multiple shapes.
 */
type DeclaredShape = NodeShapeBasedEncoder | SpecializedNodeShapeEncoder | AnyShape;

/**
 * Node group state for one {@link compressedEncode} call, which this region calls a "batch".
 * @remarks
 * A fresh instance of this class is created for each call, including recursive incremental
 * sub-chunk calls. This instance holds one {@link BatchCounts} for each encoder instance in the
 * batch.
 */
class VTextBatchState {
	private readonly perEncoder: Map<object, BatchCounts> = new Map();

	/**
	 * The {@link BatchCounts} for `encoder`.
	 * @remarks
	 * This function creates an empty {@link BatchCounts} on first access for a given encoder.
	 */
	public forEncoder(encoder: object): BatchCounts {
		let state = this.perEncoder.get(encoder);
		if (state === undefined) {
			state = { nodeGroups: new Map() };
			this.perEncoder.set(encoder, state);
		}
		return state;
	}
}

/**
 * Builds a node group key from leaf values.
 * @remarks
 * This function writes one length-prefixed {@link valueKey} segment per field. The length
 * prefix keeps `["a","b"]` distinct from `["ab"]`.
 *
 * This function uses string concatenation instead of `JSON.stringify`, because it runs once
 * per node and concatenation is cheaper.
 */
function nodeGroupKeyFromValues(values: readonly Value[]): NodeGroupKey {
	let key = "";
	for (const value of values) {
		const part = valueKey(value);
		key += `${part.length}:${part}`;
	}
	return brand(key);
}

/**
 * The distinct-value count of each specializable field.
 * @remarks
 * This function computes each count in one pass over the node groups. `fieldCount` is the
 * number of specializable fields. It sets the length of the returned array.
 */
function distinctValueCounts(
	fieldCount: number,
	nodeGroups: ReadonlyMap<NodeGroupKey, NodeGroupCounts>,
): number[] {
	const seen = Array.from({ length: fieldCount }, () => new Set<string>());
	for (const nodeGroup of nodeGroups.values()) {
		for (const [index, distinct] of seen.entries()) {
			distinct.add(valueKey(nodeGroup.values[index]));
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
 * Re-groups the whole-node node groups into node groups keyed only by the selected fields.
 * @remarks
 * This function sums the counts for nodes that agree on the selected fields but differ on
 * other fields.
 */
function buildSelectedNodeGroups(
	nodeGroups: ReadonlyMap<NodeGroupKey, NodeGroupCounts>,
	selected: readonly number[],
): Map<NodeGroupKey, SelectedNodeGroupCounts> {
	const selectedNodeGroups = new Map<NodeGroupKey, SelectedNodeGroupCounts>();
	for (const nodeGroup of nodeGroups.values()) {
		const values = selected.map((f) => nodeGroup.values[f]);
		const key = nodeGroupKeyFromValues(values);
		const existing = selectedNodeGroups.get(key);
		if (existing === undefined) {
			selectedNodeGroups.set(key, { count: nodeGroup.count, selectedValues: values });
		} else {
			existing.count += nodeGroup.count;
		}
	}
	return selectedNodeGroups;
}

/**
 * Estimated bytes saved by folding one selected node group, before the batch-wide dispatch
 * token cost.
 * @remarks
 * This is the per-instance data removed, multiplied by the member count, minus the one-time
 * cost of the node group's specialized shape. The per-instance data removed is each selected
 * value's inline bytes plus its separator.
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
 * Folds the worthwhile node groups and returns them with the declared shape.
 * @remarks
 * If no node group is worth folding, this function returns an empty set and `base` as the
 * declared shape.
 *
 * Folding makes the type polymorphic. Every instance of that type then pays a per-instance
 * dispatch token cost. This function weighs the saved bytes against the shape cost and this
 * token cost.
 *
 * A single node group that covers every instance stays monomorphic and pays no token cost.
 * Many low-value node groups cannot outweigh the token cost together, so this function folds
 * nothing in that case.
 */
function foldSelectedNodeGroups(
	selectedNodeGroups: ReadonlyMap<NodeGroupKey, SelectedNodeGroupCounts>,
	selected: readonly number[],
	base: NodeShapeBasedEncoder,
	createSpecialized: (
		selected: readonly number[],
		values: readonly Value[],
	) => SpecializedNodeShapeEncoder,
): { folded: Map<NodeGroupKey, SpecializedNodeShapeEncoder>; declared: DeclaredShape } {
	const folded = new Map<NodeGroupKey, SpecializedNodeShapeEncoder>();
	if (selectedNodeGroups.size === 1) {
		const [key, nodeGroup] =
			oneFromIterable(selectedNodeGroups) ?? fail("size-1 map has one entry");
		if (nodeGroupMarginalGain(nodeGroup) > 0) {
			// One shape for every instance. This stays monomorphic. It pays no dispatch
			// token cost.
			const encoder = createSpecialized(selected, nodeGroup.selectedValues);
			folded.set(key, encoder);
			return { folded, declared: encoder };
		}
	} else if (selectedNodeGroups.size > 1) {
		let totalInstances = 0;
		let summedMarginal = 0;
		const candidates: [NodeGroupKey, SelectedNodeGroupCounts][] = [];
		for (const entry of selectedNodeGroups) {
			totalInstances += entry[1].count;
			const marginal = nodeGroupMarginalGain(entry[1]);
			if (marginal > 0) {
				summedMarginal += marginal;
				candidates.push(entry);
			}
		}
		// Folding any node group here makes the type polymorphic. All instances then pay the
		// dispatch token cost. The type resolves to one shape per folded node group, plus the
		// base shape if any node group stays unfolded. The dispatch token width grows with this
		// shape count.
		const distinctShapes =
			candidates.length + (candidates.length < selectedNodeGroups.size ? 1 : 0);
		if (summedMarginal - totalInstances * dispatchTokenBytes(distinctShapes) > 0) {
			for (const [key, nodeGroup] of candidates) {
				folded.set(key, createSpecialized(selected, nodeGroup.selectedValues));
			}
			return { folded, declared: AnyShape.instance };
		}
	}
	return { folded, declared: base };
}

/**
 * Picks the selected-field set and the node groups to fold.
 * @remarks
 * This function uses greedy elimination. First, it selects every field except fields with no
 * repeated value. Then, while nothing folds at a profit, it drops the remaining field with
 * the most distinct values and tries again. This lets mixed data fold on a later try, while
 * uniform data folds on the first try.
 *
 * This function takes its counts as a plain, read-only input, and returns a plain decision as
 * output. It has no dependency on any encoder instance. This makes it a pure function: a caller
 * can test it directly, with test-built counts, and no cursor or schema is needed.
 *
 * TODO: This greedy method does not guarantee the best fold. A more expensive search could
 * check every combination of selected fields instead.
 */
function chooseSelectedFold(
	fieldCount: number,
	nodeGroups: ReadonlyMap<NodeGroupKey, NodeGroupCounts>,
	base: NodeShapeBasedEncoder,
	createSpecialized: (
		selected: readonly number[],
		values: readonly Value[],
	) => SpecializedNodeShapeEncoder,
): FoldDecision {
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
		const fold = foldSelectedNodeGroups(
			buildSelectedNodeGroups(nodeGroups, selected),
			selected,
			base,
			createSpecialized,
		);
		if (fold.folded.size > 0) {
			return {
				selectedFieldIndices: selected,
				foldedEncoders: fold.folded,
				declared: fold.declared,
			};
		}
		// Nothing folded with this set. Drop the field with the most distinct values and
		// try again.
		selected = withoutMostDistinctValues(selected, distinctValueCount);
	}
	return { selectedFieldIndices: [], foldedEncoders: new Map(), declared: base };
}

/**
 * Encodes ObjectNodes using {@link SpecializedNodeShapeEncoder} ('f') shapes.
 * @remarks
 * These shapes constant-fold required, single-valued leaf fields whose values repeat across a
 * batch.
 *
 * This class runs two passes. Pass 1, {@link VTextObjectNodeEncoder.countNode}, groups this
 * type's nodes into whole-node node groups. Pass 1 only collects counts. It does not decide
 * anything.
 *
 * Between the passes, {@link chooseSelectedFold} chooses which fields to select and which node
 * groups to fold. This choice uses an estimated byte gain, not a fixed count.
 * {@link chooseSelectedFold} is a free function, not a method. It takes the counts from pass 1
 * as input, and returns a fold decision as output. It has no other dependency on this class.
 *
 * Selecting only some fields lets mixed data fold its repetitive fields while it leaves unique
 * fields in the stream. For example, a record with a unique id can still fold its other,
 * repeated fields. Pass 2, {@link VTextObjectNodeEncoder.encodeNode}, emits the node data using
 * this fold decision.
 */
class VTextObjectNodeEncoder implements NodeEncoder {
	private readonly constantNodeEncoders: Map<string, NodeShapeBasedEncoder> = new Map();

	public constructor(
		private readonly base: NodeShapeBasedEncoder,
		private readonly specializableFields: readonly SpecializableField[],
		private readonly currentBatch: () => VTextBatchState,
	) {}

	public get shape(): Shape {
		return this.declaredShape(this.currentBatch());
	}

	/**
	 * The counting-pass entry point for this node.
	 * @remarks
	 * This function tallies this node's whole-node node group. On the node group's first sight,
	 * this function captures the node group's leaf values. This lets the fold step build the
	 * node group's shape later, without reading a cursor again.
	 */
	public countNode(cursor: ITreeCursorSynchronous, batch: VTextBatchState): void {
		const state = batch.forEncoder(this);
		const values = this.readValues(cursor);
		const key = nodeGroupKeyFromValues(values);
		const existing = state.nodeGroups.get(key);
		if (existing === undefined) {
			state.nodeGroups.set(key, { count: 1, values });
		} else {
			existing.count += 1;
		}
	}

	public encodeNode(
		cursor: ITreeCursorSynchronous,
		context: EncoderContext,
		outputBuffer: BufferFormat,
	): void {
		const batch = this.currentBatch();
		const declared = this.declaredShape(batch);
		if (declared instanceof AnyShape) {
			// This type resolves to more than one shape. Each instance writes its own dispatch
			// token first, using AnyShape ('d') dispatch.
			AnyShape.encodeNode(cursor, context, outputBuffer, this.resolveShape(cursor, batch));
		} else {
			// Every instance resolves to `declared`. The parent references `declared` directly.
			// This encoder writes only the node's data. It writes no dispatch token.
			declared.encodeNode(cursor, context, outputBuffer);
		}
	}

	/**
	 * The shape the parent declares for this node.
	 * @remarks
	 * This function runs the fold decision lazily, on first access during the encoding pass, and
	 * caches the result. Counting is already complete by the encode pass. This caching keeps
	 * per-node encoding O(1).
	 */
	private declaredShape(batch: VTextBatchState): DeclaredShape {
		const state = batch.forEncoder(this);
		state.decision ??= chooseSelectedFold(
			this.specializableFields.length,
			state.nodeGroups,
			this.base,
			(selected, values) => this.createSpecialized(selected, values),
		);
		return state.decision.declared;
	}

	/**
	 * The shape for this node.
	 * @remarks
	 * This is the specialized shape for this node's selected node group, if that node group was
	 * folded. Otherwise, this is the base encoder.
	 *
	 * This function runs only on the polymorphic path, through {@link AnyShape}. The batch is
	 * already finalized by that point.
	 */
	private resolveShape(
		cursor: ITreeCursorSynchronous,
		batch: VTextBatchState,
	): NodeShapeBasedEncoder | SpecializedNodeShapeEncoder {
		const decision =
			batch.forEncoder(this).decision ?? fail("resolveShape requires a finalized batch");
		const allValues = this.readValues(cursor);
		const selectedValues = decision.selectedFieldIndices.map((f) => allValues[f]);
		return decision.foldedEncoders.get(nodeGroupKeyFromValues(selectedValues)) ?? this.base;
	}

	/**
	 * Reads this node's specializable field leaf values, in the encoder's fixed field order.
	 * @remarks
	 * This function reads only required, single-valued leaf fields. It leaves out optional
	 * fields.
	 */
	private readValues(cursor: ITreeCursorSynchronous): Value[] {
		const values: Value[] = [];
		for (const field of this.specializableFields) {
			cursor.enterField(brand(field.key));
			assert(
				cursor.getFieldLength() === 1,
				"specializable field must contain exactly one node",
			);
			cursor.firstNode();
			values.push(cursor.value);
			cursor.exitNode();
			cursor.exitField();
		}
		return values;
	}

	/**
	 * Builds an `f` shape that bakes a selected node group's values in.
	 * @remarks
	 * Each selected field becomes a constant {@link NodeShapeBasedEncoder}. This function caches
	 * each constant encoder by leaf type and value. Members of the node group emit no data for a
	 * selected field. Non-selected fields stay as the base shape's variable encoders.
	 *
	 * `selected` holds indices into `specializableFields`. `values` holds each selected field's
	 * value, in the same order as `selected`.
	 */
	private createSpecialized(
		selected: readonly number[],
		values: readonly Value[],
	): SpecializedNodeShapeEncoder {
		const overrides: KeyedFieldEncoder[] = selected.map((fieldIndex, i) => {
			const field =
				this.specializableFields[fieldIndex] ?? fail("selected field index out of range");
			const value = values[i];
			const cacheKey = `${field.leafType}:${valueKey(value)}`;
			let nodeEncoder = this.constantNodeEncoders.get(cacheKey);
			if (nodeEncoder === undefined) {
				nodeEncoder = new NodeShapeBasedEncoder(field.leafType, [value], [], undefined);
				this.constantNodeEncoders.set(cacheKey, nodeEncoder);
			}
			return { key: field.key, encoder: asFieldEncoder(nodeEncoder) };
		});
		return new SpecializedNodeShapeEncoder(this.base, overrides);
	}
}

// #endregion
