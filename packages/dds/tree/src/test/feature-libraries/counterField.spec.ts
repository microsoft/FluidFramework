/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { currentVersion, makeCodecFamily } from "../../codec/index.js";
import {
	applyDelta,
	combineVisitors,
	makeAnonChange,
	makeDetachedFieldIndex,
	revisionMetadataSourceFromInfo,
	rootFieldKey,
	type FieldKey,
	type IEditableForest,
	type TreeChunk,
	type ChangeAtomId,
	TreeStoredSchemaRepository,
	ObjectNodeStoredSchema,
	LeafNodeStoredSchema,
	ValueSchema,
	type TreeNodeStoredSchema,
	type TreeNodeSchemaIdentifier,
} from "../../core/index.js";
import {
	buildChunkedForest,
	buildForest,
	cursorForJsonableTreeField,
	defaultIncrementalEncodingPolicy,
	defaultSchemaPolicy,
	FieldKinds,
	makeTreeChunker,
	ModularChangeFamily,
	type ModularChangeset,
	newChangeAtomIdBTree,
	DefaultRevisionReplacer,
	type FieldChangeEncodingContext,
	type FieldChangeDecodingContext,
	counter,
	counterChangeHandler,
} from "../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { BasicChunk } from "../../feature-libraries/chunked-forest/basicChunk.js";
// eslint-disable-next-line import-x/no-internal-modules
import { intoDelta } from "../../feature-libraries/modular-schema/modularChangeFamily.js";
// eslint-disable-next-line import-x/no-internal-modules
import { minimizeModularChangeset } from "../../feature-libraries/modular-schema/minimizeModularChange.js";
import { brand, Breakable } from "../../util/index.js";
import { ajvValidator } from "../codec/index.js";
import { mintRevisionTag, testIdCompressor, testRevisionTagCodec } from "../utils.js";
import { initializeForest } from "./initializeForest.js";
// eslint-disable-next-line import-x/no-internal-modules
import { Change } from "./modular-schema/modularChangesetUtil.js";

const kinds = new Map(defaultSchemaPolicy.fieldKinds);
kinds.set(counter.identifier, counter);
const family = new ModularChangeFamily(kinds, makeCodecFamily([]), {
	jsonValidator: ajvValidator,
	minVersionForCollab: currentVersion,
});
const key: FieldKey = brand("count");
const atom = (id: number): ChangeAtomId => ({ localId: brand(id) });

/**
 * Edits the counter under an existing Box, exercising nested field-delta aggregation.
 * Reuses temporary IDs intentionally: each applied counter delta must release them.
 */
function addition(before: number, amount: number): ModularChangeset {
	return Change.build(
		{ family, maxId: 100 },
		Change.field(
			rootFieldKey,
			FieldKinds.optional.identifier,
			FieldKinds.optional.changeHandler.createEmpty(),
			Change.node(
				0,
				Change.field(
					key,
					counter.identifier,
					counterChangeHandler.editor.add(before, amount, atom(10), atom(11)),
				),
			),
		),
	);
}

const factories: [string, () => IEditableForest][] = [
	["reference", () => buildForest(new Breakable("counter test"))],
	[
		"optimized",
		() =>
			buildChunkedForest(
				makeTreeChunker(
					new TreeStoredSchemaRepository({
						rootFieldSchema: {
							kind: FieldKinds.optional.identifier,
							types: new Set([brand("Box")]),
							persistedMetadata: undefined,
						},
						nodeSchema: new Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>([
							[
								brand("Box"),
								new ObjectNodeStoredSchema(
									new Map([
										[
											key,
											{
												kind: counter.identifier,
												types: new Set([brand("com.fluidframework.leaf.number")]),
												persistedMetadata: undefined,
											},
										],
									]),
								),
							],
							[
								brand("com.fluidframework.leaf.number"),
								new LeafNodeStoredSchema(ValueSchema.Number),
							],
						]),
					}),
					{ fieldKinds: kinds },
					defaultIncrementalEncodingPolicy,
				),
			),
	],
];

describe("Native counter change pipeline", () => {
	it("aggregates nested field work alongside outer builds and destructions", () => {
		const builds = newChangeAtomIdBTree<TreeChunk>();
		builds.set([undefined, brand(50)], new BasicChunk(brand("Box"), new Map()));
		const destroys = newChangeAtomIdBTree<number>();
		destroys.set([undefined, brand(60)], 1);
		const delta = intoDelta(makeAnonChange({ ...addition(200, 3), builds, destroys }), kinds);
		assert.deepEqual(
			delta.build?.map((build) => build.id.minor),
			[10, 50],
		);
		assert.deepEqual(
			delta.destroy?.map((destroy) => destroy.id.minor),
			[11, 60],
		);
	});

	it("round trips changes and empty edits through the field codec", () => {
		const codec = counterChangeHandler.codecsFactory(testRevisionTagCodec).resolve(1);
		const revision = mintRevisionTag();
		const context: FieldChangeEncodingContext & FieldChangeDecodingContext = {
			baseContext: {
				originatorId: testIdCompressor.localSessionId,
				idCompressor: testIdCompressor,
				revision: undefined,
				isSummary: false,
			},
			encodeNode: () => assert.fail("Counters have no child changes"),
			decodeNode: () => assert.fail("Counters have no child changes"),
		};
		const change = counterChangeHandler.editor.add(
			200,
			-5,
			{ ...atom(10), revision },
			{ ...atom(11), revision },
		);
		for (const input of [change, undefined]) {
			const encoded = codec.encode(input, context);
			assert.deepEqual(codec.decode(JSON.parse(JSON.stringify(encoded)), context), input);
		}
	});

	it("replaces both temporary IDs and filters value edits atomically", () => {
		const change = counterChangeHandler.editor.add(200, 3, atom(10), atom(11));
		assert(change !== undefined);
		const revision = mintRevisionTag();
		const updated = counterChangeHandler.rebaser.replaceRevisions(
			change,
			new DefaultRevisionReplacer(revision, new Set([undefined])),
		);
		assert(updated !== undefined);
		assert.equal(updated.fillId.revision, revision);
		assert.equal(updated.detachId.revision, revision);
		assert.notEqual(updated.fillId.localId, updated.detachId.localId);
		const options = {
			filterAttach: () => assert.fail("Value edits must not filter temporary attaches"),
			filterDetach: () => assert.fail("Value edits must not filter temporary detaches"),
			preserveOtherEdits: false,
		};
		assert.equal(counterChangeHandler.rebaser.filterEdits(change, options), undefined);
		assert.equal(
			counterChangeHandler.rebaser.filterEdits(change, {
				...options,
				preserveValueChanges: true,
			}),
			change,
		);
		assert.deepEqual(
			counterChangeHandler.intoDelta(undefined, () => assert.fail()),
			{},
		);
	});

	it("does not materialize field work for a conflicted change, but preserves outer builds", () => {
		const builds = newChangeAtomIdBTree<TreeChunk>();
		builds.set([undefined, brand(50)], new BasicChunk(brand("Box"), new Map()));
		const delta = intoDelta(
			makeAnonChange({
				...addition(200, 3),
				builds,
				constraintViolationCount: 1,
			}),
			kinds,
		);
		assert.equal(delta.build?.length, 1);
		assert.deepEqual(delta.build?.[0]?.id, { minor: 50 });
		assert.equal(delta.destroy, undefined);
		assert.equal(delta.fields, undefined);
	});

	for (const [name, factory] of factories) {
		describe(name, () => {
			function setup(initial = 200) {
				const forest = factory();
				initializeForest(
					forest,
					cursorForJsonableTreeField([
						{
							type: brand("Box"),
							fields: {
								count: [{ type: brand("com.fluidframework.leaf.number"), value: initial }],
							},
						},
					]),
					true,
				);
				const index = makeDetachedFieldIndex();
				return {
					forest,
					index,
					apply(change: ModularChangeset) {
						applyDelta(
							intoDelta(makeAnonChange(change), kinds),
							undefined,
							{
								acquireVisitor: () =>
									combineVisitors([forest.acquireVisitor(), forest.anchors.acquireVisitor()]),
							},
							index,
						);
					},
					value() {
						const cursor = forest.getCursorAboveDetachedFields();
						cursor.enterField(rootFieldKey);
						cursor.enterNode(0);
						cursor.enterField(key);
						assert.equal(cursor.getFieldLength(), 1);
						cursor.enterNode(0);
						return cursor.value;
					},
				};
			}

			it("accumulates concurrent additions and rebases undo and redo", () => {
				const a = addition(200, 3);
				const b = addition(200, 5);
				const metadata = revisionMetadataSourceFromInfo([]);
				const bOverA = family.rebase(makeAnonChange(b), makeAnonChange(a), metadata);
				const left = setup();
				left.apply(a);
				left.apply(bOverA);
				const right = setup();
				right.apply(b);
				right.apply(family.rebase(makeAnonChange(a), makeAnonChange(b), metadata));
				assert.equal(left.value(), 208);
				assert.equal(right.value(), 208);
				const inverse = family.invert(makeAnonChange(a), false, mintRevisionTag());
				const undo = family.rebase(makeAnonChange(inverse), makeAnonChange(bOverA), metadata);
				left.apply(undo);
				assert.equal(left.value(), 205);
				left.apply(family.invert(makeAnonChange(undo), false, mintRevisionTag()));
				assert.equal(left.value(), 208);
				assert.equal([...left.index.entries()].length, 0);
			});

			it("composes additions and rolls back without retained numeric leaves", () => {
				const state = setup();
				const composed = family.compose([
					makeAnonChange(addition(200, 3)),
					makeAnonChange(addition(203, 5)),
				]);
				state.apply(composed);
				assert.equal(state.value(), 208);
				state.apply(family.invert(makeAnonChange(composed), true, mintRevisionTag()));
				assert.equal(state.value(), 200);
				for (let i = 0; i < 1000; i++) {
					state.apply(addition(200 + i, 1));
					assert.equal(state.value(), 201 + i);
					assert.equal([...state.index.entries()].length, 0);
				}
			});

			it("preserves atomic edits to existing parents during minimization", () => {
				const state = setup();
				state.apply(minimizeModularChangeset(addition(200, 3), kinds, factory));
				assert.equal(state.value(), 203);
			});

			it("drops atomic edits to removed parents during minimization", () => {
				const state = setup();
				const removal = Change.build(
					{ family, maxId: 100 },
					Change.field(
						rootFieldKey,
						FieldKinds.optional.identifier,
						FieldKinds.optional.changeHandler.editor.clear(false, atom(50)),
					),
				);
				const change = family.compose([
					makeAnonChange(addition(200, 3)),
					makeAnonChange(removal),
				]);
				const minimized = minimizeModularChangeset(change, kinds, factory);
				const delta = intoDelta(makeAnonChange(minimized), kinds);
				assert.equal(delta.build, undefined);
				assert.equal(delta.destroy, undefined);
				state.apply(minimized);
				const cursor = state.forest.getCursorAboveDetachedFields();
				cursor.enterField(rootFieldKey);
				assert.equal(cursor.getFieldLength(), 0);
			});

			it("squashes atomic edits into newly built parents", () => {
				const built = new BasicChunk(
					brand("Box"),
					new Map([
						[key, [new BasicChunk(brand("com.fluidframework.leaf.number"), new Map(), 200)]],
					]),
				);
				const builds = newChangeAtomIdBTree<TreeChunk>();
				builds.set([undefined, brand(50)], built);
				const insert: ModularChangeset = {
					...Change.build(
						{ family, maxId: 100 },
						Change.field(
							rootFieldKey,
							FieldKinds.optional.identifier,
							FieldKinds.optional.changeHandler.editor.set(true, {
								fill: atom(50),
								detach: atom(51),
							}),
						),
					),
					builds,
				};
				const change = family.compose([
					makeAnonChange(insert),
					makeAnonChange(addition(200, 3)),
				]);
				const minimized = minimizeModularChangeset(change, kinds, factory);
				const forest = factory();
				const index = makeDetachedFieldIndex();
				applyDelta(intoDelta(makeAnonChange(minimized), kinds), undefined, forest, index);
				const cursor = forest.getCursorAboveDetachedFields();
				cursor.enterField(rootFieldKey);
				cursor.enterNode(0);
				cursor.enterField(key);
				cursor.enterNode(0);
				assert.equal(cursor.value, 203);
				assert.equal([...index.entries()].length, 0);
			});
		});
	}
});
