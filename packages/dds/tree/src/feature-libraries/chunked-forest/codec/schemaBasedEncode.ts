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
import { brand, getLast, oneFromIterable } from "../../../util/index.js";

import type { IncrementalEncoder } from "./codecs.js";
import {
	AnyShape,
	EncoderContext,
	type BufferFormat,
	type FieldEncoder,
	type FieldEncodeBuilder,
	type KeyedFieldEncoder,
	type NodeEncoder,
	type NodeEncodeBuilder,
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
 * Encode data from `fieldBatch` in into an `EncodedChunk` using {@link FieldBatchFormatVersion.vTextExperimental}.
 * @remarks
 * Enables the specialized node shape ('f') optimization. See {@link SpecializedNodeShapeEncoder}.
 * Uses the default specialization threshold {@link defaultMinOccurrencesForSpecialization}.
 */
export function schemaCompressedEncodeVTextExperimental(
	schema: StoredSchemaCollection,
	policy: SchemaPolicy,
	fieldBatch: FieldBatch,
	idCompressor: IIdCompressor,
	incrementalEncoder: IncrementalEncoder | undefined,
	isSummary: boolean,
): EncodedFieldBatchVTextExperimental {
	return schemaCompressedEncodeVTextExperimentalForTests(
		schema,
		policy,
		fieldBatch,
		idCompressor,
		incrementalEncoder,
		isSummary,
		defaultMinOccurrencesForSpecialization,
	);
}

/**
 * Test-only variant of {@link schemaCompressedEncodeVTextExperimental} that accepts a custom
 * `minOccurrencesForSpecialization` threshold so small test inputs can exercise the
 * specialization heuristic. Production callers must use
 * {@link schemaCompressedEncodeVTextExperimental}, which hard-codes
 * {@link defaultMinOccurrencesForSpecialization}.
 */
export function schemaCompressedEncodeVTextExperimentalForTests(
	schema: StoredSchemaCollection,
	policy: SchemaPolicy,
	fieldBatch: FieldBatch,
	idCompressor: IIdCompressor,
	incrementalEncoder: IncrementalEncoder | undefined,
	isSummary: boolean,
	minOccurrencesForSpecialization: number,
): EncodedFieldBatchVTextExperimental {
	const context = buildContextVText(
		schema,
		policy,
		idCompressor,
		incrementalEncoder,
		brand(FieldBatchFormatVersion.vTextExperimental),
		isSummary,
		minOccurrencesForSpecialization,
	);
	// `compressedEncode`'s return type is too narrow to express the vTextExperimental version
	// TODO: widen the versions of EncodedFieldBatchV1/V2 to include vText after it gets stable
	// this will allow us to remove the use of unkown as a cast here.
	return compressedEncode(
		fieldBatch,
		context,
	) as unknown as EncodedFieldBatchVTextExperimental;
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
 * Walks in post-order: children are counted before their parent so that child specialization
 * decisions are populated before the parent's specialization key is built. This is required
 * because {@link VTextObjectNodeEncoder.countNode} calls `resolveShape` on child
 * encoders, which depends on the child's counts being finalized.
 *
 * Incremental fields are skipped.
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
		// key for objects, or "" for arrays — both forms the contract accepts.
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
 * Like {@link buildContext} but uses the VText-specific node encoder policy that produces
 * {@link SpecializedNodeShapeEncoder} shapes.
 *
 * @remarks
 * Manages a stack of {@link VTextBatchState} — one per in-progress {@link compressedEncode}
 * call. The {@link EncoderContext.beginBatch} hook runs the counting pass and pushes a fresh
 * state; {@link EncoderContext.endBatch} pops it. This keeps specialization decisions scoped
 * to each batch, including recursive incremental sub-chunks.
 */
function buildContextVText(
	storedSchema: StoredSchemaCollection,
	policy: SchemaPolicy,
	idCompressor: IIdCompressor,
	incrementalEncoder: IncrementalEncoder | undefined,
	version: FieldBatchFormatVersion,
	isSummary: boolean,
	minOccurrencesForSpecialization: number,
): EncoderContext {
	const batchStack: VTextBatchState[] = [];
	const currentBatch = (): VTextBatchState => {
		const batch = getLast(batchStack);
		assert(batch !== undefined, "VText encode requires an active batch state");
		return batch;
	};
	const context: EncoderContext = new EncoderContext(
		(fieldBuilder: FieldEncodeBuilder, schemaName: TreeNodeSchemaIdentifier) =>
			getNodeEncoderVText(
				fieldBuilder,
				storedSchema,
				schemaName,
				incrementalEncoder,
				context,
				minOccurrencesForSpecialization,
				currentBatch,
			),
		(nodeBuilder: NodeEncodeBuilder, fieldSchema: TreeFieldStoredSchema) =>
			getFieldEncoder(nodeBuilder, fieldSchema, context, storedSchema),
		policy.fieldKinds,
		idCompressor,
		incrementalEncoder,
		version,
		isSummary,
		(fieldBatch: FieldBatch, encoderContext: EncoderContext): void => {
			const batch = new VTextBatchState();
			for (let iteration = 0; iteration < countPassMaxIterations; iteration++) {
				countVTextSpecializationCandidates(fieldBatch, encoderContext, storedSchema, batch);
				if (!batch.commitIteration()) {
					break;
				}
			}
			batchStack.push(batch);
		},
		() => {
			batchStack.pop();
		},
	);
	return context;
}

/**
 * Like {@link getNodeEncoder} but applies VText-specific specialization wrapping.
 *
 * @remarks
 * ObjectNodes with required single-valued fields are wrapped in a
 * {@link VTextObjectNodeEncoder} so those fields can be constant-folded into specialized shapes.
 */
function getNodeEncoderVText(
	fieldBuilder: FieldEncodeBuilder,
	storedSchema: StoredSchemaCollection,
	schemaName: TreeNodeSchemaIdentifier,
	incrementalEncoder: IncrementalEncoder | undefined,
	context: EncoderContext,
	minOccurrencesForSpecialization: number,
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
			// Defer to the caller's incremental policy: if a field is meant to be encoded
			// out-of-band, constant-folding its value into a specialized shape would silently
			// override that decision.
			if (incrementalEncoder?.shouldEncodeIncrementally?.(schemaName, key) === true) {
				continue;
			}
			const type = oneFromIterable(field.types);
			if (type === undefined) {
				// Polymorphic field: specialization key uses the resolved sub-shape per instance.
				// Specializations only fire when all instances pick the same sub-shape (which implies
				// the same cursor.type), so the override pinning that shape is sound.
				specializableFields.push({ kind: "subShape", key });
				continue;
			}
			const nodeSchema = storedSchema.nodeSchema.get(type);
			if (
				nodeSchema instanceof LeafNodeStoredSchema &&
				(nodeSchema.leafValue === ValueSchema.Boolean ||
					nodeSchema.leafValue === ValueSchema.String ||
					nodeSchema.leafValue === ValueSchema.Number)
			) {
				specializableFields.push({ kind: "leafValue", key, leafType: type });
			} else {
				specializableFields.push({ kind: "subShape", key });
			}
		}
	}

	if (specializableFields.length === 0) {
		return baseEncoder;
	}

	assert(
		baseEncoder instanceof NodeShapeBasedEncoder,
		"VText node encoder policy expects NodeShapeBasedEncoder as base",
	);
	return new VTextObjectNodeEncoder(
		baseEncoder,
		specializableFields,
		minOccurrencesForSpecialization,
		context,
		currentBatch,
	);
}

/**
 * Default minimum number of occurrences of a given boolean-value tuple in a batch required
 * to generate a {@link SpecializedNodeShapeEncoder} for it. Tuples below this threshold
 * encode through the base {@link NodeShapeBasedEncoder}.
 * @remarks
 * A specialized shape entry costs roughly `2 + 2 * fieldCount` tokens in the shape table;
 * each instance using the specialized shape saves `fieldCount` stream tokens. The encoder
 * runs a counting pass over the batch before encoding so that, when a tuple does cross the
 * threshold, *every* occurrence (including the first) uses the specialized shape. Overridable
 * per-call via the `minOccurrencesForSpecialization` parameter on {@link schemaCompressedEncodeVTextExperimental}.
 */
const defaultMinOccurrencesForSpecialization = 8;

/**
 * Defensive upper bound on iterations of the multi-pass VText count loop.
 * Monotonic merging in {@link VTextBatchState.commitIteration} guarantees convergence,
 * so this cap should never be hit. It exists only as a safety net against bugs.
 */
const countPassMaxIterations = 10;

/**
 * A field within an ObjectNode that can be constant-folded into a {@link SpecializedNodeShapeEncoder}.
 *
 * - `leafValue`: a required single-valued boolean, string, or number leaf field.
 * - `subShape`: a required single-valued field whose child encoder may produce different shapes per instance.
 */
type SpecializableField =
	| {
			readonly kind: "leafValue";
			readonly key: FieldKey;
			readonly leafType: TreeNodeSchemaIdentifier;
	  }
	| { readonly kind: "subShape"; readonly key: FieldKey };

/**
 * Per-batch specialization state for a single {@link compressedEncode} call, built and pushed
 * onto the VText-owned batch stack by the {@link EncoderContext.beginBatch} hook wired up in
 * {@link buildContextVText}. Created fresh per call (including recursive incremental sub-chunk
 * calls), so two batches never share it.
 *
 * State is partitioned per encoder instance: each {@link VTextObjectNodeEncoder}
 * reads and writes its own {@link SpecializationState} via {@link forEncoder}.
 */
class VTextBatchState {
	private readonly perEncoder: Map<object, SpecializationState> = new Map();

	/**
	 * The {@link SpecializationState} for `encoder`, created empty on first access.
	 */
	public forEncoder(encoder: object): SpecializationState {
		let state = this.perEncoder.get(encoder);
		if (state === undefined) {
			state = { counts: new Map(), resolveCounts: new Map(), specializedEncoders: new Map() };
			this.perEncoder.set(encoder, state);
		}
		return state;
	}

	/**
	 * Merge the current iteration's counts into {@link SpecializationState.resolveCounts} monotonically
	 * (counts only increase), then reset {@link SpecializationState.counts} for the next iteration.
	 * Returns whether any count increased — the loop stops when this returns `false`.
	 *
	 * @remarks
	 * Monotonic merging guarantees convergence: since counts can only go up and there are a
	 * finite number of specialization keys with a finite max count, the system must reach a fixed point.
	 */
	public commitIteration(): boolean {
		let changed = false;
		for (const state of this.perEncoder.values()) {
			for (const [key, count] of state.counts) {
				const previous = state.resolveCounts.get(key) ?? 0;
				const merged = Math.max(previous, count);
				if (merged !== previous) {
					changed = true;
				}
				state.resolveCounts.set(key, merged);
			}
			state.counts = new Map();
		}
		return changed;
	}
}

/**
 * The per-encoder slice of {@link VTextBatchState}.
 */
interface SpecializationState {
	/** Specialization key occurrence counts for the current count-pass iteration. */
	counts: Map<string, number>;
	/** Finalized counts from previous iterations, used for threshold decisions. */
	resolveCounts: Map<string, number>;
	/** Cached specialized shapes, keyed by specialization key. */
	specializedEncoders: Map<string, SpecializedNodeShapeEncoder>;
}

/**
 * Encodes ObjectNodes using {@link SpecializedNodeShapeEncoder} shapes that constant-fold
 * required single-valued fields whose contents are predictable across a batch.
 *
 * @remarks
 * Uses a two-pass encode: pass 1 ({@link countNode}) counts each field-value tuple's
 * occurrences, pass 2 ({@link encodeNode}) specializes tuples that cross
 * {@link defaultMinOccurrencesForSpecialization}. See {@link SpecializableField} for
 * the two kinds of field specialization supported.
 */
class VTextObjectNodeEncoder implements NodeEncoder {
	private readonly constantNodeEncoders: Map<string, NodeShapeBasedEncoder> = new Map();
	/**
	 * Stable per-encoder identifiers for {@link Shape} instances appearing as a `subShape`
	 * field's resolved shape. Used only to build a string specialization key.
	 */
	private readonly shapeIds: Map<Shape, number> = new Map();
	private nextShapeId = 0;

	public constructor(
		private readonly base: NodeShapeBasedEncoder,
		private readonly specializableFields: readonly SpecializableField[],
		private readonly minOccurrencesForSpecialization: number,
		private readonly nodeBuilder: NodeEncodeBuilder,
		private readonly currentBatch: () => VTextBatchState,
	) {}

	public get shape(): AnyShape {
		return AnyShape.instance;
	}

	/** Counting-pass entry point. Records this node's tuple key without producing output. */
	public countNode(cursor: ITreeCursorSynchronous, batch: VTextBatchState): void {
		const state = batch.forEncoder(this);
		const key = this.specializationKey(cursor, batch);
		state.counts.set(key, (state.counts.get(key) ?? 0) + 1);
	}

	public encodeNode(
		cursor: ITreeCursorSynchronous,
		context: EncoderContext,
		outputBuffer: BufferFormat,
	): void {
		const batch = this.currentBatch();
		const resolved = this.resolveShape(cursor, batch);
		AnyShape.encodeNode(cursor, context, outputBuffer, resolved);
	}

	/**
	 * Returns the specialized shape if this node's tuple crossed the threshold,
	 * otherwise the base encoder.
	 *
	 * @remarks
	 * Results are cached per specialization key so the same shape instance is returned across
	 * calls. This is required for stable shape identity. Parent encoders use it to
	 * build their own specialization keys via {@link idForShape}.
	 */
	public resolveShape(
		cursor: ITreeCursorSynchronous,
		batch: VTextBatchState,
	): NodeShapeBasedEncoder | SpecializedNodeShapeEncoder {
		const state = batch.forEncoder(this);
		const key = this.specializationKey(cursor, batch);
		if ((state.resolveCounts.get(key) ?? 0) >= this.minOccurrencesForSpecialization) {
			let specialized = state.specializedEncoders.get(key);
			if (specialized === undefined) {
				specialized = this.createSpecialized(cursor, batch);
				state.specializedEncoders.set(key, specialized);
			}
			return specialized;
		}
		return this.base;
	}

	/**
	 * Build the specialization key for the node at the cursor's current position.
	 * Each {@link SpecializableField} contributes one segment to the key.
	 */
	private specializationKey(cursor: ITreeCursorSynchronous, batch: VTextBatchState): string {
		const parts: string[] = [];
		for (const field of this.specializableFields) {
			cursor.enterField(brand(field.key));
			const hasNode = cursor.firstNode();
			assert(hasNode, "required specializable field must contain a node");
			if (field.kind === "leafValue") {
				parts.push(`L:${valueKey(cursor.value)}`);
			} else {
				const childEncoder = this.nodeBuilder.nodeEncoderFromSchema(cursor.type);
				const childShape =
					childEncoder instanceof VTextObjectNodeEncoder
						? childEncoder.resolveShape(cursor, batch)
						: childEncoder.shape;
				parts.push(`S:${this.idForShape(childShape)}`);
			}
			cursor.exitNode();
			cursor.exitField();
		}
		return JSON.stringify(parts);
	}

	/** Returns a stable numeric ID for `shape`, assigning one on first access. */
	private idForShape(shape: Shape): number {
		let id = this.shapeIds.get(shape);
		if (id === undefined) {
			id = this.nextShapeId++;
			this.shapeIds.set(shape, id);
		}
		return id;
	}

	/**
	 * Builds a {@link SpecializedNodeShapeEncoder} with field overrides derived from the current cursor position.
	 *
	 * @remarks
	 * For `leafValue` fields, creates a constant {@link NodeShapeBasedEncoder} that bakes the
	 * leaf's value into the shape (cached per leaf type + value). For `subShape` fields, resolves
	 * the child's shape recursively so nested specializations compose.
	 */
	private createSpecialized(
		cursor: ITreeCursorSynchronous,
		batch: VTextBatchState,
	): SpecializedNodeShapeEncoder {
		const overrides: KeyedFieldEncoder[] = [];
		for (const field of this.specializableFields) {
			cursor.enterField(brand(field.key));
			const hasNode = cursor.firstNode();
			assert(hasNode, "required specializable field must contain a node");
			if (field.kind === "leafValue") {
				const value = cursor.value;
				const cacheKey = `${field.leafType}:${valueKey(value)}`;
				let nodeEncoder = this.constantNodeEncoders.get(cacheKey);
				if (nodeEncoder === undefined) {
					nodeEncoder = new NodeShapeBasedEncoder(field.leafType, [value], [], undefined);
					this.constantNodeEncoders.set(cacheKey, nodeEncoder);
				}
				overrides.push({ key: field.key, encoder: asFieldEncoder(nodeEncoder) });
			} else {
				const childEncoder = this.nodeBuilder.nodeEncoderFromSchema(cursor.type);
				const resolvedChild =
					childEncoder instanceof VTextObjectNodeEncoder
						? childEncoder.resolveShape(cursor, batch)
						: childEncoder;
				overrides.push({
					key: field.key,
					encoder: asFieldEncoder(resolvedChild),
				});
			}
			cursor.exitNode();
			cursor.exitField();
		}
		return new SpecializedNodeShapeEncoder(this.base, overrides);
	}
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
