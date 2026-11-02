/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/prefer-spread -- These tests exercise StringSequence.concat, not Array.concat. */

import { strict as assert } from "node:assert";
import { makeRandom } from "@fluid-private/stochastic-test-utils";
import {
	StringPiece,
	StringSequence,
	stringBufferSize,
	// Allow importing the independently testable storage implementation:
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../util/stringStorage.js";

describe("forest-independent string storage", () => {
	for (const text of ["", "abc", "a\u{1F600}b", "\uD800x\uDC00", "ab\u{1F600}".repeat(3000)]) {
		it(`preserves ${text.length} UTF-16 units as code-point atoms`, () => {
			const sequence = StringSequence.fromString(text);
			const atoms = [...text];
			assert.equal(sequence.length, atoms.length);
			assert.equal(sequence.text, text);
			assert.deepEqual([...sequence.values(0)], atoms);
			for (const index of [0, 1, 63, 64, 65, atoms.length - 1]) {
				if (index >= 0 && index < atoms.length) {
					assert.equal(sequence.at(index), atoms[index]);
					assert.deepEqual([...sequence.values(index)], atoms.slice(index));
				}
			}
			assert.deepEqual([...sequence.values(sequence.length)], []);
		});
	}

	it("bounds visible buffers without splitting surrogate pairs", () => {
		const text = `${"x".repeat(stringBufferSize - 1)}\u{1F600}${"y".repeat(stringBufferSize)}`;
		const pieces = StringPiece.fromString(text);
		assert(pieces.every((piece) => piece.text.length <= stringBufferSize));
		assert.deepEqual(
			pieces.flatMap((piece) => [...piece.values(0)]),
			[...text],
		);
	});

	it("shares complete pieces and restores contiguous slices", () => {
		const piece = StringPiece.fromString("abc\u{1F600}def")[0];
		assert(piece !== undefined);
		assert.equal(piece.slice(0, piece.length), piece);
		const left = piece.slice(0, 4);
		const right = piece.slice(4, piece.length);
		const combined = left.tryAppend(right);
		assert(combined !== undefined);
		assert.equal(combined.text, piece.text);
		assert.equal(left.text, "abc\u{1F600}");
		assert.equal(right.text, "def");
	});

	it("preserves independently inserted surrogate halves", () => {
		const sequence = StringSequence.fromString("\uD800").concat(
			StringSequence.fromString("\uDC00"),
		);
		assert.equal(sequence.length, 2);
		assert.equal(sequence.pieces.length, 2);
		assert.deepEqual([...sequence.values(0)], ["\uD800", "\uDC00"]);
		assert.deepEqual([...sequence.slice(1, 2).values(0)], ["\uDC00"]);
	});

	it("bounds cross-buffer coalescing", () => {
		const small = StringSequence.fromString("a".repeat(128)).concat(
			StringSequence.fromString("b".repeat(128)),
		);
		assert.equal(small.pieces.length, 1);
		assert.equal(small.concat(StringSequence.fromString("c")).pieces.length, 2);
	});

	it("matches ordinary arrays through deterministic immutable edits", () => {
		let sequence = StringSequence.fromString("abc\u{1F600}".repeat(1000));
		let atoms = [...sequence.values(0)];
		const random = makeRandom(42);
		for (let step = 0; step < 100; step++) {
			const start = random.integer(0, atoms.length);
			const end = random.integer(start, atoms.length);
			const text = random.pick(["x", "\u{1F600}", "\uD800", "\uDC00", ""]);
			const old = sequence;
			const oldAtoms = atoms;
			sequence = sequence
				.slice(0, start)
				.concat(StringSequence.fromString(text))
				.concat(sequence.slice(end, sequence.length));
			atoms = [...atoms.slice(0, start), ...text, ...atoms.slice(end)];
			assert.deepEqual([...sequence.values(0)], atoms);
			assert.equal(sequence.length, atoms.length);
			assert.deepEqual([...old.values(0)], oldAtoms);
		}
	});

	it("rejects invalid indexes and ranges", () => {
		const sequence = StringSequence.fromString("abc");
		for (const index of [-1, 0.5, 3, Number.NaN]) {
			assert.throws(() => sequence.at(index));
		}
		assert.throws(() => sequence.slice(2, 1));
		assert.throws(() => sequence.slice(0, 4));
	});
});
