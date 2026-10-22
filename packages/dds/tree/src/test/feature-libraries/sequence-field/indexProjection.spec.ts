/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { tagChange } from "../../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Exercise the sequence editor without adding a production export.
import { sequenceFieldEditor as editor } from "../../../feature-libraries/sequence-field/sequenceFieldEditor.js";
// eslint-disable-next-line import-x/no-internal-modules -- Describe the sequence changes used by the projection experiment.
import type { Changeset } from "../../../feature-libraries/sequence-field/types.js";
import { SchemaFactory, createArrayInsertionAnchor } from "../../../simple-tree/index.js";
import { brand } from "../../../util/index.js";
import { mintRevisionTag } from "../../utils.js";

import { testCompose, testInvert, testRebase, toDelta } from "./utils.js";

const sf = new SchemaFactory("index-projection-experiment");
class Content extends sf.array("Content", sf.number) {}

/**
 * Applies shallow sequence effects to real insertion anchors, not a proposed persisted index handler.
 * Inserted values are placeholders: only positions matter, and removed content is not restored by identity.
 * Global detached-content changes have no effect on these anchors.
 */
function project(
	initial: readonly number[],
	positions: readonly number[],
	changes: readonly Changeset[],
): { content: number[]; positions: number[] } {
	const content = new Content(initial);
	const anchors = positions.map((position) => createArrayInsertionAnchor(content, position));
	try {
		for (const change of changes) {
			let index = 0;
			for (const mark of toDelta(change).local?.marks ?? []) {
				assert.equal(mark.fields, undefined);
				assert(
					mark.attach === undefined || mark.detach === undefined,
					"This probe only supports separate insert/remove marks",
				);
				if (mark.detach !== undefined) {
					content.removeRange(index, index + mark.count);
				} else if (mark.attach === undefined) {
					index += mark.count;
				} else {
					content.insertAt(index, ...Array.from({ length: mark.count }, () => 99));
					index += mark.count;
				}
			}
		}
		return {
			content: [...content],
			positions: anchors.map((anchor) => anchor.index),
		};
	} finally {
		for (const anchor of anchors) {
			anchor.dispose();
		}
	}
}

// Characterizes the current projection's limits, not the desired semantics of a future index kind.
describe("Array index projection investigation", () => {
	it("matches the sequential insertion/removal formulas at every small-array boundary", () => {
		const revision = mintRevisionTag();
		for (let length = 0; length <= 5; length++) {
			const initial = Array.from({ length }, (_, index) => index);
			const positions = Array.from({ length: length + 1 }, (_, index) => index);
			for (let index = 0; index <= length; index++) {
				for (let count = 0; count <= 3; count++) {
					const insert = editor.insert(
						index,
						count,
						{ revision, localId: brand(0) },
						revision,
					);
					assert.deepEqual(
						project(initial, positions, [insert]).positions,
						positions.map((position) => (position < index ? position : position + count)),
						`insert ${count} at ${index} in length ${length}`,
					);
				}
				for (let count = 0; count <= length - index; count++) {
					const remove = editor.remove(index, count, brand(0), revision);
					assert.deepEqual(
						project(initial, positions, [remove]).positions,
						positions.map(
							(position) => position - Math.min(count, Math.max(0, position - index)),
						),
						`remove ${count} at ${index} in length ${length}`,
					);
				}
			}
		}
	});

	it("shows that sequence rebasing alone does not make scalar endpoint projection converge", () => {
		const removeRevision = mintRevisionTag();
		const insertRevision = mintRevisionTag();
		const remove = editor.remove(1, 2, brand(0), removeRevision);
		const insert = editor.insert(
			2,
			1,
			{ revision: insertRevision, localId: brand(0) },
			insertRevision,
		);
		const taggedRemove = tagChange(remove, removeRevision);
		const taggedInsert = tagChange(insert, insertRevision);
		const insertOverRemove = testRebase(taggedInsert, taggedRemove);
		const removeOverInsert = testRebase(taggedRemove, taggedInsert);
		const initial = [0, 1, 2, 3];
		const left = project(initial, [1, 2], [remove, insertOverRemove]);
		const right = project(initial, [1, 2], [insert, removeOverInsert]);

		assert.deepEqual(left.content, [0, 99, 3]);
		assert.deepEqual(right.content, left.content);
		// [1, 2) collapses on one path but still covers the insertion on the other.
		assert.deepEqual(left.positions, [2, 2]);
		assert.deepEqual(right.positions, [1, 2]);
	});

	for (const isRollback of [false, true]) {
		it(`shows projection loses information across ${isRollback ? "rollback" : "undo"} and composition`, () => {
			const revision = mintRevisionTag();
			const inverseRevision = mintRevisionTag();
			const remove = editor.remove(1, 2, brand(0), revision);
			const taggedRemove = tagChange(remove, revision);
			const inverse = testInvert(taggedRemove, inverseRevision, isRollback);
			const composed = testCompose([taggedRemove, tagChange(inverse, inverseRevision)]);
			const initial = [0, 1, 2, 3];

			assert.deepEqual(toDelta(composed), {});
			assert.deepEqual(project(initial, [1, 2, 3], [remove]).positions, [1, 1, 1]);
			assert.deepEqual(project(initial, [1, 2, 3], [remove, inverse]).positions, [3, 3, 3]);
			assert.deepEqual(project(initial, [1, 2, 3], [composed]).positions, [1, 2, 3]);
		});
	}
});
