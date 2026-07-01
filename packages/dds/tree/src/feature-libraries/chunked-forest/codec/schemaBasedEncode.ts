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
 * Encode data from `fieldBatch` in into an `EncodedChunk` using {@link FieldBatchFormatVersion.vTextExperimental}.
 * @remarks
 * Enables the specialized node shape ('f') optimization. See {@link SpecializedNodeShapeEncoder}.
 *
 * Which cohorts are folded into specialized shapes is decided by an estimated byte-gain rule
 * (see {@link VTextObjectNodeEncoder.choosePinnedFold}) — there is no fixed occurrence threshold.
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
			// Sub-object fields are intentionally not folded: nested ("subShape") specialization
			// was removed — it measured net-negative on the test corpus and required a multi-pass
			// counting loop. Such nodes specialize on their own leaf fields (if any) instead.
		}
	}

	if (specializableFields.length === 0) {
		return baseEncoder;
	}

	// The cohort key concatenates field values in this array's order, so the order must be stable
	// across all nodes of this type for keys to be comparable. Sort by field key.
	specializableFields.sort((a, b) => compareStrings(a.key, b.key));

	assert(
		baseEncoder instanceof NodeShapeBasedEncoder,
		"VText node encoder policy expects NodeShapeBasedEncoder as base",
	);
	return new VTextObjectNodeEncoder(baseEncoder, specializableFields, currentBatch);
}

/**
 * Estimated bytes of the per-instance shape-index dispatch token every instance pays once its node
 * type resolves to `numShapes` shapes (via {@link AnyShape}). This tax is what makes folding
 * low-value cohorts a net loss. The index is a number, so its width grows with the shape count; the
 * `+ 2` is its delimiter plus the fact that the index is into the (larger) global shape table — so
 * a few cohorts fold cheaply while many marginal cohorts do not.
 *
 * This and the shape-cost constants below are estimates of the encoded JSON wire sizes, not exact
 * counts — calibrated so the fold decision matches real encoder output on the size tests, which are
 * the ground truth.
 */
function dispatchTokenBytes(numShapes: number): number {
	return String(Math.max(1, numShapes) - 1).length + 2;
}

/** Estimated serialized bytes of a specialized ('f') shape's own wrapper (its `base` + `fields` framing). */
const specializedShapeWrapperBytes = 16;

/** Estimated serialized bytes added per overridden field in a specialized shape (its `[keyRef, shapeRef]` entry). */
const overrideFieldBytes = 6;

/** Estimated bytes of one constant leaf shape's `{ c: { type, value } }` framing (the value's own bytes are counted via {@link valueByteEstimate}). */
const constantLeafShapeWrapperBytes = 24;

/**
 * Estimated bytes of a value's separator in the flat data array. Folding a field removes the value's
 * characters AND its position, so the per-instance saving is {@link valueByteEstimate} plus this —
 * which matters most for multi-field nodes (a 3-coordinate point drops three values and separators).
 */
const dataSeparatorBytes = 1;

/** Estimated inline data bytes of a leaf value: strings include their quotes, numbers/booleans their literal length. */
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
 * A single-valued boolean, string, or number leaf field of an ObjectNode whose value
 * can be constant-folded into a {@link SpecializedNodeShapeEncoder}.
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
 * Identifies a cohort: same-typed nodes sharing identical {@link SpecializableField} leaf values, so
 * they can encode through one {@link SpecializedNodeShapeEncoder}. Built by
 * {@link VTextObjectNodeEncoder.cohortKeyFromValues} as length-prefixed {@link valueKey} segments.
 */
type CohortKey = Brand<string, "tree.CohortKey">;

/**
 * What the count pass records about one whole-node cohort: how many nodes share this exact
 * combination of all specializable-field values, plus those values (captured once so the fold
 * decision can choose which fields to pin and build the shapes without re-walking a cursor).
 */
interface Cohort {
	count: number;
	/** Every specializable-field leaf value, in the encoder's (sorted) field order. */
	readonly values: readonly Value[];
}

/**
 * A cohort over the chosen pinned fields only: nodes that agree on every pinned field (their
 * non-pinned fields may differ). This is the unit that actually folds into one specialized shape.
 */
interface PinnedCohort {
	count: number;
	/** The pinned-field leaf values, in pinned-field order. */
	readonly values: readonly Value[];
}

/**
 * Per-encoder bookkeeping for one batch. The count pass fills {@link CohortState.cohorts}; the fold
 * {@link CohortState.decision} is then derived from it lazily, once, on first access.
 */
interface CohortState {
	/** Every whole-node cohort observed in the batch, keyed by its all-fields {@link CohortKey}. */
	readonly cohorts: Map<CohortKey, Cohort>;
	/** The fold decision, computed lazily once on first access. */
	decision?: FoldDecision;
}

/** What {@link VTextObjectNodeEncoder.choosePinnedFold} decides for one batch. */
interface FoldDecision {
	/** Indices into `specializableFields` chosen for pinning. */
	readonly pinnedFieldIndices: readonly number[];
	/** Specialized shapes for the folded pinned cohorts, keyed by their pinned-field {@link CohortKey}. */
	readonly foldedEncoders: ReadonlyMap<CohortKey, SpecializedNodeShapeEncoder>;
	/** The shape the parent declares for this node type (a single shape, or {@link AnyShape}). */
	readonly declared: DeclaredShape;
}

/**
 * The shape declared for a node type in a batch: a single concrete shape when monomorphic (it is
 * itself a {@link NodeEncoder}), or {@link AnyShape} when instances span multiple shapes.
 */
type DeclaredShape = NodeShapeBasedEncoder | SpecializedNodeShapeEncoder | AnyShape;

/**
 * Specialization state for one {@link compressedEncode} call (a "batch"). Created fresh per call
 * (including recursive incremental sub-chunks), holding one {@link CohortState} per encoder instance.
 */
class VTextBatchState {
	private readonly perEncoder: Map<object, CohortState> = new Map();

	/** The {@link CohortState} for `encoder`, created empty on first access. */
	public forEncoder(encoder: object): CohortState {
		let state = this.perEncoder.get(encoder);
		if (state === undefined) {
			state = { cohorts: new Map() };
			this.perEncoder.set(encoder, state);
		}
		return state;
	}
}

/**
 * Encodes ObjectNodes using {@link SpecializedNodeShapeEncoder} ('f') shapes that constant-fold
 * required single-valued leaf fields whose values repeat across a batch.
 *
 * @remarks
 * Two passes. Pass 1 ({@link VTextObjectNodeEncoder.countNode}) groups this type's nodes into
 * whole-node cohorts. {@link VTextObjectNodeEncoder.choosePinnedFold} then chooses which fields to
 * pin and which cohorts to fold, by estimated byte gain (not a fixed count). Pinning a subset of
 * fields lets mixed data (e.g. records with a unique id) fold its repetitive fields while leaving
 * unique ones in the stream. Pass 2 ({@link VTextObjectNodeEncoder.encodeNode}) emits accordingly.
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
	 * Counting-pass entry point: tallies this node's whole-node cohort, capturing the cohort's leaf
	 * values on first sight so its shape can be built later without a cursor.
	 */
	public countNode(cursor: ITreeCursorSynchronous, batch: VTextBatchState): void {
		const state = batch.forEncoder(this);
		const values = this.readValues(cursor);
		const key = this.cohortKeyFromValues(values);
		const existing = state.cohorts.get(key);
		if (existing === undefined) {
			state.cohorts.set(key, { count: 1, values });
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
			// This type resolves to more than one shape, so each instance prefixes its own shape
			// index via AnyShape (`d`) dispatch.
			AnyShape.encodeNode(cursor, context, outputBuffer, this.resolveShape(cursor, batch));
		} else {
			// Every instance resolves to `declared`, which the parent references directly: emit only
			// the node's data, with no per-instance shape token.
			declared.encodeNode(cursor, context, outputBuffer);
		}
	}

	/**
	 * The shape the parent declares for this node. Lazily runs (and memoizes) the fold decision on
	 * first access. Counting is complete by the encode pass. Keeping per-node encoding O(1).
	 */
	private declaredShape(batch: VTextBatchState): DeclaredShape {
		const state = batch.forEncoder(this);
		state.decision ??= this.choosePinnedFold(state.cohorts);
		return state.decision.declared;
	}

	/**
	 * Picks the pinned-field set and the cohorts to fold by greedy elimination: pin every field
	 * except fully-unique ones, then while nothing folds profitably, drop the remaining field with
	 * the most distinct values and retry. This is what lets mixed data fold while uniform data folds
	 * on the first try.
	 *
	 * TODO: This greedy heuristic is not guaranteed to find the optimal fold. A more expensive search
	 * could explore every combination of pinned fields instead.
	 */
	private choosePinnedFold(cohorts: ReadonlyMap<CohortKey, Cohort>): FoldDecision {
		let totalInstances = 0;
		for (const cohort of cohorts.values()) {
			totalInstances += cohort.count;
		}
		const distinctValueCount = this.distinctValueCounts(cohorts);
		// Drop fully-unique fields up front; a field with no repeated value can never form a
		// reusable cohort, only fragment one.
		let pinned = this.specializableFields
			.map((_field, index) => index)
			.filter((index) => (distinctValueCount[index] ?? 0) < totalInstances);

		while (pinned.length > 0) {
			const fold = this.foldPinnedCohorts(this.buildPinnedCohorts(cohorts, pinned), pinned);
			if (fold.folded.size > 0) {
				return {
					pinnedFieldIndices: pinned,
					foldedEncoders: fold.folded,
					declared: fold.declared,
				};
			}
			// Nothing folded with this set: drop the field with the most distinct values and retry.
			pinned = this.withoutMostDistinctValues(pinned, distinctValueCount);
		}
		return { pinnedFieldIndices: [], foldedEncoders: new Map(), declared: this.base };
	}

	/** Distinct-value count of each specializable field, computed in one pass over the cohorts. */
	private distinctValueCounts(cohorts: ReadonlyMap<CohortKey, Cohort>): number[] {
		const seen = this.specializableFields.map(() => new Set<string>());
		for (const cohort of cohorts.values()) {
			for (const [index, distinct] of seen.entries()) {
				distinct.add(valueKey(cohort.values[index]));
			}
		}
		return seen.map((distinct) => distinct.size);
	}

	/** Returns `pinned` without the field that has the most distinct values. */
	private withoutMostDistinctValues(
		pinned: readonly number[],
		distinctValueCount: readonly number[],
	): number[] {
		let worst = -1;
		let worstDistinctValueCount = -1;
		for (const index of pinned) {
			const fieldDistinctValueCount = distinctValueCount[index] ?? 0;
			if (fieldDistinctValueCount > worstDistinctValueCount) {
				worstDistinctValueCount = fieldDistinctValueCount;
				worst = index;
			}
		}
		return pinned.filter((index) => index !== worst);
	}

	/**
	 * Folds the worthwhile cohorts and returns them with the declared shape (or an empty set + the
	 * base shape if none is worth it). Folding makes the type polymorphic, so every instance then
	 * pays a per-instance dispatch token; the decision weighs saved bytes against shape cost and that
	 * tax. A single cohort covering every instance stays monomorphic. Many low-value cohorts can't
	 * beat the tax, so nothing folds.
	 */
	private foldPinnedCohorts(
		pinnedCohorts: ReadonlyMap<CohortKey, PinnedCohort>,
		pinned: readonly number[],
	): { folded: Map<CohortKey, SpecializedNodeShapeEncoder>; declared: DeclaredShape } {
		const folded = new Map<CohortKey, SpecializedNodeShapeEncoder>();
		if (pinnedCohorts.size === 1) {
			const [key, cohort] = oneFromIterable(pinnedCohorts) ?? fail("size-1 map has one entry");
			if (this.cohortMarginalGain(cohort) > 0) {
				// One shape for every instance: monomorphic, no dispatch tax.
				const encoder = this.createSpecialized(pinned, cohort.values);
				folded.set(key, encoder);
				return { folded, declared: encoder };
			}
		} else if (pinnedCohorts.size > 1) {
			let totalInstances = 0;
			let summedMarginal = 0;
			const candidates: [CohortKey, PinnedCohort][] = [];
			for (const entry of pinnedCohorts) {
				totalInstances += entry[1].count;
				const marginal = this.cohortMarginalGain(entry[1]);
				if (marginal > 0) {
					summedMarginal += marginal;
					candidates.push(entry);
				}
			}
			// Folding any cohort here makes the type polymorphic, so all instances pay the dispatch
			// tax. The type resolves to one shape per folded cohort, plus the base shape if any cohort
			// is left unfolded — and the dispatch index width grows with that shape count.
			const distinctShapes =
				candidates.length + (candidates.length < pinnedCohorts.size ? 1 : 0);
			if (summedMarginal - totalInstances * dispatchTokenBytes(distinctShapes) > 0) {
				for (const [key, cohort] of candidates) {
					folded.set(key, this.createSpecialized(pinned, cohort.values));
				}
				return { folded, declared: AnyShape.instance };
			}
		}
		return { folded, declared: this.base };
	}

	/**
	 * Re-groups the whole-node cohorts into cohorts keyed only by the pinned fields, summing counts
	 * for nodes that agree on the pinned fields but differ elsewhere.
	 */
	private buildPinnedCohorts(
		cohorts: ReadonlyMap<CohortKey, Cohort>,
		pinned: readonly number[],
	): Map<CohortKey, PinnedCohort> {
		const pinnedCohorts = new Map<CohortKey, PinnedCohort>();
		for (const cohort of cohorts.values()) {
			const values = pinned.map((f) => cohort.values[f]);
			const key = this.cohortKeyFromValues(values);
			const existing = pinnedCohorts.get(key);
			if (existing === undefined) {
				pinnedCohorts.set(key, { count: cohort.count, values });
			} else {
				existing.count += cohort.count;
			}
		}
		return pinnedCohorts;
	}

	/**
	 * Estimated bytes saved by folding one pinned cohort, before the batch-wide dispatch tax: the
	 * per-instance data removed (each pinned value's inline bytes plus its separator) times the member
	 * count, minus the one-time cost of the cohort's specialized shape.
	 */
	private cohortMarginalGain(cohort: PinnedCohort): number {
		let perInstanceSaving = 0;
		let shapeCost = specializedShapeWrapperBytes;
		for (const value of cohort.values) {
			const valueBytes = valueByteEstimate(value);
			perInstanceSaving += valueBytes + dataSeparatorBytes;
			shapeCost += overrideFieldBytes + constantLeafShapeWrapperBytes + valueBytes;
		}
		return cohort.count * perInstanceSaving - shapeCost;
	}

	/**
	 * The specialized shape for this node's pinned cohort if it was folded, otherwise the base
	 * encoder. Used only on the polymorphic ({@link AnyShape}) path, so the batch is already
	 * finalized.
	 */
	private resolveShape(
		cursor: ITreeCursorSynchronous,
		batch: VTextBatchState,
	): NodeShapeBasedEncoder | SpecializedNodeShapeEncoder {
		const decision =
			batch.forEncoder(this).decision ?? fail("resolveShape requires a finalized batch");
		const allValues = this.readValues(cursor);
		const pinnedValues = decision.pinnedFieldIndices.map((f) => allValues[f]);
		return decision.foldedEncoders.get(this.cohortKeyFromValues(pinnedValues)) ?? this.base;
	}

	/**
	 * Reads this node's {@link SpecializableField} leaf values, in the encoder's fixed field order.
	 *
	 * @remarks
	 * Only required single-valued leaf fields are read. Optional fields are intentionally left out.
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
	 * Builds a {@link CohortKey} from leaf values: one length-prefixed {@link valueKey} segment per
	 * field (the length prefix keeps `["a","b"]` distinct from `["ab"]`). Cheap concatenation rather
	 * than `JSON.stringify`, since it runs per node.
	 */
	private cohortKeyFromValues(values: readonly Value[]): CohortKey {
		let key = "";
		for (const value of values) {
			const part = valueKey(value);
			key += `${part.length}:${part}`;
		}
		return brand(key);
	}

	/**
	 * Builds an `f` shape that bakes a pinned cohort's values in: each pinned field becomes a constant
	 * {@link NodeShapeBasedEncoder} (cached per leaf type + value) so members emit no data for it;
	 * non-pinned fields stay as the base shape's variable encoders. `pinned` indexes
	 * {@link specializableFields}; `values` are its values in that order.
	 */
	private createSpecialized(
		pinned: readonly number[],
		values: readonly Value[],
	): SpecializedNodeShapeEncoder {
		const overrides: KeyedFieldEncoder[] = pinned.map((fieldIndex, i) => {
			const field =
				this.specializableFields[fieldIndex] ?? fail("pinned field index out of range");
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
