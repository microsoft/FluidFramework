/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import type {
	Edit,
	EditLogSummarizer,
	NodeIdConverter,
	RevisionView,
	SharedTreeEditOp,
	SummaryContents,
	SharedTreeSummaryBase,
} from '../generic';

/**
 * Object capable of converting between the current internal representation for edits and some versioned format used
 * for ops and summaries.
 */
export interface SharedTreeEncoder<TChangeInternal> {
	/**
	 * Encodes an edit op to be sent.
	 * @param edit - edit to encode.
	 * @param fluidSerialize - Callback which serializes fluid handles contained in a JSON-serializable object, returning the result.
	 * Should be invoked on the edit contents at some point before op encoding is complete.
	 * This is because edit contents may have Payloads needing to be serialized.
	 */
	encodeEditOp(
		edit: Edit<TChangeInternal>,
		fluidSerialize: (edit: Edit<unknown>) => Edit<unknown>
	): SharedTreeEditOp<unknown>;

	/**
	 * Decodes an edit op encoded with `encodeEditOp`.
	 * @param op - op to decode.
	 * @param fluidDeserialize - Callback which deserializes fluid handles contained in a JSON-serializable object.
	 * Should be invoked on the semi-serialized edit contents at some point before decoding is complete.
	 * This will rehydrate any serialized fluid handles into usable IFluidHandle objects.
	 */
	decodeEditOp(
		op: SharedTreeEditOp<unknown>,
		fluidDeserialize: (semiSerializedEdit: Edit<unknown>) => Edit<unknown>
	): Edit<TChangeInternal>;

	/**
	 * Encodes a summary.
	 * @internal
	 */
	encodeSummary(
		summarizeLog: EditLogSummarizer,
		currentView: RevisionView,
		idConverter: NodeIdConverter,
		summarizeHistory: boolean
	): SharedTreeSummaryBase;

	/**
	 * Decodes an encoded summary.
	 * @internal
	 */
	decodeSummary(summary: SharedTreeSummaryBase): SummaryContents<TChangeInternal>;
}
