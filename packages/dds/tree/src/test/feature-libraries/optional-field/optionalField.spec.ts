/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	CrossFieldManager,
	RelevantRemovedRootsFromChild,
} from "../../../feature-libraries/index.js";
import {
	makeAnonChange,
	TaggedChange,
	tagChange,
	tagRollbackInverse,
	makeDetachedNodeId,
	FieldKey,
	DeltaFieldChanges,
	DeltaFieldMap,
} from "../../../core/index.js";
import { brand, fakeIdAllocator, idAllocatorFromMaxId } from "../../../util/index.js";
import {
	optionalChangeHandler,
	optionalChangeRebaser,
	optionalFieldEditor,
	optionalFieldIntoDelta,
	OptionalChangeset,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/optional-field/index.js";
import {
	assertFieldChangesEqual,
	defaultRevInfosFromChanges,
	defaultRevisionMetadataFromChanges,
	mintRevisionTag,
} from "../../utils.js";
import { fooKey } from "../fieldKindTestUtils.js";
// eslint-disable-next-line import/no-internal-modules
import { rebaseRevisionMetadataFromInfo } from "../../../feature-libraries/modular-schema/modularChangeFamily.js";
import { NodeId } from "../../../feature-libraries/modular-schema/modularChangeTypes.js";
import { Change, assertEqual } from "./optionalFieldUtils.js";
import { testSnapshots } from "./optionalFieldSnapshots.test.js";
import { testRebaserAxioms } from "./optionalChangeRebaser.test.js";
import { testCodecs } from "./optionalFieldChangeCodecs.test.js";
import { TestNodeId } from "../../testNodeId.js";
import { TestChange } from "../../testChange.js";

/**
 * A change to a child encoding as a simple placeholder string.
 * This change has no actual meaning, and can be used in tests where the type of child change in not relevant.
 */
const arbitraryChildChange: NodeId = { localId: brand(42) };

const nodeId1: NodeId = { localId: brand(1) };
const nodeId2: NodeId = { localId: brand(2) };

const nodeChange1 = TestNodeId.create(nodeId1, TestChange.mint([], 1));
const nodeChange2 = TestNodeId.create(nodeId2, TestChange.mint([], 2));

const failCrossFieldManager: CrossFieldManager = {
	get: () => assert.fail("Should query CrossFieldManager"),
	set: () => assert.fail("Should modify CrossFieldManager"),
};

const failingDelegate = (): never => assert.fail("Should not be called");

const deltaFromChild2 = (nodeId: NodeId): DeltaFieldMap => {
	assert.deepEqual(nodeId, nodeId2);
	const buildId = makeDetachedNodeId(nodeId.revision, 1);
	return new Map<FieldKey, DeltaFieldChanges>([
		[
			fooKey,
			{
				local: [
					{
						count: 1,
						detach: makeDetachedNodeId(nodeId.revision, 0),
						attach: buildId,
					},
				],
			},
		],
	]);
};

const tag = mintRevisionTag();
const change1 = tagChange(
	Change.atOnce(
		Change.reserve("self", brand(1)),
		Change.move(brand(41), "self"),
		Change.childAt(brand(41), nodeChange1),
	),
	tag,
);

const change2: TaggedChange<OptionalChangeset> = tagChange(
	optionalFieldEditor.set(false, { fill: brand(42), detach: brand(2) }),
	mintRevisionTag(),
);

const revertChange2: TaggedChange<OptionalChangeset> = tagChange(
	Change.atOnce(Change.clear("self", brand(42)), Change.move(brand(2), "self")),
	mintRevisionTag(),
);

/**
 * Represents what change2 would have been had it been concurrent with change1.
 */
const change2PreChange1: TaggedChange<OptionalChangeset> = tagChange(
	optionalFieldEditor.set(true, { fill: brand(42), detach: brand(2) }),
	change2.revision,
);

const change4: TaggedChange<OptionalChangeset> = tagChange(
	optionalFieldEditor.buildChildChange(0, TestNodeId.create(nodeId2, TestChange.mint([1], 2))),
	mintRevisionTag(),
);

// TODO: unit test standalone functions from optionalField.ts
describe("optionalField", () => {
	testSnapshots();
	testRebaserAxioms();
	testCodecs();

	// TODO: more editor tests
	describe("editor", () => {
		it("can be created", () => {
			const actual: OptionalChangeset = optionalFieldEditor.set(true, {
				fill: brand(42),
				detach: brand(43),
			});
			const expected = Change.atOnce(
				Change.reserve("self", brand(43)),
				Change.move(brand(42), "self"),
			);
			assertEqual(actual, expected);
		});
	});

	describe("Rebaser", () => {
		it("can be composed", () => {
			const composed = optionalChangeRebaser.compose(
				change1,
				change2,
				TestNodeId.composeChild,
				fakeIdAllocator,
				failCrossFieldManager,
				defaultRevisionMetadataFromChanges([change1, change2]),
			);

			const change1And2 = Change.atOnce(
				Change.move(
					{ localId: brand(41), revision: change1.revision },
					{ localId: brand(2), revision: change2.revision },
				),
				Change.move({ localId: brand(42), revision: change2.revision }, "self"),
				Change.reserve("self", { localId: brand(1), revision: change1.revision }),
				Change.childAt({ localId: brand(41), revision: change1.revision }, nodeChange1),
			);

			assertEqual(composed, change1And2);
		});

		it("can compose child changes", () => {
			const expected = Change.atOnce(
				Change.move({ localId: brand(41), revision: change1.revision }, "self"),
				Change.reserve("self", { localId: brand(1), revision: change1.revision }),
				Change.childAt(
					{ localId: brand(41), revision: change1.revision },
					TestNodeId.create(nodeId1, TestChange.mint([], [1, 2])),
				),
			);

			const composed = optionalChangeRebaser.compose(
				change1,
				change4,
				TestNodeId.composeChild,
				fakeIdAllocator,
				failCrossFieldManager,
				defaultRevisionMetadataFromChanges([change1, change4]),
			);

			assert.deepEqual(composed, expected);
		});

		describe("Invert", () => {
			function undo(change: TaggedChange<OptionalChangeset>): OptionalChangeset {
				return optionalChangeRebaser.invert(
					change,
					false,
					idAllocatorFromMaxId(),
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([change]),
				);
			}
			function rollback(change: TaggedChange<OptionalChangeset>): OptionalChangeset {
				return optionalChangeRebaser.invert(
					change,
					true,
					idAllocatorFromMaxId(),
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([change]),
				);
			}

			it("clear⁻¹", () => {
				const clear = Change.clear("self", brand(42));
				const actual = rollback(tagChange(clear, tag));
				const expected = Change.atOnce(
					Change.reserve("self", brand(0)),
					Change.move({ localId: brand(42), revision: tag }, "self"),
				);
				assertEqual(actual, expected);
			});

			it("undo(clear)", () => {
				const clear = Change.clear("self", brand(42));
				const actual = undo(tagChange(clear, tag));
				const expected = Change.atOnce(
					Change.reserve("self", brand(0)),
					Change.move({ localId: brand(42), revision: tag }, "self"),
				);
				assertEqual(actual, expected);
			});

			it("clear⁻²", () => {
				const clearInv = Change.atOnce(
					Change.reserve("self", brand(41)),
					Change.move(brand(42), "self"),
				);
				const actual = rollback(tagChange(clearInv, tag));
				const expected = Change.atOnce(
					Change.move("self", { localId: brand(42), revision: tag }),
				);
				assertEqual(actual, expected);
			});

			it("undo(clear⁻¹)", () => {
				const clearInv = Change.atOnce(
					Change.reserve("self", brand(41)),
					Change.move(brand(42), "self"),
				);
				const actual = undo(tagChange(clearInv, tag));
				const expected = Change.atOnce(Change.clear("self", brand(0)));
				assertEqual(actual, expected);
			});

			it("set+child⁻¹", () => {
				const expected = Change.atOnce(
					Change.child(nodeChange1),
					Change.move("self", { localId: brand(41), revision: change1.revision }),
				);
				const actual = rollback(change1);
				assertEqual(actual, expected);
			});

			it("undo(set+child)", () => {
				const expected = Change.atOnce(
					Change.child(nodeChange1),
					Change.move("self", { localId: brand(0) }),
				);
				const actual = undo(change1);
				assertEqual(actual, expected);
			});
		});

		describe("Rebasing", () => {
			it("can be rebased", () => {
				assert.deepEqual(
					optionalChangeRebaser.rebase(
						change2PreChange1.change,
						change1,
						failingDelegate,
						fakeIdAllocator,
						failCrossFieldManager,
						rebaseRevisionMetadataFromInfo(defaultRevInfosFromChanges([change1]), [
							change1.revision,
						]),
					),
					change2.change,
				);
			});

			it("can rebase child change", () => {
				const baseChange = Change.child(TestNodeId.create(nodeId1, TestChange.mint([], 1)));
				const changeToRebase = Change.child(
					TestNodeId.create(nodeId2, TestChange.mint([], 2)),
				);

				const expected = Change.child(TestNodeId.create(nodeId2, TestChange.mint([1], 2)));

				assert.deepEqual(
					optionalChangeRebaser.rebase(
						changeToRebase,
						makeAnonChange(baseChange),
						TestNodeId.rebaseChild,
						fakeIdAllocator,
						failCrossFieldManager,
						rebaseRevisionMetadataFromInfo(defaultRevInfosFromChanges([]), []),
					),
					expected,
				);
			});

			it("can rebase a child change over a remove and revive of target node", () => {
				const tag1 = mintRevisionTag();
				const tag2 = mintRevisionTag();
				const changeToRebase = optionalFieldEditor.buildChildChange(0, nodeId1);
				const deletion = tagChange(optionalFieldEditor.clear(false, brand(1)), tag1);
				const revive = tagRollbackInverse(
					optionalChangeRebaser.invert(
						deletion,
						false,
						idAllocatorFromMaxId(),
						failCrossFieldManager,
						defaultRevisionMetadataFromChanges([deletion]),
					),
					tag2,
					tag1,
				);

				const childRebaser = (
					nodeChange: NodeId | undefined,
					baseNodeChange: NodeId | undefined,
				) => {
					assert(baseNodeChange === undefined);
					assert(nodeChange === nodeId1);
					return nodeChange;
				};

				const changeToRebase2 = optionalChangeRebaser.rebase(
					changeToRebase,
					deletion,
					childRebaser,
					fakeIdAllocator,
					failCrossFieldManager,
					rebaseRevisionMetadataFromInfo(defaultRevInfosFromChanges([deletion]), [
						deletion.revision,
					]),
				);

				const changeToRebase3 = optionalChangeRebaser.rebase(
					changeToRebase2,
					revive,
					childRebaser,
					fakeIdAllocator,
					failCrossFieldManager,
					rebaseRevisionMetadataFromInfo(defaultRevInfosFromChanges([revive]), [
						revive.revision,
					]),
				);

				assert.deepEqual(changeToRebase3, changeToRebase);
			});

			it("can rebase child change (field change ↷ field change)", () => {
				const baseChange = Change.atOnce(
					Change.clear("self", brand(0)),
					Change.child(nodeId1),
				);
				const taggedBaseChange = tagChange(baseChange, mintRevisionTag());

				// Note: this sort of change (has field changes as well as nested child changes)
				// can only be created for production codepaths using transactions.
				const changeToRebase = Change.atOnce(
					Change.clear("self", brand(1)),
					Change.move(brand(41), "self"),
					Change.child(nodeId2),
				);

				const childRebaser = (
					change: NodeId | undefined,
					base: NodeId | undefined,
				): NodeId | undefined => {
					assert.deepEqual(change, nodeId2);
					assert.deepEqual(base, nodeId1);
					return change;
				};

				const expected = Change.atOnce(
					Change.reserve("self", brand(1)),
					Change.move(brand(41), "self"),
					Change.childAt(
						{ localId: brand(0), revision: taggedBaseChange.revision },
						nodeId2,
					),
				);

				const actual = optionalChangeRebaser.rebase(
					changeToRebase,
					taggedBaseChange,
					childRebaser,
					fakeIdAllocator,
					failCrossFieldManager,
					rebaseRevisionMetadataFromInfo(defaultRevInfosFromChanges([taggedBaseChange]), [
						taggedBaseChange.revision,
					]),
				);
				assert.deepEqual(actual, expected);
			});
		});
	});

	describe("IntoDelta", () => {
		it("can be converted to a delta when field was empty", () => {
			const outerNodeId = makeDetachedNodeId(tag, 41);
			const expected: DeltaFieldChanges = {
				global: [
					{
						id: outerNodeId,
						fields: TestNodeId.deltaFromChild(nodeChange1),
					},
				],
				local: [{ count: 1, attach: outerNodeId }],
			};

			const actual = optionalFieldIntoDelta(change1, TestNodeId.deltaFromChild);
			assertFieldChangesEqual(actual, expected);
		});

		it("can be converted to a delta when restoring content", () => {
			const expected: DeltaFieldChanges = {
				local: [
					{
						count: 1,
						attach: { major: revertChange2.revision, minor: 2 },
						detach: { major: revertChange2.revision, minor: 42 },
					},
				],
			};

			const actual = optionalFieldIntoDelta(revertChange2, TestNodeId.deltaFromChild);
			assertFieldChangesEqual(actual, expected);
		});

		it("can be converted to a delta with only child changes", () => {
			const expected: DeltaFieldChanges = {
				local: [
					{
						count: 1,
						fields: TestNodeId.deltaFromChild(nodeChange2),
					},
				],
			};
			assertFieldChangesEqual(
				optionalFieldIntoDelta(change4, TestNodeId.deltaFromChild),
				expected,
			);
		});
	});

	describe("relevantRemovedRoots", () => {
		const fill = tagChange(
			optionalFieldEditor.set(true, { detach: brand(1), fill: brand(2) }),
			mintRevisionTag(),
		);
		const clear = tagChange(optionalFieldEditor.clear(false, brand(1)), mintRevisionTag());
		const hasChildChanges = tagChange(
			optionalFieldEditor.buildChildChange(0, nodeId1),
			mintRevisionTag(),
		);
		const relevantNestedTree = { minor: 4242 };
		const noTreesDelegate: RelevantRemovedRootsFromChild = () => [];
		const oneTreeDelegate: RelevantRemovedRootsFromChild = (child) => {
			assert.deepEqual(child, nodeId1);
			return [relevantNestedTree];
		};
		describe("does not include", () => {
			it("a tree being removed", () => {
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(clear, noTreesDelegate),
				);
				assert.deepEqual(actual, []);
			});
			it("a tree with child changes being removed", () => {
				const changes = [hasChildChanges, clear];
				const changeAndClear = makeAnonChange(
					optionalChangeRebaser.compose(
						hasChildChanges,
						clear,
						(): NodeId => nodeId1,
						fakeIdAllocator,
						failCrossFieldManager,
						defaultRevisionMetadataFromChanges(changes),
					),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(changeAndClear, noTreesDelegate),
				);
				assert.deepEqual(actual, []);
			});
			it("a tree that remains untouched", () => {
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(
						makeAnonChange(Change.empty()),
						noTreesDelegate,
					),
				);
				assert.deepEqual(actual, []);
			});
			it("a tree that remains untouched aside from child changes", () => {
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(hasChildChanges, noTreesDelegate),
				);
				assert.deepEqual(actual, []);
			});
		});
		describe("does include", () => {
			it("a tree being inserted", () => {
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(fill, noTreesDelegate),
				);
				assert.deepEqual(actual, [makeDetachedNodeId(fill.revision, 2)]);
			});
			it("a tree being restored", () => {
				const restore = makeAnonChange(
					optionalChangeRebaser.invert(
						clear,
						false,
						idAllocatorFromMaxId(),
						failCrossFieldManager,
						defaultRevisionMetadataFromChanges([clear]),
					),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(restore, failingDelegate),
				);
				const expected = [makeDetachedNodeId(clear.revision, 1)];
				assert.deepEqual(actual, expected);
			});
			it("a tree that remains removed but has nested changes", () => {
				const rebasedNestedChange = makeAnonChange(
					optionalChangeRebaser.rebase(
						hasChildChanges.change,
						clear,
						() => nodeId1,
						fakeIdAllocator,
						failCrossFieldManager,
						rebaseRevisionMetadataFromInfo(
							defaultRevInfosFromChanges([clear, hasChildChanges]),
							[clear.revision],
						),
					),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(
						rebasedNestedChange,
						noTreesDelegate,
					),
				);
				const expected = [makeDetachedNodeId(clear.revision, 1)];
				assert.deepEqual(actual, expected);
			});
			it("relevant roots from nested changes under a tree being inserted", () => {
				const changes = [fill, hasChildChanges];
				const fillAndChange = makeAnonChange(
					optionalChangeRebaser.compose(
						fill,
						hasChildChanges,
						(): NodeId => nodeId1,
						fakeIdAllocator,
						failCrossFieldManager,
						defaultRevisionMetadataFromChanges(changes),
					),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(fillAndChange, oneTreeDelegate),
				);
				assert.deepEqual(actual, [
					makeDetachedNodeId(fill.revision, 2),
					relevantNestedTree,
				]);
			});
			it("relevant roots from nested changes under a tree being removed", () => {
				const changes = [hasChildChanges, clear];
				const changeAndClear = makeAnonChange(
					optionalChangeRebaser.compose(
						hasChildChanges,
						clear,
						(): NodeId => nodeId1,
						fakeIdAllocator,
						failCrossFieldManager,
						defaultRevisionMetadataFromChanges(changes),
					),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(changeAndClear, oneTreeDelegate),
				);
				assert.deepEqual(actual, [relevantNestedTree]);
			});
			it("relevant roots from nested changes under a tree being restored", () => {
				const restore = tagChange(
					optionalChangeRebaser.invert(
						clear,
						false,
						idAllocatorFromMaxId(),
						failCrossFieldManager,
						defaultRevisionMetadataFromChanges([clear]),
					),
					mintRevisionTag(),
				);
				const changes = [restore, hasChildChanges];
				const restoreAndChange = makeAnonChange(
					optionalChangeRebaser.compose(
						restore,
						hasChildChanges,
						(): NodeId => nodeId1,
						fakeIdAllocator,
						failCrossFieldManager,
						defaultRevisionMetadataFromChanges(changes),
					),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(restoreAndChange, oneTreeDelegate),
				);
				const expected = [makeDetachedNodeId(clear.revision, 1), relevantNestedTree];
				assert.deepEqual(actual, expected);
			});
			it("relevant roots from nested changes under a tree that remains removed", () => {
				const rebasedNestedChange = makeAnonChange(
					optionalChangeRebaser.rebase(
						hasChildChanges.change,
						clear,
						() => nodeId1,
						fakeIdAllocator,
						failCrossFieldManager,
						rebaseRevisionMetadataFromInfo(
							defaultRevInfosFromChanges([clear, hasChildChanges]),
							[clear.revision],
						),
					),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(
						rebasedNestedChange,
						oneTreeDelegate,
					),
				);
				const expected = [makeDetachedNodeId(clear.revision, 1), relevantNestedTree];
				assert.deepEqual(actual, expected);
			});
			it("relevant roots from nested changes under a tree that remains in-doc", () => {
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(hasChildChanges, oneTreeDelegate),
				);
				assert.deepEqual(actual, [relevantNestedTree]);
			});
		});
		it("uses passed down revision", () => {
			const restore = tagChange(Change.childAt(brand(42), nodeId1), tag);
			const actual = Array.from(
				optionalChangeHandler.relevantRemovedRoots(restore, noTreesDelegate),
			);
			assert.deepEqual(actual, [{ major: tag, minor: 42 }]);
		});
	});

	describe("isEmpty", () => {
		it("is true for an empty change", () => {
			const change = Change.empty();
			const actual = optionalChangeHandler.isEmpty(change);
			assert.equal(actual, true);
		});
		it("is false for a change with moves", () => {
			const change: OptionalChangeset = {
				moves: [[{ localId: brand(0) }, { localId: brand(1) }]],
				childChanges: [],
			};
			const actual = optionalChangeHandler.isEmpty(change);
			assert.equal(actual, false);
		});
		it("is false for a change with child changes", () => {
			const change = Change.childAt(
				{ localId: brand(0), revision: tag },
				arbitraryChildChange,
			);
			const actual = optionalChangeHandler.isEmpty(change);
			assert.equal(actual, false);
		});
		it("is false for a change with a reserved detach ID", () => {
			const change = Change.reserve("self", brand(0));
			const actual = optionalChangeHandler.isEmpty(change);
			assert.equal(actual, false);
		});
	});
});
