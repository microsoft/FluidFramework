/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import type { IMergeTreeOptions } from "@fluidframework/merge-tree/internal";

import type {
	IntervalCollection,
	ISerializedIntervalCollectionV1,
	ISerializedIntervalCollectionV2,
} from "./intervalCollection.js";
import {
	ISerializedInterval,
	IntervalDeltaOpType,
	SerializedIntervalDelta,
} from "./intervals/index.js";

export interface IMapMessageLocalMetadata {
	localSeq: number;
	previous?: ISerializedInterval;
}

/**
 * Optional flags that configure options for sequence DDSs
 * @internal
 */
export interface SequenceOptions
	extends Pick<
		IMergeTreeOptions,
		| "mergeTreeReferencesCanSlideToEndpoint"
		| "mergeTreeEnableObliterate"
		| "mergeTreeEnableSidedObliterate"
		| "mergeTreeEnableAnnotateAdjust"
	> {
	/**
	 * Enable the ability to use interval APIs that rely on positions before and
	 * after individual characters, referred to as "sides". See {@link @fluidframework/merge-tree#SequencePlace}
	 * for additional context.
	 *
	 * This flag must be enabled to pass instances of {@link @fluidframework/merge-tree#SequencePlace} to
	 * any IIntervalCollection API.
	 *
	 * Also see the feature flag `mergeTreeReferencesCanSlideToEndpoint` to allow
	 * endpoints to slide to the special endpoint segments.
	 *
	 * The default value is false.
	 */
	intervalStickinessEnabled: boolean;

	/**
	 * This is for testing, and allows us to output intervals in the older formats.
	 */
	intervalSerializationFormat: "1" | "2";
}

/**
 * Defines an operation that a value type is able to handle.
 *
 */
export interface IIntervalCollectionOperation {
	/**
	 * Performs the actual processing on the incoming operation.
	 * @param value - The current value stored at the given key, which should be the value type
	 * @param params - The params on the incoming operation
	 * @param local - Whether the operation originated from this client
	 * @param message - The operation itself
	 * @param localOpMetadata - any local metadata submitted by `IValueOpEmitter.emit`.
	 */
	process(
		value: IntervalCollection,
		params: ISerializedInterval,
		local: boolean,
		message: ISequencedDocumentMessage | undefined,
		localOpMetadata: IMapMessageLocalMetadata | undefined,
	): void;

	/**
	 * Rebases an `op` on `value` from its original perspective (ref/local seq) to the current
	 * perspective. Should be invoked on reconnection.
	 * @param value - The current value stored at the given key, which should be the value type.
	 * @param op - The op to be rebased.
	 * @param localOpMetadata - Any local metadata that was originally submitted with the op.
	 * @returns A rebased version of the op and any local metadata that should be submitted with it.
	 */
	rebase(
		value: IntervalCollection,
		op: IIntervalCollectionTypeOperationValue,
		localOpMetadata: IMapMessageLocalMetadata,
	):
		| {
				rebasedOp: IIntervalCollectionTypeOperationValue;
				rebasedLocalOpMetadata: IMapMessageLocalMetadata;
		  }
		| undefined;
}

/**
 * The _ready-for-serialization_ format of values contained in DDS contents. This allows us to use
 * ISerializableValue.type to understand whether they're storing a Plain JS object, a SharedObject, or a value type.
 * Note that the in-memory equivalent of ISerializableValue is ILocalValue (similarly holding a type, but with
 * the _in-memory representation_ of the value instead). An ISerializableValue is what gets passed to
 * JSON.stringify and comes out of JSON.parse. This format is used both for snapshots (loadCore/populate)
 * and ops (set).
 *
 * The DefaultMap implementation for sequence has been specialized to only support a single ValueType, which serializes
 * and deserializes via .store() and .load().
 */
export interface ISerializableIntervalCollection {
	/**
	 * A type annotation to help indicate how the value serializes.
	 */
	type: "sharedStringIntervalCollection";

	/**
	 * The JSONable representation of the value.
	 */
	value: ISerializedIntervalCollectionV1 | ISerializedIntervalCollectionV2;
}

export interface ISerializedIntervalCollection {
	/**
	 * A type annotation to help indicate how the value serializes.
	 */
	type: string;

	/**
	 * String representation of the value.
	 */
	value: string | undefined;
}

/**
 * ValueTypes handle ops slightly differently from SharedObjects or plain JS objects.  Since the Map/Directory doesn't
 * know how to handle the ValueType's ops, those ops are instead passed along to the ValueType for processing.
 * IValueTypeOperationValue is that passed-along op.  The opName on it is the ValueType-specific operation and the
 * value is whatever params the ValueType needs to complete that operation.  Similar to ISerializableValue, it is
 * serializable via JSON.stringify/parse but differs in that it has no equivalency with an in-memory value - rather
 * it just describes an operation to be applied to an already-in-memory value.
 */
export interface IIntervalCollectionTypeOperationValue {
	/**
	 * The name of the operation.
	 */
	opName: IntervalDeltaOpType;

	/**
	 * The payload that is submitted along with the operation.
	 */
	value: SerializedIntervalDelta;
}
