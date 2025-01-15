/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { describeStress, StressMode } from "@fluid-private/stochastic-test-utils";
import type { CrossFieldManager, FieldChangeDelta } from "../../../feature-libraries/index.js";
import {
	type ChangeAtomId,
	type ChangeAtomIdMap,
	type ChangesetLocalId,
	type RevisionMetadataSource,
	type RevisionTag,
	type TaggedChange,
	type TreeNodeSchemaIdentifier,
	makeAnonChange,
	tagChange,
	tagRollbackInverse,
} from "../../../core/index.js";
import {
	type NodeChangeComposer,
	type NodeChangeRebaser,
	type NodeId,
	type RebaseRevisionMetadata,
	type ToDelta,
	rebaseRevisionMetadataFromInfo,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/index.js";
import {
	type OptionalChangeset,
	optionalChangeRebaser,
	optionalFieldEditor,
	optionalFieldIntoDelta,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/optional-field/index.js";
import {
	brand,
	forEachInNestedMap,
	idAllocatorFromMaxId,
	setInNestedMap,
} from "../../../util/index.js";
import {
	type ChildStateGenerator,
	type FieldStateTree,
	generatePossibleSequenceOfEdits,
	getSequentialEdits,
	getSequentialStates,
} from "../../exhaustiveRebaserUtils.js";
import { runExhaustiveComposeRebaseSuite } from "../../rebaserAxiomaticTests.js";
// TODO: Throughout this file, we use TestChange as the child change type.
// This is the same approach used in sequenceChangeRebaser.spec.ts, but it requires casting in this file
// since OptionalChangeset is not generic over the child changeset type.
// Search this file for "as any" and "as NodeChangeset"
import { TestChange } from "../../testChange.js";
import {
	defaultRevInfosFromChanges,
	defaultRevisionMetadataFromChanges,
	isDeltaVisible,
} from "../../utils.js";
import { TestNodeId } from "../../testNodeId.js";
import { Change, assertTaggedEqual, verifyContextChain } from "./optionalFieldUtils.js";
import { ChangesetWrapper } from "../../changesetWrapper.js";
import { deepFreeze } from "@fluidframework/test-runtime-utils/internal";

type RevisionTagMinter = () => RevisionTag;

function makeRevisionTagMinter(prefix = "rev"): RevisionTagMinter {
	// Rather than use UUIDs, allocate these sequentially for an easier time debugging tests.
	let currentRevision = 0;
	return () => `${prefix}${currentRevision++}` as unknown as RevisionTag;
}

const type: TreeNodeSchemaIdentifier = brand("Node");
const mintRevisionTag = makeRevisionTagMinter();
const tag1 = mintRevisionTag();

const OptionalChange = {
	set(
		value: string,
		wasEmpty: boolean,
		ids: {
			fill: ChangeAtomId;
			detach: ChangeAtomId;
		},
	) {
		return optionalFieldEditor.set(wasEmpty, ids);
	},

	clear(wasEmpty: boolean, detachId: ChangeAtomId) {
		return optionalFieldEditor.clear(wasEmpty, detachId);
	},

	buildChildChange(childChange: NodeId) {
		return optionalFieldEditor.buildChildChange(0, childChange);
	},
};

const failCrossFieldManager: CrossFieldManager = {
	get: () => assert.fail("Should not query CrossFieldManager"),
	set: () => assert.fail("Should not modify CrossFieldManager"),
	onMoveIn: () => assert.fail("Should not modify CrossFieldManager"),
	moveKey: () => assert.fail("Should not modify CrossFieldManager"),
};

function toDelta(
	change: OptionalChangeset,
	deltaFromChild: ToDelta = TestNodeId.deltaFromChild,
): FieldChangeDelta {
	return optionalFieldIntoDelta(change, deltaFromChild);
}

function toDeltaWrapped(change: TaggedChange<WrappedChangeset>) {
	return ChangesetWrapper.toDelta(change.change, (c, deltaFromChild) =>
		toDelta(c, deltaFromChild),
	);
}

function getMaxId(...changes: OptionalChangeset[]): ChangesetLocalId | undefined {
	let max: ChangesetLocalId | undefined;
	const ingest = (candidate: ChangesetLocalId | undefined) => {
		if (max === undefined || (candidate !== undefined && candidate > max)) {
			max = candidate;
		}
	};

	for (const change of changes) {
		for (const [src, dst] of change.moves) {
			ingest(src.localId);
			ingest(dst.localId);
		}

		for (const [id] of change.childChanges) {
			if (id !== "self") {
				// Child changes do not need to be ingested for this test file, as TestChange (which is used as a child)
				// doesn't have any `ChangesetLocalId`s.
				ingest(id.localId);
			}
		}

		if (change.valueReplace !== undefined) {
			ingest(change.valueReplace.dst.localId);
			if (change.valueReplace.src !== undefined && change.valueReplace.src !== "self") {
				ingest(change.valueReplace.src.localId);
			}
		}
	}

	return max;
}

function invert(
	change: TaggedChange<OptionalChangeset>,
	revision: RevisionTag | undefined,
	isRollback: boolean,
): OptionalChangeset {
	const inverted = optionalChangeRebaser.invert(
		change.change,
		isRollback,
		idAllocatorFromMaxId(),
		revision,
		failCrossFieldManager,
		defaultRevisionMetadataFromChanges([change]),
	);
	verifyContextChain(change, makeAnonChange(inverted));
	return inverted;
}

function invertWrapped(
	change: TaggedChange<WrappedChangeset>,
	revision: RevisionTag,
	isRollback: boolean,
): WrappedChangeset {
	return ChangesetWrapper.invert(change, invert, revision, isRollback);
}

function rebase(
	change: OptionalChangeset,
	base: TaggedChange<OptionalChangeset>,
	metadataArg?: RebaseRevisionMetadata,
	rebaseChild: NodeChangeRebaser = (id, baseId) => id,
): OptionalChangeset {
	deepFreeze(change);
	deepFreeze(base);

	const metadata =
		metadataArg ??
		rebaseRevisionMetadataFromInfo(defaultRevInfosFromChanges([base]), undefined, [
			base.revision,
		]);
	const moveEffects = failCrossFieldManager;
	const idAllocator = idAllocatorFromMaxId(getMaxId(change, base.change));
	const rebased = optionalChangeRebaser.rebase(
		change,
		base.change,
		rebaseChild,
		idAllocator,
		moveEffects,
		metadata,
	);
	verifyContextChain(base, makeAnonChange(rebased));
	return rebased;
}

function rebaseWrapped(
	change: TaggedChange<WrappedChangeset>,
	base: TaggedChange<WrappedChangeset>,
	metadataArg?: RebaseRevisionMetadata,
): WrappedChangeset {
	return ChangesetWrapper.rebase(change, base, (c, b, rebaseChild) =>
		rebase(c.change, b, metadataArg, rebaseChild),
	);
}

function rebaseWrappedTagged(
	change: TaggedChange<WrappedChangeset>,
	base: TaggedChange<WrappedChangeset>,
): TaggedChange<WrappedChangeset> {
	return tagChange(rebaseWrapped(change, base), change.revision);
}

function rebaseComposedWrapped(
	metadata: RebaseRevisionMetadata,
	change: TaggedChange<WrappedChangeset>,
	...baseChanges: TaggedChange<WrappedChangeset>[]
): WrappedChangeset {
	const composed =
		baseChanges.length === 0
			? makeAnonChange(ChangesetWrapper.create(Change.empty()))
			: baseChanges.reduce((change1, change2) =>
					makeAnonChange(composeWrapped(change1, change2)),
				);

	return rebaseWrapped(change, composed, metadata);
}

function compose(
	change1: TaggedChange<OptionalChangeset>,
	change2: TaggedChange<OptionalChangeset>,
	metadata?: RevisionMetadataSource,
	composeChild: NodeChangeComposer = TestNodeId.composeChild,
): OptionalChangeset {
	verifyContextChain(change1, change2);
	const moveEffects = failCrossFieldManager;
	const idAllocator = idAllocatorFromMaxId(getMaxId(change1.change, change2.change));
	return optionalChangeRebaser.compose(
		change1.change,
		change2.change,
		composeChild,
		idAllocator,
		moveEffects,
		metadata ?? defaultRevisionMetadataFromChanges([change1, change2]),
	);
}

function composeWrapped(
	change1: TaggedChange<WrappedChangeset>,
	change2: TaggedChange<WrappedChangeset>,
	metadata?: RevisionMetadataSource,
): WrappedChangeset {
	return ChangesetWrapper.compose(change1, change2, (c1, c2, composeChild) =>
		compose(c1, c2, metadata, composeChild),
	);
}

function isWrappedChangeEmpty(change: WrappedChangeset): boolean {
	const delta = toDeltaWrapped(makeAnonChange(change)).local;
	return delta === undefined || !isDeltaVisible(delta);
}

function assertWrappedChangesetsEquivalent(
	change1: TaggedChange<WrappedChangeset>,
	change2: TaggedChange<WrappedChangeset>,
) {
	assert.deepEqual(toDeltaWrapped(change1), toDeltaWrapped(change2));
}

type OptionalFieldTestState = FieldStateTree<string | undefined, WrappedChangeset>;

function computeChildChangeInputContext(inputState: OptionalFieldTestState): number[] {
	// This is effectively a filter of the intentions from all edits such that it only includes
	// intentions for edits which modify the same child as the final one in the changeset.
	// Note: this takes a dependency on the fact that `generateChildStates` doesn't set matching string
	// content for what are meant to represent different nodes.
	const states = getSequentialStates(inputState);
	const finalContent = states.at(-1)?.content;
	assert(
		finalContent !== undefined,
		"Child change input context should only be computed when the optional field has content.",
	);
	const intentions: number[] = [];
	let currentContent: string | undefined;
	for (const state of states) {
		if (
			state.mostRecentEdit !== undefined &&
			currentContent === finalContent &&
			state.mostRecentEdit.changeset.change.fieldChange.childChanges.length > 0
		) {
			intentions.push(state.mostRecentEdit.intention);
		}

		currentContent = state.content;
	}

	return intentions;
}

type WrappedChangeset = ChangesetWrapper<OptionalChangeset>;

/**
 * See {@link ChildStateGenerator}
 */
const generateChildStates: ChildStateGenerator<string | undefined, WrappedChangeset> =
	function* (
		state: OptionalFieldTestState,
		tagFromIntention: (intention: number) => RevisionTag,
		mintIntention: () => number,
	): Iterable<OptionalFieldTestState> {
		const mintId: () => ChangeAtomId = () => {
			return {
				localId: mintIntention() as ChangesetLocalId,
			};
		};
		const edits = getSequentialEdits(state);
		if (state.content !== undefined) {
			const changeChildIntention = mintIntention();
			const nodeId: NodeId = { localId: brand(0) };
			yield {
				content: state.content,
				mostRecentEdit: {
					changeset: tagWrappedChangeInline(
						ChangesetWrapper.create(OptionalChange.buildChildChange(nodeId), [
							nodeId,
							TestChange.mint(computeChildChangeInputContext(state), changeChildIntention),
						]),
						tagFromIntention(changeChildIntention),
					),
					intention: changeChildIntention,
					description: `ChildChange${changeChildIntention}`,
				},
				parent: state,
			};

			const setUndefinedIntention = mintIntention();
			yield {
				content: undefined,
				mostRecentEdit: {
					changeset: tagWrappedChangeInline(
						ChangesetWrapper.create(OptionalChange.clear(false, mintId())),
						tagFromIntention(setUndefinedIntention),
					),
					intention: setUndefinedIntention,
					description: "Remove",
				},
				parent: state,
			};
		} else {
			// Even if there is no content, optional field supports an explicit clear operation with LWW semantics,
			// as a concurrent set operation may populate the field.
			const setUndefinedIntention = mintIntention();
			yield {
				content: undefined,
				mostRecentEdit: {
					changeset: tagWrappedChangeInline(
						ChangesetWrapper.create(OptionalChange.clear(true, mintId())),
						tagFromIntention(setUndefinedIntention),
					),
					intention: setUndefinedIntention,
					description: "Remove",
				},
				parent: state,
			};
		}

		for (const value of ["A", "B"]) {
			const setIntention = mintIntention();
			const [fill, detach] = [mintId(), mintId()];
			// Using length of the input context guarantees set operations generated at different times also have different
			// values, which should tend to be easier to debug.
			// This also makes the logic to determine intentions simpler.
			const newContents = `${value},${edits.length}`;
			yield {
				content: newContents,
				mostRecentEdit: {
					changeset: tagWrappedChangeInline(
						ChangesetWrapper.create(
							OptionalChange.set(newContents, state.content === undefined, {
								fill,
								detach,
							}),
						),
						tagFromIntention(setIntention),
					),
					intention: setIntention,
					description: `Set${newContents}`,
				},
				parent: state,
			};
		}

		if (state.mostRecentEdit !== undefined) {
			const undoIntention = mintIntention();
			// We don't use the `invert` helper here, as `TestChange.invert` has logic to negate the intention
			// of the most recent edit. Instead, we want to mint a new intention. Having correct composition for
			// the 'negate' operation is already tested via sandwich rebasing.
			const invertTestChangeViaNewIntention = (change: TestChange): TestChange => {
				if ("inputContext" in change) {
					return {
						inputContext: change.outputContext,
						outputContext: [...change.outputContext, undoIntention],
						intentions: [undoIntention],
					};
				}
				return TestChange.emptyChange;
			};

			const invertedNodeChanges: ChangeAtomIdMap<TestChange> = new Map();
			forEachInNestedMap(state.mostRecentEdit.changeset.change.nodes, (node, revision, id) => {
				const invertedNode = invertTestChangeViaNewIntention(node);
				setInNestedMap(invertedNodeChanges, revision, id, invertedNode);
			});

			const inverseChangeset: WrappedChangeset = {
				fieldChange: invert(
					tagChange(
						state.mostRecentEdit.changeset.change.fieldChange,
						state.mostRecentEdit.changeset.revision,
					),
					tagFromIntention(undoIntention),
					false,
				),
				nodes: invertedNodeChanges,
			};

			yield {
				content: state.parent?.content,
				mostRecentEdit: {
					changeset: tagWrappedChangeInline(inverseChangeset, tagFromIntention(undoIntention)),
					intention: undoIntention,
					description: `Undo:${state.mostRecentEdit.description}`,
				},
				parent: state,
			};
		}
	};

/**
 * Runs a suite of axiomatic tests which use combinations of single edits that are valid to apply from an initial state.
 */
function runSingleEditRebaseAxiomSuite(initialState: OptionalFieldTestState) {
	const singleTestChanges = (prefix: string) =>
		generatePossibleSequenceOfEdits(initialState, generateChildStates, 1, prefix);

	/**
	 * This test simulates rebasing over an do-inverse pair.
	 */
	describe("A ↷ [B, B⁻¹] === A", () => {
		for (const [{ description: name1, changeset: change1 }] of singleTestChanges("A")) {
			for (const [{ description: name2, changeset: change2 }] of singleTestChanges("B")) {
				const title = `(${name1} ↷ ${name2}) ↷ ${name2}⁻¹ => ${name1}`;
				it(title, () => {
					const inv = tagRollbackInverse(
						invertWrapped(change2, tag1, true),
						tag1,
						change2.revision,
					);
					const r1 = rebaseWrappedTagged(change1, change2);
					const r2 = rebaseWrappedTagged(r1, inv);
					assert.deepEqual(r2.change, change1.change);
				});
			}
		}
	});

	/**
	 * This test simulates rebasing over an do-undo pair.
	 * It is different from the above in two ways:
	 * - The undo(B) changeset bears a different RevisionTag than B
	 * - The inverse produced by undo(B) is not a rollback
	 */
	describe("A ↷ [B, undo(B)] => A", () => {
		for (const [{ description: name1, changeset: change1 }] of singleTestChanges("A")) {
			for (const [{ description: name2, changeset: change2 }] of singleTestChanges("B")) {
				const title = `${name1} ↷ [${name2}, undo(${name2})] => ${name1}`;
				it(title, () => {
					const inv = tagWrappedChangeInline(invertWrapped(change2, tag1, false), tag1);
					const r1 = rebaseWrappedTagged(change1, change2);
					const r2 = rebaseWrappedTagged(r1, inv);
					assert.deepEqual(r2.change, change1.change);
				});
			}
		}
	});

	/**
	 * This test simulates sandwich rebasing:
	 * a change is first rebased over the inverse of a change it took for granted
	 * then rebased over the updated version of that change (the same as the original in our case).
	 *
	 * The first rebase (A ↷ B) is purely for the purpose of manufacturing a change to which we can
	 * apply the inverse of some change.
	 */
	describe("(A ↷ B) ↷ [B⁻¹, B] === A ↷ B", () => {
		for (const [{ description: name1, changeset: change1 }] of singleTestChanges("A")) {
			for (const [{ description: name2, changeset: change2 }] of singleTestChanges("B")) {
				const title = `${name1} ↷ [${name2}, ${name2}⁻¹, ${name2}] => ${name1} ↷ ${name2}`;
				it(title, () => {
					const inverse2 = tagRollbackInverse(
						invertWrapped(change2, tag1, true),
						tag1,
						change2.revision,
					);
					const r1 = rebaseWrappedTagged(change1, change2);
					const r2 = rebaseWrappedTagged(r1, inverse2);
					const r3 = rebaseWrappedTagged(r2, change2);
					assert.deepEqual(r3.change, r1.change);
				});
			}
		}
	});

	describe("A ○ A⁻¹ === ε", () => {
		for (const [{ description: name, changeset: change }] of singleTestChanges("A")) {
			it(`${name} ○ ${name}⁻¹ === ε`, () => {
				const inv = invertWrapped(change, tag1, true);
				const actual = composeWrapped(change, tagRollbackInverse(inv, tag1, change.revision));
				const delta = toDeltaWrapped(makeAnonChange(actual));
				assert.equal(isDeltaVisible(delta.local), false);
			});
		}
	});

	describe("A⁻¹ ○ A === ε", () => {
		for (const [{ description: name, changeset: change }] of singleTestChanges("A")) {
			it(`${name}⁻¹ ○ ${name} === ε`, () => {
				const inv = tagRollbackInverse(
					invertWrapped(change, tag1, true),
					tag1,
					change.revision,
				);
				const actual = composeWrapped(inv, change);
				const delta = toDeltaWrapped(makeAnonChange(actual));
				assert.equal(isDeltaVisible(delta.local), false);
			});
		}
	});
}

export function testRebaserAxioms() {
	describe("Rebaser Axioms", () => {
		describe("Using valid edits from an undefined field", () => {
			runSingleEditRebaseAxiomSuite({ content: undefined });
		});

		describe("Using valid edits from a field with content", () => {
			runSingleEditRebaseAxiomSuite({ content: "A" });
		});

		describeStress("Exhaustive", ({ stressMode }) => {
			runExhaustiveComposeRebaseSuite(
				[{ content: undefined }, { content: "A" }],
				generateChildStates,
				{
					rebase: rebaseWrapped,
					rebaseComposed: rebaseComposedWrapped,
					compose: composeWrapped,
					invert: invertWrapped,
					inlineRevision: inlineRevisionWrapped,
					assertEqual: assertWrappedEqual,
					createEmpty: () => ChangesetWrapper.create(Change.empty()),
					isEmpty: isWrappedChangeEmpty,
					assertChangesetsEquivalent: assertWrappedChangesetsEquivalent,
				},
				{
					numberOfEditsToRebase: 3,
					numberOfEditsToRebaseOver: stressMode !== StressMode.Short ? 5 : 3,
					numberOfEditsToVerifyAssociativity: stressMode !== StressMode.Short ? 6 : 3,
				},
			);
		});
	});
}

function assertWrappedEqual(
	a: TaggedChange<WrappedChangeset> | undefined,
	b: TaggedChange<WrappedChangeset> | undefined,
): void {
	if (a === undefined || b === undefined) {
		assert.equal(a, b);
		return;
	}

	ChangesetWrapper.assertEqual(a.change, b.change, (fieldA, fieldB) =>
		assertTaggedEqual({ ...a, change: fieldA }, { ...b, change: fieldB }),
	);
}

function inlineRevisionWrapped(
	change: WrappedChangeset,
	revision: RevisionTag,
): WrappedChangeset {
	return ChangesetWrapper.inlineRevision(change, revision, inlineRevision);
}

function inlineRevision(change: OptionalChangeset, revision: RevisionTag): OptionalChangeset {
	return optionalChangeRebaser.replaceRevisions(change, new Set([undefined]), revision);
}

function tagWrappedChangeInline(
	change: WrappedChangeset,
	revision: RevisionTag,
	rollbackOf?: RevisionTag,
): TaggedChange<WrappedChangeset> {
	const inlined = inlineRevisionWrapped(change, revision);
	return rollbackOf !== undefined
		? tagRollbackInverse(inlined, revision, rollbackOf)
		: tagChange(inlined, revision);
}
