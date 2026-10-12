/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { makeRandom } from "@fluid-private/stochastic-test-utils";

import type { DeltaMark, DeltaRoot, FieldKey } from "../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { PositionHistory } from "../../shared-tree/positionHistory.js";
import {
	PositionMap,
	type FieldPosition,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../shared-tree/positionMap.js";
import { brand } from "../../util/index.js";

const left: FieldKey = brand("left");
const right: FieldKey = brand("right");
const field = { parent: [], field: left };

function delta(marks: readonly DeltaMark[]): PositionMap {
	return PositionMap.fromDelta({ fields: new Map([[left, { marks }]]) });
}

function insert(index: number, count: number): PositionMap {
	return delta([...(index === 0 ? [] : [{ count: index }]), { count, attach: { minor: 0 } }]);
}

function remove(index: number, count: number): PositionMap {
	return delta([...(index === 0 ? [] : [{ count: index }]), { count, detach: { minor: 0 } }]);
}

function resolve(
	map: PositionMap,
	index: number,
	affinity: "before" | "after" = "after",
): number | undefined {
	return map.resolve({ field, index }, affinity)?.index;
}

describe("PositionMap", () => {
	it("maps insertion boundaries and both affinities", () => {
		const map = insert(2, 3);
		assert.deepEqual(
			[0, 1, 2, 3, 4].map((i) => resolve(map, i, "before")),
			[0, 1, 2, 6, 7],
		);
		assert.deepEqual(
			[0, 1, 2, 3, 4].map((i) => resolve(map, i, "after")),
			[0, 1, 5, 6, 7],
		);
		assert.equal(resolve(insert(0, 2), 0, "before"), 0);
		assert.equal(resolve(insert(0, 2), 0, "after"), 2);
	});

	it("collapses deletions, including deletion of the whole sequence", () => {
		for (const affinity of ["before", "after"] as const) {
			assert.deepEqual(
				[0, 1, 2, 3, 4, 5].map((i) => resolve(remove(1, 3), i, affinity)),
				[0, 1, 1, 1, 1, 2],
			);
			assert.deepEqual(
				[0, 1, 2, 3].map((i) => resolve(remove(0, 3), i, affinity)),
				[0, 0, 0, 0],
			);
		}
	});

	it("follows cross-field moves and chooses a side at their boundaries", () => {
		const move: DeltaRoot = {
			fields: new Map([
				[left, { marks: [{ count: 1 }, { count: 3, detach: { minor: 0 } }] }],
				[right, { marks: [{ count: 2 }, { count: 3, attach: { minor: 0 } }] }],
			]),
		};
		const map = PositionMap.fromDelta(move);
		const position = (
			index: number,
			affinity: "before" | "after",
		): FieldPosition | undefined => map.resolve({ field, index }, affinity);
		assert.deepEqual(position(2, "after"), { field: { parent: [], field: right }, index: 3 });
		assert.deepEqual(position(1, "before"), { field, index: 1 });
		assert.deepEqual(position(1, "after"), { field: { parent: [], field: right }, index: 2 });
		assert.deepEqual(position(4, "before"), { field: { parent: [], field: right }, index: 5 });
		assert.deepEqual(position(4, "after"), { field, index: 1 });
	});

	it("composes movement of a containing node with edits to its array", () => {
		const child: FieldKey = brand("child");
		const original = { parent: [{ field: left, index: 2 }], field: child };
		const shifted = { parent: [{ field: left, index: 3 }], field: child };
		const first = insert(0, 1);
		const second = PositionMap.fromDelta({
			fields: new Map([
				[
					left,
					{
						marks: [
							{ count: 3 },
							{
								count: 1,
								fields: new Map([[child, { marks: [{ count: 2, attach: { minor: 3 } }] }]]),
							},
						],
					},
				],
			]),
		});
		const combined = PositionMap.compose(first, second);
		assert.deepEqual(combined.sourceField(shifted), original);
		assert.equal(combined.lengthDelta(original), 2);
		assert.deepEqual(combined.resolve({ field: original, index: 1 }, "after"), {
			field: shifted,
			index: 3,
		});
	});

	it("applies detached-root renames simultaneously before matching move endpoints", () => {
		const map = PositionMap.fromDelta({
			fields: new Map([
				[
					left,
					{
						marks: [
							{ count: 1, detach: { minor: 0 } },
							{ count: 1, detach: { minor: 1 } },
						],
					},
				],
				[
					right,
					{
						marks: [
							{ count: 1, attach: { minor: 1 } },
							{ count: 1, attach: { minor: 2 } },
						],
					},
				],
			]),
			rename: [
				{ oldId: { minor: 0 }, newId: { minor: 1 }, count: 1 },
				{ oldId: { minor: 1 }, newId: { minor: 2 }, count: 1 },
			],
		});
		assert.deepEqual(map.resolve({ field, index: 0 }, "after"), {
			field: { parent: [], field: right },
			index: 0,
		});
		assert.deepEqual(map.resolve({ field, index: 1 }, "after"), {
			field: { parent: [], field: right },
			index: 1,
		});
	});

	it("composition agrees with sequential mapping for randomized edits and every gap", () => {
		const generator = makeRandom(12345);
		const random = (max: number): number => generator.integer(0, max - 1);
		for (let run = 0; run < 30; run++) {
			const maps: PositionMap[] = [];
			let length = 20;
			for (let edit = 0; edit < 60; edit++) {
				const index = random(length + 1);
				const count = random(4) + 1;
				if (index < length && random(2) === 0) {
					const removed = Math.min(length - index, count);
					maps.push(remove(index, removed));
					length -= removed;
				} else {
					maps.push(insert(index, count));
					length += count;
				}
			}
			let combined = PositionMap.identity;
			for (const map of maps) {
				combined = PositionMap.compose(combined, map);
			}
			for (const affinity of ["before", "after"] as const) {
				for (let index = 0; index <= 20; index++) {
					let expected = index;
					for (const map of maps) {
						const result = resolve(map, expected, affinity);
						assert(result !== undefined);
						expected = result;
					}
					assert.equal(
						resolve(combined, index, affinity),
						expected,
						`run ${run}, index ${index}, ${affinity}`,
					);
				}
			}
			assert.equal(combined.lengthDelta(field), length - 20);
		}
	});

	it("composes randomized cross-field moves without losing their destinations", () => {
		const random = makeRandom(789);
		for (let run = 0; run < 20; run++) {
			const lengths = [20, 20];
			const maps: PositionMap[] = [];
			let combined = PositionMap.identity;
			for (let edit = 0; edit < 50; edit++) {
				const source = lengths[0] === 0 ? 1 : lengths[1] === 0 ? 0 : random.integer(0, 1);
				const destination = 1 - source;
				const start = random.integer(0, lengths[source] - 1);
				const count = random.integer(1, lengths[source] - start);
				const target = random.integer(0, lengths[destination]);
				const keys = [left, right];
				const map = PositionMap.fromDelta({
					fields: new Map([
						[
							keys[source],
							{
								marks: [
									...(start === 0 ? [] : [{ count: start }]),
									{ count, detach: { minor: 0 } },
								],
							},
						],
						[
							keys[destination],
							{
								marks: [
									...(target === 0 ? [] : [{ count: target }]),
									{ count, attach: { minor: 0 } },
								],
							},
						],
					]),
				});
				maps.push(map);
				combined = PositionMap.compose(combined, map);
				lengths[source] -= count;
				lengths[destination] += count;
			}
			for (const affinity of ["before", "after"] as const) {
				for (const fieldKey of [left, right]) {
					for (let index = 0; index <= 20; index++) {
						const initial = { field: { parent: [], field: fieldKey }, index };
						let expected: FieldPosition | undefined = initial;
						for (const map of maps) {
							assert(expected !== undefined);
							expected = map.resolve(expected, affinity);
						}
						assert.deepEqual(combined.resolve(initial, affinity), expected);
					}
				}
			}
		}
	});
});

describe("PositionHistory", () => {
	it("queries logarithmically many blocks instead of replaying commits", () => {
		const history = new PositionHistory();
		for (let i = 0; i < 4096; i++) {
			history.append(insert(0, 1));
		}
		for (const start of [0, 1, 17, 2047, 4095, 4096]) {
			const maps = history.maps(start);
			assert(maps.length <= 24, `Too many blocks: ${maps.length}`);
			let index = 0;
			for (const map of maps) {
				index = resolve(map, index) ?? -1;
			}
			assert.equal(index, 4096 - start);
		}
	});

	it("preserves maps across prefix trimming and suffix replacement", () => {
		const history = new PositionHistory();
		for (let i = 0; i < 31; i++) {
			history.append(insert(0, 1));
		}
		history.trim(7);
		history.truncate(19);
		history.append(remove(0, 2));
		assert.equal(history.start, 7);
		assert.equal(history.end, 20);
		let index = 0;
		for (const map of history.maps(7)) {
			index = resolve(map, index) ?? -1;
		}
		assert.equal(index, 10);
		assert.throws(() => history.maps(6));
		history.trim(20);
		assert.deepEqual(history.maps(20), []);
	});
});
