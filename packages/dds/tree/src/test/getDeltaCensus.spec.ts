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
	allEndpoints,
	nodeFlowCensusFromDelta,
	NodeFlowEndpoint,
	type NodeFlowCensus,
} from "./getDeltaCensus.js";
import { brand } from "../util/index.js";
import { chunkFromJsonTrees } from "./utils.js";

const id0 = { minor: 0 };
const id1 = { minor: 1 };
const id10 = { minor: 10 };
const id100 = { minor: 100 };

type PartialCensus = Partial<
	Record<NodeFlowEndpoint, Partial<Record<NodeFlowEndpoint, number>>>
>;

function assertPartial(
	actual: NodeFlowCensus,
	expected: PartialCensus,
	implicitValue: number = 0,
): void {
	for (const from of allEndpoints) {
		for (const to of allEndpoints) {
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
				{ count: 1, fields: new Map([[fooKey, { marks: [{ count: 1, attach: id10 }] }]]) },
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
				{ count: 1, fields: new Map([[fooKey, { marks: [{ count: 1, attach: id10 }] }]]) },
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
				{ count: 1, fields: new Map([[fooKey, { marks: [{ count: 1, detach: id10 }] }]]) },
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
				{ count: 1, fields: new Map([[fooKey, { marks: [{ count: 1, detach: id10 }] }]]) },
			],
		},
	],
]);

describe("getDeltaCensus", () => {
	describe(`counts nodes that go from ${NodeFlowEndpoint.DetachedPriorRoot}`, () => {
		it(`to ${NodeFlowEndpoint.DetachedPriorRoot}`, () => {
			const delta: DeltaRoot = {
				rename: [
					{ oldId: id1, newId: id10, count: 1 },
					{ oldId: id10, newId: id1, count: 2 },
				],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.DetachedPriorRoot]: 3 },
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachedPriorTree}`, () => {
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
				[NodeFlowEndpoint.DetachedPriorRoot]: {
					[NodeFlowEndpoint.UnderAttachedPriorTree]: 11,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderDetachingPriorTree}`, () => {
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
				[NodeFlowEndpoint.UnderAttachedPriorTree]: { [NodeFlowEndpoint.DetachedPriorRoot]: 1 },
				[NodeFlowEndpoint.DetachedPriorRoot]: {
					[NodeFlowEndpoint.UnderDetachingPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderDetachedPriorTree}`, () => {
			const delta: DeltaRoot = { global: [{ id: id0, fields: attachNodes1Through10 }] };
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedPriorRoot]: {
					[NodeFlowEndpoint.DetachedPriorRoot]: 1,
					[NodeFlowEndpoint.UnderDetachedPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderTransientBuiltTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id0, trees: oneTree }],
				global: [{ id: id0, fields: attachNodes1Through10 }],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.DetachedBuiltRoot]: 1 },
				[NodeFlowEndpoint.DetachedPriorRoot]: {
					[NodeFlowEndpoint.UnderTransientBuiltTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachingPriorTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id0, trees: oneTree }],
				global: [{ id: id0, fields: attachNodes1Through10 }],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id0 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedPriorRoot]: {
					[NodeFlowEndpoint.UnderAttachedPriorTree]: 1,
					[NodeFlowEndpoint.UnderAttachingPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachingBuiltTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id0, trees: oneTree }],
				global: [{ id: id0, fields: attachNodes1Through10 }],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id0 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedPriorRoot]: {
					[NodeFlowEndpoint.UnderAttachedPriorTree]: 1,
					[NodeFlowEndpoint.UnderAttachingBuiltTree]: 10,
				},
			});
		});
	});
	describe(`counts nodes that go from ${NodeFlowEndpoint.DetachedBuiltRoot}`, () => {
		it(`to ${NodeFlowEndpoint.DetachedBuiltRoot}`, () => {
			const delta: DeltaRoot = {
				build: [
					{ id: id0, trees: oneTree },
					{ id: id1, trees: tenTrees },
				],
				rename: [{ oldId: id1, newId: id10, count: 5 }],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.DetachedBuiltRoot]: 11 },
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachedPriorTree}`, () => {
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
				[NodeFlowEndpoint.DetachedBuiltRoot]: {
					[NodeFlowEndpoint.UnderAttachedPriorTree]: 11,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderDetachingPriorTree}`, () => {
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
				[NodeFlowEndpoint.UnderAttachedPriorTree]: { [NodeFlowEndpoint.DetachedPriorRoot]: 1 },
				[NodeFlowEndpoint.DetachedBuiltRoot]: {
					[NodeFlowEndpoint.UnderDetachingPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderDetachedPriorTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id1, trees: tenTrees }],
				global: [{ id: id0, fields: attachNodes1Through10 }],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.DetachedPriorRoot]: 1 },
				[NodeFlowEndpoint.DetachedBuiltRoot]: {
					[NodeFlowEndpoint.UnderDetachedPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderTransientBuiltTree}`, () => {
			const delta: DeltaRoot = {
				build: [
					{ id: id0, trees: oneTree },
					{ id: id1, trees: tenTrees },
				],
				global: [{ id: id0, fields: attachNodes1Through10 }],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedBuiltRoot]: {
					[NodeFlowEndpoint.DetachedBuiltRoot]: 1,
					[NodeFlowEndpoint.UnderTransientBuiltTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachingPriorTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id1, trees: tenTrees }],
				global: [{ id: id0, fields: attachNodes1Through10 }],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id0 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 1 },
				[NodeFlowEndpoint.DetachedBuiltRoot]: {
					[NodeFlowEndpoint.UnderAttachingPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachingBuiltTree}`, () => {
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
				[NodeFlowEndpoint.DetachedBuiltRoot]: {
					[NodeFlowEndpoint.UnderAttachedPriorTree]: 1,
					[NodeFlowEndpoint.UnderAttachingBuiltTree]: 10,
				},
			});
		});
	});

	describe(`counts nodes that go from ${NodeFlowEndpoint.UnderAttachedPriorTree}`, () => {
		it(`to ${NodeFlowEndpoint.DetachedPriorRoot}`, () => {
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
				[NodeFlowEndpoint.UnderAttachedPriorTree]: {
					[NodeFlowEndpoint.DetachedPriorRoot]: 11,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.DetachedBuiltRoot}`, () => {
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
				[NodeFlowEndpoint.UnderAttachedPriorTree]: {
					[NodeFlowEndpoint.DetachedBuiltRoot]: 11,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachedPriorTree}`, () => {
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
				[NodeFlowEndpoint.UnderAttachedPriorTree]: {
					[NodeFlowEndpoint.UnderAttachedPriorTree]: 11,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderDetachingPriorTree}`, () => {
			const delta: DeltaRoot = {
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, detach: id100, fields: attachNodes0Through10 },
								{ count: 1, detach: id0, fields: detachNodes1Through10 },
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.UnderAttachedPriorTree]: {
					[NodeFlowEndpoint.DetachedPriorRoot]: 1,
					[NodeFlowEndpoint.UnderDetachingPriorTree]: 11,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderDetachedPriorTree}`, () => {
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
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.DetachedPriorRoot]: 1 },
				[NodeFlowEndpoint.UnderAttachedPriorTree]: {
					[NodeFlowEndpoint.UnderDetachedPriorTree]: 11,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderTransientBuiltTree}`, () => {
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
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.DetachedBuiltRoot]: 1 },
				[NodeFlowEndpoint.UnderAttachedPriorTree]: {
					[NodeFlowEndpoint.UnderTransientBuiltTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachingPriorTree}`, () => {
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
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 1 },
				[NodeFlowEndpoint.UnderAttachedPriorTree]: {
					[NodeFlowEndpoint.UnderAttachingPriorTree]: 11,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachingBuiltTree}`, () => {
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
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 1 },
				[NodeFlowEndpoint.UnderAttachedPriorTree]: {
					[NodeFlowEndpoint.UnderAttachingBuiltTree]: 11,
				},
			});
		});
	});

	describe(`counts nodes that go from ${NodeFlowEndpoint.UnderDetachingPriorTree}`, () => {
		it(`to ${NodeFlowEndpoint.DetachedPriorRoot}`, () => {
			const delta: DeltaRoot = {
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
				[NodeFlowEndpoint.UnderAttachedPriorTree]: { [NodeFlowEndpoint.DetachedPriorRoot]: 1 },
				[NodeFlowEndpoint.UnderDetachingPriorTree]: {
					[NodeFlowEndpoint.DetachedPriorRoot]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.DetachedBuiltRoot}`, () => {
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
				[NodeFlowEndpoint.UnderAttachedPriorTree]: { [NodeFlowEndpoint.DetachedPriorRoot]: 1 },
				[NodeFlowEndpoint.UnderDetachingPriorTree]: {
					[NodeFlowEndpoint.DetachedBuiltRoot]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachedPriorTree}`, () => {
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
				[NodeFlowEndpoint.UnderAttachedPriorTree]: { [NodeFlowEndpoint.DetachedPriorRoot]: 1 },
				[NodeFlowEndpoint.UnderDetachingPriorTree]: {
					[NodeFlowEndpoint.UnderAttachedPriorTree]: 11,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderDetachingPriorTree}`, () => {
			const delta: DeltaRoot = {
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, detach: id100, fields: attachNodes1Through10 },
								{ count: 1, detach: id0, fields: detachNodes1Through10 },
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.UnderAttachedPriorTree]: { [NodeFlowEndpoint.DetachedPriorRoot]: 2 },
				[NodeFlowEndpoint.UnderDetachingPriorTree]: {
					[NodeFlowEndpoint.UnderDetachingPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderDetachedPriorTree}`, () => {
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
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.DetachedPriorRoot]: 1 },
				[NodeFlowEndpoint.UnderAttachedPriorTree]: {
					[NodeFlowEndpoint.DetachedPriorRoot]: 1,
					[NodeFlowEndpoint.UnderDetachedPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderTransientBuiltTree}`, () => {
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
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.DetachedBuiltRoot]: 1 },
				[NodeFlowEndpoint.UnderAttachedPriorTree]: {
					[NodeFlowEndpoint.DetachedPriorRoot]: 1,
					[NodeFlowEndpoint.UnderTransientBuiltTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachingPriorTree}`, () => {
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
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 1 },
				[NodeFlowEndpoint.UnderAttachedPriorTree]: { [NodeFlowEndpoint.DetachedPriorRoot]: 1 },
				[NodeFlowEndpoint.UnderDetachingPriorTree]: {
					[NodeFlowEndpoint.UnderAttachingPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachingBuiltTree}`, () => {
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
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 1 },
				[NodeFlowEndpoint.UnderAttachedPriorTree]: { [NodeFlowEndpoint.DetachedPriorRoot]: 1 },
				[NodeFlowEndpoint.UnderDetachingPriorTree]: {
					[NodeFlowEndpoint.UnderAttachingBuiltTree]: 10,
				},
			});
		});
	});

	describe(`counts nodes that go from ${NodeFlowEndpoint.UnderTransientBuiltTree}`, () => {
		it(`to ${NodeFlowEndpoint.DetachedBuiltRoot}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [{ id: id100, fields: detachNodes1Through10 }],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.DetachedBuiltRoot]: 1 },
				[NodeFlowEndpoint.UnderTransientBuiltTree]: {
					[NodeFlowEndpoint.DetachedBuiltRoot]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachedPriorTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [{ id: id100, fields: detachNodes0Through10 }],
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
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.DetachedBuiltRoot]: 1 },
				[NodeFlowEndpoint.UnderTransientBuiltTree]: {
					[NodeFlowEndpoint.UnderAttachedPriorTree]: 11,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderDetachingPriorTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [{ id: id100, fields: detachNodes1Through10 }],
				fields: new Map([
					[
						rootFieldKey,
						{ marks: [{ count: 1, detach: id0, fields: attachNodes1Through10 }] },
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.DetachedBuiltRoot]: 1 },
				[NodeFlowEndpoint.UnderAttachedPriorTree]: { [NodeFlowEndpoint.DetachedPriorRoot]: 1 },
				[NodeFlowEndpoint.UnderTransientBuiltTree]: {
					[NodeFlowEndpoint.UnderDetachingPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderDetachedPriorTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [
					{ id: id0, fields: attachNodes1Through10 },
					{ id: id100, fields: detachNodes1Through10 },
				],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.DetachedBuiltRoot]: 1 },
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.DetachedPriorRoot]: 1 },
				[NodeFlowEndpoint.UnderTransientBuiltTree]: {
					[NodeFlowEndpoint.UnderDetachedPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderTransientBuiltTree}`, () => {
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
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.DetachedBuiltRoot]: 2 },
				[NodeFlowEndpoint.UnderTransientBuiltTree]: {
					[NodeFlowEndpoint.UnderTransientBuiltTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachingPriorTree}`, () => {
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
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.DetachedBuiltRoot]: 1 },
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 1 },
				[NodeFlowEndpoint.UnderTransientBuiltTree]: {
					[NodeFlowEndpoint.UnderAttachingPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachingBuiltTree}`, () => {
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
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.DetachedBuiltRoot]: 1 },
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 1 },
				[NodeFlowEndpoint.UnderTransientBuiltTree]: {
					[NodeFlowEndpoint.UnderAttachingBuiltTree]: 10,
				},
			});
		});
	});

	describe(`counts nodes that go from ${NodeFlowEndpoint.UnderDetachedPriorTree}`, () => {
		it(`to ${NodeFlowEndpoint.DetachedPriorRoot}`, () => {
			const delta: DeltaRoot = { global: [{ id: id100, fields: detachNodes1Through10 }] };
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.DetachedPriorRoot]: 1 },
				[NodeFlowEndpoint.UnderDetachedPriorTree]: {
					[NodeFlowEndpoint.DetachedPriorRoot]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachedPriorTree}`, () => {
			const delta: DeltaRoot = {
				global: [{ id: id100, fields: detachNodes0Through10 }],
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
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.DetachedPriorRoot]: 1 },
				[NodeFlowEndpoint.UnderDetachedPriorTree]: {
					[NodeFlowEndpoint.UnderAttachedPriorTree]: 11,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderDetachingPriorTree}`, () => {
			const delta: DeltaRoot = {
				global: [{ id: id100, fields: detachNodes1Through10 }],
				fields: new Map([
					[
						rootFieldKey,
						{ marks: [{ count: 1, detach: id0, fields: attachNodes1Through10 }] },
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.DetachedPriorRoot]: 1 },
				[NodeFlowEndpoint.UnderAttachedPriorTree]: { [NodeFlowEndpoint.DetachedPriorRoot]: 1 },
				[NodeFlowEndpoint.UnderDetachedPriorTree]: {
					[NodeFlowEndpoint.UnderDetachingPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderDetachedPriorTree}`, () => {
			const delta: DeltaRoot = {
				global: [
					{ id: id0, fields: attachNodes1Through10 },
					{ id: id100, fields: detachNodes1Through10 },
				],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.DetachedPriorRoot]: 2 },
				[NodeFlowEndpoint.UnderDetachedPriorTree]: {
					[NodeFlowEndpoint.UnderDetachedPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderTransientBuiltTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id0, trees: oneTree }],
				global: [
					{ id: id0, fields: attachNodes1Through10 },
					{ id: id100, fields: detachNodes1Through10 },
				],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.DetachedPriorRoot]: 1 },
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.DetachedBuiltRoot]: 1 },
				[NodeFlowEndpoint.UnderDetachedPriorTree]: {
					[NodeFlowEndpoint.UnderTransientBuiltTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachingPriorTree}`, () => {
			const delta: DeltaRoot = {
				global: [
					{ id: id0, fields: attachNodes1Through10 },
					{ id: id100, fields: detachNodes1Through10 },
				],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id0 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedPriorRoot]: {
					[NodeFlowEndpoint.DetachedPriorRoot]: 1,
					[NodeFlowEndpoint.UnderAttachedPriorTree]: 1,
				},
				[NodeFlowEndpoint.UnderDetachedPriorTree]: {
					[NodeFlowEndpoint.UnderAttachingPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachingBuiltTree}`, () => {
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
				[NodeFlowEndpoint.DetachedPriorRoot]: {
					[NodeFlowEndpoint.DetachedPriorRoot]: 1,
					[NodeFlowEndpoint.UnderAttachedPriorTree]: 1,
				},
				[NodeFlowEndpoint.UnderDetachedPriorTree]: {
					[NodeFlowEndpoint.UnderAttachingBuiltTree]: 10,
				},
			});
		});
	});

	describe(`counts nodes that go from ${NodeFlowEndpoint.UnderAttachingPriorTree}`, () => {
		it(`to ${NodeFlowEndpoint.DetachedPriorRoot}`, () => {
			const delta: DeltaRoot = {
				global: [{ id: id100, fields: detachNodes1Through10 }],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id100 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 1 },
				[NodeFlowEndpoint.UnderAttachingPriorTree]: {
					[NodeFlowEndpoint.DetachedPriorRoot]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachedPriorTree}`, () => {
			const delta: DeltaRoot = {
				global: [{ id: id100, fields: detachNodes0Through10 }],
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
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 1 },
				[NodeFlowEndpoint.UnderAttachingPriorTree]: {
					[NodeFlowEndpoint.UnderAttachedPriorTree]: 11,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderDetachingPriorTree}`, () => {
			const delta: DeltaRoot = {
				global: [{ id: id100, fields: detachNodes1Through10 }],
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id100 },
								{ count: 1, detach: id0, fields: attachNodes1Through10 },
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 1 },
				[NodeFlowEndpoint.UnderAttachedPriorTree]: { [NodeFlowEndpoint.DetachedPriorRoot]: 1 },
				[NodeFlowEndpoint.UnderAttachingPriorTree]: {
					[NodeFlowEndpoint.UnderDetachingPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderDetachedPriorTree}`, () => {
			const delta: DeltaRoot = {
				global: [
					{ id: id0, fields: attachNodes1Through10 },
					{ id: id100, fields: detachNodes1Through10 },
				],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id100 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 2 },
				[NodeFlowEndpoint.UnderAttachingPriorTree]: {
					[NodeFlowEndpoint.UnderDetachedPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderTransientBuiltTree}`, () => {
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
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 1 },
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.DetachedBuiltRoot]: 1 },
				[NodeFlowEndpoint.UnderAttachingPriorTree]: {
					[NodeFlowEndpoint.UnderTransientBuiltTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachingPriorTree}`, () => {
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
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 2 },
				[NodeFlowEndpoint.UnderAttachingPriorTree]: {
					[NodeFlowEndpoint.UnderAttachingPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachingBuiltTree}`, () => {
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
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 1 },
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 1 },
				[NodeFlowEndpoint.UnderAttachingPriorTree]: {
					[NodeFlowEndpoint.UnderAttachingBuiltTree]: 10,
				},
			});
		});
	});

	describe(`counts nodes that go from ${NodeFlowEndpoint.UnderAttachingBuiltTree}`, () => {
		it(`to ${NodeFlowEndpoint.DetachedBuiltRoot}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [{ id: id100, fields: detachNodes1Through10 }],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id100 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 1 },
				[NodeFlowEndpoint.UnderAttachingBuiltTree]: {
					[NodeFlowEndpoint.DetachedBuiltRoot]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachedPriorTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [{ id: id100, fields: detachNodes0Through10 }],
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
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 1 },
				[NodeFlowEndpoint.UnderAttachingBuiltTree]: {
					[NodeFlowEndpoint.UnderAttachedPriorTree]: 11,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderDetachingPriorTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [{ id: id100, fields: detachNodes1Through10 }],
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id100 },
								{ count: 1, detach: id0, fields: attachNodes1Through10 },
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 1 },
				[NodeFlowEndpoint.UnderAttachedPriorTree]: { [NodeFlowEndpoint.DetachedPriorRoot]: 1 },
				[NodeFlowEndpoint.UnderAttachingBuiltTree]: {
					[NodeFlowEndpoint.UnderDetachingPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderDetachedPriorTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id100, trees: oneTree }],
				global: [
					{ id: id0, fields: attachNodes1Through10 },
					{ id: id100, fields: detachNodes1Through10 },
				],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id100 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 1 },
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.DetachedPriorRoot]: 1 },
				[NodeFlowEndpoint.UnderAttachingBuiltTree]: {
					[NodeFlowEndpoint.UnderDetachedPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderTransientBuiltTree}`, () => {
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
				[NodeFlowEndpoint.DetachedBuiltRoot]: {
					[NodeFlowEndpoint.DetachedBuiltRoot]: 1,
					[NodeFlowEndpoint.UnderAttachedPriorTree]: 1,
				},
				[NodeFlowEndpoint.UnderAttachingBuiltTree]: {
					[NodeFlowEndpoint.UnderTransientBuiltTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachingPriorTree}`, () => {
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
				[NodeFlowEndpoint.DetachedPriorRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 1 },
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 1 },
				[NodeFlowEndpoint.UnderAttachingBuiltTree]: {
					[NodeFlowEndpoint.UnderAttachingPriorTree]: 10,
				},
			});
		});

		it(`to ${NodeFlowEndpoint.UnderAttachingBuiltTree}`, () => {
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
				[NodeFlowEndpoint.DetachedBuiltRoot]: { [NodeFlowEndpoint.UnderAttachedPriorTree]: 2 },
				[NodeFlowEndpoint.UnderAttachingBuiltTree]: {
					[NodeFlowEndpoint.UnderAttachingBuiltTree]: 10,
				},
			});
		});
	});
});
