/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Store text without a separate stored string or object for each character.
 * Pieces refer to ranges in immutable string buffers.
 * To represent an edit, reuse those buffers and build a new list of pieces.
 * Existing pieces and sequences do not change.
 *
 * This module has no tree, schema, cursor, or forest dependencies.
 * Different tree representations can share its storage without sharing their editing policies.
 *
 * Indexes count logical atoms, not UTF-16 code units or grapheme clusters.
 * Each code point in an input string becomes one atom.
 * A lone surrogate is also one atom.
 * Joining sequences preserves these boundaries: separately supplied surrogate halves remain two atoms.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";

const checkpointStride = 64;

/**
 * Maximum visible length of a new backing buffer, in UTF-16 code units.
 * JavaScript string slices can share larger allocations, so this is not a physical memory limit.
 */
export const stringBufferSize = 4096;
const coalesceSize = 256;

/** Immutable text and sparse code-point offsets shared by pieces. */
class StringBuffer {
	public readonly length: number;
	private readonly checkpoints: readonly number[] | undefined;

	public constructor(public readonly text: string) {
		const checkpoints: number[] = [];
		let count = 0;
		for (let offset = 0; offset < text.length; count++) {
			if (count % checkpointStride === 0) {
				checkpoints.push(offset);
			}
			offset += characterWidth(text, offset);
		}
		this.length = count;
		this.checkpoints = count === text.length ? undefined : checkpoints;
	}

	/**
	 * Converts an atom index to its UTF-16 offset in this buffer.
	 * @param index - An integer from zero through length.
	 * The index at length maps to the end of the string.
	 */
	public offset(index: number): number {
		assert(index >= 0 && index <= this.length, "Character offset out of bounds");
		if (this.checkpoints === undefined || index === this.length) {
			return index === this.length ? this.text.length : index;
		}
		const checkpoint = Math.floor(index / checkpointStride);
		let offset = this.checkpoints[checkpoint] ?? oob();
		for (let i = checkpoint * checkpointStride; i < index; i++) {
			offset += characterWidth(this.text, offset);
		}
		return offset;
	}
}

function characterWidth(text: string, offset: number): number {
	return (text.codePointAt(offset) ?? oob()) > 0xffff ? 2 : 1;
}

/**
 * An immutable range of logical code-point atoms in a shared string buffer.
 * @remarks
 * A piece stores a range, not a string for each atom.
 * Slices share the buffer and can outlive the piece from which they were made.
 * All indexes and lengths on this class count atoms unless stated otherwise.
 */
export class StringPiece {
	private constructor(
		private readonly buffer: StringBuffer,
		private readonly start: number,
		/**
		 * The number of atoms in this piece.
		 */
		public readonly length: number,
	) {}

	/**
	 * Splits an input string into pieces with buffers bounded by {@link stringBufferSize}.
	 * Each Unicode code point, including a lone surrogate, becomes one atom.
	 * A surrogate pair is never split between buffers.
	 * @returns An empty list for an empty string, or a list of non-empty pieces in input order.
	 */
	public static fromString(text: string): StringPiece[] {
		const pieces: StringPiece[] = [];
		for (let start = 0; start < text.length; ) {
			let end = Math.min(start + stringBufferSize, text.length);
			// Do not split a surrogate pair at a backing-buffer boundary.
			if (end < text.length && characterWidth(text, end - 1) === 2) {
				end--;
			}
			const buffer = new StringBuffer(text.slice(start, end));
			pieces.push(new StringPiece(buffer, 0, buffer.length));
			start = end;
		}
		return pieces;
	}

	public get text(): string {
		return this.buffer.text.slice(
			this.buffer.offset(this.start),
			this.buffer.offset(this.start + this.length),
		);
	}

	/**
	 * Returns one atom as a string containing one or two UTF-16 code units.
	 * @param index - An integer from zero up to, but not including, length.
	 * Negative indexes are not supported.
	 */
	public at(index: number): string {
		assert(Number.isInteger(index) && index >= 0 && index < this.length, "Invalid atom index");
		const offset = this.buffer.offset(this.start + index);
		return this.buffer.text.slice(offset, offset + characterWidth(this.buffer.text, offset));
	}

	/**
	 * Reads atoms in order from start through the end of the piece.
	 * The iterator advances through the buffer instead of looking up each atom from the start.
	 * @param start - An integer from zero through length.
	 * Passing length produces an empty iterator.
	 */
	public *values(start: number): IterableIterator<string> {
		assert(
			Number.isInteger(start) && start >= 0 && start <= this.length,
			"Invalid atom index",
		);
		let offset = this.buffer.offset(this.start + start);
		for (let index = start; index < this.length; index++) {
			const end = offset + characterWidth(this.buffer.text, offset);
			yield this.buffer.text.slice(offset, end);
			offset = end;
		}
	}

	/**
	 * Shares the backing buffer without changing the source piece.
	 * @param start - The first atom to include.
	 * @param end - The first atom to exclude.
	 * Both indexes must be integers within this piece, with start less than end.
	 * @returns This piece for its full range, or a new piece for a smaller range.
	 * Unlike {@link StringSequence.slice}, this method does not accept an empty range.
	 */
	public slice(start: number, end: number): StringPiece {
		assert(
			Number.isInteger(start) &&
				Number.isInteger(end) &&
				start >= 0 &&
				start < end &&
				end <= this.length,
			"Invalid string piece range",
		);
		return start === 0 && end === this.length
			? this
			: new StringPiece(this.buffer, this.start + start, end - start);
	}

	/**
	 * Attempts to join this piece and other into one piece without changing either input.
	 * @returns A new piece, or undefined if the pieces must remain separate.
	 * @remarks
	 * Adjacent ranges in the same buffer join without copying text.
	 * Other ranges join only when their combined text is at most 256 UTF-16 code units.
	 * That case creates a new buffer.
	 * The join is rejected if it would combine two separate surrogate-half atoms into one atom.
	 */
	public tryAppend(other: StringPiece): StringPiece | undefined {
		if (this.buffer === other.buffer && this.start + this.length === other.start) {
			return new StringPiece(this.buffer, this.start, this.length + other.length);
		}
		const leftLength =
			this.buffer.offset(this.start + this.length) - this.buffer.offset(this.start);
		const rightLength =
			other.buffer.offset(other.start + other.length) - other.buffer.offset(other.start);
		if (leftLength + rightLength > coalesceSize) {
			return undefined;
		}
		const buffer = new StringBuffer(this.text + other.text);
		// Separately inserted surrogate halves must remain separate logical atoms.
		if (buffer.length !== this.length + other.length) {
			return undefined;
		}
		return new StringPiece(buffer, 0, buffer.length);
	}
}

/**
 * An immutable sequence of string atoms with no tree, schema, or forest dependencies.
 * Edits produce new piece lists while sharing immutable backing storage.
 * @remarks
 * Use slices and concatenation to build an edited sequence.
 * Keep the original sequence when another reader still needs the old text.
 * Atom boundaries are preserved even when joining the text would form a new surrogate pair.
 * All indexes and lengths on this class count atoms.
 */
export class StringSequence {
	/**
	 * The number of logical atoms, which can differ from the code-point count of text.
	 * Separate surrogate-half atoms remain separate in this count.
	 */
	public readonly length: number;
	/**
	 * The immutable pieces in sequence order.
	 */
	public readonly pieces: readonly StringPiece[];

	/**
	 * Copies the supplied piece list and shares the pieces.
	 * This constructor does not join adjacent pieces.
	 * Later changes to the supplied list do not affect this sequence.
	 */
	public constructor(pieces: Iterable<StringPiece>) {
		this.pieces = [...pieces];
		this.length = this.pieces.reduce((length, piece) => length + piece.length, 0);
	}

	/**
	 * Creates a sequence with one atom per Unicode code point in the input.
	 * Lone surrogates are preserved.
	 * Storage is split into bounded pieces without splitting a surrogate pair.
	 */
	public static fromString(text: string): StringSequence {
		return new StringSequence(StringPiece.fromString(text));
	}

	/**
	 * Joins the piece spans into a string.
	 * The result does not record atom boundaries between separately supplied surrogate halves.
	 * Use values when those boundaries must be preserved.
	 */
	public get text(): string {
		return this.pieces.map((piece) => piece.text).join("");
	}

	/**
	 * Returns the atom at an index.
	 * @param index - An integer from zero up to, but not including, length.
	 * Negative indexes are not supported.
	 * @remarks
	 * This method scans the piece list to find the containing piece.
	 * Use values for sequential reads to avoid repeating that scan for each atom.
	 */
	public at(index: number): string {
		assert(Number.isInteger(index) && index >= 0 && index < this.length, "Invalid atom index");
		let offset = index;
		for (const piece of this.pieces) {
			if (offset < piece.length) {
				return piece.at(offset);
			}
			offset -= piece.length;
		}
		return oob();
	}

	/**
	 * Reads atoms in order without restarting the piece search for each atom.
	 * @param start - An integer from zero through length.
	 * Passing length produces an empty iterator.
	 * @remarks
	 * The iterator keeps the sequence's atom boundaries, including separate surrogate halves.
	 */
	public *values(start: number): IterableIterator<string> {
		assert(
			Number.isInteger(start) && start >= 0 && start <= this.length,
			"Invalid atom index",
		);
		let offset = start;
		for (const piece of this.pieces) {
			if (offset < piece.length) {
				yield* piece.values(offset);
				offset = 0;
			} else {
				offset -= piece.length;
			}
		}
	}

	/**
	 * Returns a new sequence for the range from start, inclusive, to end, exclusive.
	 * @param start - The first atom to include.
	 * @param end - The first atom to exclude.
	 * Both indexes must be integers from zero through length, with start no greater than end.
	 * @remarks
	 * An empty range produces an empty sequence.
	 * Complete pieces are reused; partial pieces share their original buffers.
	 * The source sequence does not change.
	 */
	public slice(start: number, end: number): StringSequence {
		assert(
			Number.isInteger(start) &&
				Number.isInteger(end) &&
				start >= 0 &&
				start <= end &&
				end <= this.length,
			"Invalid string sequence range",
		);
		const pieces: StringPiece[] = [];
		let offset = 0;
		for (const piece of this.pieces) {
			const from = Math.max(0, start - offset);
			const to = Math.min(piece.length, end - offset);
			if (from < to) {
				pieces.push(piece.slice(from, to));
			}
			offset += piece.length;
			if (offset >= end) {
				break;
			}
		}
		return new StringSequence(pieces);
	}

	/**
	 * Returns a new sequence containing this sequence followed by other.
	 * Neither input changes, and all atom boundaries are preserved.
	 * @remarks
	 * The result shares backing storage where possible.
	 * Adjacent pieces are joined when {@link StringPiece.tryAppend} permits it.
	 * This can copy small spans, but does not copy all text into a single buffer.
	 */
	public concat(other: StringSequence): StringSequence {
		const pieces: StringPiece[] = [];
		for (const sequence of [this, other]) {
			for (const piece of sequence.pieces) {
				const combined = pieces.at(-1)?.tryAppend(piece);
				if (combined === undefined) {
					pieces.push(piece);
				} else {
					pieces[pieces.length - 1] = combined;
				}
			}
		}
		return new StringSequence(pieces);
	}
}
