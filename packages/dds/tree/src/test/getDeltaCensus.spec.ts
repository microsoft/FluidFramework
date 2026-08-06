/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	rootFieldKey,
	type DeltaFieldMap,
	type DeltaRoot,
	type FieldKey,
} from "../core/index.js";
import {
	allTreeLocations,
	nodeFlowCensusFromDelta,
	TreeLocation,
	type NodeFlowCensus,
} from "./getDeltaCensus.js";
import { brand } from "../util/index.js";
import { chunkFromJsonTrees } from "./utils.js";

const id0 = { minor: 0 };
const id1 = { minor: 1 };
const id10 = { minor: 10 };
const id100 = { minor: 100 };

type PartialCensus = Partial<Record<TreeLocation, Partial<Record<TreeLocation, number>>>>;

function assertPartial(
	actual: NodeFlowCensus,
	expected: PartialCensus,
	implicitValue: number = 0,
): void {
	for (const from of allTreeLocations) {
		for (const to of allTreeLocations) {
			const actualCount = actual[from][to];
			const expectedCount = expected[from]?.[to] ?? implicitValue;
			assert.equal(
				actualCount,
				expectedCount,
				`Expected ${expectedCount} nodes to flow from ${from} to ${to}, but got ${actualCount}`,
			);
		}
	}
}

const fooKey: FieldKey = brand("foo");
const barKey: FieldKey = brand("bar");
const oneTree = chunkFromJsonTrees(["X"]);
const tenTrees = chunkFromJsonTrees(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);

const attachNodes1Through10: DeltaFieldMap = new Map([
	[fooKey, { marks: [{ count: 9, attach: id1 }] }],
	[
		barKey,
		{
			marks: [
				{
					count: 1,
					fields: new Map([[fooKey, { marks: [{ count: 1, attach: id10 }] }]]),
				},
			],
		},
	],
]);

const attachNodes0Through10: DeltaFieldMap = new Map([
	[fooKey, { marks: [{ count: 10, attach: id0 }] }],
	[
		barKey,
		{
			marks: [
				{
					count: 1,
					fields: new Map([[fooKey, { marks: [{ count: 1, attach: id10 }] }]]),
				},
			],
		},
	],
]);

const detachNodes1Through10: DeltaFieldMap = new Map([
	[fooKey, { marks: [{ count: 9, detach: id1 }] }],
	[
		barKey,
		{
			marks: [
				{
					count: 1,
					fields: new Map([[fooKey, { marks: [{ count: 1, detach: id10 }] }]]),
				},
			],
		},
	],
]);

const detachNodes0Through10: DeltaFieldMap = new Map([
	[fooKey, { marks: [{ count: 10, detach: id0 }] }],
	[
		barKey,
		{
			marks: [
				{
					count: 1,
					fields: new Map([[fooKey, { marks: [{ count: 1, detach: id10 }] }]]),
				},
			],
		},
	],
]);

describe("getDeltaCensus", () => {
	describe(`counts nodes that go from ${TreeLocation.DetachedPriorRoot}`, () => {
		it(`to ${TreeLocation.DetachedPriorRoot}`, () => {
			const delta: DeltaRoot = {
				rename: [
					{ oldId: id1, newId: id10, count: 1 },
					{ oldId: id10, newId: id1, count: 2 },
				],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.DetachedPriorRoot]: 3,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachedTree}`, () => {
			const delta: DeltaRoot = {
				fields: new Map([
					[
						rootFieldKey,
						{ marks: [{ count: 1, attach: id0, fields: attachNodes1Through10 }] },
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.UnderAttachedTree]: 11,
				},
			});
		});

		it(`to ${TreeLocation.UnderDetachingTree}`, () => {
			const delta: DeltaRoot = {
				fields: new Map([
					[
						rootFieldKey,
						{ marks: [{ count: 1, detach: id0, fields: attachNodes1Through10 }] },
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.DetachedPriorRoot]: 1,
				},
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.UnderDetachingTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderDetachedPriorTree}`, () => {
			const delta: DeltaRoot = {
				global: [{ id: id0, fields: attachNodes1Through10 }],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.DetachedPriorRoot]: 1,
					[TreeLocation.UnderDetachedPriorTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderTransientTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id0, trees: oneTree }],
				global: [{ id: id0, fields: attachNodes1Through10 }],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.DetachedBuiltRoot]: 1,
				},
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.UnderTransientTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachingPriorTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id0, trees: oneTree }],
				global: [{ id: id0, fields: attachNodes1Through10 }],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id0 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
					[TreeLocation.UnderAttachingPriorTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachingBuiltTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id0, trees: oneTree }],
				global: [{ id: id0, fields: attachNodes1Through10 }],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id0 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
					[TreeLocation.UnderAttachingBuiltTree]: 10,
				},
			});
		});
	});

	describe(`counts nodes that go from ${TreeLocation.DetachedBuiltRoot}`, () => {
		it(`to ${TreeLocation.DetachedBuiltRoot}`, () => {
			const delta: DeltaRoot = {
				build: [
					{ id: id0, trees: oneTree },
					{ id: id1, trees: tenTrees },
				],
				rename: [{ oldId: id1, newId: id10, count: 5 }],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.DetachedBuiltRoot]: 11,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachedTree}`, () => {
			const delta: DeltaRoot = {
				build: [
					{ id: id0, trees: oneTree },
					{ id: id1, trees: tenTrees },
				],
				fields: new Map([
					[
						rootFieldKey,
						{ marks: [{ count: 1, attach: id0, fields: attachNodes1Through10 }] },
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.UnderAttachedTree]: 11,
				},
			});
		});

		it(`to ${TreeLocation.UnderDetachingTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id1, trees: tenTrees }],
				fields: new Map([
					[
						rootFieldKey,
						{ marks: [{ count: 1, detach: id0, fields: attachNodes1Through10 }] },
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.DetachedPriorRoot]: 1,
				},
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.UnderDetachingTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderDetachedPriorTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id1, trees: tenTrees }],
				global: [{ id: id0, fields: attachNodes1Through10 }],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.DetachedPriorRoot]: 1,
				},
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.UnderDetachedPriorTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderTransientTree}`, () => {
			const delta: DeltaRoot = {
				build: [
					{ id: id0, trees: oneTree },
					{ id: id1, trees: tenTrees },
				],
				global: [{ id: id0, fields: attachNodes1Through10 }],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.DetachedBuiltRoot]: 1,
					[TreeLocation.UnderTransientTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachingPriorTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id1, trees: tenTrees }],
				global: [{ id: id0, fields: attachNodes1Through10 }],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id0 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.UnderAttachingPriorTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachingBuiltTree}`, () => {
			const delta: DeltaRoot = {
				build: [
					{ id: id0, trees: oneTree },
					{ id: id1, trees: tenTrees },
				],
				global: [{ id: id0, fields: attachNodes1Through10 }],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id0 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
					[TreeLocation.UnderAttachingBuiltTree]: 10,
				},
			});
		});
	});

	describe(`counts nodes that go from ${TreeLocation.UnderAttachedTree}`, () => {
		it(`to ${TreeLocation.DetachedPriorRoot}`, () => {
			const delta: DeltaRoot = {
				global: [
					{
						id: id100,
						fields: new Map([
							[fooKey, { marks: [{ count: 1, attach: id0 }] }],
							[barKey, { marks: [{ count: 1, fields: attachNodes1Through10 }] }],
						]),
					},
				],
				fields: new Map([
					[
						rootFieldKey,
						{ marks: [{ count: 1, detach: id0, fields: detachNodes1Through10 }] },
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.DetachedPriorRoot]: 11,
				},
			});
		});

		it(`to ${TreeLocation.DetachedBuiltRoot}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [
					{
						id: id100,
						fields: new Map([
							[fooKey, { marks: [{ count: 1, attach: id0 }] }],
							[barKey, { marks: [{ count: 1, fields: attachNodes1Through10 }] }],
						]),
					},
				],
				fields: new Map([
					[
						rootFieldKey,
						{ marks: [{ count: 1, detach: id0, fields: detachNodes1Through10 }] },
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.DetachedBuiltRoot]: 11,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachedTree}`, () => {
			const delta: DeltaRoot = {
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id0 },
								{ count: 1, detach: id0 },
								{ count: 1, fields: attachNodes1Through10 },
								{ count: 1, fields: detachNodes1Through10 },
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.UnderAttachedTree]: 11,
				},
			});
		});

		it(`to ${TreeLocation.UnderDetachingTree}`, () => {
			const delta: DeltaRoot = {
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{
									count: 1,
									detach: id100,
									fields: attachNodes0Through10,
								},
								{
									count: 1,
									detach: id0,
									fields: detachNodes1Through10,
								},
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.DetachedPriorRoot]: 1,
					[TreeLocation.UnderDetachingTree]: 11,
				},
			});
		});

		it(`to ${TreeLocation.UnderDetachedPriorTree}`, () => {
			const delta: DeltaRoot = {
				global: [{ id: id100, fields: attachNodes0Through10 }],
				fields: new Map([
					[
						rootFieldKey,
						{ marks: [{ count: 1, detach: id0, fields: detachNodes1Through10 }] },
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.DetachedPriorRoot]: 1,
				},
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.UnderDetachedPriorTree]: 11,
				},
			});
		});

		it(`to ${TreeLocation.UnderTransientTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [{ id: id100, fields: attachNodes0Through10 }],
				fields: new Map([
					[
						rootFieldKey,
						{ marks: [{ count: 1, detach: id0, fields: detachNodes1Through10 }] },
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.DetachedBuiltRoot]: 1,
				},
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.UnderTransientTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachingPriorTree}`, () => {
			const delta: DeltaRoot = {
				global: [{ id: id100, fields: attachNodes0Through10 }],
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id100 },
								{ count: 1, detach: id0, fields: detachNodes1Through10 },
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.UnderAttachingPriorTree]: 11,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachingBuiltTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [{ id: id100, fields: attachNodes0Through10 }],
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id100 },
								{ count: 1, detach: id0, fields: detachNodes1Through10 },
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.UnderAttachingBuiltTree]: 11,
				},
			});
		});
	});

	describe(`counts nodes that go from ${TreeLocation.UnderDetachingTree}`, () => {
		it(`to ${TreeLocation.DetachedPriorRoot}`, () => {
			const delta: DeltaRoot = {
				global: [
					{
						id: id100,
						fields: attachNodes1Through10,
					},
				],
				fields: new Map([
					[
						rootFieldKey,
						{ marks: [{ count: 1, detach: id0, fields: detachNodes1Through10 }] },
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.DetachedPriorRoot]: 1,
				},
				[TreeLocation.UnderDetachingTree]: {
					[TreeLocation.DetachedPriorRoot]: 10,
				},
			});
		});

		it(`to ${TreeLocation.DetachedBuiltRoot}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [
					{
						id: id100,
						fields: attachNodes1Through10,
					},
				],
				fields: new Map([
					[
						rootFieldKey,
						{ marks: [{ count: 1, detach: id0, fields: detachNodes1Through10 }] },
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.DetachedPriorRoot]: 1,
				},
				[TreeLocation.UnderDetachingTree]: {
					[TreeLocation.DetachedBuiltRoot]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachedTree}`, () => {
			const delta: DeltaRoot = {
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id0 },
								{ count: 1, fields: attachNodes1Through10 },
								{ count: 1, detach: id100, fields: detachNodes0Through10 },
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.DetachedPriorRoot]: 1,
				},
				[TreeLocation.UnderDetachingTree]: {
					[TreeLocation.UnderAttachedTree]: 11,
				},
			});
		});

		it(`to ${TreeLocation.UnderDetachingTree}`, () => {
			const delta: DeltaRoot = {
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{
									count: 1,
									detach: id100,
									fields: attachNodes1Through10,
								},
								{
									count: 1,
									detach: id0,
									fields: detachNodes1Through10,
								},
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.DetachedPriorRoot]: 2,
				},
				[TreeLocation.UnderDetachingTree]: {
					[TreeLocation.UnderDetachingTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderDetachedPriorTree}`, () => {
			const delta: DeltaRoot = {
				global: [{ id: id100, fields: attachNodes0Through10 }],
				fields: new Map([
					[
						rootFieldKey,
						{ marks: [{ count: 1, detach: id0, fields: detachNodes1Through10 }] },
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.DetachedPriorRoot]: 1,
				},
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.DetachedPriorRoot]: 1,
					[TreeLocation.UnderDetachedPriorTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderTransientTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [{ id: id100, fields: attachNodes1Through10 }],
				fields: new Map([
					[
						rootFieldKey,
						{ marks: [{ count: 1, detach: id0, fields: detachNodes1Through10 }] },
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.DetachedBuiltRoot]: 1,
				},
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.DetachedPriorRoot]: 1,
					[TreeLocation.UnderTransientTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachingPriorTree}`, () => {
			const delta: DeltaRoot = {
				global: [{ id: id100, fields: attachNodes0Through10 }],
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id100 },
								{ count: 1, detach: id0, fields: detachNodes1Through10 },
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.DetachedPriorRoot]: 1,
				},
				[TreeLocation.UnderDetachingTree]: {
					[TreeLocation.UnderAttachingPriorTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachingBuiltTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [{ id: id100, fields: attachNodes1Through10 }],
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id100 },
								{ count: 1, detach: id0, fields: detachNodes1Through10 },
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.DetachedPriorRoot]: 1,
				},
				[TreeLocation.UnderDetachingTree]: {
					[TreeLocation.UnderAttachingBuiltTree]: 10,
				},
			});
		});
	});

	describe(`counts nodes that go from ${TreeLocation.UnderTransientTree}`, () => {
		it(`to ${TreeLocation.DetachedBuiltRoot}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [
					{
						id: id100,
						fields: detachNodes1Through10,
					},
				],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.DetachedBuiltRoot]: 1,
				},
				[TreeLocation.UnderTransientTree]: {
					[TreeLocation.DetachedBuiltRoot]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachedTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [
					{
						id: id100,
						fields: detachNodes0Through10,
					},
				],
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id0 },
								{ count: 1, fields: attachNodes1Through10 },
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.DetachedBuiltRoot]: 1,
				},
				[TreeLocation.UnderTransientTree]: {
					[TreeLocation.UnderAttachedTree]: 11,
				},
			});
		});

		it(`to ${TreeLocation.UnderDetachingTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [
					{
						id: id100,
						fields: detachNodes1Through10,
					},
				],
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{
									count: 1,
									detach: id0,
									fields: attachNodes1Through10,
								},
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.DetachedBuiltRoot]: 1,
				},
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.DetachedPriorRoot]: 1,
				},
				[TreeLocation.UnderTransientTree]: {
					[TreeLocation.UnderDetachingTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderDetachedPriorTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [
					{
						id: id0,
						fields: attachNodes1Through10,
					},
					{
						id: id100,
						fields: detachNodes1Through10,
					},
				],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.DetachedBuiltRoot]: 1,
				},
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.DetachedPriorRoot]: 1,
				},
				[TreeLocation.UnderTransientTree]: {
					[TreeLocation.UnderDetachedPriorTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderTransientTree}`, () => {
			const delta: DeltaRoot = {
				build: [
					{ id: id0, trees: oneTree },
					{ id: id100, trees: oneTree },
				],
				global: [
					{ id: id0, fields: attachNodes1Through10 },
					{ id: id100, fields: detachNodes1Through10 },
				],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.DetachedBuiltRoot]: 2,
				},
				[TreeLocation.UnderTransientTree]: {
					[TreeLocation.UnderTransientTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachingPriorTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [
					{ id: id0, fields: attachNodes1Through10 },
					{ id: id100, fields: detachNodes1Through10 },
				],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id0 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.DetachedBuiltRoot]: 1,
				},
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.UnderTransientTree]: {
					[TreeLocation.UnderAttachingPriorTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachingBuiltTree}`, () => {
			const delta: DeltaRoot = {
				build: [
					{ id: id0, trees: oneTree },
					{ id: id100, trees: oneTree },
				],
				global: [
					{ id: id0, fields: attachNodes1Through10 },
					{ id: id100, fields: detachNodes1Through10 },
				],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id0 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.DetachedBuiltRoot]: 1,
				},
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.UnderTransientTree]: {
					[TreeLocation.UnderAttachingBuiltTree]: 10,
				},
			});
		});
	});

	describe(`counts nodes that go from ${TreeLocation.UnderDetachedPriorTree}`, () => {
		it(`to ${TreeLocation.DetachedPriorRoot}`, () => {
			const delta: DeltaRoot = {
				global: [
					{
						id: id100,
						fields: detachNodes1Through10,
					},
				],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.DetachedPriorRoot]: 1,
				},
				[TreeLocation.UnderDetachedPriorTree]: {
					[TreeLocation.DetachedPriorRoot]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachedTree}`, () => {
			const delta: DeltaRoot = {
				global: [
					{
						id: id100,
						fields: detachNodes0Through10,
					},
				],
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id0 },
								{ count: 1, fields: attachNodes1Through10 },
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.DetachedPriorRoot]: 1,
				},
				[TreeLocation.UnderDetachedPriorTree]: {
					[TreeLocation.UnderAttachedTree]: 11,
				},
			});
		});

		it(`to ${TreeLocation.UnderDetachingTree}`, () => {
			const delta: DeltaRoot = {
				global: [
					{
						id: id100,
						fields: detachNodes1Through10,
					},
				],
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{
									count: 1,
									detach: id0,
									fields: attachNodes1Through10,
								},
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.DetachedPriorRoot]: 1,
				},
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.DetachedPriorRoot]: 1,
				},
				[TreeLocation.UnderDetachedPriorTree]: {
					[TreeLocation.UnderDetachingTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderDetachedPriorTree}`, () => {
			const delta: DeltaRoot = {
				global: [
					{
						id: id0,
						fields: attachNodes1Through10,
					},
					{
						id: id100,
						fields: detachNodes1Through10,
					},
				],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.DetachedPriorRoot]: 2,
				},
				[TreeLocation.UnderDetachedPriorTree]: {
					[TreeLocation.UnderDetachedPriorTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderTransientTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id0, trees: oneTree }],
				global: [
					{ id: id0, fields: attachNodes1Through10 },
					{ id: id100, fields: detachNodes1Through10 },
				],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.DetachedPriorRoot]: 1,
				},
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.DetachedBuiltRoot]: 1,
				},
				[TreeLocation.UnderDetachedPriorTree]: {
					[TreeLocation.UnderTransientTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachingPriorTree}`, () => {
			const delta: DeltaRoot = {
				global: [
					{ id: id0, fields: attachNodes1Through10 },
					{ id: id100, fields: detachNodes1Through10 },
				],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id0 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.DetachedPriorRoot]: 1,
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.UnderDetachedPriorTree]: {
					[TreeLocation.UnderAttachingPriorTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachingBuiltTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id0, trees: oneTree }],
				global: [
					{ id: id0, fields: attachNodes1Through10 },
					{ id: id100, fields: detachNodes1Through10 },
				],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id0 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.DetachedPriorRoot]: 1,
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.UnderDetachedPriorTree]: {
					[TreeLocation.UnderAttachingBuiltTree]: 10,
				},
			});
		});
	});

	describe(`counts nodes that go from ${TreeLocation.UnderAttachingPriorTree}`, () => {
		it(`to ${TreeLocation.DetachedPriorRoot}`, () => {
			const delta: DeltaRoot = {
				global: [
					{
						id: id100,
						fields: detachNodes1Through10,
					},
				],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id100 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.UnderAttachingPriorTree]: {
					[TreeLocation.DetachedPriorRoot]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachedTree}`, () => {
			const delta: DeltaRoot = {
				global: [
					{
						id: id100,
						fields: detachNodes0Through10,
					},
				],
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id100 },
								{ count: 1, attach: id0 },
								{ count: 1, fields: attachNodes1Through10 },
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.UnderAttachingPriorTree]: {
					[TreeLocation.UnderAttachedTree]: 11,
				},
			});
		});

		it(`to ${TreeLocation.UnderDetachingTree}`, () => {
			const delta: DeltaRoot = {
				global: [
					{
						id: id100,
						fields: detachNodes1Through10,
					},
				],
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id100 },
								{
									count: 1,
									detach: id0,
									fields: attachNodes1Through10,
								},
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.DetachedPriorRoot]: 1,
				},
				[TreeLocation.UnderAttachingPriorTree]: {
					[TreeLocation.UnderDetachingTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderDetachedPriorTree}`, () => {
			const delta: DeltaRoot = {
				global: [
					{
						id: id0,
						fields: attachNodes1Through10,
					},
					{
						id: id100,
						fields: detachNodes1Through10,
					},
				],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id100 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.UnderAttachedTree]: 2,
				},
				[TreeLocation.UnderAttachingPriorTree]: {
					[TreeLocation.UnderDetachedPriorTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderTransientTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id0, trees: oneTree }],
				global: [
					{ id: id0, fields: attachNodes1Through10 },
					{ id: id100, fields: detachNodes1Through10 },
				],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id100 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.DetachedBuiltRoot]: 1,
				},
				[TreeLocation.UnderAttachingPriorTree]: {
					[TreeLocation.UnderTransientTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachingPriorTree}`, () => {
			const delta: DeltaRoot = {
				global: [
					{ id: id0, fields: attachNodes1Through10 },
					{ id: id100, fields: detachNodes1Through10 },
				],
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id0 },
								{ count: 1, attach: id100 },
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.UnderAttachedTree]: 2,
				},
				[TreeLocation.UnderAttachingPriorTree]: {
					[TreeLocation.UnderAttachingPriorTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachingBuiltTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id0, trees: oneTree }],
				global: [
					{ id: id0, fields: attachNodes1Through10 },
					{ id: id100, fields: detachNodes1Through10 },
				],
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id0 },
								{ count: 1, attach: id100 },
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.UnderAttachingPriorTree]: {
					[TreeLocation.UnderAttachingBuiltTree]: 10,
				},
			});
		});
	});

	describe(`counts nodes that go from ${TreeLocation.UnderAttachingBuiltTree}`, () => {
		it(`to ${TreeLocation.DetachedBuiltRoot}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [
					{
						id: id100,
						fields: detachNodes1Through10,
					},
				],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id100 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.UnderAttachingBuiltTree]: {
					[TreeLocation.DetachedBuiltRoot]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachedTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [
					{
						id: id100,
						fields: detachNodes0Through10,
					},
				],
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id100 },
								{ count: 1, attach: id0 },
								{ count: 1, fields: attachNodes1Through10 },
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.UnderAttachingBuiltTree]: {
					[TreeLocation.UnderAttachedTree]: 11,
				},
			});
		});

		it(`to ${TreeLocation.UnderDetachingTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [
					{
						id: id100,
						fields: detachNodes1Through10,
					},
				],
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id100 },
								{
									count: 1,
									detach: id0,
									fields: attachNodes1Through10,
								},
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.UnderAttachedTree]: {
					[TreeLocation.DetachedPriorRoot]: 1,
				},
				[TreeLocation.UnderAttachingBuiltTree]: {
					[TreeLocation.UnderDetachingTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderDetachedPriorTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [
					{
						id: id0,
						fields: attachNodes1Through10,
					},
					{
						id: id100,
						fields: detachNodes1Through10,
					},
				],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id100 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.DetachedPriorRoot]: 1,
				},
				[TreeLocation.UnderAttachingBuiltTree]: {
					[TreeLocation.UnderDetachedPriorTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderTransientTree}`, () => {
			const delta: DeltaRoot = {
				build: [
					{ id: id0, trees: oneTree },
					{ id: id100, trees: oneTree },
				],
				global: [
					{ id: id0, fields: attachNodes1Through10 },
					{ id: id100, fields: detachNodes1Through10 },
				],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id100 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.DetachedBuiltRoot]: 1,
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.UnderAttachingBuiltTree]: {
					[TreeLocation.UnderTransientTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachingPriorTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [
					{ id: id0, fields: attachNodes1Through10 },
					{ id: id100, fields: detachNodes1Through10 },
				],
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id0 },
								{ count: 1, attach: id100 },
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedPriorRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.UnderAttachedTree]: 1,
				},
				[TreeLocation.UnderAttachingBuiltTree]: {
					[TreeLocation.UnderAttachingPriorTree]: 10,
				},
			});
		});

		it(`to ${TreeLocation.UnderAttachingBuiltTree}`, () => {
			const delta: DeltaRoot = {
				build: [
					{ id: id0, trees: oneTree },
					{ id: id100, trees: oneTree },
				],
				global: [
					{ id: id0, fields: attachNodes1Through10 },
					{ id: id100, fields: detachNodes1Through10 },
				],
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id0 },
								{ count: 1, attach: id100 },
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[TreeLocation.DetachedBuiltRoot]: {
					[TreeLocation.UnderAttachedTree]: 2,
				},
				[TreeLocation.UnderAttachingBuiltTree]: {
					[TreeLocation.UnderAttachingBuiltTree]: 10,
				},
			});
		});
	});
});
