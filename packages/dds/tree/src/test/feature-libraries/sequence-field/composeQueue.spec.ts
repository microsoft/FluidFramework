/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { offsetChangeAtomId, revisionMetadataSourceFromInfo } from "../../../core/index.js";
import type { NodeId } from "../../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Tests exercise the internal composition queue.
import { compose, ComposeQueue } from "../../../feature-libraries/sequence-field/compose.js";
// eslint-disable-next-line import-x/no-internal-modules -- Tests inspect shared subtrees directly.
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

describe("Segment-backed ComposeQueue", () => {
	describe("indexed no-op boundaries", () => {
		it("locates populated-cell endpoints in input and output contexts without consuming marks", () => {
			const tree = MarkSegmentTree.fromMarks([insert(100, 3), remove(0, 4), { count: 2 }]);
			const queue = new SegmentMarkQueue(tree, noMoveEffects());
			assert.equal(queue.findNoopEnd({ count: 3 }, "input"), 6);
			assert.equal(queue.findNoopEnd({ count: 4 }, "output"), 8);
			assert.deepEqual(queue.peek(), insert(100, 3));

			// Consuming only part of an insertion advances output, but not input, indexes.
			queue.dequeueUpTo(2);
			assert.equal(queue.findNoopEnd({ count: 3 }, "input"), 6);
			assert.equal(queue.findNoopEnd({ count: 2 }, "output"), 8);
			queue.dequeueUpTo(1);
			queue.dequeueUpTo(1);
			assert.equal(queue.findNoopEnd({ count: 2 }, "input"), 6);
			assert.equal(queue.findNoopEnd({ count: 1 }, "output"), 8);
		});

		it("uses the last covered cell, excluding trailing zero-length marks", () => {
			const queue = new SegmentMarkQueue(
				MarkSegmentTree.fromMarks([remove(0, 3), insert(10, 2)]),
				noMoveEffects(),
			);
			assert.equal(queue.findNoopEnd({ count: 3 }, "input"), 3);
			assert.equal(queue.findNoopEnd({ count: 2 }, "output"), 5);
			assert.equal(queue.findNoopEnd({ count: 4 }, "input"), undefined);
			assert.equal(queue.findNoopEnd({ count: 3 }, "output"), undefined);
		});

		it("locates empty-cell endpoints inside marks and distinguishes output from detach IDs", () => {
			const removed: CellMark<Remove> = {
				...remove(0, 4),
				idOverride: { revision, localId: brand(200) },
			};
			const queue = new SegmentMarkQueue(
				MarkSegmentTree.fromMarks([insert(100, 3), removed]),
				noMoveEffects(),
			);
			assert.equal(
				queue.findNoopEnd({ count: 2, cellId: { revision, localId: brand(100) } }, "input"),
				2,
			);
			assert.equal(
				queue.findNoopEnd({ count: 3, cellId: { revision, localId: brand(200) } }, "output"),
				6,
			);
			assert.equal(
				queue.findNoopEnd({ count: 3, cellId: { revision, localId: brand(0) } }, "output"),
				undefined,
			);
		});

		it("handles absent, foreign-revision, anonymous, and already-consumed IDs", () => {
			const queue = new SegmentMarkQueue(
				MarkSegmentTree.fromMarks([
					{ count: 2, cellId: { localId: brand(0) } },
					insert(10, 2),
				]),
				noMoveEffects(),
			);
			const noop: Mark = { count: 2, cellId: { localId: brand(0) } };
			assert.equal(queue.findNoopEnd(noop, "input"), 2);
			assert.equal(
				queue.findNoopEnd(
					{ count: 2, cellId: { revision: mintRevisionTag(), localId: brand(10) } },
					"input",
				),
				undefined,
			);
			assert.equal(
				queue.findNoopEnd({ count: 3, cellId: { revision, localId: brand(10) } }, "input"),
				undefined,
			);
			assert.equal(queue.findNoopEnd(noop, "input"), 2);
			queue.dequeueUpTo(2);
			assert.equal(queue.findNoopEnd(noop, "input"), undefined);
			assert.equal(
				queue.findNoopEnd({ count: 1, cellId: { revision, localId: brand(11) } }, "input"),
				4,
			);
		});

		it("returns no populated endpoint for an empty tree or an empty-cell-only context", () => {
			for (const marks of [[], [insert(0, 2)]]) {
				const queue = new SegmentMarkQueue(MarkSegmentTree.fromMarks(marks), noMoveEffects());
				assert.equal(queue.findNoopEnd({ count: 1 }, "input"), undefined);
				assert.equal(queue.findNoopEnd({ count: 0 }, "input"), 0);
			}
		});

		it("rejects local edits and child-only edits as no-op boundary queries", () => {
			const queue = new SegmentMarkQueue(
				MarkSegmentTree.fromMarks([remove(0)]),
				noMoveEffects(),
			);
			assert.throws(() => queue.findNoopEnd(remove(0), "input"));
			assert.throws(() =>
				queue.findNoopEnd({ count: 1, changes: { localId: brand(0) } }, "input"),
			);
		});

		for (const context of ["input", "output"] as const) {
			for (const empty of [false, true]) {
				it(`locates a ${empty ? "empty" : "full"}-cell span across subtrees in ${context} context`, () => {
					const marks = Array.from({ length: 2048 }, (_, index) =>
						(context === "input") === empty ? insert(index) : remove(index),
					);
					const tree = MarkSegmentTree.fromMarks(marks);
					const findByIndex = tree.findByIndex.bind(tree);
					const findById = tree.findById.bind(tree);
					let searches = 0;
					tree.findByIndex = (index, actualContext) => {
						assert(!empty);
						assert.equal(actualContext, context);
						searches++;
						return findByIndex(index, actualContext);
					};
					tree.findById = (id, actualContext) => {
						assert(empty);
						assert.equal(actualContext, context);
						searches++;
						return findById(id, actualContext);
					};
					const queue = new SegmentMarkQueue(tree, noMoveEffects());
					const spanLength = 1531;
					let consumed = 0;
					while (consumed < spanLength) {
						const noop: Mark = empty
							? {
									count: spanLength - consumed,
									cellId: offsetChangeAtomId({ revision, localId: brand(0) }, consumed),
								}
							: { count: spanLength - consumed };
						const reused = queue.tryDequeueReusable(noop, context);
						assert(reused !== undefined);
						consumed += reused.count;
					}
					assert.equal(consumed, spanLength);
					assert(searches > 0 && searches <= 12, `Performed ${searches} tree searches`);
					assert.deepEqual(queue.peek(), marks[spanLength]);
					const next: Mark = empty
						? { count: 1, cellId: { revision, localId: brand(spanLength) } }
						: { count: 1 };
					assert.equal(queue.findNoopEnd(next, context), spanLength + 1);
				});
			}
		}

		it("does not treat finding an empty endpoint as proof of contiguous alignment", () => {
			const noop: Mark = { count: 6, cellId: { revision, localId: brand(0) } };
			const queue = new SegmentMarkQueue(
				MarkSegmentTree.fromMarks([insert(0), insert(1), insert(4), insert(5)]),
				noMoveEffects(),
			);
			assert.equal(queue.findNoopEnd(noop, "input"), 4);
			assert.equal(queue.tryDequeueReusable(noop, "input")?.count, 2);
			assert.equal(
				queue.tryDequeueReusable(
					{ count: 4, cellId: { revision, localId: brand(2) } },
					"input",
				),
				undefined,
			);
		});
	});

	for (const side of ["base", "new"] as const) {
		it(`reuses a large block against a ${side} no-op without scanning the block`, () => {
			let reads = 0;
			const marks = Array.from({ length: 2048 }, (_, index): Mark => {
				const mark = side === "base" ? remove(index * 2) : insert(index * 2);
				Object.defineProperty(mark, "count", {
					get: () => {
						reads++;
						return 1;
					},
					enumerable: true,
				});
				return Object.freeze(mark);
			});
			const noop = [{ count: marks.length }];
			const queue = new ComposeQueue(
				side === "base" ? noop : marks,
				side === "base" ? marks : noop,
				noMoveEffects(),
				metadata,
			);
			reads = 0;
			const reused = queue.tryPopReusable();
			assert(reused !== undefined);
			assert.equal(reused.markCount, marks.length);
			assert(reads < 16, `Bulk dequeue read ${reads} leaf counts`);
			assert(queue.isEmpty());
			assert.deepEqual([...reused], marks);
			const result = composeWithoutChildren(
				side === "base" ? noop : marks,
				side === "base" ? marks : noop,
			);
			assert.deepEqual(result, marks);
			assert.equal(result[1000], marks[1000]);
		});
	}

	it("finds a non-tree-aligned prefix using logarithmically many shared segments", () => {
		const marks = Array.from({ length: 2048 }, (_, index) => remove(index * 2));
		const prefixLength = 1531;
		const queue = new ComposeQueue(
			[{ count: prefixLength }, remove(10000)],
			marks,
			noMoveEffects(),
			metadata,
		);
		const segments: MarkSegmentTree[] = [];
		let consumed = 0;
		while (consumed < prefixLength) {
			const segment = queue.tryPopReusable();
			assert(segment !== undefined);
			segments.push(segment);
			consumed += segment.count;
		}
		assert.equal(consumed, prefixLength);
		assert(segments.length <= 12, `Reused ${segments.length} segments`);
		assert.deepEqual(
			segments.flatMap((segment) => [...segment]),
			marks.slice(0, prefixLength),
		);
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
		assert.equal(reused?.markCount, marks.length);
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
		assert.equal(queue.tryPopReusable()?.markCount, 1);
		assert.equal(queue.tryPopReusable(), undefined);
		assert.deepEqual(queue.pop().newMark, insert(10));
		assert.equal(queue.tryPopReusable()?.markCount, 1);
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
