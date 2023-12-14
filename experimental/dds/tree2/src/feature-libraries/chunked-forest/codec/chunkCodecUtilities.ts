/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { assertValidIndex } from "../../../util";
import { TreeChunk } from "../chunk";
import { FluidSerializableReadOnly, assertAllowedValue } from "../../valueUtilities";
import { TreeValue } from "../../../core";

/**
 * Utilities related to chunk encoding and decoding that do not depend on specific chunk types or formats.
 */

/**
 * Counts usages of some `T`, then generates tables for replacing those `T` values with small numbers.
 *
 * Can be used to deduplicate objects when encoding via {@link https://go-compression.github.io/algorithms/dictionary/ | Dictionary Coding}.
 */
export class Counter<T> {
	private readonly counts: Map<T, number> = new Map();
	public add(t: T, count = 1) {
		const old = this.counts.get(t) ?? 0;
		this.counts.set(t, old + count);
	}

	/**
	 * Generate a table which can be used to deduplicate the items added via `add`.
	 * Table is sorted from most used to least used so that more commonly added items will get smaller indexes.
	 *
	 * @param filter - determines which items should be included in the table.
	 */
	public buildTable(filter: CounterFilter<T> = () => true): DeduplicationTable<T> {
		const data: T[] = [...this.counts.keys()];
		// Sort in descending order by count, giving priority (smaller indexes) to more commonly used values.
		data.sort((a, b) => (this.counts.get(b) ?? 0) - (this.counts.get(a) ?? 0));
		// Since the index needed is the output index not the input one, data.filter doesn't quite work here.
		const filtered: T[] = [];
		for (const t of data) {
			const include = filter(t, filtered.length, this.counts.get(t) ?? 0);
			if (include) {
				filtered.push(t);
			}
		}
		return {
			indexToValue: filtered,
			valueToIndex: new Map(filtered.map((t, index) => [t, index])),
		};
	}
}

/**
 * Returns true iff a given item `t` (of which there are `count` usages) is worth substituting with the number `value`.
 */
export type CounterFilter<T> = (t: T, value: number, count: number) => boolean;

/**
 * Table for dictionary compression.
 * See {@link Counter}.
 */
export interface DeduplicationTable<T> {
	/**
	 * Lookup table derived from indexToValue,
	 */
	readonly valueToIndex: ReadonlyMap<T, number>;
	/**
	 * Deduplication table: lookup values by their index.
	 *
	 * This is the portion of the table that should be included in persisted data.
	 */
	readonly indexToValue: readonly T[];
}

/**
 * Filter for use with Counter.buildTable that minimizes the size of the produced JSON.
 *
 * @remarks
 * This minimizes the number of UTF-16 code units in the produced JSON.
 * This is not ideal: minimizing UTF-8 bytes would be better.
 * For ascii text these are the same, and in worst cases they correlate pretty well (accurate to within a small constant factor).
 * This is thus good enough for a heuristic.
 *
 * Also the use of this filter doesn't take into account the length cost of keeping a value in the table possibly
 * making some of the entries at higher indexes in the table get a larger number.
 * For example, if keeping an entry at index 9 saves one character this will keep it,
 * even if that means the next entry (at index 10) loses more than one character due to 10 being two digits instead of the one digit it would have been at index 9.
 * This means that this filter is not guaranteed to be optimal, but it should always be quite close.
 */
export function jsonMinimizingFilter(s: string, value: number, count: number): boolean {
	// The most practical way to compute how long s will be with quoting and escaping
	// is to actually quote and escape it with JSON.stringify:
	const quotedAndEscaped = JSON.stringify(s);
	// Account for count instances of value, and one instance of a `,s` which would go in the table.
	const lengthUsingTable = String(value).length * count + quotedAndEscaped.length + 1;
	// Account for count instances of s.
	const lengthWithoutTable = quotedAndEscaped.length * count;
	// Break ties to not use the table to avoid needing a lookup,
	// and save table entries for other uses.
	return lengthUsingTable < lengthWithoutTable;
}

/**
 * Read from an array, but error if index is not valid.
 */
export function getChecked<T>(data: readonly T[], index: number): T {
	assertValidIndex(index, data);
	return data[index];
}

/**
 * A readable stream.
 */
export interface StreamCursor {
	/**
	 * The data to read.
	 */
	readonly data: readonly FluidSerializableReadOnly[];
	/**
	 * Location in the data.
	 */
	offset: number;
}

/**
 * Read one item from the stream, advancing the stream offset.
 */
export function readStream(stream: StreamCursor): FluidSerializableReadOnly {
	const content = getChecked(stream.data, stream.offset);
	stream.offset++;
	return content;
}

/**
 * Read one number from the stream, advancing the stream offset.
 */
export function readStreamNumber(stream: StreamCursor): number {
	const content = readStream(stream);
	assert(typeof content === "number", 0x730 /* expected number in stream */);
	return content;
}

/**
 * Read one boolean from the stream, advancing the stream offset.
 */
export function readStreamBoolean(stream: StreamCursor): boolean {
	const content = readStream(stream);
	assert(typeof content === "boolean", 0x731 /* expected boolean in stream */);
	return content;
}

/**
 * Read one TreeValue from the stream, advancing the stream offset.
 */
export function readStreamValue(stream: StreamCursor): TreeValue {
	const content = readStream(stream);
	assertAllowedValue(content);
	return content;
}

/**
 * Read one nested array from the stream, advancing the stream offset.
 *
 * @returns the nested array as a stream.
 */
export function readStreamStream(stream: StreamCursor): StreamCursor {
	const content = readStream(stream);
	assert(Array.isArray(content), 0x732 /* expected Array in stream */);
	return { data: content, offset: 0 };
}

/**
 * Decodes a chunk within a FieldBatch.
 */
export interface ChunkDecoder {
	/**
	 * Read from stream, updating the offset.
	 *
	 * @returns a TreeChunk made from the data from `stream`.
	 * This chunk is allowed to reference/take ownership of content it reads from the stream.
	 */
	decode(decoders: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk;
}
