/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { revisionMetadataSourceFromInfo } from "../../../core/index.js";
import type { NodeId } from "../../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Tests exercise the internal composition queue.
import { compose, ComposeQueue } from "../../../feature-libraries/sequence-field/compose.js";
// eslint-disable-next-line import-x/no-internal-modules -- Tests exercise indexed array navigation.
import { MarkSegmentTree } from "../../../feature-libraries/sequence-field/markSegmentTree.js";
// eslint-disable-next-line import-x/no-internal-modules -- Tests provide a controlled move-effect table.
import type { MoveEffectTable } from "../../../feature-libraries/sequence-field/moveEffectTable.js";
// eslint-disable-next-line import-x/no-internal-modules -- Tests exercise internal cursor boundaries.
import { SegmentMarkQueue } from "../../../feature-libraries/sequence-field/segmentMarkQueue.js";
import type {
	CellMark,
	Mark,
	Remove,
	// eslint-disable-next-line import-x/no-internal-modules -- Test fixtures use internal mark types.
} from "../../../feature-libraries/sequence-field/types.js";
import { brand, idAllocatorFromMaxId } from "../../../util/index.js";
import { mintRevisionTag } from "../../utils.js";

const revision = mintRevisionTag();
const metadata = revisionMetadataSourceFromInfo([{ revision }]);

function noMoveEffects(): MoveEffectTable {
	return {
		get: () => assert.fail("Unexpected move query"),
		set: () => assert.fail("Unexpected move update"),
		onMoveIn: () => assert.fail("Unexpected child notification"),
		moveKey: () => assert.fail("Unexpected move key"),
	};
}

function remove(id: number, count = 1): CellMark<Remove> {
	return { type: "Remove", count, id: brand(id), revision };
}

function insert(id: number, count = 1): Mark {
	return {
		type: "Insert",
		count,
		id: brand(id),
		revision,
		cellId: { revision, localId: brand(id) },
	};
}

function composeWithoutChildren(base: Mark[], next: Mark[]): Mark[] {
	return compose(
		base,
		next,
		() => assert.fail("Unexpected child composition"),
		idAllocatorFromMaxId(),
		noMoveEffects(),
		metadata,
	);
}

describe("Array-indexed ComposeQueue", () => {
	describe("indexed reusable boundaries", () => {
		it("resumes array jumps after individually consuming a partial mark", () => {
			const marks: Mark[] = [insert(100, 3), remove(0, 4), { count: 2 }];
			const queue = new SegmentMarkQueue(MarkSegmentTree.fromMarks(marks), noMoveEffects());
			assert.equal(queue.tryDequeueReusable({ count: 4 }, "input"), undefined);
			assert.deepEqual(queue.dequeueUpTo(2), insert(100, 2));
			assert.equal(queue.tryDequeueReusable(undefined, "output"), undefined);
			assert.deepEqual(queue.dequeueUpTo(1), insert(102));
			assert.deepEqual(queue.tryDequeueReusable({ count: 4 }, "input"), [marks[1]]);
			assert.strictEqual(queue.peek(), marks[2]);
			assert.deepEqual(queue.tryDequeueReusable(undefined, "output"), [marks[2]]);
			assert(queue.isEmpty());
		});

		it("jumps over three of four marks in one call and keeps the fourth available", () => {
			const marks = Array.from({ length: 4 }, (_, index) => remove(index));
			const queue = new SegmentMarkQueue(MarkSegmentTree.fromMarks(marks), noMoveEffects());
			assert.deepEqual(queue.tryDequeueReusable({ count: 3 }, "input"), marks.slice(0, 3));
			assert.strictEqual(queue.peek(), marks[3]);
			assert.strictEqual(queue.dequeueUpTo(1), marks[3]);
			assert(queue.isEmpty());
		});

		for (const context of ["input", "output"] as const) {
			for (const empty of [false, true]) {
				it(`jumps over a ${empty ? "empty" : "full"}-cell span in ${context} context with one query`, () => {
					const marks = Array.from({ length: 2048 }, (_, index) =>
						(context === "input") === empty ? insert(index) : remove(index),
					);
					const tree = MarkSegmentTree.fromMarks(marks);
					const findReusableEnd = tree.findReusableEnd.bind(tree);
					let searches = 0;
					tree.findReusableEnd = (start, opposingNoop, actualContext) => {
						assert.equal(start, 0);
						assert.equal(actualContext, context);
						searches++;
						return findReusableEnd(start, opposingNoop, actualContext);
					};
					const queue = new SegmentMarkQueue(tree, noMoveEffects());
					const spanLength = 1531;
					const noop: Mark = empty
						? { count: spanLength, cellId: { revision, localId: brand(0) } }
						: { count: spanLength };
					assert.deepEqual(
						queue.tryDequeueReusable(noop, context),
						marks.slice(0, spanLength),
					);
					assert.equal(searches, 1);
					assert.strictEqual(queue.peek(), marks[spanLength]);
				});
			}
		}
	});

	for (const side of ["base", "new"] as const) {
		it(`reuses original array entries against a ${side} no-op`, () => {
			const marks = Array.from(
				{ length: 2048 },
				(_, index): Mark =>
					Object.freeze(side === "base" ? remove(index * 2) : insert(index * 2)),
			);
			Object.freeze(marks);
			const noop = [{ count: marks.length }];
			const queue = new ComposeQueue(
				side === "base" ? noop : marks,
				side === "base" ? marks : noop,
				noMoveEffects(),
				metadata,
			);
			const reused = queue.tryPopReusable();
			assert(reused !== undefined);
			assert.equal(reused.length, marks.length);
			assert(queue.isEmpty());
			for (const [index, mark] of reused.entries()) {
				assert.strictEqual(mark, marks[index]);
			}
			const result = composeWithoutChildren(
				side === "base" ? noop : marks,
				side === "base" ? marks : noop,
			);
			assert.deepEqual(result, marks);
			assert.equal(result[1000], marks[1000]);
		});
	}

	it("returns a non-tree-aligned prefix as one array slice", () => {
		const marks = Array.from({ length: 2048 }, (_, index) => remove(index * 2));
		const prefixLength = 1531;
		const queue = new ComposeQueue(
			[{ count: prefixLength }, remove(10000)],
			marks,
			noMoveEffects(),
			metadata,
		);
		assert.deepEqual(queue.tryPopReusable(), marks.slice(0, prefixLength));
		assert.equal(queue.tryPopReusable(), undefined);
		assert.deepEqual(queue.pop().baseMark, remove(10000));
		assert.deepEqual(queue.pop().newMark, marks[prefixLength]);
	});

	it("splits only at a partial no-op boundary and preserves alignment afterward", () => {
		const queue = new ComposeQueue(
			[{ count: 5 }, remove(50)],
			[remove(0, 3), remove(10, 4)],
			noMoveEffects(),
			metadata,
		);
		const reused = queue.tryPopReusable();
		assert.deepEqual(reused === undefined ? undefined : [...reused], [remove(0, 3)]);
		assert.equal(queue.tryPopReusable(), undefined);
		assert.deepEqual(queue.pop(), { baseMark: { count: 2 }, newMark: remove(10, 2) });
		assert.deepEqual(queue.pop().baseMark, remove(50));
		assert.deepEqual(queue.pop(), { baseMark: { count: 2 }, newMark: remove(12, 2) });
		assert(queue.isEmpty());
	});

	it("reuses consecutive empty-cell IDs but stops at an ID gap", () => {
		const queue = new ComposeQueue(
			[{ count: 6, cellId: { revision, localId: brand(0) } }],
			[insert(0), insert(1), insert(4), insert(5)],
			noMoveEffects(),
			metadata,
		);
		const reused = queue.tryPopReusable();
		assert.deepEqual(reused === undefined ? undefined : [...reused], [insert(0), insert(1)]);
		assert.equal(queue.tryPopReusable(), undefined);
		const pair = queue.pop();
		assert.deepEqual(pair.newMark, insert(4));
		assert.equal(pair.baseMark?.cellId?.localId, 4);
	});

	it("does not confuse empty cells from different revisions", () => {
		const otherRevision = mintRevisionTag();
		const queue = new ComposeQueue(
			[{ count: 2, cellId: { revision: otherRevision, localId: brand(0) } }],
			[insert(0), insert(1)],
			noMoveEffects(),
			revisionMetadataSourceFromInfo([{ revision }, { revision: otherRevision }]),
		);
		assert.equal(queue.tryPopReusable(), undefined);
	});

	it("matches a new tombstone against a block's output IDs rather than detach IDs", () => {
		const marks = Array.from(
			{ length: 32 },
			(_, index): CellMark<Remove> => ({
				...remove(index * 2),
				idOverride: { revision, localId: brand(100 + index) },
			}),
		);
		const tombstone: Mark[] = [{ count: 32, cellId: { revision, localId: brand(100) } }];
		const queue = new ComposeQueue(marks, tombstone, noMoveEffects(), metadata);
		const reused = queue.tryPopReusable();
		assert.equal(reused?.length, marks.length);
		assert(queue.isEmpty());
		assert.deepEqual(composeWithoutChildren(marks, tombstone), marks);
	});

	it("stops full-cell reuse before intervening empty cells", () => {
		const queue = new ComposeQueue(
			[{ count: 2 }],
			[remove(0), insert(10), remove(2)],
			noMoveEffects(),
			metadata,
		);
		assert.equal(queue.tryPopReusable()?.length, 1);
		assert.equal(queue.tryPopReusable(), undefined);
		assert.deepEqual(queue.pop().newMark, insert(10));
		assert.equal(queue.tryPopReusable()?.length, 1);
		assert(queue.isEmpty());
	});

	it("normalizes adjacent reused marks and drops trailing offsets", () => {
		assert.deepEqual(
			composeWithoutChildren(
				[{ count: 2 }, { count: 3 }],
				[remove(0), remove(1), { count: 3 }],
			),
			[remove(0, 2)],
		);
		assert.deepEqual(composeWithoutChildren([{ count: 10 }], []), []);
	});

	it("advances zero-count array entries without consuming the opposing no-op", () => {
		for (const base of [true, false]) {
			const marks = [{ count: 0 }, remove(0)];
			const noop = [{ count: 0 }, { count: 1 }];
			const result = composeWithoutChildren(base ? noop : marks, base ? marks : noop);
			assert.deepEqual(result, [remove(0)]);
		}
	});

	it("leaves partial empty-cell boundaries to ordinary splitting", () => {
		const marks = [insert(10, 3), insert(13, 4)];
		const queue = new ComposeQueue(
			[{ count: 5, cellId: { revision, localId: brand(10) } }],
			marks,
			noMoveEffects(),
			metadata,
		);
		assert.deepEqual(queue.tryPopReusable(), [marks[0]]);
		assert.equal(queue.tryPopReusable(), undefined);
		assert.deepEqual(queue.pop(), {
			baseMark: { count: 2, cellId: { revision, localId: brand(13) } } satisfies Mark,
			newMark: insert(13, 2),
		});
		assert.equal(queue.tryPopReusable(), undefined);
		assert.deepEqual(queue.pop().newMark, insert(15, 2));
		assert(queue.isEmpty());
	});

	it("settles redundant edits instead of reusing them", () => {
		assert.deepEqual(
			composeWithoutChildren([{ count: 2 }], [{ type: "Insert", count: 2, id: brand(0) }]),
			[],
		);
	});

	it("preserves child callbacks and notifications between reusable blocks", () => {
		const child: NodeId = { localId: brand(0) };
		const composedChild: NodeId = { localId: brand(1) };
		const calls: (NodeId | undefined)[][] = [];
		const notifications: NodeId[] = [];
		const result = compose(
			[{ count: 3 }],
			[remove(0), { count: 1, changes: child }, remove(2)],
			(base, next) => {
				calls.push([base, next]);
				return composedChild;
			},
			idAllocatorFromMaxId(),
			{ ...noMoveEffects(), onMoveIn: (node) => notifications.push(node) },
			metadata,
		);
		assert.deepEqual(calls, [[undefined, child]]);
		assert.deepEqual(notifications, [child]);
		assert.deepEqual(result, [remove(0), { count: 1, changes: composedChild }, remove(2)]);
	});

	it("does not treat child-only modifications as no-ops", () => {
		const child: NodeId = { localId: brand(0) };
		for (const base of [true, false]) {
			const queue = new ComposeQueue(
				base ? [{ count: 1, changes: child }] : [remove(0)],
				base ? [remove(0)] : [{ count: 1, changes: child }],
				noMoveEffects(),
				metadata,
			);
			assert.equal(queue.tryPopReusable(), undefined);
		}
	});

	it("uses move-effect boundaries when peeking and rechecks pending marks", () => {
		let partition = 2;
		const effects: MoveEffectTable = {
			...noMoveEffects(),
			get: (_target, _revision, _id, count) => ({
				value: undefined,
				length: Math.min(count, partition),
			}),
		};
		const queue = new SegmentMarkQueue(
			MarkSegmentTree.fromMarks([{ type: "MoveOut", count: 5, id: brand(0), revision }]),
			effects,
		);
		assert.equal(queue.tryDequeueReusable(undefined, "output"), undefined);
		assert.equal(queue.peek()?.count, 2);
		assert.equal(queue.dequeueUpTo(5).count, 2);
		partition = 1;
		assert.equal(queue.peek()?.count, 1);
		assert.equal(queue.dequeueUpTo(5).count, 1);
		partition = 5;
		assert.equal(queue.dequeueUpTo(5).count, 2);
		assert(queue.isEmpty());
	});
});
