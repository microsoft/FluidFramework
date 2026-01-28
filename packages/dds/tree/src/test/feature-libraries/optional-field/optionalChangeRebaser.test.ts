/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { describeStress, StressMode } from "@fluid-private/stochastic-test-utils";

import {
	type ChangeAtomId,
	type ChangesetLocalId,
	type RevisionTag,
	type TaggedChange,
	areEqualChangeAtomIds,
	makeChangeAtomId,
	makeDetachedNodeId,
	rootFieldKey,
	tagChange,
} from "../../../core/index.js";
import {
	intoDelta,
	type DefaultChangeset,
	FieldKinds as defaultFieldKinds,
} from "../../../feature-libraries/index.js";
import type {
	ModularChangeset,
	NodeId,
	RebaseVersion,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/modular-schema/index.js";
import type {
	FieldEditDescription,
	GlobalEditDescription,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/modular-schema/modularChangeFamily.js";
import {
	optionalFieldEditor,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/optional-field/optionalField.js";
import { brand, brandConst } from "../../../util/index.js";
import {
	type ChildStateGenerator,
	type FieldStateTree,
	getSequentialEdits,
} from "../../exhaustiveRebaserUtils.js";
import { runExhaustiveComposeRebaseSuite } from "../../rebaserAxiomaticTests.js";
// TODO: Throughout this file, we use TestChange as the child change type.
// This is the same approach used in sequenceChangeRebaser.spec.ts, but it requires casting in this file
// since OptionalChangeset is not generic over the child changeset type.
// Search this file for "as any" and "as NodeChangeset"
import { chunkFromJsonTrees } from "../../utils.js";
import {
	defaultFamily,
	defaultFieldRebaser,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../default-field-kinds/defaultChangesetUtil.js";
import {
	assertEqual,
	normalizeDelta,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../modular-schema/modularChangesetUtil.js";

const optional = defaultFieldKinds.optional;

type RevisionTagMinter = () => RevisionTag;

function makeRevisionTagMinter(prefix = "rev"): RevisionTagMinter {
	// Rather than use UUIDs, allocate these sequentially for an easier time debugging tests.
	let currentRevision = 0;
	return () => `${prefix}${currentRevision++}` as unknown as RevisionTag;
}

const mintRevisionTag = makeRevisionTagMinter();
const tag1 = mintRevisionTag();

const OptionalChange = {
	set(
		wasEmpty: boolean,
		ids: {
			fill: ChangeAtomId;
			detach: ChangeAtomId;
			detachNode?: ChangeAtomId;
		},
	) {
		return optionalFieldEditor.set(wasEmpty, ids);
	},

	clear(wasEmpty: boolean, detachId: ChangeAtomId) {
		return optionalFieldEditor.clear(wasEmpty, detachId);
	},

	buildChildChange(childChange: NodeId) {
		return optionalFieldEditor.buildChildChanges([[0, childChange]]);
	},
};

// function toDelta(
// 	change: OptionalChangeset,
// 	deltaFromChild: ToDelta = TestNodeId.deltaFromChild,
// ): DeltaFieldChanges {
// 	return optionalFieldIntoDelta(change, deltaFromChild);
// }

// function getMaxId(...changes: OptionalChangeset[]): ChangesetLocalId | undefined {
// 	let max: ChangesetLocalId | undefined;
// 	const ingest = (candidate: ChangesetLocalId | undefined) => {
// 		if (max === undefined || (candidate !== undefined && candidate > max)) {
// 			max = candidate;
// 		}
// 	};

// 	for (const change of changes) {
// 		if (change.childChange !== undefined) {
// 			// Child changes do not need to be ingested for this test file, as TestChange (which is used as a child)
// 			// doesn't have any `ChangesetLocalId`s.
// 			ingest(change.childChange.localId);
// 		}

// 		if (change.valueReplace !== undefined) {
// 			ingest(change.valueReplace.dst.localId);
// 			if (change.valueReplace.src !== undefined && change.valueReplace.src !== "self") {
// 				ingest(change.valueReplace.src.localId);
// 			}
// 		}
// 	}

// 	return max;
// }

// function invert(
// 	change: TaggedChange<OptionalChangeset>,
// 	revision: RevisionTag | undefined,
// 	isRollback: boolean,
// ): OptionalChangeset {
// 	const inverted = optionalChangeRebaser.invert(
// 		change.change,
// 		isRollback,
// 		idAllocatorFromMaxId(),

// 		revision,
// 		failInvertManager,
// 		defaultRevisionMetadataFromChanges([change]),
// 	);
// 	verifyContextChain(change, makeAnonChange(inverted));
// 	return inverted;
// }

// function rebase(
// 	change: OptionalChangeset,
// 	base: TaggedChange<OptionalChangeset>,
// 	metadataArg?: RebaseRevisionMetadata,
// 	rebaseChild: NodeChangeRebaser = (id, baseId) => id,
// ): OptionalChangeset {
// 	deepFreeze(change);
// 	deepFreeze(base);

// 	const metadata =
// 		metadataArg ??
// 		rebaseRevisionMetadataFromInfo(defaultRevInfosFromChanges([base]), undefined, [
// 			base.revision,
// 		]);
// 	const moveEffects = failRebaseManager;
// 	const idAllocator = idAllocatorFromMaxId(getMaxId(change, base.change));
// 	const rebased = optionalChangeRebaser.rebase(
// 		change,
// 		base.change,
// 		rebaseChild,
// 		idAllocator,
// 		moveEffects,
// 		metadata,
// 	);
// 	verifyContextChain(base, makeAnonChange(rebased));
// 	return rebased;
// }

// function compose(
// 	change1: TaggedChange<OptionalChangeset>,
// 	change2: TaggedChange<OptionalChangeset>,
// 	metadata?: RevisionMetadataSource,
// 	composeChild: NodeChangeComposer = TestNodeId.composeChild,
// ): OptionalChangeset {
// 	verifyContextChain(change1, change2);
// 	const moveEffects = failComposeManager;
// 	const idAllocator = idAllocatorFromMaxId(getMaxId(change1.change, change2.change));
// 	return optionalChangeRebaser.compose(
// 		change1.change,
// 		change2.change,
// 		composeChild,
// 		idAllocator,
// 		moveEffects,
// 		metadata ?? defaultRevisionMetadataFromChanges([change1, change2]),
// 	);
// }

type OptionalFieldTestState = FieldStateTree<
	OptionalFieldTestContent,
	DefaultChangeset,
	OptionalChangeMetadata
>;

interface RootNode {
	readonly id: ChangeAtomId;
	readonly value: string;
}

interface OptionalFieldTestContent {
	readonly attached: string | undefined;
	readonly detached: readonly RootNode[];
}

interface OptionalChangeMetadata {
	readonly detach?: RootNode;
	readonly attach?: RootNode;
}

// function computeChildChangeInputContext(inputState: OptionalFieldTestState): number[] {
// 	// This is effectively a filter of the intentions from all edits such that it only includes
// 	// intentions for edits which modify the same child as the final one in the changeset.
// 	// Note: this takes a dependency on the fact that `generateChildStates` doesn't set matching string
// 	// content for what are meant to represent different nodes.
// 	const states = getSequentialStates(inputState);
// 	const finalContent = states.at(-1)?.content;
// 	assert(
// 		finalContent !== undefined,
// 		"Child change input context should only be computed when the optional field has content.",
// 	);
// 	const intentions: number[] = [];
// 	let currentContent: string | undefined;
// 	for (const state of states) {
// 		if (state.mostRecentEdit !== undefined && currentContent === finalContent) {
// 			const fieldChange = state.mostRecentEdit.changeset.change.fieldChanges.get(rootFieldKey);
// 			if (fieldChange === undefined) {
// 				continue;
// 			}
// 			const optionalFieldChange = fieldChange.change as OptionalChangeset;
// 			if (optionalFieldChange.childChange !== undefined) {
// 				intentions.push(state.mostRecentEdit.intention);
// 			}
// 		}

// 		currentContent = state.content;
// 	}

// 	return intentions;
// }

function makeChildStateGenerator(
	minRebaseVersion: RebaseVersion,
	maxRebaseVersion: RebaseVersion,
): ChildStateGenerator<OptionalFieldTestContent, DefaultChangeset, OptionalChangeMetadata> {
	return function* forEachRebaseVersions(
		state: OptionalFieldTestState,
		tagFromIntention: (intention: number) => RevisionTag,
		mintIntention: () => number,
	): Iterable<OptionalFieldTestState> {
		for (
			let rebaseVersion: RebaseVersion = minRebaseVersion;
			rebaseVersion <= maxRebaseVersion;
			rebaseVersion++
		) {
			yield* generateChildStateForRebaseVersion(
				rebaseVersion,
				state,
				tagFromIntention,
				mintIntention,
			);
		}
	};
}

const generateChildStateForRebaseVersion = function* (
	rebaseVersion: RebaseVersion,
	state: OptionalFieldTestState,
	tagFromIntention: (intention: number) => RevisionTag,
	mintIntention: () => number,
): Iterable<OptionalFieldTestState> {
	const mintId = (revision: RevisionTag): ChangeAtomId => {
		return {
			localId: mintIntention() as ChangesetLocalId,
			revision,
		};
	};
	const editor = defaultFamily.buildEditor(
		makeRevisionTagMinter(),
		() => undefined,
		rebaseVersion,
	);
	const edits = getSequentialEdits(state);
	const current = state.content.attached;
	const isEmpty = current === undefined;
	if (current === undefined) {
		// Clear Empty Field
		// Even if there is no content, optional field supports an explicit clear operation with LWW semantics,
		// as a concurrent set operation may populate the field.
		const intention = mintIntention();
		const revision = tagFromIntention(intention);
		const detach = mintId(revision);
		const fieldEdit: FieldEditDescription = {
			type: "field",
			field: { parent: undefined, field: rootFieldKey },
			fieldKind: optional.identifier,
			change: brand(OptionalChange.clear(true, detach)),
			revision,
		};
		const modularEdit = editor.buildChanges([fieldEdit]);
		yield {
			content: state.content,
			mostRecentEdit: {
				changeset: tagChange(modularEdit, revision),
				intention,
				description: `RemoveEV${rebaseVersion}`,
				meta: {},
			},
			parent: state,
		};
	} else {
		// Nested Change in Populated Field
		{
			const intention = mintIntention();
			const revision = tagFromIntention(intention);
			const fieldEdit: FieldEditDescription = {
				type: "field",
				field: { parent: undefined, field: rootFieldKey },
				fieldKind: optional.identifier,
				// This no-op change is used to force ModularChangeFamily to generate a shallow optional changeset with a child change.
				// Otherwise, it would generate a generic changeset.
				change: brand(optional.changeHandler.createEmpty()),
				revision,
			};
			const nestedFieldEdit: FieldEditDescription = {
				type: "field",
				field: {
					parent: {
						parent: undefined,
						parentField: rootFieldKey,
						parentIndex: 0,
						detachedNodeId: undefined,
					},
					field: brand("foo"),
				},
				fieldKind: optional.identifier,
				change: brand(OptionalChange.clear(true, mintId(revision))),
				revision,
			};
			const modularEdit = editor.buildChanges([fieldEdit, nestedFieldEdit]);
			yield {
				content: state.content,
				mostRecentEdit: {
					changeset: tagChange(modularEdit, revision),
					intention,
					description: `AttachedNodeChangeV${rebaseVersion}`,
					meta: {},
				},
				parent: state,
			};
		}

		// Clear Populated Field
		{
			const intention = mintIntention();
			const revision = tagFromIntention(intention);
			const detach = mintId(revision);
			const fieldEdit: FieldEditDescription = {
				type: "field",
				field: { parent: undefined, field: rootFieldKey },
				fieldKind: optional.identifier,
				change: brand(OptionalChange.clear(false, detach)),
				revision,
			};
			const modularEdit = editor.buildChanges([fieldEdit]);
			yield {
				content: {
					attached: undefined,
					detached: [...state.content.detached, { id: detach, value: current }],
				},
				mostRecentEdit: {
					changeset: tagChange(modularEdit, revision),
					intention,
					description: `RemoveV${rebaseVersion}`,
					meta: { detach: { id: detach, value: current } },
				},
				parent: state,
			};
		}

		// Pin node
		{
			const intention = mintIntention();
			const revision = tagFromIntention(intention);
			const [detach, attach] = [mintId(revision), mintId(revision)];
			const fieldEdit: FieldEditDescription = {
				type: "field",
				field: { parent: undefined, field: rootFieldKey },
				fieldKind: optional.identifier,
				change: brand(OptionalChange.set(false, { detach, fill: attach, detachNode: attach })),
				revision,
			};

			const modularEdit = editor.buildChanges([fieldEdit]);
			yield {
				content: state.content,
				mostRecentEdit: {
					changeset: tagChange(modularEdit, revision),
					intention,
					description: `PinV${rebaseVersion}`,
					meta: {},
				},
				parent: state,
			};
		}
	}

	// Set
	{
		const setIntention = mintIntention();
		const setRevision = tagFromIntention(setIntention);
		const [fill, detach] = [mintId(setRevision), mintId(setRevision)];
		// Using length of the input context guarantees set operations generated at different times also have different
		// values, which should tend to be easier to debug.
		// This also makes the logic to determine intentions simpler.
		const newContents = `N${edits.length}`;
		const build = editor.buildTrees(
			fill.localId,
			chunkFromJsonTrees([newContents]),
			setRevision,
		);
		const fieldEdit: FieldEditDescription = {
			type: "field",
			field: { parent: undefined, field: rootFieldKey },
			fieldKind: optional.identifier,
			change: brand(
				OptionalChange.set(isEmpty, {
					fill,
					detach,
				}),
			),
			revision: setRevision,
		};
		const detached = [...state.content.detached];
		let detachedNode: RootNode | undefined;
		if (!isEmpty) {
			detachedNode = { id: detach, value: current };
			detached.push(detachedNode);
		}
		const modularEdit = editor.buildChanges([build, fieldEdit]);
		yield {
			content: { attached: newContents, detached },
			mostRecentEdit: {
				changeset: tagChange(modularEdit, setRevision),
				intention: setIntention,
				description: `SetV${rebaseVersion}:${newContents}`,
				meta: {
					detach: detachedNode,
					attach: { id: fill, value: newContents },
				},
			},
			parent: state,
		};
	}

	// Build
	if (state.content.detached.length === 0) {
		const buildIntention = mintIntention();
		const buildRevision = tagFromIntention(buildIntention);
		const id = mintId(buildRevision);
		// Using length of the input context guarantees set operations generated at different times also have different
		// values, which should tend to be easier to debug.
		// This also makes the logic to determine intentions simpler.
		const newContents = `N${edits.length}`;
		const build = editor.buildTrees(
			id.localId,
			chunkFromJsonTrees([newContents]),
			buildRevision,
		);
		const detached = [...state.content.detached, { id, value: newContents }];
		const modularEdit = editor.buildChanges([build]);
		yield {
			content: { attached: current, detached },
			mostRecentEdit: {
				changeset: tagChange(modularEdit, buildRevision),
				intention: buildIntention,
				description: `BuildV${rebaseVersion}:${newContents}`,
				meta: {},
			},
			parent: state,
		};
	}

	// Attach
	if (rebaseVersion >= 2) {
		for (const node of state.content.detached) {
			const attachIntention = mintIntention();
			const attachRevision = tagFromIntention(attachIntention);
			const [attach, detach] = [mintId(attachRevision), mintId(attachRevision)];
			const rename: GlobalEditDescription = {
				type: "global",
				revision: attachRevision,
				renames: [
					{
						count: 1,
						oldId: node.id,
						newId: attach,
						detachLocation: undefined,
					},
				],
			};
			const fieldEdit: FieldEditDescription = {
				type: "field",
				field: { parent: undefined, field: rootFieldKey },
				fieldKind: optional.identifier,
				change: brand(OptionalChange.set(isEmpty, { fill: attach, detach })),
				revision: attachRevision,
			};
			const modularEdit = editor.buildChanges([rename, fieldEdit]);
			const detached = state.content.detached.filter((n) => n !== node);
			let detachedNode: RootNode | undefined;
			if (!isEmpty) {
				detachedNode = { id: detach, value: current };
				detached.push(detachedNode);
			}
			yield {
				content: { attached: node.value, detached },
				mostRecentEdit: {
					changeset: tagChange(modularEdit, attachRevision),
					intention: attachIntention,
					description: `AttachV${rebaseVersion}:${node.value}`,
					meta: {
						detach: detachedNode,
						attach: node,
					},
				},
				parent: state,
			};
			break; // Only try this for one node in order to keep the set of possible edits manageable
		}
	}

	// Nested change in detached node
	if (rebaseVersion >= 2) {
		for (const node of state.content.detached) {
			const intention = mintIntention();
			const revision = tagFromIntention(intention);
			const nestedFieldEdit: FieldEditDescription = {
				type: "field",
				field: {
					parent: {
						parent: undefined,
						parentField: brand("detached-root"),
						parentIndex: 0,
						detachedNodeId: makeDetachedNodeId(node.id.revision, node.id.localId),
					},
					field: brand("foo"),
				},
				fieldKind: optional.identifier,
				change: brand(OptionalChange.clear(true, mintId(revision))),
				revision,
			};
			const modularEdit = editor.buildChanges([nestedFieldEdit]);
			yield {
				content: state.content,
				mostRecentEdit: {
					changeset: tagChange(modularEdit, revision),
					intention,
					description: `DetachedNodeChangeV${rebaseVersion}`,
					meta: {},
				},
				parent: state,
			};
			break; // Only try this for one node in order to keep the set of possible edits manageable
		}
	}

	// Undo
	if (
		state.mostRecentEdit !== undefined &&
		!state.mostRecentEdit.description.startsWith("Rollback")
	) {
		const { detach: priorDetach, attach: priorAttach } =
			state.mostRecentEdit.meta ?? assert.fail();
		const undoIntention = mintIntention();
		const undoRevision = tagFromIntention(undoIntention);
		const modularEdit = defaultFamily.invert(
			state.mostRecentEdit.changeset,
			false,
			undoRevision,
		);
		const changeset = tagChange(modularEdit, undoRevision);
		let attached: string | undefined;
		const detached = [...state.content.detached];
		let newAttach: RootNode | undefined;
		let newDetach: RootNode | undefined;
		if (priorDetach !== undefined) {
			const entryIndex = detached.findIndex((node) =>
				areEqualChangeAtomIds(node.id, priorDetach.id),
			);
			assert(entryIndex >= 0, "Expected detached node to be present");
			attached = priorDetach.value;
			detached.splice(entryIndex, 1);
			newAttach = priorDetach;
		}
		if (priorAttach !== undefined) {
			const undoMark = intoDelta(changeset).fields?.get(rootFieldKey)?.at(0) ?? assert.fail();
			const detachId = undoMark.detach ?? assert.fail("Expected detach");
			const id = makeChangeAtomId(brand(detachId.minor), detachId.major);
			newDetach = { id, value: priorAttach.value };
			detached.push(newDetach);
		}
		yield {
			content: { attached, detached },
			mostRecentEdit: {
				changeset,
				intention: undoIntention,
				description: `Undo:${state.mostRecentEdit.description}`,
				meta: {
					attach: newAttach,
					detach: newDetach,
				},
			},
			parent: state,
		};
	}

	// Rollback
	if (
		state.mostRecentEdit !== undefined &&
		!state.mostRecentEdit.description.startsWith("Rollback")
	) {
		const intention = mintIntention();
		const revision = tagFromIntention(intention);
		const modularEdit = defaultFamily.invert(state.mostRecentEdit.changeset, true, revision);

		yield {
			content: (state.parent ?? assert.fail()).content,
			mostRecentEdit: {
				changeset: tagChange(modularEdit, revision),
				intention,
				description: `Rollback:${state.mostRecentEdit.description}`,
			},
			parent: state,
		};
	}
};

// /**
//  * Runs a suite of axiomatic tests which use combinations of single edits that are valid to apply from an initial state.
//  */
// function runSingleEditRebaseAxiomSuite(initialState: OptionalFieldTestState) {
// 	const singleTestChanges = (prefix: string) =>
// 		generatePossibleSequenceOfEdits(initialState, generateChildStates, 1, prefix);

// 	/**
// 	 * This test simulates rebasing over an do-inverse pair.
// 	 */
// 	describe("A ↷ [B, B⁻¹] === A", () => {
// 		for (const [{ description: name1, changeset: change1 }] of singleTestChanges("A")) {
// 			for (const [{ description: name2, changeset: change2 }] of singleTestChanges("B")) {
// 				const title = `(${name1} ↷ ${name2}) ↷ ${name2}⁻¹ => ${name1}`;
// 				it(title, () => {
// 					const inv = tagRollbackInverse(
// 						invertWrapped(change2, tag1, true),
// 						tag1,
// 						change2.revision,
// 					);
// 					const r1 = rebaseWrappedTagged(change1, change2);
// 					const r2 = rebaseWrappedTagged(r1, inv);
// 					assert.deepEqual(r2.change, change1.change);
// 				});
// 			}
// 		}
// 	});

// 	/**
// 	 * This test simulates rebasing over an do-undo pair.
// 	 * It is different from the above in two ways:
// 	 * - The undo(B) changeset bears a different RevisionTag than B
// 	 * - The inverse produced by undo(B) is not a rollback
// 	 */
// 	describe("A ↷ [B, undo(B)] => A", () => {
// 		for (const [{ description: name1, changeset: change1 }] of singleTestChanges("A")) {
// 			for (const [{ description: name2, changeset: change2 }] of singleTestChanges("B")) {
// 				const title = `${name1} ↷ [${name2}, undo(${name2})] => ${name1}`;
// 				it(title, () => {
// 					const inv = tagWrappedChangeInline(invertWrapped(change2, tag1, false), tag1);
// 					const r1 = rebaseWrappedTagged(change1, change2);
// 					const r2 = rebaseWrappedTagged(r1, inv);
// 					assert.deepEqual(r2.change, change1.change);
// 				});
// 			}
// 		}
// 	});

// 	/**
// 	 * This test simulates sandwich rebasing:
// 	 * a change is first rebased over the inverse of a change it took for granted
// 	 * then rebased over the updated version of that change (the same as the original in our case).
// 	 *
// 	 * The first rebase (A ↷ B) is purely for the purpose of manufacturing a change to which we can
// 	 * apply the inverse of some change.
// 	 */
// 	describe("(A ↷ B) ↷ [B⁻¹, B] === A ↷ B", () => {
// 		for (const [{ description: name1, changeset: change1 }] of singleTestChanges("A")) {
// 			for (const [{ description: name2, changeset: change2 }] of singleTestChanges("B")) {
// 				const title = `${name1} ↷ [${name2}, ${name2}⁻¹, ${name2}] => ${name1} ↷ ${name2}`;
// 				it(title, () => {
// 					const inverse2 = tagRollbackInverse(
// 						invertWrapped(change2, tag1, true),
// 						tag1,
// 						change2.revision,
// 					);
// 					const r1 = rebaseWrappedTagged(change1, change2);
// 					const r2 = rebaseWrappedTagged(r1, inverse2);
// 					const r3 = rebaseWrappedTagged(r2, change2);
// 					assert.deepEqual(r3.change, r1.change);
// 				});
// 			}
// 		}
// 	});

// 	describe("A ○ A⁻¹ === ε", () => {
// 		for (const [{ description: name, changeset: change }] of singleTestChanges("A")) {
// 			it(`${name} ○ ${name}⁻¹ === ε`, () => {
// 				const inv = invertWrapped(change, tag1, true);
// 				const actual = composeWrapped(change, tagRollbackInverse(inv, tag1, change.revision));
// 				const delta = toDeltaWrapped(makeAnonChange(actual));
// 				assert.equal(isDeltaVisible(delta), false);
// 			});
// 		}
// 	});

// 	describe("A⁻¹ ○ A === ε", () => {
// 		for (const [{ description: name, changeset: change }] of singleTestChanges("A")) {
// 			it(`${name}⁻¹ ○ ${name} === ε`, () => {
// 				const inv = tagRollbackInverse(
// 					invertWrapped(change, tag1, true),
// 					tag1,
// 					change.revision,
// 				);
// 				const actual = composeWrapped(inv, change);
// 				const delta = toDeltaWrapped(makeAnonChange(actual));
// 				assert.equal(isDeltaVisible(delta), false);
// 			});
// 		}
// 	});
// }

export function testRebaserAxioms(): void {
	describe("Rebaser Axioms", () => {
		// describe("Using valid edits from an undefined field", () => {
		// 	runSingleEditRebaseAxiomSuite({ content: undefined });
		// });

		// describe("Using valid edits from a field with content", () => {
		// 	runSingleEditRebaseAxiomSuite({ content: "A" });
		// });

		describeStress("Exhaustive", ({ stressMode }) => {
			runExhaustiveComposeRebaseSuite<
				OptionalFieldTestContent,
				DefaultChangeset,
				OptionalChangeMetadata
			>(
				[
					{
						content: {
							attached: undefined,
							detached: [
								{
									id: {
										revision: mintRevisionTag(),
										localId: brandConst(0)<ChangesetLocalId>(),
									},
									value: "A",
								},
							],
						},
					},
					{ content: { attached: "A", detached: [] } },
				],
				makeChildStateGenerator(1, 2),
				defaultFieldRebaser,
				{
					numberOfEditsToRebase: 2,
					numberOfEditsToRebaseOver: stressMode === StressMode.Short ? 2 : 5,
					numberOfEditsToVerifyAssociativity: stressMode === StressMode.Short ? 2 : 6,
					groupSubSuites: false,
				},
			);
		});
	});
}

export function assertModularChangesetsEquivalent(
	change1: TaggedChange<ModularChangeset>,
	change2: TaggedChange<ModularChangeset>,
) {
	const actualDelta = normalizeDelta(intoDelta(change1));
	const expectedDelta = normalizeDelta(intoDelta(change2));
	assertEqual(actualDelta, expectedDelta);
}
