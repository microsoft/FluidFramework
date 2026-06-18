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
import { brand, getLast, oneFromIterable } from "../../../util/index.js";

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
 * `minOccurrencesForSpecialization` threshold.
 * @remarks
 * Lets small test inputs exercise the specialization heuristic. Production callers must use
 * {@link schemaCompressedEncodeVTextExperimental}.
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
 * Every node at every depth is visited, since any ObjectNode can be a specialization candidate.
 * A node's specialization key depends only on its own leaf values, so traversal order does not
 * matter (one pass is enough — there is no cross-node count dependency).
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
 * {@link EncoderContext} for the VText format. Owns the per-batch specialization state and runs
 * the counting pass at the start of each batch.
 *
 * @remarks
 * Manages a stack of {@link VTextBatchState} — one per in-progress {@link compressedEncode} call.
 * {@link beginBatch} runs the counting pass and pushes a fresh state; {@link endBatch} pops it.
 * The stack (rather than a single field) is what scopes specialization decisions to each batch,
 * including the recursive incremental sub-chunk encodes.
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
 * Like {@link buildContext} but uses the VText-specific node encoder policy that produces
 * {@link SpecializedNodeShapeEncoder} shapes, via a {@link VTextEncoderContext}.
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
	const context: VTextEncoderContext = new VTextEncoderContext(
		(fieldBuilder: FieldEncodeBuilder, schemaName: TreeNodeSchemaIdentifier) =>
			getNodeEncoderVText(
				fieldBuilder,
				storedSchema,
				schemaName,
				incrementalEncoder,
				context,
				minOccurrencesForSpecialization,
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
			// Sub-object fields are intentionally not folded: nested ("subShape") specialization
			// was removed — it measured net-negative on the test corpus and required a multi-pass
			// counting loop. Such nodes specialize on their own leaf fields (if any) instead.
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
		currentBatch,
	);
}

/**
 * Default minimum number of occurrences of a given leaf-value tuple in a batch required to
 * generate a {@link SpecializedNodeShapeEncoder} for it.
 * @remarks
 * Tuples below this threshold encode through the base {@link NodeShapeBasedEncoder}. A specialized
 * shape entry costs roughly `2 + 2 * fieldCount` tokens in the shape table; each instance using
 * the specialized shape saves `fieldCount` stream tokens. The encoder runs a counting pass over
 * the batch before encoding so that, when a tuple does cross the threshold, *every* occurrence
 * (including the first) uses the specialized shape.
 */
const defaultMinOccurrencesForSpecialization = 8;

/**
 * A required single-valued boolean, string, or number leaf field of an ObjectNode whose value
 * can be constant-folded into a {@link SpecializedNodeShapeEncoder}.
 */
interface SpecializableField {
	readonly key: FieldKey;
	readonly leafType: TreeNodeSchemaIdentifier;
}

/**
 * Per-encoder bookkeeping for one batch, keyed by specialization key (a "cohort" of node instances
 * that share identical specializable-field values).
 *
 * @remarks
 * A cohort's members share one specialization key, so they can all encode through a single
 * {@link SpecializedNodeShapeEncoder} that constant-folds the shared field values into the shape
 * table. Tracks how often each cohort occurs (filled by the count pass, read by the encode pass)
 * and the specialized shape cached for cohorts that have crossed the specialization threshold.
 */
interface CohortState {
	/** How many times each specialization key (cohort) occurs in the batch. */
	counts: Map<string, number>;
	/** The specialized shape cached for each cohort that has crossed the threshold. */
	specializedEncoders: Map<string, SpecializedNodeShapeEncoder>;
	/**
	 * Memoized declared shape for the batch; `undefined` until first computed.
	 *
	 * @remarks
	 * Its inputs ({@link counts} and {@link specializedEncoders}) are final once the count pass
	 * completes, so it is computed once and reused. This keeps per-node encoding O(1) rather than
	 * O(distinct cohorts), which matters when values are unique (cohort count grows with N).
	 */
	declared?: DeclaredShape;
}

/**
 * The shape declared for a node in a batch: a concrete node shape when the batch is monomorphic
 * (which is also a {@link NodeEncoder}, so it can encode the node directly), or {@link AnyShape}
 * when instances span multiple shapes and need per-instance dispatch.
 */
type DeclaredShape = NodeShapeBasedEncoder | SpecializedNodeShapeEncoder | AnyShape;

/**
 * Specialization state for a single {@link compressedEncode} call (one "batch").
 *
 * @remarks
 * Created fresh per call (including recursive incremental sub-chunk calls), so two batches never
 * share it. Holds one {@link CohortState} per encoder instance, accessed via {@link forEncoder},
 * so encoders never collide.
 */
class VTextBatchState {
	private readonly perEncoder: Map<object, CohortState> = new Map();

	/**
	 * The {@link CohortState} for `encoder`, created empty on first access.
	 */
	public forEncoder(encoder: object): CohortState {
		let state = this.perEncoder.get(encoder);
		if (state === undefined) {
			state = { counts: new Map(), specializedEncoders: new Map() };
			this.perEncoder.set(encoder, state);
		}
		return state;
	}
}

/**
 * Encodes ObjectNodes using {@link SpecializedNodeShapeEncoder} shapes that constant-fold
 * required single-valued leaf fields whose values are predictable across a batch.
 *
 * @remarks
 * Uses a two-pass encode: pass 1 ({@link countNode}) counts each leaf-value tuple's
 * occurrences, pass 2 ({@link encodeNode}) specializes tuples that cross
 * {@link defaultMinOccurrencesForSpecialization}.
 */
class VTextObjectNodeEncoder implements NodeEncoder {
	private readonly constantNodeEncoders: Map<string, NodeShapeBasedEncoder> = new Map();

	public constructor(
		private readonly base: NodeShapeBasedEncoder,
		private readonly specializableFields: readonly SpecializableField[],
		private readonly minOccurrencesForSpecialization: number,
		private readonly currentBatch: () => VTextBatchState,
	) {}

	public get shape(): Shape {
		return this.declaredShape(this.currentBatch());
	}

	/**
	 * Counting-pass entry point. Records this node's tuple key without producing output, and once a
	 * cohort crosses the threshold, eagerly creates its specialized shape.
	 *
	 * @remarks
	 * The specialized shape is created here (during counting, while a cohort-member cursor is in
	 * hand) rather than lazily in {@link resolveShape}, so that {@link declaredShape} — which has no
	 * cursor and may be read before this node's `encodeNode` runs (e.g. via polymorphic AnyShape
	 * dispatch by a parent) — always finds the specialized shape for a fired cohort. Any
	 * cohort-member cursor produces the same specialized shape, so it does not matter which member
	 * crosses the threshold.
	 */
	public countNode(cursor: ITreeCursorSynchronous, batch: VTextBatchState): void {
		const state = batch.forEncoder(this);
		const key = this.specializationKey(cursor);
		const count = (state.counts.get(key) ?? 0) + 1;
		state.counts.set(key, count);
		if (count >= this.minOccurrencesForSpecialization && !state.specializedEncoders.has(key)) {
			state.specializedEncoders.set(key, this.createSpecialized(cursor));
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
			// Instances of this node resolve to more than one shape in this batch, so the data must
			// be prefixed with the per-instance shape (resolved per node) via AnyShape (`d`) dispatch.
			AnyShape.encodeNode(cursor, context, outputBuffer, this.resolveShape(cursor, batch));
		} else {
			// Every instance resolves to `declared`, which the parent declares directly (see
			// {@link VTextObjectNodeEncoder.shape}); emit only the node's data, with no per-instance
			// shape token — and without recomputing this node's specialization key.
			declared.encodeNode(cursor, context, outputBuffer);
		}
	}

	/**
	 * The shape the parent declares for this node in the current batch: the single shape every
	 * instance resolves to when the batch is monomorphic, otherwise {@link AnyShape} (which makes
	 * each instance prefix its own shape index in the data).
	 *
	 * @remarks
	 * The result is constant for a batch (its inputs are final once counting completes), so it is
	 * memoized on {@link CohortState.declared} — computing it per `encodeNode` call would be
	 * O(distinct cohorts) per node, i.e. O(N²) when values are unique. See
	 * {@link VTextObjectNodeEncoder.computeDeclaredShape} for the derivation.
	 */
	private declaredShape(batch: VTextBatchState): DeclaredShape {
		const state = batch.forEncoder(this);
		state.declared ??= this.computeDeclaredShape(state);
		return state.declared;
	}

	/**
	 * Derives the {@link declaredShape} from the finalized {@link CohortState.counts}: cohorts at or
	 * above the threshold resolve to their specialized shape, every other cohort to
	 * {@link VTextObjectNodeEncoder.base} — mirroring {@link resolveShape}. The batch is monomorphic
	 * exactly when that yields a single distinct shape; a concrete result lets the parent reference
	 * it directly, avoiding a per-instance shape-index token. A fired cohort's specialized shape is
	 * created during the count pass (see {@link countNode}), so it is always present here.
	 */
	private computeDeclaredShape(state: CohortState): DeclaredShape {
		let firedKey: string | undefined;
		let firedCount = 0;
		let hasUnfired = false;
		for (const [key, count] of state.counts) {
			if (count >= this.minOccurrencesForSpecialization) {
				firedKey = key;
				firedCount += 1;
			} else {
				hasUnfired = true;
			}
		}
		if (firedCount === 0) {
			// No cohort fired (or no instances at all): every instance uses the base shape.
			return this.base;
		}
		if (firedCount === 1 && !hasUnfired && firedKey !== undefined) {
			// A single cohort fired and nothing falls back to base: one specialized shape for all.
			// The specialized encoder is created during the count pass (see countNode), so it is
			// always present here — even when `shape` is read before this node's `encodeNode` runs
			// (e.g. when a parent dispatches polymorphically via AnyShape).
			return (
				state.specializedEncoders.get(firedKey) ??
				fail("fired cohort missing its specialized shape")
			);
		}
		// Instances span multiple shapes: polymorphic dispatch.
		return AnyShape.instance;
	}

	/**
	 * Returns the specialized shape for this node's cohort if it crossed the threshold, otherwise
	 * the base encoder. The specialized shape is created during the count pass (see
	 * {@link countNode}) and cached per specialization key, giving stable shape identity.
	 */
	private resolveShape(
		cursor: ITreeCursorSynchronous,
		batch: VTextBatchState,
	): NodeShapeBasedEncoder | SpecializedNodeShapeEncoder {
		const state = batch.forEncoder(this);
		const key = this.specializationKey(cursor);
		return state.specializedEncoders.get(key) ?? this.base;
	}

	/**
	 * Build the specialization key for the node at the cursor's current position: the tuple of
	 * its {@link SpecializableField} leaf values.
	 *
	 * @remarks
	 * Each field contributes a length-prefixed `{@link valueKey}` segment (`<len>:<typedValue>`).
	 * Length-prefixing makes the concatenation injective without escaping or a `JSON.stringify`
	 * per node — which matters because this runs once per node in the count pass (and again per
	 * node in the encode pass for polymorphic cohorts).
	 */
	private specializationKey(cursor: ITreeCursorSynchronous): string {
		let key = "";
		for (const field of this.specializableFields) {
			cursor.enterField(brand(field.key));
			const hasNode = cursor.firstNode();
			assert(hasNode, "required specializable field must contain a node");
			const part = valueKey(cursor.value);
			key += `${part.length}:${part}`;
			cursor.exitNode();
			cursor.exitField();
		}
		return key;
	}

	/**
	 * Builds a {@link SpecializedNodeShapeEncoder} that bakes the current node's leaf-field values
	 * into the shape: each {@link SpecializableField} becomes a constant {@link NodeShapeBasedEncoder}
	 * (cached per leaf type + value) so instances of this cohort emit zero data for those fields.
	 */
	private createSpecialized(cursor: ITreeCursorSynchronous): SpecializedNodeShapeEncoder {
		const overrides: KeyedFieldEncoder[] = [];
		for (const field of this.specializableFields) {
			cursor.enterField(brand(field.key));
			const hasNode = cursor.firstNode();
			assert(hasNode, "required specializable field must contain a node");
			const value = cursor.value;
			const cacheKey = `${field.leafType}:${valueKey(value)}`;
			let nodeEncoder = this.constantNodeEncoders.get(cacheKey);
			if (nodeEncoder === undefined) {
				nodeEncoder = new NodeShapeBasedEncoder(field.leafType, [value], [], undefined);
				this.constantNodeEncoders.set(cacheKey, nodeEncoder);
			}
			overrides.push({ key: field.key, encoder: asFieldEncoder(nodeEncoder) });
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
