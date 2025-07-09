/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type {
	BufferFormat,
	BufferFormatIncremental,
	FieldBufferFormat,
} from "./compressedEncode.js";
import { FieldUnchanged } from "./format.js";

/**
 * Interface for building encoded data in BufferFormatIncremental format.
 */
export interface IEncodedDataBuilder {
	/**
	 * Indicates whether the data can be encoded incrementally.
	 * If true, field supporting incremental encoding may add their data to the incremental field buffers.
	 * If false, all data must be added to the main buffer.
	 */
	readonly encodeIncrementally: boolean;
	/**
	 * Indicates whether fields should be encoded irrespective of whether they have changed or not.
	 * If true, all fields will be encoded in the batch, even if they have not changed since the last encoding.
	 */
	readonly fullTree: boolean;
	/**
	 * Add data to the main buffer.
	 * @param data - The data to add.
	 */
	addToBuffer(data: BufferFormat[number]): void;
	/**
	 * Add data to the incremental field buffers in case where the field has changed since the last summary.
	 * @param fieldSummaryRefId - The reference ID of the summary for this field in the previous summary.
	 * @param fieldBufferIncremental - The data for the filed in BufferFormatIncremental format.
	 */
	addIncrementalFieldChanged(
		fieldSummaryRefId: string,
		fieldBufferIncremental: BufferFormatIncremental,
	): void;
	/**
	 * Add data to the incremental field buffers in case where the field has not changed since the last summary.
	 * @param fieldSummaryRefId - The reference ID of the summary for this field in the previous summary.
	 */
	addIncrementalFieldUnchanged(fieldSummaryRefId: string): void;
	/**
	 * Create a new child builder that will be used by the children of a field that supports incremental encoding.
	 * @returns A new EncodedDataBuilder instance that can be used to build data for a child.
	 */
	createChild(): EncodedDataBuilder;
	/**
	 * Create a sibling builder from the main buffer. This is used to create a new builder that shares the
	 * incremental field buffers with the current builder but has its own main buffer.
	 * @param mainBuffer - The main buffer to use for the new builder.	 *
	 * @returns A new EncodedDataBuilder instance that shares the incremental field buffers with the current builder.
	 */
	createSiblingFromBuffer(mainBuffer: BufferFormat): EncodedDataBuilder;
}

/**
 * Helper class to build data in BufferFormatIncremental format during encoding. Data may be added to the
 * main buffer or to incremental field buffers. If added to incremental field buffers, it can be either
 * be for a field that has changed or for a field that has not changed since the last summary.
 */
export class EncodedDataBuilder implements IEncodedDataBuilder {
	public constructor(
		public readonly encodeIncrementally: boolean,
		public readonly fullTree: boolean,
		private readonly mainBuffer: BufferFormat = [],
		private readonly incrementalFieldBuffers: Map<string, FieldBufferFormat> = new Map(),
	) {}

	/** {@inheritdoc IEncodedDataBuilder.addToBuffer} */
	public addToBuffer(content: BufferFormat[number]): void {
		this.mainBuffer.push(content);
	}

	/** {@inheritdoc IEncodedDataBuilder.addIncrementalFieldChanged} */
	public addIncrementalFieldChanged(
		fieldSummaryRefId: string,
		fieldBufferIncremental: BufferFormatIncremental,
	): void {
		assert(
			this.encodeIncrementally,
			"Cannot add incremental field changes when encodeIncrementally is false",
		);
		// Wrap the mainBuffer in an array as that is the expected format.
		// TODO: I am not 100% sure why this though.
		const fieldBufferForEncoding: BufferFormatIncremental = {
			mainBuffer: [fieldBufferIncremental.mainBuffer],
			incrementalFieldBuffers: fieldBufferIncremental.incrementalFieldBuffers,
		};
		this.incrementalFieldBuffers.set(fieldSummaryRefId, fieldBufferForEncoding);
	}

	/** {@inheritdoc IEncodedDataBuilder.addIncrementalFieldUnchanged} */
	public addIncrementalFieldUnchanged(fieldSummaryRefId: string): void {
		assert(
			this.encodeIncrementally,
			"Cannot add unchanged incremental field when encodeIncrementally is false",
		);
		assert(!this.fullTree, "Fields must be fully encoded in full tree mode");
		this.incrementalFieldBuffers.set(fieldSummaryRefId, FieldUnchanged);
	}

	/** {@inheritdoc IEncodedDataBuilder.createChild} */
	public createChild(): EncodedDataBuilder {
		return new EncodedDataBuilder(this.encodeIncrementally, this.fullTree);
	}

	/** {@inheritdoc IEncodedDataBuilder.createSiblingFromBuffer} */
	public createSiblingFromBuffer(mainBuffer: BufferFormat): EncodedDataBuilder {
		return new EncodedDataBuilder(
			this.encodeIncrementally,
			this.fullTree,
			mainBuffer,
			this.incrementalFieldBuffers,
		);
	}

	public getBufferIncremental(): BufferFormatIncremental {
		return {
			mainBuffer: this.mainBuffer,
			incrementalFieldBuffers: this.incrementalFieldBuffers,
		};
	}
}
