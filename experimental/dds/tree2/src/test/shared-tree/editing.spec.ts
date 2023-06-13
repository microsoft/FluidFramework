/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { unreachableCase } from "@fluidframework/common-utils";

import { singleJsonCursor } from "../../domains";
import { rootFieldKeySymbol, UpPath, moveToDetachedField, FieldUpPath } from "../../core";
import { JsonCompatible, brand, makeArray } from "../../util";
import { makeTreeFromJson, remove, insert, expectJsonTree } from "../utils";
import { SharedTreeView } from "../../shared-tree";

describe("Editing", () => {
	describe("Sequence Field", () => {
		it("can order concurrent inserts within concurrently deleted content", () => {
			const tree = makeTreeFromJson(["A", "B", "C", "D"]);
			const delAB = tree.fork();
			const delCD = tree.fork();
			const addX = tree.fork();
			const addY = tree.fork();

			// Make deletions in two steps to ensure that gap tracking handles comparing insertion places that
			// were affected by different deletes.
			remove(delAB, 0, 2);
			remove(delCD, 2, 2);
			insert(addX, 1, "x");
			insert(addY, 3, "y");

			tree.merge(delAB);
			tree.merge(delCD);
			tree.merge(addX);
			tree.merge(addY);

			delAB.rebaseOnto(tree);
			delCD.rebaseOnto(tree);
			addX.rebaseOnto(tree);
			addY.rebaseOnto(tree);

			expectJsonTree([tree, delAB, delCD, addX, addY], ["x", "y"]);
		});

		it.skip("can rebase a change under a node whose insertion is also rebased", () => {
			const tree1 = makeTreeFromJson(["B"]);
			const tree2 = tree1.fork();
			const tree3 = tree1.fork();

			insert(tree2, 1, "C");
			insert(tree3, 0, "A");
			tree3.editor.setValue(
				{ parent: undefined, parentField: rootFieldKeySymbol, parentIndex: 0 },
				"a",
			);

			tree1.merge(tree2);
			tree1.merge(tree3);

			tree2.rebaseOnto(tree1);
			tree3.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2, tree3], ["a", "B", "C"]);
		});

		it("can handle competing deletes", () => {
			for (const index of [0, 1, 2, 3]) {
				const startingState = ["A", "B", "C", "D"];
				const tree = makeTreeFromJson(startingState);
				const tree1 = tree.fork();
				const tree2 = tree.fork();
				const tree3 = tree.fork();

				remove(tree1, index, 1);
				remove(tree2, index, 1);
				remove(tree3, index, 1);

				tree.merge(tree1);
				tree.merge(tree2);
				tree.merge(tree3);

				tree1.rebaseOnto(tree);
				tree2.rebaseOnto(tree);
				tree3.rebaseOnto(tree);

				const expected = [...startingState];
				expected.splice(index, 1);
				expectJsonTree([tree, tree1, tree2, tree3], expected);
			}
		});

		it("can rebase local dependent inserts", () => {
			const tree1 = makeTreeFromJson(["y"]);
			const tree2 = tree1.fork();

			insert(tree1, 0, "x");

			insert(tree2, 1, "a", "c");
			insert(tree2, 2, "b");

			expectJsonTree(tree2, ["y", "a", "b", "c"]);

			// Get an anchor to node b
			const cursor = tree2.forest.allocateCursor();
			moveToDetachedField(tree2.forest, cursor);
			cursor.enterNode(2);
			assert.equal(cursor.value, "b");
			const anchor = cursor.buildAnchor();
			cursor.free();

			tree1.merge(tree2);
			tree2.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2], ["x", "y", "a", "b", "c"]);

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const { parent, parentField, parentIndex } = tree2.locate(anchor)!;
			const expectedPath: UpPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 3,
			};
			assert.deepEqual({ parent, parentField, parentIndex }, expectedPath);
		});

		it("can rebase a local delete", () => {
			const addW = makeTreeFromJson(["x", "y"]);
			const delY = addW.fork();

			remove(delY, 1, 1);
			insert(addW, 0, "w");

			addW.merge(delY);
			delY.rebaseOnto(addW);

			expectJsonTree([addW, delY], ["w", "x"]);
		});

		it("inserts that concurrently target the same insertion point do not interleave their contents", () => {
			const tree = makeTreeFromJson([]);
			const abc = tree.fork();
			const rst = tree.fork();
			const xyz = tree.fork();

			insert(abc, 0, "a", "b", "c");
			insert(rst, 0, "r", "s", "t");
			insert(xyz, 0, "x", "y", "z");

			tree.merge(xyz);
			tree.merge(rst);
			tree.merge(abc);

			xyz.rebaseOnto(tree);
			rst.rebaseOnto(tree);
			abc.rebaseOnto(tree);

			expectJsonTree([tree, abc, rst, xyz], ["a", "b", "c", "r", "s", "t", "x", "y", "z"]);
		});

		it("merge-left tie-breaking does not interleave concurrent left to right inserts", () => {
			const tree = makeTreeFromJson([]);
			const a = tree.fork();
			const r = tree.fork();
			const x = tree.fork();

			insert(a, 0, "a");
			const b = a.fork();
			insert(b, 1, "b");
			const c = b.fork();
			insert(c, 2, "c");

			insert(r, 0, "r");
			const s = r.fork();
			insert(s, 1, "s");
			const t = s.fork();
			insert(s, 2, "t");

			insert(x, 0, "x");
			const y = x.fork();
			insert(y, 1, "y");
			const z = y.fork();
			insert(z, 2, "z");

			tree.merge(x);
			tree.merge(r);
			tree.merge(a);
			tree.merge(s);
			tree.merge(b);
			tree.merge(y);
			tree.merge(c);
			tree.merge(z);
			tree.merge(t);

			c.rebaseOnto(tree);
			t.rebaseOnto(tree);
			z.rebaseOnto(tree);

			expectJsonTree([tree, c, t, z], ["a", "b", "c", "r", "s", "t", "x", "y", "z"]);
		});

		// The current implementation orders the letters from inserted last to inserted first.
		// This is due to the hard-coded merge-left policy.
		// Having merge-right tie-breaking does preserve groupings but in a first-to-last order
		// which is the desired outcome for RTL text.
		// TODO: update and activate this test once merge-right is supported.
		it.skip("merge-right tie-breaking does not interleave concurrent right to left inserts", () => {
			const tree = makeTreeFromJson([]);
			const c = tree.fork();
			const t = tree.fork();
			const z = tree.fork();

			insert(c, 0, "c");
			const b = c.fork();
			insert(b, 0, "b");
			const a = b.fork();
			insert(a, 0, "a");

			insert(t, 0, "t");
			const s = t.fork();
			insert(s, 0, "s");
			const r = s.fork();
			insert(r, 0, "r");

			insert(z, 0, "z");
			const y = z.fork();
			insert(y, 0, "y");
			const x = y.fork();
			insert(x, 0, "x");

			tree.merge(z);
			tree.merge(t);
			tree.merge(c);
			tree.merge(s);
			tree.merge(b);
			tree.merge(y);
			tree.merge(a);
			tree.merge(x);
			tree.merge(r);

			a.rebaseOnto(tree);
			r.rebaseOnto(tree);
			x.rebaseOnto(tree);

			expectJsonTree([tree, a, r, x], ["a", "b", "c", "r", "s", "t", "x", "y", "z"]);
		});

		// TODO: Enable once local branch repair data is supported
		it.skip("intentional revive", () => {
			const tree1 = makeTreeFromJson(["A", "B", "C"]);
			const tree2 = tree1.fork();

			remove(tree1, 1, 1);

			remove(tree2, 0, 3);
			tree2.undo();

			tree1.merge(tree2);
			tree2.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2], ["a", "b", "c"]);
		});

		it("intra-field move", () => {
			const tree1 = makeTreeFromJson(["A", "B"]);

			tree1.editor
				.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				})
				.move(0, 1, 1);

			expectJsonTree(tree1, ["B", "A"]);
		});

		it.skip("can rebase intra-field move over insert", () => {
			const tree1 = makeTreeFromJson(["A", "B"]);
			const tree2 = tree1.fork();

			insert(tree1, 2, "C");

			tree2.editor
				.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				})
				.move(0, 1, 1);

			tree1.merge(tree2);
			tree2.rebaseOnto(tree1);
			expectJsonTree(tree1, ["B", "A", "C"]);
			expectJsonTree(tree2, ["B", "A", "C"]);
		});

		it("can concurrently change node's value and move node", () => {
			const tree1 = makeTreeFromJson(["A", "B"]);
			const tree2 = tree1.fork();

			// Change value of B to C
			tree1.editor.setValue(
				{ parent: undefined, parentField: rootFieldKeySymbol, parentIndex: 1 },
				"C",
			);

			// Move B before A.
			tree2.editor.move(
				{ parent: undefined, field: rootFieldKeySymbol },
				1,
				1,
				{ parent: undefined, field: rootFieldKeySymbol },
				0,
			);

			tree1.merge(tree2);
			tree2.rebaseOnto(tree1);

			const expectedState: JsonCompatible = ["C", "A"];
			expectJsonTree(tree1, expectedState);
			expectJsonTree(tree2, expectedState);
		});

		it("can concurrently move node and change node's value", () => {
			const tree1 = makeTreeFromJson(["A", "B"]);
			const tree2 = tree1.fork();

			// Move B before A.
			tree1.editor.move(
				{ parent: undefined, field: rootFieldKeySymbol },
				1,
				1,
				{ parent: undefined, field: rootFieldKeySymbol },
				0,
			);

			// Change value of B to C
			tree2.editor.setValue(
				{ parent: undefined, parentField: rootFieldKeySymbol, parentIndex: 1 },
				"C",
			);

			tree1.merge(tree2);
			tree2.rebaseOnto(tree1);

			const expectedState: JsonCompatible = ["C", "A"];
			expectJsonTree(tree1, expectedState);
			expectJsonTree(tree2, expectedState);
		});

		it("can rebase cross-field move over value change of moved node", () => {
			const tree1 = makeTreeFromJson({
				foo: ["A"],
				bar: ["B"],
			});
			const tree2 = tree1.fork();

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};

			const fooList: UpPath = { parent: rootPath, parentField: brand("foo"), parentIndex: 0 };
			const barList: UpPath = { parent: rootPath, parentField: brand("bar"), parentIndex: 0 };

			// Change value of A to C
			tree1.editor.setValue({ parent: fooList, parentField: brand(""), parentIndex: 0 }, "C");

			// Move A after B.
			tree2.editor.move(
				{ parent: fooList, field: brand("") },
				0,
				1,
				{ parent: barList, field: brand("") },
				1,
			);

			const expectedState: JsonCompatible = [
				{
					foo: [],
					bar: ["B", "C"],
				},
			];

			tree1.merge(tree2);
			tree2.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2], expectedState);
		});

		it("can rebase value change over cross-field move of changed node", () => {
			const tree1 = makeTreeFromJson({
				foo: ["A"],
				bar: ["B"],
			});
			const tree2 = tree1.fork();

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};

			const fooList: UpPath = { parent: rootPath, parentField: brand("foo"), parentIndex: 0 };
			const barList: UpPath = { parent: rootPath, parentField: brand("bar"), parentIndex: 0 };

			// Move A after B.
			tree1.editor.move(
				{ parent: fooList, field: brand("") },
				0,
				1,
				{ parent: barList, field: brand("") },
				1,
			);

			// Change value of A to C
			tree2.editor.setValue({ parent: fooList, parentField: brand(""), parentIndex: 0 }, "C");

			const expectedState: JsonCompatible = [
				{
					foo: [],
					bar: ["B", "C"],
				},
			];

			tree1.merge(tree2);
			tree2.rebaseOnto(tree1);

			expectJsonTree(tree1, expectedState);
			expectJsonTree([tree1, tree2], expectedState);
		});

		it("move under move-out", () => {
			const tree1 = makeTreeFromJson([{ foo: ["a", "b"] }, "x"]);

			tree1.transaction.start();

			const node1: UpPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};
			const listNode: UpPath = {
				parent: node1,
				parentField: brand("foo"),
				parentIndex: 0,
			};
			const fooField = tree1.editor.sequenceField({ parent: listNode, field: brand("") });
			fooField.move(0, 1, 1);

			const rootField = tree1.editor.sequenceField({
				parent: undefined,
				field: rootFieldKeySymbol,
			});
			rootField.move(0, 1, 1);

			tree1.transaction.commit();

			expectJsonTree(tree1, ["x", { foo: ["b", "a"] }]);
		});

		it("rebase changes to field untouched by base", () => {
			const tree = makeTreeFromJson({ foo: [{ bar: "A" }, "B"] });
			const tree1 = tree.fork();
			const tree2 = tree.fork();

			const rootNode: UpPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};
			const fooList: UpPath = {
				parent: rootNode,
				parentField: brand("foo"),
				parentIndex: 0,
			};
			const foo1: UpPath = {
				parent: fooList,
				parentField: brand(""),
				parentIndex: 0,
			};
			const nodeB: UpPath = {
				parent: fooList,
				parentField: brand(""),
				parentIndex: 1,
			};

			tree1.editor.setValue(nodeB, "b");
			tree2.editor.sequenceField({ parent: foo1, field: brand("bar") }).delete(0, 1);

			tree.merge(tree1);
			tree.merge(tree2);
			tree1.rebaseOnto(tree);
			tree2.rebaseOnto(tree);

			expectJsonTree([tree, tree1, tree2], [{ foo: [{}, "b"] }]);
		});

		describe.skip("Exhaustive removal tests", () => {
			// Toggle the constant below to run each scenario as a separate test.
			// This is useful to debug a specific scenario but makes CI and the test browser slower.
			// Note that if the numbers of nodes and peers are too high (more than 3 nodes and 3 peers),
			// then the number of scenarios overwhelms the test browser.
			// Should be committed with the constant set to false.
			const individualTests = false;
			const nbNodes = 3;
			const nbPeers = 3;
			const testRemoveRevive = true;
			const testMoveReturn = true;
			assert(testRemoveRevive || testMoveReturn, "No scenarios to run");

			const [outerFixture, innerFixture] = individualTests
				? [describe, it]
				: [it, (title: string, fn: () => void) => fn()];

			enum StepType {
				Remove,
				Undo,
			}
			interface RemoveStep {
				readonly type: StepType.Remove;
				/**
				 * The index of the removed node.
				 * Note that this index does not account for the removal of earlier nodes.
				 */
				readonly index: number;
				/**
				 * The index of the peer that removes the node.
				 */
				readonly peer: number;
			}

			interface UndoStep {
				readonly type: StepType.Undo;
				/**
				 * The index of the peer that performs the undo.
				 */
				readonly peer: number;
			}

			type ScenarioStep = RemoveStep | UndoStep;

			/**
			 * Generates all permutations for `nbNodes` and `nbPeers` such that:
			 * - Each node is removed exactly once.
			 * - Each removal is undone by the peer that removed it.
			 * The order of removals and undos is unique when considering which peer does what.
			 * This does mean that this function produces symmetrical scenarios such as:
			 * - D(i:0 p:0) D(i:1 p:1) U(1) U(0)
			 * - D(i:0 p:1) D(i:1 p:0) U(0) U(1)
			 * This is taken advantage of to test different network conditions (see {@link runScenario}).
			 */
			function buildScenarios(): Generator<readonly ScenarioStep[]> {
				interface ScenarioBuilderState {
					/**
					 * Whether the `i`th node has been removed.
					 * The index does not account for the removal of earlier nodes.
					 */
					removed: boolean[];
					/**
					 * The number of operations that the `i`th peer has yet to undo.
					 */
					peerUndoStack: number[];
				}

				const buildState: ScenarioBuilderState = {
					removed: makeArray(nbNodes, () => false),
					peerUndoStack: makeArray(nbPeers, () => 0),
				};

				/**
				 * Generates all permutations with prefix `scenario`
				 */
				function* buildScenariosWithPrefix(
					scenario: ScenarioStep[] = [],
				): Generator<readonly ScenarioStep[]> {
					let done = true;
					for (let p = 0; p < nbPeers; p++) {
						for (let i = 0; i < nbNodes; i++) {
							if (!buildState.removed[i]) {
								buildState.removed[i] = true;
								buildState.peerUndoStack[p] += 1;
								yield* buildScenariosWithPrefix([
									...scenario,
									{ type: StepType.Remove, index: i, peer: p },
								]);
								buildState.peerUndoStack[p] -= 1;
								buildState.removed[i] = false;
								done = false;
							}
						}
						if (buildState.peerUndoStack[p] > 0) {
							buildState.peerUndoStack[p] -= 1;
							yield* buildScenariosWithPrefix([
								...scenario,
								{ type: StepType.Undo, peer: p },
							]);
							buildState.peerUndoStack[p] += 1;
							done = false;
						}
					}
					if (done) {
						yield scenario;
					}
				}
				return buildScenariosWithPrefix();
			}

			const delAction = (peer: SharedTreeView, idx: number) => remove(peer, idx, 1);
			const srcField: FieldUpPath = { parent: undefined, field: rootFieldKeySymbol };
			const dstField: FieldUpPath = { parent: undefined, field: brand("dst") };
			const moveAction = (peer: SharedTreeView, idx: number) =>
				peer.editor.move(srcField, idx, 1, dstField, 0);

			/**
			 * Runs the given `scenario` using either delete or move operations.
			 * Verifies that the final state is the same as the initial state.
			 * Simulates different peers learning of the same edit at different times.
			 * For example, given the following two (otherwise symmetrical) scenarios:
			 * 1) D(i:0 p:0) D(i:1 p:1) U(1) U(0)
			 * 2) D(i:0 p:1) D(i:1 p:0) U(0) U(1)
			 * In scenario 1, the peer that deletes N1 learns of the deletion of N0 beforehand.
			 * In scenario 2, the peer that deletes N1 learns of the deletion of N0 afterwards.
			 * @param scenario - The scenario to run through.
			 * @param useMove - When `true`, uses move operations. Otherwise, uses delete operations.
			 */
			function runScenario(scenario: readonly ScenarioStep[], useMove: boolean): void {
				const [verb, action] = useMove ? ["M", moveAction] : ["D", delAction];
				const title = scenario
					.map((s) => {
						switch (s.type) {
							case StepType.Remove:
								return `${verb}(i:${s.index} p:${s.peer})`;
							case StepType.Undo:
								return `U(${s.peer})`;
							default:
								unreachableCase(s);
						}
					})
					.join(" ");
				innerFixture(title, () => {
					// Indicator which keeps track of which nodes are present in the root field for a given peer.
					// Represented as an integer (0: removed, 1: present) to facilitate summing.
					// Used to compute the index of the next node to remove.
					const present = makeArray(nbPeers, () => makeArray(nbNodes, () => 1));
					// The number of remaining undos available for each peer.
					const undoQueues: number[][] = makeArray(nbPeers, () => []);

					const tree = makeTreeFromJson(startState);
					const peers = makeArray(nbPeers, () => tree.fork());
					for (const step of scenario) {
						const iPeer = step.peer;
						const peer = peers[iPeer];
						let presence: number;
						let affectedNode: number;
						switch (step.type) {
							case StepType.Remove: {
								const idx = present[iPeer]
									.slice(0, step.index)
									.reduce((a, b) => a + b, 0);
								action(peer, idx);
								presence = 0;
								affectedNode = step.index;
								undoQueues[iPeer].push(step.index);
								break;
							}
							case StepType.Undo: {
								peer.undo();
								presence = 1;
								// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
								affectedNode = undoQueues[iPeer].pop()!;
								break;
							}
							default:
								unreachableCase(step);
						}
						tree.merge(peer);
						// We only let peers with a higher index learn of this edit.
						// This breaks the symmetry between scenarios where the permutation of actions is the same
						// except for which peer does which set of actions.
						// It also helps simulate different peers learning of the same edit at different times.
						for (let downhillPeer = iPeer + 1; downhillPeer < nbPeers; downhillPeer++) {
							peers[downhillPeer].rebaseOnto(peer);
							present[downhillPeer][affectedNode] = presence;
						}
						present[iPeer][affectedNode] = presence;
					}
					peers.forEach((peer) => peer.rebaseOnto(tree));
					expectJsonTree([tree, ...peers], startState);
				});
			}

			const startState = makeArray(nbNodes, (n) => `N${n}`);
			const scenarios = buildScenarios();

			outerFixture("All Scenarios", () => {
				for (const scenario of scenarios) {
					if (testRemoveRevive) {
						runScenario(scenario, false);
					}
					if (testMoveReturn) {
						runScenario(scenario, true);
					}
				}
			});
		});
	});

	describe("Optional Field", () => {
		it.skip("can rebase an insert of and edit to a node", () => {
			const tree1 = makeTreeFromJson([]);
			const tree2 = tree1.fork();

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};

			// e1
			tree1.editor
				.optionalField({
					parent: undefined,
					field: rootFieldKeySymbol,
				})
				.set(singleJsonCursor("41"), true);

			// e2
			tree2.editor
				.optionalField({
					parent: undefined,
					field: rootFieldKeySymbol,
				})
				.set(singleJsonCursor("42"), true);

			// e3
			tree2.editor.setValue(rootPath, "43");

			// Rebasing e3 over e2⁻¹ mutes e3
			// Rebasing the muted e3 over e1 doesn't affect it
			// Rebasing the muted e3 over e2' fails to unmute the change because e2' is expressed
			// as `set` operation instead of a `revert`.
			tree1.merge(tree2);
			tree2.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2], ["43"]);
		});
	});
});
