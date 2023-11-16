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
import { assertFieldChangesEqual, defaultRevisionMetadataFromChanges } from "../../utils";
import {
	optionalChangeHandler,
	optionalChangeRebaser,
	optionalFieldEditor,
	optionalFieldIntoDelta,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/default-field-kinds/optionalField";
// eslint-disable-next-line import/no-internal-modules
import { OptionalChangeset } from "../../../feature-libraries/default-field-kinds/defaultFieldChangeTypes";
import { changesetForChild, fooKey, testTree, testTreeCursor } from "./fieldKindTestUtils";

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
		fieldChange: {
			id: brand(1),
			newContent: {
				set: testTree("tree1"),
				changes: nodeChange1,
				buildId: { localId: brand(41) },
			},
			wasEmpty: true,
		},
	},
	tag,
);

const change2: TaggedChange<OptionalChangeset> = tagChange(
	optionalFieldEditor.set(testTreeCursor("tree2"), false, brand(2), brand(42)),
	mintRevisionTag(),
);

const revertChange2: TaggedChange<OptionalChangeset> = tagChange(
	{
		fieldChange: {
			id: brand(2),
			newContent: {
				revert: { revision: change2.revision, localId: brand(2) },
			},
			wasEmpty: false,
		},
	},
	mintRevisionTag(),
);

/**
 * Represents what change2 would have been had it been concurrent with change1.
 */
const change2PreChange1: TaggedChange<OptionalChangeset> = tagChange(
	optionalFieldEditor.set(testTreeCursor("tree2"), true, brand(2), brand(42)),
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
			const actual: OptionalChangeset = optionalFieldEditor.set(
				testTreeCursor("x"),
				true,
				brand(42),
				brand(43),
			);
			const expected: OptionalChangeset = {
				fieldChange: {
					id: brand(42),
					newContent: { set: testTree("x"), buildId: { localId: brand(43) } },
					wasEmpty: true,
				},
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
				fieldChange: {
					id: brand(2),
					revision: change2.revision,
					newContent: { set: testTree("tree2"), buildId: { localId: brand(42) } },
					wasEmpty: true,
				},
				childChanges: [[{ revision: change2.revision, localId: brand(2) }, nodeChange1]],
			};

			assert.deepEqual(composed, change1And2);
		});

		it("can compose child changes", () => {
			const expected: OptionalChangeset = {
				fieldChange: {
					id: brand(1),
					revision: change1.revision,
					wasEmpty: true,
					newContent: {
						set: testTree("tree1"),
						buildId: { localId: brand(41) },
						changes: arbitraryChildChange,
					},
				},
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
				fieldChange: { id: brand(1), wasEmpty: false },
				childChanges: [["self", nodeChange2]],
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
				const baseChange: OptionalChangeset = { childChanges: [["self", nodeChange1]] };
				const changeToRebase: OptionalChangeset = { childChanges: [["self", nodeChange2]] };

				const childRebaser = (
					change: NodeChangeset | undefined,
					base: NodeChangeset | undefined,
				): NodeChangeset | undefined => {
					assert.deepEqual(change, nodeChange2);
					assert.deepEqual(base, nodeChange1);
					return arbitraryChildChange;
				};

				const expected: OptionalChangeset = {
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
					fieldChange: {
						id: brand(0),
						wasEmpty: false,
					},
					childChanges: [["self", nodeChange1]],
				};
				const changeToRebase: OptionalChangeset = {
					fieldChange: {
						id: brand(1),
						wasEmpty: false,
						newContent: {
							set: { type: brand("value"), value: "X" },
							buildId: { localId: brand(41) },
						},
					},
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
					fieldChange: {
						id: brand(1),
						wasEmpty: true,
						newContent: {
							set: { type: brand("value"), value: "X" },
							buildId: { localId: brand(41) },
						},
					},
					childChanges: [[{ localId: brand(0) }, arbitraryChildChange]],
				};

				const actual = optionalChangeRebaser.rebase(
					changeToRebase,
					makeAnonChange(baseChange),
					childRebaser,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([]),
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
						attach: { major: change2.revision, minor: 2 },
						detach: { major: revertChange2.revision, minor: 2 },
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
			optionalFieldEditor.set(testTreeCursor(""), true, brand(1), brand(2)),
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
					optionalChangeHandler.relevantRemovedTrees({}, noTreesDelegate),
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
