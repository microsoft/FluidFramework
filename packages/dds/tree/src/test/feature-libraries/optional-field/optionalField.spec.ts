/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import {
	type ChangeAtomId,
	type DeltaFieldChanges,
	type TaggedChange,
	makeAnonChange,
	makeDetachedNodeId,
	tagChange,
} from "../../../core/index.js";
import type {
	CrossFieldManager,
	NodeId,
	RelevantRemovedRootsFromChild,
} from "../../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import { rebaseRevisionMetadataFromInfo } from "../../../feature-libraries/modular-schema/modularChangeFamily.js";
import {
	type OptionalChangeset,
	optionalChangeHandler,
	optionalChangeRebaser,
	optionalFieldEditor,
	optionalFieldIntoDelta,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/optional-field/index.js";
import { brand, fakeIdAllocator, idAllocatorFromMaxId } from "../../../util/index.js";
import {
	assertFieldChangesEqual,
	defaultRevInfosFromChanges,
	defaultRevisionMetadataFromChanges,
	mintRevisionTag,
} from "../../utils.js";
import { TestNodeId } from "../../testNodeId.js";
import { TestChange } from "../../testChange.js";
import { Change, assertEqual, inlineRevision, tagChangeInline } from "./optionalFieldUtils.js";
import { testSnapshots } from "./optionalFieldSnapshots.test.js";
import { testRebaserAxioms } from "./optionalChangeRebaser.test.js";
import { testCodecs } from "./optionalFieldChangeCodecs.test.js";
import { deepFreeze } from "@fluidframework/test-runtime-utils/internal";
import { testReplaceRevisions } from "./replaceRevisions.test.js";
// eslint-disable-next-line import/no-internal-modules
import type { NestedChangesIndices } from "../../../feature-libraries/modular-schema/fieldChangeHandler.js";

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
	set: () => assert.fail("Should not modify CrossFieldManager"),
	onMoveIn: () => assert.fail("Should not modify CrossFieldManager"),
	moveKey: () => assert.fail("Should not modify CrossFieldManager"),
};

const failingDelegate = (): never => assert.fail("Should not be called");

const tag = mintRevisionTag();
const change1 = tagChangeInline(
	Change.atOnce(
		Change.reserve("self", brand(1)),
		Change.move(brand(41), "self"),
		Change.childAt(brand(41), nodeChange1),
	),
	tag,
);

const change2Tag = mintRevisionTag();
const change2: TaggedChange<OptionalChangeset> = tagChangeInline(
	optionalFieldEditor.set(false, {
		fill: { localId: brand(42) },
		detach: { localId: brand(2) },
	}),
	change2Tag,
);

const revertChange2: TaggedChange<OptionalChangeset> = tagChangeInline(
	Change.atOnce(Change.clear("self", brand(42)), Change.move(brand(2), "self")),
	mintRevisionTag(),
);

/**
 * Represents what change2 would have been had it been concurrent with change1.
 */
const change2PreChange1: TaggedChange<OptionalChangeset> = tagChangeInline(
	optionalFieldEditor.set(true, {
		fill: { localId: brand(42) },
		detach: { localId: brand(2) },
	}),
	change2Tag,
);

const change4: TaggedChange<OptionalChangeset> = tagChangeInline(
	optionalFieldEditor.buildChildChange(0, TestNodeId.create(nodeId2, TestChange.mint([1], 2))),
	mintRevisionTag(),
);

// TODO: unit test standalone functions from optionalField.ts
describe("optionalField", () => {
	testSnapshots();
	testRebaserAxioms();
	testCodecs();
	testReplaceRevisions();

	// TODO: more editor tests
	describe("editor", () => {
		it("can be created", () => {
			const actual: OptionalChangeset = optionalFieldEditor.set(true, {
				fill: { localId: brand(42) },
				detach: { localId: brand(43) },
			});
			const expected = Change.atOnce(
				Change.reserve("self", brand(43)),
				Change.move(brand(42), "self"),
			);
			assertEqual(actual, expected);
		});
	});

	describe("Rebaser", () => {
		describe("Compose", () => {
			it("a bit of everything", () => {
				const composed = optionalChangeRebaser.compose(
					change1.change,
					change2.change,
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
					Change.childAt(
						{ localId: brand(41), revision: change1.revision },
						{ ...nodeChange1, revision: change1.revision },
					),
				);

				assertEqual(composed, change1And2);
			});

			it("invokes child composer when both changeset have changes for a node", () => {
				const changeA = tagChangeInline(
					Change.atOnce(
						Change.child(TestNodeId.create(nodeId1, TestChange.mint([], 1))),
						Change.clear("self", { localId: brand(0) }),
					),
					tag,
				);
				const changeB = tagChangeInline(
					Change.childAt(
						{ localId: brand(0), revision: tag },
						TestNodeId.create(nodeId2, TestChange.mint([1], 2)),
					),
					change2Tag,
				);
				const composed = optionalChangeRebaser.compose(
					changeA.change,
					changeB.change,
					TestNodeId.composeChild,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([changeA, changeB]),
				);

				const expected = Change.atOnce(
					Change.child(
						TestNodeId.create({ ...nodeId1, revision: tag }, TestChange.mint([], [1, 2])),
					),
					Change.clear("self", { localId: brand(0), revision: tag }),
				);

				assertEqual(composed, expected);
			});

			it("invokes child composer when only the first changeset has changes for a node", () => {
				const changeA = tagChangeInline(
					Change.atOnce(Change.child(nodeId1), Change.clear("self", { localId: brand(0) })),
					tag,
				);
				const changeB = tagChangeInline(Change.empty(), change2Tag);
				const childComposerCalls: [ChangeAtomId | undefined, ChangeAtomId | undefined][] = [];

				const composed = optionalChangeRebaser.compose(
					changeA.change,
					changeB.change,
					(fst, snd) => {
						childComposerCalls.push([fst, snd]);
						return fst ?? snd ?? fail("At least one node should be defined");
					},
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([changeA, changeB]),
				);

				const taggedNodeId1 = { ...nodeId1, revision: tag };
				const expected = Change.atOnce(
					Change.child(taggedNodeId1),
					Change.clear("self", { localId: brand(0), revision: tag }),
				);

				assertEqual(composed, expected);
				assert.deepEqual(childComposerCalls, [[taggedNodeId1, undefined]]);
			});

			it("invokes child composer when only the second changeset has changes for a node", () => {
				const changeA = tagChangeInline(Change.clear("self", { localId: brand(0) }), tag);
				const changeB = tagChangeInline(
					Change.childAt({ localId: brand(0), revision: tag }, nodeId2),
					change2Tag,
				);
				const childComposerCalls: [ChangeAtomId | undefined, ChangeAtomId | undefined][] = [];

				const composed = optionalChangeRebaser.compose(
					changeA.change,
					changeB.change,
					(fst, snd) => {
						childComposerCalls.push([fst, snd]);
						return fst ?? snd ?? fail("At least one node should be defined");
					},
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([changeA, changeB]),
				);

				const taggedNodeId2 = { ...nodeId2, revision: change2Tag };
				const expected = Change.atOnce(
					Change.child(taggedNodeId2),
					Change.clear("self", { localId: brand(0), revision: tag }),
				);

				assertEqual(composed, expected);
				assert.deepEqual(childComposerCalls, [[undefined, taggedNodeId2]]);
			});
		});

		it("pin ○ child change", () => {
			const detach: ChangeAtomId = { localId: brand(42), revision: tag };
			const pin = Change.pin(detach);
			const withChild = Change.childAt(detach, nodeChange1);
			const composed = optionalChangeRebaser.compose(
				pin,
				withChild,
				TestNodeId.composeChild,
				fakeIdAllocator,
				failCrossFieldManager,
				defaultRevisionMetadataFromChanges([]),
			);

			const expected = Change.atOnce(pin, withChild);

			assertEqual(composed, expected);
		});

		it("can compose child changes", () => {
			const expected = Change.atOnce(
				Change.move({ localId: brand(41), revision: change1.revision }, "self"),
				Change.reserve("self", { localId: brand(1), revision: change1.revision }),
				Change.childAt(
					{ localId: brand(41), revision: change1.revision },
					TestNodeId.create(
						{ ...nodeId1, revision: change1.revision },
						TestChange.mint([], [1, 2]),
					),
				),
			);

			const composed = optionalChangeRebaser.compose(
				change1.change,
				change4.change,
				TestNodeId.composeChild,
				fakeIdAllocator,
				failCrossFieldManager,
				defaultRevisionMetadataFromChanges([change1, change4]),
			);

			assert.deepEqual(composed, expected);
		});

		it("can compose a chain of moves", () => {
			const tag1 = mintRevisionTag();
			const changeA = tagChangeInline(Change.atOnce(Change.move(brand(0), brand(1))), tag1);

			const tag2 = mintRevisionTag();
			const changeB = tagChangeInline(
				Change.atOnce(Change.move({ revision: tag1, localId: brand(1) }, brand(2))),
				tag2,
			);

			const composed = optionalChangeRebaser.compose(
				changeA.change,
				changeB.change,
				TestNodeId.composeChild,
				fakeIdAllocator,
				failCrossFieldManager,
				defaultRevisionMetadataFromChanges([changeA, changeB]),
			);

			const expected = Change.atOnce(
				Change.move(
					{ revision: tag1, localId: brand(0) },
					{ revision: tag2, localId: brand(2) },
				),
			);

			assert.deepEqual(composed, expected);
		});

		describe("Invert", () => {
			function undo(change: TaggedChange<OptionalChangeset>): OptionalChangeset {
				return optionalChangeRebaser.invert(
					change.change,
					false,
					idAllocatorFromMaxId(),
					mintRevisionTag(),
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([change]),
				);
			}
			function rollback(change: TaggedChange<OptionalChangeset>): OptionalChangeset {
				return optionalChangeRebaser.invert(
					change.change,
					true,
					idAllocatorFromMaxId(),
					mintRevisionTag(),
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([change]),
				);
			}

			it("clear⁻¹", () => {
				const clear = Change.clear("self", brand(42));
				const actual = rollback(tagChangeInline(clear, tag));
				const expected = Change.atOnce(
					Change.reserve("self", brand(0)),
					Change.move({ localId: brand(42), revision: tag }, "self"),
				);
				assertEqual(actual, expected);
			});

			it("undo(clear)", () => {
				const clear = Change.clear("self", brand(42));
				const actual = undo(tagChangeInline(clear, tag));
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
				const actual = rollback(tagChangeInline(clearInv, tag));
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
				const actual = undo(tagChangeInline(clearInv, tag));
				const expected = Change.atOnce(Change.clear("self", brand(0)));
				assertEqual(actual, expected);
			});

			it("set+child⁻¹", () => {
				const expected = Change.atOnce(
					Change.child({ ...nodeChange1, revision: change1.revision }),
					Change.move("self", { localId: brand(41), revision: change1.revision }),
				);
				const actual = rollback(change1);
				assertEqual(actual, expected);
			});

			it("undo(set+child)", () => {
				const expected = Change.atOnce(
					Change.child({ ...nodeChange1, revision: change1.revision }),
					Change.move("self", { localId: brand(0) }),
				);
				const actual = undo(change1);
				assertEqual(actual, expected);
			});

			it("(pin+child)⁻¹", () => {
				const input = makeAnonChange(
					Change.atOnce(Change.child(nodeChange1), Change.pin({ localId: brand(42) })),
				);
				const expected = Change.child(nodeChange1);
				const actual = rollback(input);
				assertEqual(actual, expected);
			});
		});

		describe("Rebasing", () => {
			it("can be rebased", () => {
				assert.deepEqual(
					optionalChangeRebaser.rebase(
						change2PreChange1.change,
						change1.change,
						TestNodeId.rebaseChild,
						fakeIdAllocator,
						failCrossFieldManager,
						rebaseRevisionMetadataFromInfo(
							defaultRevInfosFromChanges([change1]),
							change2PreChange1.revision,
							[change1.revision],
						),
					),
					change2.change,
				);
			});

			it("invokes child rebaser when both changeset have changes for a node", () => {
				const baseChange = Change.child(TestNodeId.create(nodeId1, TestChange.mint([], 1)));
				const changeToRebase = Change.child(
					TestNodeId.create(nodeId2, TestChange.mint([], 2)),
				);
				const expected = Change.child(TestNodeId.create(nodeId2, TestChange.mint([1], 2)));

				assert.deepEqual(
					optionalChangeRebaser.rebase(
						changeToRebase,
						baseChange,
						TestNodeId.rebaseChild,
						fakeIdAllocator,
						failCrossFieldManager,
						rebaseRevisionMetadataFromInfo(defaultRevInfosFromChanges([]), undefined, []),
					),
					expected,
				);
			});

			it("invokes child rebaser when only the current changeset has changes for a node", () => {
				const baseChange = Change.clear("self", { localId: brand(0) });
				const changeToRebase = Change.child(nodeId1);
				const expected = Change.childAt({ localId: brand(0) }, nodeId1);

				const childRebaserCalls: [ChangeAtomId | undefined, ChangeAtomId | undefined][] = [];

				assert.deepEqual(
					optionalChangeRebaser.rebase(
						changeToRebase,
						baseChange,
						(curr, base) => {
							childRebaserCalls.push([curr, base]);
							return curr ?? base;
						},
						fakeIdAllocator,
						failCrossFieldManager,
						rebaseRevisionMetadataFromInfo(defaultRevInfosFromChanges([]), undefined, []),
					),
					expected,
				);

				assert.deepEqual(childRebaserCalls, [[nodeId1, undefined]]);
			});

			it("invokes child rebaser when only the base changeset has changes for a node", () => {
				const baseChange = Change.atOnce(
					Change.child(nodeId1),
					Change.clear("self", { localId: brand(0) }),
				);
				const changeToRebase = Change.empty();
				const childRebaserCalls: [ChangeAtomId | undefined, ChangeAtomId | undefined][] = [];

				const expected = Change.childAt({ localId: brand(0) }, nodeId1);

				assert.deepEqual(
					optionalChangeRebaser.rebase(
						changeToRebase,
						baseChange,
						(curr, base) => {
							childRebaserCalls.push([curr, base]);
							return curr ?? base;
						},
						fakeIdAllocator,
						failCrossFieldManager,
						rebaseRevisionMetadataFromInfo(defaultRevInfosFromChanges([]), undefined, []),
					),
					expected,
				);

				assert.deepEqual(childRebaserCalls, [[undefined, nodeId1]]);
			});

			it("can rebase a child change over a remove and revive of target node", () => {
				const tag1 = mintRevisionTag();
				const tag2 = mintRevisionTag();
				const changeToRebase = optionalFieldEditor.buildChildChange(0, nodeId1);
				const deletion = tagChange(
					optionalFieldEditor.clear(false, { localId: brand(1), revision: tag1 }),
					tag1,
				);
				const revive = tagChange(
					optionalChangeRebaser.invert(
						deletion.change,
						false,
						idAllocatorFromMaxId(),
						tag2,
						failCrossFieldManager,
						defaultRevisionMetadataFromChanges([deletion]),
					),
					tag2,
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
					deletion.change,
					childRebaser,
					fakeIdAllocator,
					failCrossFieldManager,
					rebaseRevisionMetadataFromInfo(defaultRevInfosFromChanges([deletion]), undefined, [
						deletion.revision,
					]),
				);

				const changeToRebase3 = optionalChangeRebaser.rebase(
					changeToRebase2,
					revive.change,
					childRebaser,
					fakeIdAllocator,
					failCrossFieldManager,
					rebaseRevisionMetadataFromInfo(defaultRevInfosFromChanges([revive]), undefined, [
						revive.revision,
					]),
				);

				assert.deepEqual(changeToRebase3, changeToRebase);
			});

			it("can rebase a child change over a reserved detach on empty field", () => {
				const changeToRebase = optionalFieldEditor.buildChildChange(0, nodeId1);
				deepFreeze(changeToRebase);
				const clear = tagChange(
					optionalFieldEditor.clear(true, { localId: brand(42), revision: tag }),
					tag,
				);

				const childRebaser = (
					nodeChange: NodeId | undefined,
					baseNodeChange: NodeId | undefined,
				) => {
					assert(baseNodeChange === undefined);
					assert(nodeChange === nodeId1);
					return nodeChange;
				};

				const actual = optionalChangeRebaser.rebase(
					changeToRebase,
					clear.change,
					childRebaser,
					fakeIdAllocator,
					failCrossFieldManager,
					rebaseRevisionMetadataFromInfo(defaultRevInfosFromChanges([clear]), undefined, [
						clear.revision,
					]),
				);

				assert.deepEqual(actual, changeToRebase);
			});

			it("can rebase a child change over a reserved detach on field with a pinned node", () => {
				const changeToRebase = optionalFieldEditor.buildChildChange(0, nodeId1);
				deepFreeze(changeToRebase);
				const pin = tagChangeInline(Change.pin(brand(42)), tag);

				const childRebaser = (
					nodeChange: NodeId | undefined,
					baseNodeChange: NodeId | undefined,
				) => {
					assert(baseNodeChange === undefined);
					assert(nodeChange === nodeId1);
					return nodeChange;
				};

				const actual = optionalChangeRebaser.rebase(
					changeToRebase,
					pin.change,
					childRebaser,
					fakeIdAllocator,
					failCrossFieldManager,
					rebaseRevisionMetadataFromInfo(defaultRevInfosFromChanges([pin]), undefined, [
						pin.revision,
					]),
				);

				assert.deepEqual(actual, changeToRebase);
			});

			it("can rebase child change (field change ↷ field change)", () => {
				const baseChange = Change.atOnce(
					Change.clear("self", brand(0)),
					Change.child(nodeId1),
				);
				const taggedBaseChange = tagChangeInline(baseChange, mintRevisionTag());

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
					assert.deepEqual(base, { ...nodeId1, revision: taggedBaseChange.revision });
					return change;
				};

				const expected = Change.atOnce(
					Change.reserve("self", brand(1)),
					Change.move(brand(41), "self"),
					Change.childAt({ localId: brand(0), revision: taggedBaseChange.revision }, nodeId2),
				);

				const actual = optionalChangeRebaser.rebase(
					changeToRebase,
					taggedBaseChange.change,
					childRebaser,
					fakeIdAllocator,
					failCrossFieldManager,
					rebaseRevisionMetadataFromInfo(
						defaultRevInfosFromChanges([taggedBaseChange]),
						undefined,
						[taggedBaseChange.revision],
					),
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

			const actual = optionalFieldIntoDelta(change1.change, TestNodeId.deltaFromChild);
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

			const actual = optionalFieldIntoDelta(revertChange2.change, TestNodeId.deltaFromChild);
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
				optionalFieldIntoDelta(change4.change, TestNodeId.deltaFromChild),
				expected,
			);
		});
	});

	describe("relevantRemovedRoots", () => {
		const tag1 = mintRevisionTag();
		const fill = tagChange(
			optionalFieldEditor.set(true, {
				detach: { localId: brand(1), revision: tag1 },
				fill: { localId: brand(2), revision: tag1 },
			}),
			tag1,
		);
		const tag2 = mintRevisionTag();
		const clear = tagChange(
			optionalFieldEditor.clear(false, { localId: brand(1), revision: tag2 }),
			tag2,
		);
		const childChangeTag = mintRevisionTag();
		const hasChildChanges = tagChange(
			optionalFieldEditor.buildChildChange(0, { ...nodeId1, revision: childChangeTag }),
			childChangeTag,
		);
		const relevantNestedTree = { minor: 4242 };
		const noTreesDelegate: RelevantRemovedRootsFromChild = () => [];
		const oneTreeDelegate: RelevantRemovedRootsFromChild = (child) => {
			assert.deepEqual(child, { ...nodeId1, revision: hasChildChanges.revision });
			return [relevantNestedTree];
		};
		describe("does not include", () => {
			it("a tree being removed", () => {
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(clear.change, noTreesDelegate),
				);
				assert.deepEqual(actual, []);
			});
			it("a tree with child changes being removed", () => {
				const changes = [hasChildChanges, clear];
				const changeAndClear = optionalChangeRebaser.compose(
					hasChildChanges.change,
					clear.change,
					(): NodeId => nodeId1,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges(changes),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(changeAndClear, noTreesDelegate),
				);
				assert.deepEqual(actual, []);
			});
			it("a tree that remains untouched", () => {
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(Change.empty(), noTreesDelegate),
				);
				assert.deepEqual(actual, []);
			});
			it("a tree that remains untouched aside from child changes", () => {
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(hasChildChanges.change, noTreesDelegate),
				);
				assert.deepEqual(actual, []);
			});
		});
		describe("does include", () => {
			it("a tree being inserted", () => {
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(fill.change, noTreesDelegate),
				);
				assert.deepEqual(actual, [makeDetachedNodeId(fill.revision, 2)]);
			});
			it("a tree being restored", () => {
				const restore = optionalChangeRebaser.invert(
					clear.change,
					false,
					idAllocatorFromMaxId(),
					mintRevisionTag(),
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([clear]),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(restore, failingDelegate),
				);
				const expected = [makeDetachedNodeId(clear.revision, 1)];
				assert.deepEqual(actual, expected);
			});
			it("a tree that remains removed but has nested changes", () => {
				const rebasedNestedChange = optionalChangeRebaser.rebase(
					hasChildChanges.change,
					clear.change,
					() => nodeId1,
					fakeIdAllocator,
					failCrossFieldManager,
					rebaseRevisionMetadataFromInfo(
						defaultRevInfosFromChanges([clear, hasChildChanges]),
						undefined,
						[clear.revision],
					),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(rebasedNestedChange, noTreesDelegate),
				);
				const expected = [makeDetachedNodeId(clear.revision, 1)];
				assert.deepEqual(actual, expected);
			});
			it("relevant roots from nested changes under a tree being inserted", () => {
				const changes = [fill, hasChildChanges];
				const fillAndChange = optionalChangeRebaser.compose(
					fill.change,
					hasChildChanges.change,
					(id1, id2): NodeId => id1 ?? id2 ?? fail("Expected child change"),
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges(changes),
				);

				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(fillAndChange, oneTreeDelegate),
				);
				assert.deepEqual(actual, [makeDetachedNodeId(fill.revision, 2), relevantNestedTree]);
			});
			it("relevant roots from nested changes under a tree being removed", () => {
				const changes = [hasChildChanges, clear];
				const changeAndClear = optionalChangeRebaser.compose(
					hasChildChanges.change,
					clear.change,
					(id1, id2): NodeId => id1 ?? id2 ?? fail("Expected child change"),
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges(changes),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(changeAndClear, oneTreeDelegate),
				);
				assert.deepEqual(actual, [relevantNestedTree]);
			});
			it("relevant roots from nested changes under a tree being restored", () => {
				const restore = tagChangeInline(
					optionalChangeRebaser.invert(
						clear.change,
						false,
						idAllocatorFromMaxId(),
						mintRevisionTag(),
						failCrossFieldManager,
						defaultRevisionMetadataFromChanges([clear]),
					),
					mintRevisionTag(),
				);
				const changes = [restore, hasChildChanges];
				const restoreAndChange = optionalChangeRebaser.compose(
					restore.change,
					hasChildChanges.change,
					(id1, id2): NodeId => id1 ?? id2 ?? fail("Expected child change"),
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges(changes),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(restoreAndChange, oneTreeDelegate),
				);
				const expected = [makeDetachedNodeId(clear.revision, 1), relevantNestedTree];
				assert.deepEqual(actual, expected);
			});
			it("relevant roots from nested changes under a tree that remains removed", () => {
				const rebasedNestedChange = optionalChangeRebaser.rebase(
					hasChildChanges.change,
					clear.change,
					(id1, id2): NodeId => id1 ?? id2 ?? fail("Expected child change"),
					fakeIdAllocator,
					failCrossFieldManager,
					rebaseRevisionMetadataFromInfo(
						defaultRevInfosFromChanges([clear, hasChildChanges]),
						undefined,
						[clear.revision],
					),
				);
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(rebasedNestedChange, oneTreeDelegate),
				);
				const expected = [makeDetachedNodeId(clear.revision, 1), relevantNestedTree];
				assert.deepEqual(actual, expected);
			});
			it("relevant roots from nested changes under a tree that remains in-doc", () => {
				const actual = Array.from(
					optionalChangeHandler.relevantRemovedRoots(hasChildChanges.change, oneTreeDelegate),
				);
				assert.deepEqual(actual, [relevantNestedTree]);
			});
		});
		it("uses passed down revision", () => {
			const restore = inlineRevision(Change.childAt(brand(42), nodeId1), tag);
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

	describe("getNestedChanges", () => {
		it("is empty for an empty change", () => {
			const change = Change.empty();
			const actual = optionalChangeHandler.getNestedChanges(change);
			assert.deepEqual(actual, []);
		});
		it("includes changes to the node in the field", () => {
			const change: OptionalChangeset = Change.child(nodeId1);
			const actual = optionalChangeHandler.getNestedChanges(change);
			const expected: NestedChangesIndices = [[nodeId1, 0, 0]];
			assert.deepEqual(actual, expected);
		});
		it("includes changes to removed nodes", () => {
			const change: OptionalChangeset = Change.atOnce(
				Change.childAt(brand(41), nodeId1),
				Change.childAt(brand(42), nodeId2),
			);
			const actual = optionalChangeHandler.getNestedChanges(change);
			const expected: NestedChangesIndices = [
				[nodeId1, undefined, undefined],
				[nodeId2, undefined, undefined],
			];
			assert.deepEqual(actual, expected);
		});
	});
});
