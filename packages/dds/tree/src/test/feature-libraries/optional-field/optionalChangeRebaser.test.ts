/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { describeStress, StressMode } from "@fluid-private/stochastic-test-utils";
import {
	type ChangeAtomId,
	type ChangesetLocalId,
	type RevisionMetadataSource,
	type RevisionTag,
	type TaggedChange,
	makeAnonChange,
	rootFieldKey,
	tagChange,
} from "../../../core/index.js";
import {
	type FieldKindConfiguration,
	type ModularChangeset,
	type NodeId,
	type RebaseRevisionMetadata,
	makeModularChangeCodecFamily,
	rebaseRevisionMetadataFromInfo,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/index.js";
import {
	type OptionalChangeset,
	optionalFieldEditor,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/optional-field/index.js";
import { brand, fail } from "../../../util/index.js";
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
import {
	chunkFromJsonTrees,
	defaultRevInfosFromChanges,
	testRevisionTagCodec,
} from "../../utils.js";
import type { ChangesetWrapper } from "../../changesetWrapper.js";
import {
	intoDelta,
	makeFieldBatchCodec,
	type DefaultChangeset,
} from "../../../feature-libraries/index.js";
import {
	ModularChangeFamily,
	type FieldEditDescription,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/modularChangeFamily.js";
import {
	fieldKindConfigurations,
	fieldKinds,
	optional,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/default-schema/defaultFieldKinds.js";
import { ajvValidator } from "../../codec/index.js";
import type { ICodecOptions } from "../../../index.js";
import {
	assertEqual,
	empty,
	isModularEmpty,
	normalizeDelta,
	removeAliases,
	// eslint-disable-next-line import/no-internal-modules
} from "../modular-schema/modularChangesetUtil.js";

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

// function toDeltaWrapped(change: TaggedChange<WrappedChangeset>) {
// 	return ChangesetWrapper.toDelta(change.change, (c, deltaFromChild) =>
// 		toDelta(c, deltaFromChild),
// 	);
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

function invertModular(
	change: TaggedChange<ModularChangeset>,
	revision: RevisionTag,
	isRollback: boolean,
): ModularChangeset {
	return family.invert(change, isRollback, revision);
}

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

function rebaseModular(
	change: TaggedChange<ModularChangeset>,
	base: TaggedChange<ModularChangeset>,
	metadataArg?: RebaseRevisionMetadata,
): ModularChangeset {
	const metadata =
		metadataArg ??
		rebaseRevisionMetadataFromInfo(defaultRevInfosFromChanges([base]), undefined, [
			base.revision,
		]);
	return family.rebase(change, base, metadata);
}

function rebaseComposedModular(
	metadata: RebaseRevisionMetadata,
	change: TaggedChange<ModularChangeset>,
	...baseChanges: TaggedChange<ModularChangeset>[]
): ModularChangeset {
	const composed =
		baseChanges.length === 0
			? makeAnonChange(empty())
			: baseChanges.reduce((change1, change2) =>
					makeAnonChange(composeModular(change1, change2)),
				);

	return rebaseModular(change, composed, metadata);
}

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

function composeModular(
	change1: TaggedChange<ModularChangeset>,
	change2: TaggedChange<ModularChangeset>,
	metadata?: RevisionMetadataSource,
): ModularChangeset {
	return family.compose([change1, change2]);
}

// function isWrappedChangeEmpty(change: WrappedChangeset): boolean {
// 	const delta = toDeltaWrapped(makeAnonChange(change));
// 	return delta === undefined || !isDeltaVisible(delta);
// }

type OptionalFieldTestState = FieldStateTree<string | undefined, DefaultChangeset>;

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

type WrappedChangeset = ChangesetWrapper<OptionalChangeset>;

const codecOptions: ICodecOptions = {
	jsonValidator: ajvValidator,
};

const fieldKindConfiguration: FieldKindConfiguration =
	fieldKindConfigurations.get(4) ?? fail("Field kind configuration not found");
assert(
	fieldKindConfigurations.get(5) === undefined,
	"There's a newer configuration. It probably should be used.",
);

const codec = makeModularChangeCodecFamily(
	new Map([[1, fieldKindConfiguration]]),
	testRevisionTagCodec,
	makeFieldBatchCodec(codecOptions, 1),
	codecOptions,
);
const family = new ModularChangeFamily(fieldKinds, codec);
const editor = family.buildEditor(() => undefined);

/**
 * See {@link ChildStateGenerator}
 */
const generateChildStates: ChildStateGenerator<string | undefined, DefaultChangeset> =
	function* (
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
		const edits = getSequentialEdits(state);
		if (state.content !== undefined) {
			// Nested Change
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
						parent: { parent: undefined, parentField: rootFieldKey, parentIndex: 0 },
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
						description: `ChildChange${intention}`,
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
					content: undefined,
					mostRecentEdit: {
						changeset: tagChange(modularEdit, revision),
						intention,
						description: "Remove",
					},
					parent: state,
				};
			}
		} else {
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
				content: undefined,
				mostRecentEdit: {
					changeset: tagChange(modularEdit, revision),
					intention,
					description: "Remove",
				},
				parent: state,
			};
		}

		for (const value of ["A", "B"]) {
			const setIntention = mintIntention();
			const setRevision = tagFromIntention(setIntention);
			const [fill, detach] = [mintId(setRevision), mintId(setRevision)];
			// Using length of the input context guarantees set operations generated at different times also have different
			// values, which should tend to be easier to debug.
			// This also makes the logic to determine intentions simpler.
			const newContents = `${value},${edits.length}`;
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
					OptionalChange.set(state.content === undefined, {
						fill,
						detach,
					}),
				),
				revision: setRevision,
			};
			const modularEdit = editor.buildChanges([build, fieldEdit]);
			yield {
				content: newContents,
				mostRecentEdit: {
					changeset: tagChange(modularEdit, setRevision),
					intention: setIntention,
					description: `Set${newContents}`,
				},
				parent: state,
			};
		}

		if (state.mostRecentEdit !== undefined) {
			const undoIntention = mintIntention();
			const undoRevision = tagFromIntention(undoIntention);
			const modularEdit = family.invert(state.mostRecentEdit.changeset, false, undoRevision);

			yield {
				content: state.parent?.content,
				mostRecentEdit: {
					changeset: tagChange(modularEdit, undoRevision),
					intention: undoIntention,
					description: `Undo:${state.mostRecentEdit.description}`,
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

export function testRebaserAxioms() {
	describe("Rebaser Axioms", () => {
		// describe("Using valid edits from an undefined field", () => {
		// 	runSingleEditRebaseAxiomSuite({ content: undefined });
		// });

		// describe("Using valid edits from a field with content", () => {
		// 	runSingleEditRebaseAxiomSuite({ content: "A" });
		// });

		describeStress("Exhaustive", ({ stressMode }) => {
			runExhaustiveComposeRebaseSuite(
				[{ content: undefined }, { content: "A" }],
				generateChildStates,
				{
					rebase: rebaseModular,
					rebaseComposed: rebaseComposedModular,
					compose: composeModular,
					invert: invertModular,
					inlineRevision: inlineRevisionModular,
					assertEqual: assertModularEqual,
					createEmpty: empty,
					isEmpty: isModularEmpty,
					assertChangesetsEquivalent: assertModularChangesetsEquivalent,
				},
				{
					numberOfEditsToRebase: 3,
					numberOfEditsToRebaseOver: stressMode !== StressMode.Short ? 5 : 3,
					numberOfEditsToVerifyAssociativity: stressMode !== StressMode.Short ? 6 : 3,
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

function assertModularEqual(
	a: TaggedChange<ModularChangeset> | undefined,
	b: TaggedChange<ModularChangeset> | undefined,
): void {
	if (a === undefined || b === undefined) {
		assert.equal(a, b);
		return;
	}

	// Removing aliases ensures that we don't consider the changesets different if they only differ in their aliases.
	// It also means that we risk treating some changesets that are the same (once you consider aliases) as different.
	const aWithoutAliases = { ...a, change: removeAliases(a.change) };
	const bWithoutAliases = { ...b, change: removeAliases(b.change) };
	assertEqual(aWithoutAliases, bWithoutAliases);
}

function inlineRevisionModular(
	change: ModularChangeset,
	revision: RevisionTag,
): ModularChangeset {
	return family.changeRevision(change, revision);
}

// function inlineRevision(change: OptionalChangeset, revision: RevisionTag): OptionalChangeset {
// 	return optionalChangeRebaser.replaceRevisions(change, new Set([undefined]), revision);
// }

// function tagWrappedChangeInline(
// 	change: WrappedChangeset,
// 	revision: RevisionTag,
// 	rollbackOf?: RevisionTag,
// ): TaggedChange<WrappedChangeset> {
// 	const inlined = inlineRevisionModular(change, revision);
// 	return rollbackOf !== undefined
// 		? tagRollbackInverse(inlined, revision, rollbackOf)
// 		: tagChange(inlined, revision);
// }
