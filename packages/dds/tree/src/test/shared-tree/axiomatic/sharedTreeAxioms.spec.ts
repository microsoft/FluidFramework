/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mock } from "node:test";

import { currentVersion } from "../../../codec/index.js";
import { makeAnonChange, tagChange, type TaggedChange } from "../../../core/index.js";
import { fieldBatchCodecBuilder } from "../../../feature-libraries/index.js";
import {
	ForestTypeOptimized,
	ForestTypeReference,
	type SharedTreeChange,
	type TreeCheckout,
} from "../../../shared-tree/index.js";
import {
	SharedTreeChangeFamily,
	// eslint-disable-next-line import-x/no-internal-modules -- Exercise the production change family directly.
} from "../../../shared-tree/sharedTreeChangeFamily.js";
import { ajvValidator } from "../../codec/index.js";
import {
	defaultRevisionMetadataFromChanges,
	expectJsonTree,
	mintRevisionTag,
	testIdCompressor,
	testRevisionTagCodec,
} from "../../utils.js";

import { generateSharedTreeHistories, type SharedTreeHistory } from "./historyGeneration.js";
import {
	createMultiFieldFixture,
	multiFieldContent,
	multiFieldOperations,
} from "./multiFieldFixture.js";
import {
	SharedTreeAxiomAdapter,
	assertSharedTreeChangeHasNoEffects,
	assertSharedTreeChangesEqual,
	assertSharedTreeReplayEqual,
	verifySharedTreeRebaseOverComposition,
} from "./sharedTreeAxioms.js";

function createFamily(): SharedTreeChangeFamily {
	const options = { jsonValidator: ajvValidator, minVersionForCollab: currentVersion };
	return new SharedTreeChangeFamily(
		testRevisionTagCodec,
		fieldBatchCodecBuilder.build(options),
		options,
		undefined,
		testIdCompressor,
	);
}

function changes(history: SharedTreeHistory): TaggedChange<SharedTreeChange>[] {
	return history.map((entry) => entry.change);
}

function withTrace(histories: readonly SharedTreeHistory[], run: () => void): void {
	try {
		run();
	} catch (error) {
		throw new Error(
			`SharedTree axiom failed for ${JSON.stringify(histories.map((history) => history.map((entry) => entry.description)))}`,
			{ cause: error },
		);
	}
}

describe("SharedTree axioms: bounded multi-field histories", () => {
	for (const [name, forestType] of [
		["reference forest", ForestTypeReference],
		["optimized forest", ForestTypeOptimized],
	] as const) {
		describe(name, () => {
			let parent: TreeCheckout;
			let adapter: SharedTreeAxiomAdapter;
			beforeEach(() => {
				parent = createMultiFieldFixture(forestType);
				adapter = new SharedTreeAxiomAdapter(createFamily(), mintRevisionTag);
			});
			afterEach(() => {
				try {
					expectJsonTree(parent, multiFieldContent(["A"], ["B"]));
				} finally {
					parent.dispose();
				}
			});

			it("composition and rebase identities for all seven initial operations", () => {
				let count = 0;
				for (const history of generateSharedTreeHistories(parent, multiFieldOperations, 1)) {
					withTrace([history], () => {
						const edit = history[0].change;
						const empty = adapter.empty();
						const metadata = defaultRevisionMetadataFromChanges([empty, edit]);
						assertSharedTreeChangesEqual(adapter.rebase(edit, empty, metadata), edit);
						assertSharedTreeChangesEqual(adapter.rebase(empty, edit, metadata), empty);
						for (const composition of [
							adapter.compose([edit, empty]),
							adapter.compose([empty, edit]),
						]) {
							assertSharedTreeChangesEqual(composition, makeAnonChange(edit.change));
							assertSharedTreeReplayEqual(parent, [composition], [edit], mintRevisionTag());
						}
					});
					count++;
				}
				assert.equal(count, 7);
			});

			it("composes each operation with its rollback to a change with no effects", () => {
				for (const history of generateSharedTreeHistories(parent, multiFieldOperations, 1)) {
					withTrace([history], () => {
						const edit = history[0].change;
						const rollback = adapter.invert(edit, true);
						assert.equal(rollback.rollbackOf, edit.revision);
						assert.equal(typeof rollback.revision, "number");
						const composed = adapter.compose([edit, rollback]);
						assertSharedTreeChangeHasNoEffects(composed);
						assertSharedTreeReplayEqual(parent, [composed], [], mintRevisionTag());
					});
				}
			});

			it("composition matches sequential replay for all 41 two-edit histories", () => {
				let count = 0;
				for (const history of generateSharedTreeHistories(parent, multiFieldOperations, 2)) {
					withTrace([history], () => {
						const edits = changes(history);
						assertSharedTreeReplayEqual(
							parent,
							[adapter.compose(edits)],
							edits,
							mintRevisionTag(),
						);
					});
					count++;
				}
				assert.equal(count, 41);
			});

			it("composition is associative for all 235 three-edit histories", () => {
				let count = 0;
				for (const history of generateSharedTreeHistories(parent, multiFieldOperations, 3)) {
					withTrace([history], () => {
						const [a, b, c] = changes(history);
						const left = adapter.compose([adapter.compose([a, b]), c]);
						const right = adapter.compose([a, adapter.compose([b, c])]);
						assertSharedTreeChangesEqual(left, right);
						assertSharedTreeChangesEqual(left, adapter.compose([a, b, c]));
					});
					count++;
				}
				assert.equal(count, 235);
			});

			it("rebases seven concurrent operations over all 41 two-edit histories", () => {
				const locals = [...generateSharedTreeHistories(parent, multiFieldOperations, 1)];
				const bases = [...generateSharedTreeHistories(parent, multiFieldOperations, 2)];
				let count = 0;
				for (const local of locals) {
					for (const base of bases) {
						withTrace([local, base], () => {
							const edits = changes(base);
							const rebased = verifySharedTreeRebaseOverComposition(
								adapter,
								local[0].change,
								edits,
							);
							assertSharedTreeReplayEqual(
								parent,
								[adapter.compose(edits), rebased],
								[...edits, rebased],
								mintRevisionTag(),
							);
						});
						count++;
					}
				}
				assert.equal(count, 287);
			});
		});
	}
});

describe("SharedTree axiom infrastructure: adapter and assertions", () => {
	let parent: TreeCheckout;
	let family: SharedTreeChangeFamily;
	let adapter: SharedTreeAxiomAdapter;
	let edit: TaggedChange<SharedTreeChange>;
	beforeEach(() => {
		parent = createMultiFieldFixture(ForestTypeReference);
		family = createFamily();
		adapter = new SharedTreeAxiomAdapter(family, mintRevisionTag);
		const histories = [...generateSharedTreeHistories(parent, multiFieldOperations, 1)];
		edit = histories[0][0].change;
	});
	afterEach(() => {
		mock.restoreAll();
		parent.dispose();
	});

	it("routes complete envelopes through the production family", () => {
		const compose = mock.method(family, "compose");
		const invert = mock.method(family, "invert");
		const rebase = mock.method(family, "rebase");
		const empty = adapter.empty();
		const metadata = defaultRevisionMetadataFromChanges([edit, empty]);
		adapter.compose([edit]);
		adapter.invert(edit, false);
		adapter.rebase(edit, empty, metadata);
		adapter.rebaseOverComposition(edit, [empty], metadata);
		assert.equal(compose.mock.callCount(), 2);
		assert.equal(compose.mock.calls[0].arguments[0][0], edit);
		assert.equal(invert.mock.callCount(), 1);
		assert.equal(invert.mock.calls[0].arguments[0], edit);
		assert.equal(invert.mock.calls[0].arguments[1], false);
		assert.equal(rebase.mock.callCount(), 2);
		assert.equal(rebase.mock.calls[0].arguments[0], edit);
		assert.equal(rebase.mock.calls[0].arguments[2], metadata);
	});

	it("does not swallow family failures", () => {
		const failure = new Error("family failure");
		mock.method(family, "compose", () => {
			throw failure;
		});
		assert.throws(
			() => adapter.compose([edit]),
			(error) => error === failure,
		);
	});

	it("effect assertion rejects a nonempty result and accepts both empty representations", () => {
		assert.throws(
			() => assertSharedTreeChangeHasNoEffects(edit),
			/Unexpected (attachment|detachment)/,
		);
		assertSharedTreeChangeHasNoEffects(adapter.empty());
		const emptyData = adapter.compose([edit, adapter.invert(edit, true)]);
		assert.equal(emptyData.change.changes.length, 1);
		assertSharedTreeChangeHasNoEffects(emptyData);
		assert.throws(() =>
			assertSharedTreeChangesEqual(
				emptyData,
				makeAnonChange(SharedTreeChangeFamily.emptyChange),
			),
		);
	});

	it("structural equality checks outer revision and rollback tags", () => {
		assertSharedTreeChangesEqual(edit, edit);
		assert.throws(() =>
			assertSharedTreeChangesEqual(edit, tagChange(edit.change, mintRevisionTag())),
		);
		assert.throws(() =>
			assertSharedTreeChangesEqual(edit, { ...edit, rollbackOf: edit.revision }),
		);
	});

	it("preserves schema entries, their ordering, and schema-conflict behavior", () => {
		const schema: SharedTreeChange = {
			changes: [
				{
					type: "schema",
					innerChange: {
						schema: { old: parent.storedSchema.clone(), new: parent.storedSchema.clone() },
						isInverse: false,
					},
				},
			],
		};
		const schemaEdit = tagChange(schema, mintRevisionTag());
		const composed = adapter.compose([edit, schemaEdit]);
		assert.deepEqual(
			composed.change.changes.map((entry) => entry.type),
			["data", "schema"],
		);
		assert.throws(() =>
			assertSharedTreeChangesEqual(composed, adapter.compose([schemaEdit, edit])),
		);
		assert.throws(() => assertSharedTreeChangeHasNoEffects(schemaEdit), /data-only/);
		const inverse = adapter.invert(schemaEdit, false);
		assert.throws(() =>
			assertSharedTreeChangesEqual(makeAnonChange(inverse.change), makeAnonChange(schema)),
		);
		const metadata = defaultRevisionMetadataFromChanges([schemaEdit, edit]);
		assert.deepEqual(
			adapter.rebase(edit, schemaEdit, metadata).change,
			SharedTreeChangeFamily.emptyChange,
		);
	});
});
