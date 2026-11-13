/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

/**
 * Test-only arithmetic model for edits expressed in one common array coordinate system.
 * It retains history instead of attempting to recover positions from collapsed numeric values.
 * Causally authored coordinates, moves, explicit endpoint reassignment, and history compaction are not modeled.
 */
interface Edit {
	readonly kind: "edit";
	readonly id: number;
	readonly index: number;
	readonly remove: number;
	readonly insert: number;
}

/** Reverting a revert provides redo; targets must already exist and form an acyclic history. */
interface Revert {
	readonly kind: "revert";
	readonly id: number;
	readonly target: number;
}

type Event = Edit | Revert;
type History = ReadonlyMap<number, Event>;

/** Composition and rebasing retain the union of identified intentions, including numerically ineffective ones. */
function merge(...histories: readonly History[]): History {
	const result = new Map<number, Event>();
	for (const history of histories) {
		for (const [id, event] of history) {
			const previous = result.get(id);
			assert(previous === undefined || JSON.stringify(previous) === JSON.stringify(event));
			result.set(id, event);
		}
	}
	for (const event of result.values()) {
		if (event.kind === "revert") {
			assert(result.has(event.target), "Revert target must be available");
			assert(event.target < event.id, "Reverts must point to earlier events");
		}
	}
	return result;
}

function activeEdits(history: History): Edit[] {
	const active = new Map<number, boolean>();
	const suppressed = new Set<number>();
	for (const event of [...history.values()].sort((a, b) => b.id - a.id)) {
		const enabled = !suppressed.has(event.id);
		active.set(event.id, enabled);
		if (enabled && event.kind === "revert") {
			suppressed.add(event.target);
		}
	}
	return [...history.values()].filter(
		(event): event is Edit => event.kind === "edit" && active.get(event.id) === true,
	);
}

/**
 * Projects an original boundary through the union of removed original intervals and surviving insertions.
 * Concurrent insertions are not part of original intervals, so those removals do not delete them.
 */
function project(original: number, history: History): number {
	const edits = activeEdits(history);
	const intervals = edits
		.map((edit) => [
			Math.min(original, edit.index),
			Math.min(original, edit.index + edit.remove),
		])
		.sort(([a], [b]) => a - b);
	let end = 0;
	let removed = 0;
	for (const [start, nextEnd] of intervals) {
		removed += Math.max(0, nextEnd - Math.max(start, end));
		end = Math.max(end, nextEnd);
	}
	const inserted = edits.reduce(
		(sum, edit) => sum + (edit.index <= original ? edit.insert : 0),
		0,
	);
	return original - removed + inserted;
}

function singleton(event: Event): History {
	return new Map([[event.id, event]]);
}

/** Rebase requires the common endpoint basis and both histories, not just the current numeric result. */
function rebase(
	original: number,
	change: History,
	over: History,
): { before: number; after: number; history: History } {
	const history = merge(over, change);
	return { before: project(original, over), after: project(original, history), history };
}

describe("Contextual index arithmetic investigation", () => {
	it("requires causal coordinates to be translated rather than treated as original coordinates", () => {
		const insertion = singleton({ kind: "edit", id: 0, index: 1, remove: 0, insert: 2 });
		// This removal intends to delete one newly inserted item, not an original item.
		const untranslatedRemoval = singleton({
			kind: "edit",
			id: 1,
			index: 1,
			remove: 1,
			insert: 0,
		});
		const afterInsert = 1 + 2;
		const afterRemove = afterInsert - 1;
		assert.equal(afterRemove, 2);
		assert.equal(project(1, merge(insertion, untranslatedRemoval)), 3);
	});

	it("resolves the insertion-inside-removal counterexample without losing boundary distinctions", () => {
		const removal = singleton({ kind: "edit", id: 0, index: 1, remove: 2, insert: 0 });
		const insertion = singleton({ kind: "edit", id: 1, index: 2, remove: 0, insert: 1 });
		for (const original of [1, 2, 3]) {
			const left = rebase(original, insertion, removal);
			const right = rebase(original, removal, insertion);
			assert.equal(left.after, right.after);
			assert.equal(left.after, original === 1 ? 1 : 2);
		}
	});

	it("handles every pair of same-context small insertions, removals, and splices", () => {
		for (let length = 0; length <= 5; length++) {
			const edits: Omit<Edit, "id">[] = [];
			for (let index = 0; index <= length; index++) {
				for (let remove = 0; remove <= length - index; remove++) {
					for (let insert = 0; insert <= 2; insert++) {
						edits.push({ kind: "edit", index, remove, insert });
					}
				}
			}
			for (const a of edits) {
				for (const b of edits) {
					const left = singleton({ ...a, id: 0 });
					const right = singleton({ ...b, id: 1 });
					const combined = merge(left, right);
					for (let original = 0; original <= length; original++) {
						assert.equal(
							rebase(original, left, right).after,
							rebase(original, right, left).after,
						);
						// Independent discrete oracle: count surviving original items and inserted items before the boundary.
						let expected = 0;
						for (let cell = 0; cell < original; cell++) {
							if (
								![a, b].some((edit) => edit.index <= cell && cell < edit.index + edit.remove)
							) {
								expected++;
							}
						}
						expected += [a, b].reduce(
							(sum, edit) => sum + (edit.index <= original ? edit.insert : 0),
							0,
						);
						assert.equal(project(original, combined), expected);
						assert(project(original, combined) <= project(length, combined));
					}
				}
			}
		}
	});

	it("preserves overlap and remote insertion effects through selective undo and redo", () => {
		const a = singleton({ kind: "edit", id: 0, index: 1, remove: 3, insert: 0 });
		const b = singleton({ kind: "edit", id: 1, index: 2, remove: 3, insert: 0 });
		const c = singleton({ kind: "edit", id: 2, index: 3, remove: 0, insert: 2 });
		const combined = merge(a, b, c);
		const undone = merge(combined, singleton({ kind: "revert", id: 3, target: 0 }));
		const redone = merge(undone, singleton({ kind: "revert", id: 4, target: 3 }));
		for (let original = 0; original <= 6; original++) {
			assert.equal(project(original, undone), project(original, merge(b, c)));
			assert.equal(project(original, redone), project(original, combined));
		}
	});

	it("restores collapsed offsets and agrees with composed history after reversal", () => {
		const removal = singleton({ kind: "edit", id: 0, index: 1, remove: 2, insert: 0 });
		const inverse = singleton({ kind: "revert", id: 1, target: 0 });
		const restored = merge(removal, inverse);
		for (let original = 0; original <= 4; original++) {
			assert.equal(rebase(original, restored, removal).after, original);
			assert.equal(project(original, restored), original);
		}
	});

	it("is insensitive to delivery order and composition grouping for three concurrent edits", () => {
		const a = singleton({ kind: "edit", id: 0, index: 1, remove: 3, insert: 1 });
		const b = singleton({ kind: "edit", id: 1, index: 2, remove: 0, insert: 2 });
		const c = singleton({ kind: "edit", id: 2, index: 3, remove: 2, insert: 0 });
		for (const order of [
			[a, b, c],
			[a, c, b],
			[b, a, c],
			[b, c, a],
			[c, a, b],
			[c, b, a],
		]) {
			for (let original = 0; original <= 5; original++) {
				const first = rebase(original, order[1], order[0]);
				const second = rebase(original, order[2], first.history);
				assert.equal(second.after, project(original, merge(a, b, c)));
				assert.equal(
					project(original, merge(merge(order[0], order[1]), order[2])),
					second.after,
				);
			}
		}
	});
});
