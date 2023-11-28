/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	CrossFieldManager,
	NodeChangeset,
	RemovedTreesFromChild,
} from "../../../feature-libraries";
import {
	makeAnonChange,
	TaggedChange,
	Delta,
	mintRevisionTag,
	tagChange,
	tagRollbackInverse,
	makeDetachedNodeId,
	FieldKey,
} from "../../../core";
import { brand, fakeIdAllocator } from "../../../util";
import {
	optionalChangeHandler,
	optionalChangeRebaser,
	optionalFieldEditor,
	optionalFieldIntoDelta,
	OptionalChangeset,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/optional-field";
import { assertFieldChangesEqual, defaultRevisionMetadataFromChanges } from "../../utils";
import { changesetForChild, fooKey, testTree, testTreeCursor } from "../fieldKindTestUtils";
import { assertEqual } from "./optionalFieldUtils";

/**
 * A change to a child encoding as a simple placeholder string.
 * This change has no actual meaning, and can be used in tests where the type of child change in not relevant.
 */
const arbitraryChildChange = changesetForChild("arbitraryChildChange");

const nodeChange1 = changesetForChild("nodeChange1");
const nodeChange2 = changesetForChild("nodeChange2");

const failCrossFieldManager: CrossFieldManager = {
	get: () => assert.fail("Should query CrossFieldManager"),
	set: () => assert.fail("Should modify CrossFieldManager"),
};

const deltaFromChild1 = ({ change, revision }: TaggedChange<NodeChangeset>): Delta.FieldMap => {
	assert.deepEqual(change, nodeChange1);
	const buildId = makeDetachedNodeId(revision, 1);
	return new Map<FieldKey, Delta.FieldChanges>([
		[
			fooKey,
			{
				build: [{ id: buildId, trees: [testTreeCursor("nodeChange1")] }],
				local: [
					{
						count: 1,
						detach: makeDetachedNodeId(revision, 0),
						attach: buildId,
					},
				],
			},
		],
	]);
};

const deltaFromChild2 = ({ change, revision }: TaggedChange<NodeChangeset>): Delta.FieldMap => {
	assert.deepEqual(change, nodeChange2);
	const buildId = makeDetachedNodeId(revision, 1);
	return new Map<FieldKey, Delta.FieldChanges>([
		[
			fooKey,
			{
				build: [{ id: buildId, trees: [testTreeCursor("nodeChange2")] }],
				local: [
					{
						count: 1,
						detach: makeDetachedNodeId(revision, 0),
						attach: buildId,
					},
				],
			},
		],
	]);
};

const tag = mintRevisionTag();
const change1: TaggedChange<OptionalChangeset> = tagChange(
	{
		build: [{ id: { localId: brand(41) }, set: testTree("tree1") }],
		moves: [[{ localId: brand(41) }, "self", "nodeTargeting"]],
		childChanges: [["self", nodeChange1]],
		reservedDetachId: { localId: brand(1) },
	},
	tag,
);

const change2: TaggedChange<OptionalChangeset> = tagChange(
	optionalFieldEditor.set(testTreeCursor("tree2"), false, { fill: brand(42), detach: brand(2) }),
	mintRevisionTag(),
);

const revertChange2: TaggedChange<OptionalChangeset> = tagChange(
	{
		moves: [
			[{ localId: brand(2) }, "self", "nodeTargeting"],
			["self", { localId: brand(42) }, "cellTargeting"],
		],
		childChanges: [],
		build: [],
	},
	mintRevisionTag(),
);

/**
 * Represents what change2 would have been had it been concurrent with change1.
 */
const change2PreChange1: TaggedChange<OptionalChangeset> = tagChange(
	optionalFieldEditor.set(testTreeCursor("tree2"), true, { fill: brand(42), detach: brand(2) }),
	change2.revision,
);

const change4: TaggedChange<OptionalChangeset> = tagChange(
	optionalFieldEditor.buildChildChange(0, nodeChange2),
	mintRevisionTag(),
);

// TODO: unit test standalone functions from optionalField.ts
describe("optionalField", () => {
	// TODO: more editor tests
	describe("editor", () => {
		it("can be created", () => {
			const actual: OptionalChangeset = optionalFieldEditor.set(testTreeCursor("x"), true, {
				fill: brand(42),
				detach: brand(43),
			});
			const expected: OptionalChangeset = {
				build: [{ id: { localId: brand(42) }, set: testTree("x") }],
				moves: [[{ localId: brand(42) }, "self", "nodeTargeting"]],
				childChanges: [],
				reservedDetachId: { localId: brand(43) },
			};
			assert.deepEqual(actual, expected);
		});
	});

	describe("optionalChangeRebaser", () => {
		it("can be composed", () => {
			const simpleChildComposer = (changes: TaggedChange<NodeChangeset>[]) => {
				assert.equal(changes.length, 1);
				return changes[0].change;
			};
			const composed = optionalChangeRebaser.compose(
				[change1, change2],
				simpleChildComposer,
				fakeIdAllocator,
				failCrossFieldManager,
				defaultRevisionMetadataFromChanges([change1, change2]),
			);

			const change1And2: OptionalChangeset = {
				build: [
					{
						id: { localId: brand(41), revision: change1.revision },
						set: testTree("tree1"),
					},
					{
						id: { localId: brand(42), revision: change2.revision },
						set: testTree("tree2"),
					},
				],
				moves: [
					[
						{ localId: brand(41), revision: change1.revision },
						{ localId: brand(2), revision: change2.revision },
						"nodeTargeting",
					],
					[{ localId: brand(42), revision: change2.revision }, "self", "nodeTargeting"],
				],
				childChanges: [[{ localId: brand(2), revision: change2.revision }, nodeChange1]],
				reservedDetachId: { localId: brand(1), revision: change1.revision },
			};

			assertEqual(makeAnonChange(composed), makeAnonChange(change1And2));
		});

		it("can compose child changes", () => {
			const expected: OptionalChangeset = {
				build: [
					{
						id: { localId: brand(41), revision: change1.revision },
						set: testTree("tree1"),
					},
				],
				moves: [
					[{ localId: brand(41), revision: change1.revision }, "self", "nodeTargeting"],
				],
				childChanges: [["self", arbitraryChildChange]],
				reservedDetachId: { localId: brand(1), revision: change1.revision },
			};

			assert.deepEqual(
				optionalChangeRebaser.compose(
					[change1, change4],
					(changes: TaggedChange<NodeChangeset>[]): NodeChangeset => {
						assert.deepEqual(
							changes.map((c) => c.change),
							[nodeChange1, nodeChange2],
						);
						return arbitraryChildChange;
					},
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([change1, change4]),
				),
				expected,
			);
		});

		it("can be inverted", () => {
			const childInverter = (change: NodeChangeset) => {
				assert.deepEqual(change, nodeChange1);
				return nodeChange2;
			};

			const expected: OptionalChangeset = {
				build: [],
				moves: [
					["self", { localId: brand(41), revision: change1.revision }, "cellTargeting"],
				],
				childChanges: [[{ localId: brand(41), revision: change1.revision }, nodeChange2]],
			};

			assert.deepEqual(
				optionalChangeRebaser.invert(
					change1,
					childInverter,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([change1]),
				),
				expected,
			);
		});

		describe("Rebasing", () => {
			it("can be rebased", () => {
				const childRebaser = (
					_change: NodeChangeset | undefined,
					_base: NodeChangeset | undefined,
				) => assert.fail("Should not be called");
				assert.deepEqual(
					optionalChangeRebaser.rebase(
						change2PreChange1.change,
						change1,
						childRebaser,
						fakeIdAllocator,
						failCrossFieldManager,
						defaultRevisionMetadataFromChanges([change1]),
					),
					change2.change,
				);
			});

			it("can rebase child change", () => {
				const baseChange: OptionalChangeset = {
					build: [],
					moves: [],
					childChanges: [["self", nodeChange1]],
				};
				const changeToRebase: OptionalChangeset = {
					build: [],
					moves: [],
					childChanges: [["self", nodeChange2]],
				};

				const childRebaser = (
					change: NodeChangeset | undefined,
					base: NodeChangeset | undefined,
				): NodeChangeset | undefined => {
					assert.deepEqual(change, nodeChange2);
					assert.deepEqual(base, nodeChange1);
					return arbitraryChildChange;
				};

				const expected: OptionalChangeset = {
					build: [],
					moves: [],
					childChanges: [["self", arbitraryChildChange]],
				};

				assert.deepEqual(
					optionalChangeRebaser.rebase(
						changeToRebase,
						makeAnonChange(baseChange),
						childRebaser,
						fakeIdAllocator,
						failCrossFieldManager,
						defaultRevisionMetadataFromChanges([]),
					),
					expected,
				);
			});

			it("can rebase a child change over a delete and revive of target node", () => {
				const tag1 = mintRevisionTag();
				const tag2 = mintRevisionTag();
				const changeToRebase = optionalFieldEditor.buildChildChange(0, nodeChange1);
				const deletion = tagChange(optionalFieldEditor.clear(false, brand(1)), tag1);
				const revive = tagRollbackInverse(
					optionalChangeRebaser.invert(
						deletion,
						() => assert.fail("Should not need to invert children"),
						fakeIdAllocator,
						failCrossFieldManager,
						defaultRevisionMetadataFromChanges([deletion]),
					),
					tag2,
					tag1,
				);

				const childRebaser = (
					nodeChange: NodeChangeset | undefined,
					baseNodeChange: NodeChangeset | undefined,
				) => {
					assert(baseNodeChange === undefined);
					assert(nodeChange === nodeChange1);
					return nodeChange;
				};

				const changeToRebase2 = optionalChangeRebaser.rebase(
					changeToRebase,
					deletion,
					childRebaser,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([deletion]),
				);

				const changeToRebase3 = optionalChangeRebaser.rebase(
					changeToRebase2,
					revive,
					childRebaser,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([revive]),
				);

				assert.deepEqual(changeToRebase3, changeToRebase);
			});

			it("can rebase child change (field change ↷ field change)", () => {
				const baseChange: OptionalChangeset = {
					build: [],
					moves: [["self", { localId: brand(0) }, "cellTargeting"]],
					childChanges: [[{ localId: brand(0) }, nodeChange1]],
				};
				const taggedBaseChange = tagChange(baseChange, mintRevisionTag());

				// Note: this sort of change (has field changes as well as nested child changes)
				// can only be created for production codepaths using transactions.
				const changeToRebase: OptionalChangeset = {
					build: [
						{ id: { localId: brand(41) }, set: { type: brand("value"), value: "X" } },
					],
					moves: [
						[{ localId: brand(41) }, "self", "nodeTargeting"],
						["self", { localId: brand(1) }, "cellTargeting"],
					],
					childChanges: [[{ localId: brand(1) }, nodeChange2]],
				};

				const childRebaser = (
					change: NodeChangeset | undefined,
					base: NodeChangeset | undefined,
				): NodeChangeset | undefined => {
					assert.deepEqual(change, nodeChange2);
					assert.deepEqual(base, nodeChange1);
					return arbitraryChildChange;
				};

				const expected: OptionalChangeset = {
					build: [
						{ id: { localId: brand(41) }, set: { type: brand("value"), value: "X" } },
					],
					// TODO:AB#6298: This test case demonstrates a problem with rebasing transactions:
					// we don't realize that { localId: brand(1) } no longer refers to the right node
					// because we rebased over a change that detaches that node. We either need to augment
					// this with a move from { localId: brand(0), revision: taggedBaseChange.revision } => { localId: brand(1) }
					// OR update the child change here to refer to { localId: brand(0), revision: taggedBaseChange.revision }!
					// Right now we do things inconsistently with 'self' due to how renamedDsts works in optional field, which causes this bug.
					moves: [[{ localId: brand(41) }, "self", "nodeTargeting"]],
					childChanges: [[{ localId: brand(1) }, arbitraryChildChange]],
					// See comment above: this may need to change as well.
					reservedDetachId: { localId: brand(1) },
				};

				const actual = optionalChangeRebaser.rebase(
					changeToRebase,
					taggedBaseChange,
					childRebaser,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([taggedBaseChange]),
				);
				assert.deepEqual(actual, expected);
			});
		});
	});

	describe("optionalFieldIntoDelta", () => {
		it("can be converted to a delta when field was empty", () => {
			const outerNodeId = makeDetachedNodeId(tag, 41);
			const innerNodeId = makeDetachedNodeId(tag, 1);
			const expected: Delta.FieldChanges = {
				build: [{ id: outerNodeId, trees: [testTreeCursor("tree1")] }],
				global: [
					{
						id: outerNodeId,
						fields: new Map<FieldKey, Delta.FieldChanges>([
							[
								fooKey,
								{
									build: [
										{
											id: innerNodeId,
											trees: [testTreeCursor("nodeChange1")],
										},
									],
									local: [
										{
											count: 1,
											attach: innerNodeId,
											detach: { major: tag, minor: 0 },
										},
									],
								},
							],
						]),
					},
				],
				local: [{ count: 1, attach: outerNodeId }],
			};

			const actual = optionalFieldIntoDelta(change1, (change) =>
				deltaFromChild1(tagChange(change, tag)),
			);
			assertFieldChangesEqual(actual, expected);
		});

		it("can be converted to a delta when restoring content", () => {
			const expected: Delta.FieldChanges = {
				local: [
					{
						count: 1,
						attach: { major: revertChange2.revision, minor: 2 },
						detach: { major: revertChange2.revision, minor: 42 },
					},
				],
			};

			const actual = optionalFieldIntoDelta(revertChange2, (change) =>
				deltaFromChild1(tagChange(change, revertChange2.revision)),
			);
			assertFieldChangesEqual(actual, expected);
		});

		it("can be converted to a delta with only child changes", () => {
			const expected: Delta.FieldChanges = {
				local: [
					{
						count: 1,
						fields: new Map<FieldKey, Delta.FieldChanges>([
							[
								fooKey,
								{
									build: [
										{
											id: { major: tag, minor: 1 },
											trees: [testTreeCursor("nodeChange2")],
										},
									],
									local: [
										{
											count: 1,
											attach: { major: tag, minor: 1 },
											detach: { major: tag, minor: 0 },
										},
									],
								},
							],
						]),
					},
				],
			};
			assertFieldChangesEqual(
				optionalFieldIntoDelta(change4, (change) =>
					deltaFromChild2(tagChange(change, tag)),
				),
				expected,
			);
		});
	});

	describe("relevantRemovedTrees", () => {
		const fill = tagChange(
			optionalFieldEditor.set(testTreeCursor(""), true, { detach: brand(1), fill: brand(2) }),
			mintRevisionTag(),
		);
		const clear = tagChange(optionalFieldEditor.clear(false, brand(1)), mintRevisionTag());
		const hasChildChanges = tagChange(
			optionalFieldEditor.buildChildChange(0, nodeChange1),
			mintRevisionTag(),
		);
		const relevantNestedTree = { major: "Child revision", minor: 4242 };
		const failingDelegate: RemovedTreesFromChild = (): never =>
			assert.fail("Should not be called");
		const noTreesDelegate: RemovedTreesFromChild = () => [];
		const oneTreeDelegate: RemovedTreesFromChild = (child) => {
			assert.deepEqual(child, nodeChange1);
			return [relevantNestedTree];
		};
		describe("does not include", () => {
			it("a tree being inserted", () => {
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedTrees(fill.change, noTreesDelegate),
				);
				assert.deepEqual(actual, []);
			});
			it("a tree with child changes being inserted", () => {
				const changes = [fill, hasChildChanges];
				const fillAndChange = optionalChangeRebaser.compose(
					changes,
					(): NodeChangeset => nodeChange1,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges(changes),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedTrees(fillAndChange, noTreesDelegate),
				);
				assert.deepEqual(actual, []);
			});
			it("a tree being removed", () => {
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedTrees(clear.change, noTreesDelegate),
				);
				assert.deepEqual(actual, []);
			});
			it("a tree with child changes being removed", () => {
				const changes = [hasChildChanges, clear];
				const changeAndClear = optionalChangeRebaser.compose(
					changes,
					(): NodeChangeset => nodeChange1,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges(changes),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedTrees(changeAndClear, noTreesDelegate),
				);
				assert.deepEqual(actual, []);
			});
			it("a tree that remains untouched", () => {
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedTrees(
						{ build: [], moves: [], childChanges: [] },
						noTreesDelegate,
					),
				);
				assert.deepEqual(actual, []);
			});
			it("a tree that remains untouched aside from child changes", () => {
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedTrees(
						hasChildChanges.change,
						noTreesDelegate,
					),
				);
				assert.deepEqual(actual, []);
			});
		});
		describe("does include", () => {
			it("a tree being restored", () => {
				const restore = optionalChangeRebaser.invert(
					clear,
					() => assert.fail("Should not need to invert children"),
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([clear]),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedTrees(restore, failingDelegate),
				);
				const expected = [makeDetachedNodeId(clear.revision, 1)];
				assert.deepEqual(actual, expected);
			});
			it("a tree that remains removed but has nested changes", () => {
				const rebasedNestedChange = optionalChangeRebaser.rebase(
					hasChildChanges.change,
					clear,
					() => nodeChange1,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([clear, hasChildChanges]),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedTrees(
						rebasedNestedChange,
						noTreesDelegate,
					),
				);
				const expected = [makeDetachedNodeId(clear.revision, 1)];
				assert.deepEqual(actual, expected);
			});
			it("relevant trees from nested changes under a tree being inserted", () => {
				const changes = [fill, hasChildChanges];
				const fillAndChange = optionalChangeRebaser.compose(
					changes,
					(): NodeChangeset => nodeChange1,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges(changes),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedTrees(fillAndChange, oneTreeDelegate),
				);
				assert.deepEqual(actual, [relevantNestedTree]);
			});
			it("relevant trees from nested changes under a tree being removed", () => {
				const changes = [hasChildChanges, clear];
				const changeAndClear = optionalChangeRebaser.compose(
					changes,
					(): NodeChangeset => nodeChange1,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges(changes),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedTrees(changeAndClear, oneTreeDelegate),
				);
				assert.deepEqual(actual, [relevantNestedTree]);
			});
			it("relevant trees from nested changes under a tree being restored", () => {
				const restore = tagChange(
					optionalChangeRebaser.invert(
						clear,
						() => assert.fail("Should not need to invert children"),
						fakeIdAllocator,
						failCrossFieldManager,
						defaultRevisionMetadataFromChanges([clear]),
					),
					mintRevisionTag(),
				);
				const changes = [restore, hasChildChanges];
				const restoreAndChange = optionalChangeRebaser.compose(
					changes,
					(): NodeChangeset => nodeChange1,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges(changes),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedTrees(restoreAndChange, oneTreeDelegate),
				);
				const expected = [makeDetachedNodeId(clear.revision, 1), relevantNestedTree];
				assert.deepEqual(actual, expected);
			});
			it("relevant trees from nested changes under a tree that remains removed", () => {
				const rebasedNestedChange = optionalChangeRebaser.rebase(
					hasChildChanges.change,
					clear,
					() => nodeChange1,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([clear, hasChildChanges]),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedTrees(
						rebasedNestedChange,
						oneTreeDelegate,
					),
				);
				const expected = [makeDetachedNodeId(clear.revision, 1), relevantNestedTree];
				assert.deepEqual(actual, expected);
			});
			it("relevant trees from nested changes under a tree that remains in-doc ", () => {
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedTrees(
						hasChildChanges.change,
						oneTreeDelegate,
					),
				);
				assert.deepEqual(actual, [relevantNestedTree]);
			});
		});
	});
});
