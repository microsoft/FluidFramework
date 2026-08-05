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
} from "../../../core/index.js";
import { nodeFlowCensusFromDelta, Location, type NodeFlowCensus } from "./getDeltaCensus.js";
import { brand } from "../../../util/index.js";
import { chunkFromJsonTrees } from "../../utils.js";

const id0 = { minor: 0 };
const id1 = { minor: 1 };
const id10 = { minor: 10 };

type PartialCensus = Partial<Record<Location, Partial<Record<Location, number>>>>;

function sumCensus(census: PartialCensus): number {
	let sum = 0;
	for (const from of Object.values(Location)) {
		for (const to of Object.values(Location)) {
			sum += census[from as Location]?.[to as Location] ?? 0;
		}
	}
	return sum;
}

function assertPartial(actual: NodeFlowCensus, expected: PartialCensus): void {
	for (const from of Object.values(Location)) {
		for (const to of Object.values(Location)) {
			const actualCount = actual[from as Location][to as Location];
			const expectedCount = expected[from as Location]?.[to as Location] ?? 0;
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
const trees = chunkFromJsonTrees(["X"]);

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

describe("getDeltaCensus", () => {
	describe(`counts nodes that go from ${Location.DetachedRoot}`, () => {
		it(` to ${Location.DetachedRoot}`, () => {
			const delta: DeltaRoot = {
				rename: [
					{ oldId: id1, newId: id10, count: 1 },
					{ oldId: id10, newId: id1, count: 10 },
				],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[Location.DetachedRoot]: {
					[Location.DetachedRoot]: 10,
				},
			});
		});

		it(` to ${Location.UnderAttachedTree}`, () => {
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
				[Location.DetachedRoot]: {
					[Location.UnderAttachedTree]: 11,
				},
			});
		});

		it(` to ${Location.UnderDetachingTree}`, () => {
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
				[Location.UnderAttachedTree]: {
					[Location.DetachedRoot]: 1,
				},
				[Location.DetachedRoot]: {
					[Location.UnderDetachingTree]: 10,
				},
			});
		});

		it(` to ${Location.UnderDetachedPriorTree}`, () => {
			const delta: DeltaRoot = {
				global: [{ id: id0, fields: attachNodes1Through10 }],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[Location.DetachedRoot]: {
					[Location.UnderDetachedPriorTree]: 10,
				},
			});
		});

		it(` to ${Location.UnderDetachedBuiltTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id0, trees }],
				global: [{ id: id0, fields: attachNodes1Through10 }],
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[Location.DetachedRoot]: {
					[Location.UnderDetachedBuiltTree]: 10,
				},
			});
		});

		it(` to ${Location.UnderAttachingPriorTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id0, trees }],
				global: [{ id: id0, fields: attachNodes1Through10 }],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id0 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[Location.DetachedRoot]: {
					[Location.UnderAttachedTree]: 1,
					[Location.UnderAttachingPriorTree]: 10,
				},
			});
		});

		it(` to ${Location.UnderAttachingBuiltTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id0, trees }],
				global: [{ id: id0, fields: attachNodes1Through10 }],
				fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: id0 }] }]]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[Location.DetachedRoot]: {
					[Location.UnderAttachedTree]: 1,
					[Location.UnderAttachingBuiltTree]: 10,
				},
			});
		});
	});

	describe(`counts nodes that go from ${Location.UnderAttachedTree}`, () => {
		it(` to ${Location.DetachedRoot}`, () => {
			const delta: DeltaRoot = {
				fields: new Map([
					[
						rootFieldKey,
						{ marks: [{ count: 1, detach: id0, fields: detachNodes1Through10 }] },
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[Location.UnderAttachedTree]: {
					[Location.DetachedRoot]: 11,
				},
			});
		});

		it(` to ${Location.UnderAttachedTree}`, () => {
			const delta: DeltaRoot = {
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id0 },
								{
									count: 1,
									detach: id0,
									fields: new Map([
										[
											fooKey,
											{
												marks: [
													{ count: 1, fields: attachNodes1Through10 },
													{ count: 1, fields: detachNodes1Through10 },
												],
											},
										],
									]),
								},
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[Location.UnderAttachedTree]: {
					[Location.UnderAttachedTree]: 11,
				},
			});
		});

		it(` to ${Location.UnderDetachingTree}`, () => {
			const delta: DeltaRoot = {
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
								{
									count: 1,
									fields: detachNodes1Through10,
								},
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[Location.UnderAttachedTree]: {
					[Location.DetachedRoot]: 1,
					[Location.UnderDetachingTree]: 10,
				},
			});
		});

		it(` to ${Location.UnderDetachedPriorTree}`, () => {
			const delta: DeltaRoot = {
				global: [{ id: id0, fields: attachNodes1Through10 }],
				fields: new Map([
					[rootFieldKey, { marks: [{ count: 1, fields: detachNodes1Through10 }] }],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[Location.UnderAttachedTree]: {
					[Location.UnderDetachedPriorTree]: 10,
				},
			});
		});

		it(` to ${Location.UnderDetachedBuiltTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id0, trees }],
				global: [{ id: id0, fields: attachNodes1Through10 }],
				fields: new Map([
					[rootFieldKey, { marks: [{ count: 1, fields: detachNodes1Through10 }] }],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[Location.UnderAttachedTree]: {
					[Location.UnderDetachedBuiltTree]: 10,
				},
			});
		});

		it(` to ${Location.UnderAttachingPriorTree}`, () => {
			const delta: DeltaRoot = {
				global: [{ id: id0, fields: attachNodes1Through10 }],
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id0 },
								{ count: 1, fields: detachNodes1Through10 },
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[Location.DetachedRoot]: {
					[Location.UnderAttachedTree]: 1,
				},
				[Location.UnderAttachedTree]: {
					[Location.UnderAttachingPriorTree]: 10,
				},
			});
		});

		it(` to ${Location.UnderAttachingBuiltTree}`, () => {
			const delta: DeltaRoot = {
				build: [{ id: id0, trees }],
				global: [{ id: id0, fields: attachNodes1Through10 }],
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, attach: id0 },
								{ count: 1, fields: detachNodes1Through10 },
							],
						},
					],
				]),
			};
			const census = nodeFlowCensusFromDelta(delta);
			assertPartial(census, {
				[Location.DetachedRoot]: {
					[Location.UnderAttachedTree]: 1,
				},
				[Location.UnderAttachedTree]: {
					[Location.UnderAttachingBuiltTree]: 10,
				},
			});
		});
	});
});
