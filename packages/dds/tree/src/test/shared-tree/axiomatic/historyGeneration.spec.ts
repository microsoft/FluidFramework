/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { CommitKind } from "../../../core/index.js";
import { ForestTypeReference, type TreeCheckout } from "../../../shared-tree/index.js";
import type { JsonCompatible } from "../../../util/index.js";
import { expectJsonTree } from "../../utils.js";

import {
	generateSharedTreeChanges,
	type SharedTreeTestOperation,
} from "./changeGeneration.js";
import { generateSharedTreeHistories } from "./historyGeneration.js";
import {
	applyMultiFieldOperation,
	createMultiFieldFixture,
	multiFieldOperationDescriptors,
	multiFieldOperations,
	type MultiFieldOperationDescriptor,
} from "./multiFieldFixture.js";

type OperationSource = (
	state: TreeCheckout,
	depth: number,
) => Iterable<SharedTreeTestOperation>;

function observeForks(source: OperationSource, events: string[]): OperationSource {
	return function* (state, depth) {
		for (const operation of source(state, depth)) {
			yield {
				description: operation.description,
				apply: (child: TreeCheckout) => {
					events.push(`create ${depth}`);
					child.events.on("dispose", () => {
						events.push(`dispose ${depth}`);
					});
					operation.apply(child);
				},
			};
		}
	};
}

const initialCases: {
	operation: MultiFieldOperationDescriptor;
	expected: JsonCompatible[];
}[] = [
	{
		operation: { type: "move", source: "left" },
		expected: [{ left: [], right: ["B", "A"] }],
	},
	{
		operation: { type: "move", source: "right" },
		expected: [{ left: ["A", "B"], right: [] }],
	},
	{
		operation: { type: "insert", value: "N0" },
		expected: [{ left: ["A", "N0"], right: ["B"] }],
	},
	{
		operation: { type: "remove" },
		expected: [{ left: [], right: ["B"] }],
	},
	{
		operation: { type: "setOptional", value: "N0" },
		expected: [{ left: ["A"], right: ["B"], optional: "N0" }],
	},
	{
		operation: { type: "clearOptional" },
		expected: [{ left: ["A"], right: ["B"] }],
	},
];

describe("SharedTree axiom infrastructure: history generation", () => {
	let parent: TreeCheckout;
	beforeEach(() => {
		parent = createMultiFieldFixture(ForestTypeReference);
	});
	afterEach(() => {
		parent.dispose();
	});

	it("uses a deterministic, serializable vocabulary with explicit outcomes", () => {
		const descriptors = [...multiFieldOperationDescriptors(parent, 0)];
		assert.deepEqual(
			descriptors,
			initialCases.map(({ operation }) => operation),
		);
		// eslint-disable-next-line unicorn/prefer-structured-clone -- Verify a JSON serialization roundtrip, not general cloning.
		assert.deepEqual(JSON.parse(JSON.stringify(descriptors)), descriptors);
		let index = 0;
		for (const candidate of generateSharedTreeChanges(
			parent,
			multiFieldOperations(parent, 0),
		)) {
			const { operation, expected } = initialCases[index++];
			assert.equal(candidate.description, JSON.stringify(operation));
			expectJsonTree(candidate.checkout, expected);
		}
		assert.equal(index, 6);
		expectJsonTree(parent, [{ left: ["A"], right: ["B"] }]);
	});

	it("yields one empty history at zero depth without requesting candidates", () => {
		const histories = [
			...generateSharedTreeHistories(
				parent,
				() => {
					assert.fail("Zero depth must not request candidates");
				},
				0,
			),
		];
		assert.deepEqual(histories, [[]]);
	});

	it("temporary views leave the checkout alive and author no setup commits", () => {
		const child = parent.fork();
		try {
			const before = child.mainBranch.getHead();
			assert.equal([...multiFieldOperationDescriptors(child, 0)].length, 6);
			assert.equal(child.mainBranch.getHead(), before);
			applyMultiFieldOperation(child, { type: "clearOptional" });
			assert.equal(child.mainBranch.getHead().parent, before);
			assert.equal(child.disposed, false);
			expectJsonTree(child, [{ left: ["A"], right: ["B"] }]);
		} finally {
			child.dispose();
		}
	});

	it("releases the temporary view when an operation fails", () => {
		applyMultiFieldOperation(parent, { type: "remove" });
		const before = parent.mainBranch.getHead();
		assert.throws(() => applyMultiFieldOperation(parent, { type: "remove" }));
		assert.equal(parent.mainBranch.getHead(), before);
		// A subsequent operation must be able to open a new view on the same checkout.
		applyMultiFieldOperation(parent, { type: "setOptional", value: "after failure" });
		expectJsonTree(parent, [{ left: [], right: ["B"], optional: "after failure" }]);
	});

	for (const [length, count] of [
		[1, 6],
		[2, 28],
	] as const) {
		it(`enumerates ${count} deterministic histories of length ${length}`, () => {
			const base = parent.mainBranch.getHead();
			const first = [...generateSharedTreeHistories(parent, multiFieldOperations, length)];
			const second = [...generateSharedTreeHistories(parent, multiFieldOperations, length)];
			assert.equal(first.length, count);
			assert.deepEqual(
				first.map((history) => history.map(({ description }) => description)),
				second.map((history) => history.map(({ description }) => description)),
			);
			for (const history of first) {
				assert.equal(history.length, length);
			}
			assert.equal(parent.mainBranch.getHead(), base);
			expectJsonTree(parent, [{ left: ["A"], right: ["B"] }]);
		});
	}

	it("disposes all 34 exploration forks on completion", () => {
		const events: string[] = [];
		const source = observeForks(multiFieldOperations, events);
		assert.equal([...generateSharedTreeHistories(parent, source, 2)].length, 28);
		assert.equal(events.filter((event) => event.startsWith("create")).length, 34);
		assert.equal(events.filter((event) => event.startsWith("dispose")).length, 34);
	});

	it("disposes nested forks in descendant-first order on early exit", () => {
		const events: string[] = [];
		const source = observeForks(multiFieldOperations, events);
		for (const history of generateSharedTreeHistories(parent, source, 2)) {
			assert.equal(history.length, 2);
			assert.deepEqual(events, ["create 0", "create 1"]);
			break;
		}
		assert.deepEqual(events, ["create 0", "create 1", "dispose 1", "dispose 0"]);
		expectJsonTree(parent, [{ left: ["A"], right: ["B"] }]);
	});

	it("retains replayable complete changes, not live checkouts", () => {
		const steps: MultiFieldOperationDescriptor[] = [
			{ type: "insert", value: "N0" },
			{ type: "setOptional", value: "N1" },
			{ type: "move", source: "left" },
			{ type: "clearOptional" },
		];
		const events: string[] = [];
		const source = observeForks(
			(state, depth) => [
				{
					description: JSON.stringify(steps[depth]),
					apply: (child) => applyMultiFieldOperation(child, steps[depth]),
				},
			],
			events,
		);
		const histories = [...generateSharedTreeHistories(parent, source, steps.length)];
		assert.equal(histories.length, 1);
		assert.equal(events.filter((event) => event.startsWith("dispose")).length, steps.length);
		const replay = parent.fork();
		try {
			for (const { change } of histories[0]) {
				replay.mainBranch.apply(change, CommitKind.Default, undefined);
			}
			expectJsonTree(replay, [{ left: ["N0"], right: ["B", "A"] }]);
		} finally {
			replay.dispose();
		}
	});
});
