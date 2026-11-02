/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { CommitKind } from "../../../core/index.js";
import {
	ForestTypeOptimized,
	ForestTypeReference,
	type TreeCheckout,
} from "../../../shared-tree/index.js";
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
	multiFieldContent,
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
		expected: multiFieldContent([], ["B", "A"]),
	},
	{
		operation: { type: "move", source: "right" },
		expected: multiFieldContent(["A", "B"], []),
	},
	{
		operation: { type: "insert", value: "N0" },
		expected: multiFieldContent(["A", "N0"], ["B"]),
	},
	{
		operation: { type: "remove" },
		expected: multiFieldContent([], ["B"]),
	},
	{
		operation: { type: "setOptional", value: "N0" },
		expected: multiFieldContent(["A"], ["B"], "N0"),
	},
	{
		operation: { type: "clearOptional" },
		expected: multiFieldContent(["A"], ["B"]),
	},
	{
		operation: { type: "setRequired", value: "N0" },
		expected: multiFieldContent(["A"], ["B"], undefined, "N0"),
	},
];

describe("SharedTree axiom infrastructure: history generation", () => {
	for (const [name, forestType] of [
		["reference forest", ForestTypeReference],
		["optimized forest", ForestTypeOptimized],
	] as const) {
		describe(name, () => {
			let parent: TreeCheckout;
			beforeEach(() => {
				parent = createMultiFieldFixture(forestType);
			});
			afterEach(() => {
				parent.dispose();
			});

			it("initializes the fixture without setup commits", () => {
				assert.equal(parent.mainBranch.getHead().parent, undefined);
				expectJsonTree(parent, multiFieldContent(["A"], ["B"]));
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
				assert.equal(index, 7);
				expectJsonTree(parent, multiFieldContent(["A"], ["B"]));
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

			for (const [length, count] of [
				[1, 7],
				[2, 41],
			] as const) {
				it(`enumerates ${count} deterministic histories of length ${length}`, () => {
					const base = parent.mainBranch.getHead();
					const first = [...generateSharedTreeHistories(parent, multiFieldOperations, length)];
					const second = [
						...generateSharedTreeHistories(parent, multiFieldOperations, length),
					];
					assert.equal(first.length, count);
					assert.deepEqual(
						first.map((history) => history.map(({ description }) => description)),
						second.map((history) => history.map(({ description }) => description)),
					);
					for (const history of first) {
						assert.equal(history.length, length);
						for (const entry of history) {
							assert.deepEqual(Object.keys(entry).sort(), ["change", "description"]);
							assert.equal(typeof entry.change.revision, "number");
							assert.equal(entry.change.change.changes.length, 1);
							assert.equal(entry.change.change.changes[0].type, "data");
						}
					}
					assert.equal(parent.mainBranch.getHead(), base);
					expectJsonTree(parent, multiFieldContent(["A"], ["B"]));
				});
			}

			it("derives descendant availability from each edited forest", () => {
				const histories = [...generateSharedTreeHistories(parent, multiFieldOperations, 2)];
				const counts = initialCases.map(
					({ operation }) =>
						histories.filter((history) => history[0].description === JSON.stringify(operation))
							.length,
				);
				// The four sequence edits each leave five candidates; the three scalar edits leave seven.
				assert.deepEqual(counts, [5, 5, 5, 5, 7, 7, 7]);
				const remove = JSON.stringify({ type: "remove" });
				assert(
					!histories.some((history) => history.every((entry) => entry.description === remove)),
				);
				assert(
					histories.some(
						(history) =>
							history[0].description === JSON.stringify({ type: "move", source: "left" }) &&
							history[1].description === JSON.stringify({ type: "move", source: "right" }),
					),
				);
			});

			it("disposes all 48 exploration forks on completion", () => {
				const events: string[] = [];
				const source = observeForks(multiFieldOperations, events);
				assert.equal([...generateSharedTreeHistories(parent, source, 2)].length, 41);
				assert.equal(events.filter((event) => event.startsWith("create")).length, 48);
				assert.equal(events.filter((event) => event.startsWith("dispose")).length, 48);
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
				expectJsonTree(parent, multiFieldContent(["A"], ["B"]));
			});

			it("retains replayable complete changes, not live checkouts", () => {
				const steps: MultiFieldOperationDescriptor[] = [
					{ type: "insert", value: "N0" },
					{ type: "setOptional", value: "N1" },
					{ type: "setRequired", value: "N2" },
					{ type: "move", source: "left" },
					{ type: "clearOptional" },
				];
				const events: string[] = [];
				const source = observeForks((state, depth) => {
					const operation = [...multiFieldOperations(state, depth)].find(
						(candidate) => candidate.description === JSON.stringify(steps[depth]),
					);
					assert(operation !== undefined);
					return [operation];
				}, events);
				const histories = [...generateSharedTreeHistories(parent, source, steps.length)];
				assert.equal(histories.length, 1);
				assert.equal(
					events.filter((event) => event.startsWith("dispose")).length,
					steps.length,
				);
				const replay = parent.fork();
				try {
					for (const { change } of histories[0]) {
						replay.mainBranch.apply(change, CommitKind.Default, undefined);
					}
					expectJsonTree(replay, multiFieldContent(["N0"], ["B", "A"], undefined, "N2"));
				} finally {
					replay.dispose();
				}
			});

			it("retains committed empty clears", () => {
				const depths: number[] = [];
				const events: string[] = [];
				const source = observeForks((_state, depth) => {
					depths.push(depth);
					return [
						{
							description: "empty clear",
							apply: (child) => applyMultiFieldOperation(child, { type: "clearOptional" }),
						},
					];
				}, events);
				const histories = [...generateSharedTreeHistories(parent, source, 2)];
				assert.deepEqual(depths, [0, 1]);
				assert.deepEqual(
					histories.map((history) => history.map((entry) => entry.description)),
					[["empty clear", "empty clear"]],
				);
				assert.equal(events.filter((event) => event.startsWith("create")).length, 2);
				assert.equal(events.filter((event) => event.startsWith("dispose")).length, 2);
				expectJsonTree(parent, multiFieldContent(["A"], ["B"]));
			});

			it("rejects no-submission candidates without exploring later siblings", () => {
				const depths: number[] = [];
				const events: string[] = [];
				const source = observeForks((_state, depth) => {
					depths.push(depth);
					return [
						{ description: "no submission", apply: () => {} },
						{ description: "later sibling", apply: () => assert.fail("Must not continue") },
					];
				}, events);
				const histories = generateSharedTreeHistories(parent, source, 2);
				assert.throws(() => histories.next(), /Operation must submit a commit/);
				assert.deepEqual(depths, [0]);
				assert.deepEqual(events, ["create 0", "dispose 0"]);
				expectJsonTree(parent, multiFieldContent(["A"], ["B"]));
			});

			for (const length of [-1, 0.5, 1.5, Number.NaN, Infinity, -Infinity]) {
				it(`rejects invalid length ${length}`, () => {
					const histories = generateSharedTreeHistories(
						parent,
						() => {
							assert.fail("Invalid length must not request candidates");
						},
						length,
					);
					assert.throws(
						() => histories.next(),
						/History length must be a nonnegative integer/,
					);
				});
			}

			for (const failure of [
				"apply",
				"enumeration",
				"no submission",
				"open transaction",
				"multiple commits",
			] as const) {
				it(`cleans up nested exploration after failure: ${failure}`, () => {
					const events: string[] = [];
					const expected = new Error("generation failed");
					const source = observeForks(function* (_state, depth) {
						if (depth === 1 && failure === "enumeration") {
							throw expected;
						}
						yield {
							description: `clear at ${depth}`,
							apply: (child: TreeCheckout) => {
								if (depth === 1 && failure === "no submission") {
									return;
								}
								if (depth === 1 && (failure === "apply" || failure === "open transaction")) {
									child.transaction.start();
								}
								applyMultiFieldOperation(child, { type: "clearOptional" });
								if (depth === 1 && failure === "apply") {
									throw expected;
								}
								if (depth === 1 && failure === "multiple commits") {
									applyMultiFieldOperation(child, { type: "clearOptional" });
								}
							},
						};
					}, events);
					const histories = generateSharedTreeHistories(parent, source, 2);
					assert.throws(
						() => histories.next(),
						(error: unknown) => {
							if (failure === "apply" || failure === "enumeration") {
								assert.equal(error, expected);
							} else {
								assert(error instanceof Error);
								assert.match(
									error.message,
									failure === "open transaction"
										? /Operation left a transaction open/
										: failure === "no submission"
											? /Operation must submit a commit/
											: /Operation must submit at most one commit/,
								);
							}
							return true;
						},
					);
					assert.deepEqual(
						events,
						failure === "enumeration"
							? ["create 0", "dispose 0"]
							: ["create 0", "create 1", "dispose 1", "dispose 0"],
					);
					assert.equal(parent.transaction.size, 0);
					expectJsonTree(parent, multiFieldContent(["A"], ["B"]));
				});
			}
		});
	}
});
