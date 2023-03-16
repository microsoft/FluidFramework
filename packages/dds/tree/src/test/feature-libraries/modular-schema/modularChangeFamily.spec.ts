/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	FieldChangeEncoder,
	FieldChangeHandler,
	FieldChangeRebaser,
	FieldKind,
	Multiplicity,
	ModularChangeFamily,
	FieldKinds,
	FieldEditor,
	NodeChangeset,
	genericFieldKind,
	FieldChange,
	ModularChangeset,
	ChangesetLocalId,
	RevisionInfo,
} from "../../../feature-libraries";
import {
	makeAnonChange,
	RevisionTag,
	tagChange,
	TaggedChange,
	FieldKindIdentifier,
	AnchorSet,
	Delta,
	FieldKey,
	UpPath,
	mintRevisionTag,
	tagRollbackInverse,
} from "../../../core";
import { brand, fail, JsonCompatibleReadOnly } from "../../../util";
import { assertDeltaEqual, deepFreeze } from "../../utils";

type ValueChangeset = FieldKinds.ReplaceOp<number>;

const valueHandler: FieldChangeHandler<ValueChangeset> = {
	rebaser: FieldKinds.replaceRebaser(),
	encoder: new FieldKinds.ValueEncoder<ValueChangeset & JsonCompatibleReadOnly>(),
	editor: { buildChildChange: (index, change) => fail("Child changes not supported") },

	intoDelta: (change, deltaFromChild) =>
		change === 0 ? [] : [{ type: Delta.MarkType.Modify, setValue: change.new }],
};

const valueField = new FieldKind(
	brand("Value"),
	Multiplicity.Value,
	valueHandler,
	(a, b) => false,
	new Set(),
);

const singleNodeEncoder: FieldChangeEncoder<NodeChangeset> = {
	encodeForJson: (formatVersion, change, encodeChild) => encodeChild(change),
	decodeJson: (formatVersion, change, decodeChild) => decodeChild(change),
};

const singleNodeRebaser: FieldChangeRebaser<NodeChangeset> = {
	compose: (changes, composeChild) => composeChild(changes),
	invert: (change, invertChild) => invertChild(change.change, 0),
	rebase: (change, base, rebaseChild) => rebaseChild(change, base.change),
	amendCompose: () => fail("Not supported"),
	amendInvert: () => fail("Not supported"),
	amendRebase: () => fail("Not supported"),
};

const singleNodeEditor: FieldEditor<NodeChangeset> = {
	buildChildChange: (index: number, change: NodeChangeset): NodeChangeset => {
		assert(index === 0, "This field kind only supports one node in its field");
		return change;
	},
};

const singleNodeHandler: FieldChangeHandler<NodeChangeset> = {
	rebaser: singleNodeRebaser,
	encoder: singleNodeEncoder,
	editor: singleNodeEditor,
	intoDelta: (change, deltaFromChild) => [deltaFromChild(change)],
};

const singleNodeField = new FieldKind(
	brand("SingleNode"),
	Multiplicity.Value,
	singleNodeHandler,
	(a, b) => false,
	new Set(),
);

type IdChangeset = ChangesetLocalId;

const idFieldRebaser: FieldChangeRebaser<IdChangeset> = {
	compose: (changes, composeChild, genId): IdChangeset => genId(),
	invert: (change, invertChild, reviver, genId): IdChangeset => genId(),
	rebase: (change, over, rebaseChild, genId): IdChangeset => genId(),
	amendCompose: () => fail("Not supported"),
	amendInvert: () => fail("Not supported"),
	amendRebase: () => fail("Not supported"),
};

const idFieldHandler: FieldChangeHandler<IdChangeset> = {
	rebaser: idFieldRebaser,
	encoder: new FieldKinds.ValueEncoder<IdChangeset & JsonCompatibleReadOnly>(),
	editor: { buildChildChange: (index, change) => fail("Child changes not supported") },
	intoDelta: (change, deltaFromChild) => [],
};

/**
 * A field which just allocates a new `ChangesetLocalId` for every operation.
 */
const idField = new FieldKind(
	brand("Id"),
	Multiplicity.Value,
	idFieldHandler,
	(a, b) => false,
	new Set(),
);

const fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind> = new Map(
	[singleNodeField, valueField, idField].map((field) => [field.identifier, field]),
);

const family = new ModularChangeFamily(fieldKinds);

const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();

const fieldA: FieldKey = brand("a");
const fieldB: FieldKey = brand("b");

const valueChange1a: ValueChangeset = { old: 0, new: 1 };
const valueChange1b: ValueChangeset = { old: 0, new: 2 };
const valueChange2: ValueChangeset = { old: 1, new: 2 };

const nodeChange1a: NodeChangeset = {
	fieldChanges: new Map([
		[fieldA, { fieldKind: valueField.identifier, change: brand(valueChange1a) }],
	]),
};

const nodeChanges1b: NodeChangeset = {
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: valueField.identifier,
				change: brand(valueChange1b),
			},
		],
		[
			fieldB,
			{
				fieldKind: valueField.identifier,
				change: brand(valueChange1a),
			},
		],
	]),
};

const nodeChanges2: NodeChangeset = {
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: valueField.identifier,
				change: brand(valueChange2),
			},
		],
		[
			fieldB,
			{
				fieldKind: valueField.identifier,
				change: brand(valueChange1a),
			},
		],
	]),
};

const nodeChange3: NodeChangeset = {
	fieldChanges: new Map([
		[fieldA, { fieldKind: valueField.identifier, change: brand(valueChange1a) }],
	]),
	valueConstraint: {
		value: "a",
		violated: false,
	},
};

const rootChange1a: ModularChangeset = {
	changes: new Map([
		[
			fieldA,
			{
				fieldKind: singleNodeField.identifier,
				change: brand(nodeChange1a),
			},
		],
		[
			fieldB,
			{
				fieldKind: valueField.identifier,
				change: brand(valueChange2),
			},
		],
	]),
};

const rootChange1aGeneric: ModularChangeset = {
	changes: new Map([
		[
			fieldA,
			{
				fieldKind: genericFieldKind.identifier,
				change: brand(
					genericFieldKind.changeHandler.editor.buildChildChange(0, nodeChange1a),
				),
			},
		],
		[
			fieldB,
			{
				fieldKind: valueField.identifier,
				change: brand(valueChange2),
			},
		],
	]),
};

const rootChange1b: ModularChangeset = {
	changes: new Map([
		[
			fieldA,
			{
				fieldKind: singleNodeField.identifier,
				change: brand(nodeChanges1b),
			},
		],
	]),
};

const rootChange1bGeneric: ModularChangeset = {
	changes: new Map([
		[
			fieldA,
			{
				fieldKind: genericFieldKind.identifier,
				change: brand(
					genericFieldKind.changeHandler.editor.buildChildChange(0, nodeChanges1b),
				),
			},
		],
	]),
};

const rootChange2: ModularChangeset = {
	changes: new Map([
		[
			fieldA,
			{
				fieldKind: singleNodeField.identifier,
				change: brand(nodeChanges2),
			},
		],
	]),
};

const rootChange2Generic: ModularChangeset = {
	changes: new Map([
		[
			fieldA,
			{
				fieldKind: genericFieldKind.identifier,
				change: brand(
					genericFieldKind.changeHandler.editor.buildChildChange(0, nodeChanges2),
				),
			},
		],
	]),
};

const rootChange3: ModularChangeset = {
	changes: new Map([
		[
			fieldA,
			{
				fieldKind: singleNodeField.identifier,
				change: brand(nodeChange3),
			},
		],
	]),
};

const testValue = "Test Value";
const nodeValueOverwrite: ModularChangeset = {
	changes: new Map([
		[
			fieldA,
			{
				fieldKind: genericFieldKind.identifier,
				change: brand(
					genericFieldKind.changeHandler.editor.buildChildChange(0, {
						valueChange: { value: testValue },
					}),
				),
			},
		],
	]),
};

const detachedBy = mintRevisionTag();
const nodeValueRevert: ModularChangeset = {
	changes: new Map([
		[
			fieldA,
			{
				fieldKind: genericFieldKind.identifier,
				change: brand(
					genericFieldKind.changeHandler.editor.buildChildChange(0, {
						valueChange: { value: testValue },
					}),
				),
			},
		],
	]),
};

describe("ModularChangeFamily", () => {
	describe("compose", () => {
		const composedValues: ValueChangeset = { old: 0, new: 2 };

		const composedNodeChange: NodeChangeset = {
			fieldChanges: new Map([
				[
					fieldA,
					{
						fieldKind: valueField.identifier,
						change: brand(composedValues),
					},
				],
				[
					fieldB,
					{
						fieldKind: valueField.identifier,
						change: brand(valueChange1a),
					},
				],
			]),
		};

		it("compose specific ○ specific", () => {
			const expectedCompose: ModularChangeset = {
				changes: new Map([
					[
						fieldA,
						{
							fieldKind: singleNodeField.identifier,
							change: brand(composedNodeChange),
						},
					],
					[
						fieldB,
						{
							fieldKind: valueField.identifier,
							change: brand(valueChange2),
						},
					],
				]),
			};
			assert.deepEqual(
				family.compose([makeAnonChange(rootChange1a), makeAnonChange(rootChange2)]),
				expectedCompose,
			);
		});

		it("compose specific ○ generic", () => {
			const expectedCompose: ModularChangeset = {
				changes: new Map([
					[
						fieldA,
						{
							fieldKind: singleNodeField.identifier,
							change: brand(composedNodeChange),
						},
					],
					[
						fieldB,
						{
							fieldKind: valueField.identifier,
							change: brand(valueChange2),
						},
					],
				]),
			};
			assert.deepEqual(
				family.compose([makeAnonChange(rootChange1a), makeAnonChange(rootChange2Generic)]),
				expectedCompose,
			);
		});

		it("compose generic ○ specific", () => {
			const expectedCompose: ModularChangeset = {
				changes: new Map([
					[
						fieldA,
						{
							fieldKind: singleNodeField.identifier,
							change: brand(composedNodeChange),
						},
					],
					[
						fieldB,
						{
							fieldKind: valueField.identifier,
							change: brand(valueChange2),
						},
					],
				]),
			};
			assert.deepEqual(
				family.compose([makeAnonChange(rootChange1aGeneric), makeAnonChange(rootChange2)]),
				expectedCompose,
			);
		});

		it("compose generic ○ generic", () => {
			const expectedCompose: ModularChangeset = {
				changes: new Map([
					[
						fieldA,
						{
							fieldKind: genericFieldKind.identifier,
							change: brand(
								genericFieldKind.changeHandler.editor.buildChildChange(
									0,
									composedNodeChange,
								),
							),
						},
					],
					[
						fieldB,
						{
							fieldKind: valueField.identifier,
							change: brand(valueChange2),
						},
					],
				]),
			};
			assert.deepEqual(
				family.compose([
					makeAnonChange(rootChange1aGeneric),
					makeAnonChange(rootChange2Generic),
				]),
				expectedCompose,
			);
		});

		it("compose tagged changes", () => {
			const change1A: FieldChange = {
				fieldKind: valueField.identifier,
				change: brand(valueChange1a),
			};

			const value1 = "Value 1";
			const nodeChange1: NodeChangeset = {
				valueChange: { value: value1 },
			};

			const change1B: FieldChange = {
				fieldKind: singleNodeField.identifier,
				change: brand(nodeChange1),
			};

			const change1: TaggedChange<ModularChangeset> = tagChange(
				{
					changes: new Map([
						[fieldA, change1A],
						[fieldB, change1B],
					]),
				},
				tag1,
			);

			const nodeChange2: NodeChangeset = {
				fieldChanges: new Map([
					[
						fieldA,
						{
							fieldKind: valueField.identifier,
							change: brand(valueChange2),
						},
					],
				]),
			};

			const change2B: FieldChange = {
				fieldKind: singleNodeField.identifier,
				change: brand(nodeChange2),
			};

			deepFreeze(change2B);
			const change2: TaggedChange<ModularChangeset> = tagChange(
				{
					changes: new Map([[fieldB, change2B]]),
				},
				tag2,
			);

			deepFreeze(change1);
			deepFreeze(change2);
			const composed = family.compose([change1, change2]);

			const expectedNodeChange: NodeChangeset = {
				valueChange: { revision: change1.revision, value: value1 },
				fieldChanges: new Map([
					[
						fieldA,
						{
							revision: change2.revision,
							fieldKind: valueField.identifier,
							change: brand(valueChange2),
						},
					],
				]),
			};

			const expected: ModularChangeset = {
				changes: new Map([
					[
						fieldA,
						{
							revision: change1.revision,
							fieldKind: valueField.identifier,
							change: brand(valueChange1a),
						},
					],
					[
						fieldB,
						{
							fieldKind: singleNodeField.identifier,
							change: brand(expectedNodeChange),
						},
					],
				]),
				revisions: [{ tag: tag1 }, { tag: tag2 }],
			};

			assert.deepEqual(composed, expected);
		});

		it("generate IDs", () => {
			const id0: ChangesetLocalId = brand(0);
			const id1: ChangesetLocalId = brand(1);
			const change1: ModularChangeset = {
				maxId: id0,
				changes: new Map([[fieldA, { fieldKind: idField.identifier, change: brand(id0) }]]),
			};

			const change2: ModularChangeset = {
				maxId: id0,
				changes: new Map([[fieldB, { fieldKind: idField.identifier, change: brand(id0) }]]),
			};

			const expected1: ModularChangeset = {
				maxId: id0,
				changes: new Map([
					[fieldA, { fieldKind: idField.identifier, revision: tag1, change: brand(id0) }],
					[fieldB, { fieldKind: idField.identifier, revision: tag2, change: brand(id0) }],
				]),
				revisions: [{ tag: tag1 }, { tag: tag2 }],
			};

			const composed1 = family.compose([tagChange(change1, tag1), tagChange(change2, tag2)]);
			assert.deepEqual(composed1, expected1);

			const expected2: ModularChangeset = {
				maxId: id1,
				changes: new Map([[fieldA, { fieldKind: idField.identifier, change: brand(id1) }]]),
				revisions: [{ tag: tag1 }, { tag: tag2 }],
			};

			const composed2 = family.compose([tagChange(change1, tag1), tagChange(change1, tag2)]);
			assert.deepEqual(composed2, expected2);
		});
	});

	describe("invert", () => {
		const valueInverse1: ValueChangeset = { old: 1, new: 0 };
		const valueInverse2: ValueChangeset = { old: 2, new: 1 };

		const nodeInverse: NodeChangeset = {
			fieldChanges: new Map([
				[
					fieldA,
					{
						fieldKind: valueField.identifier,
						change: brand(valueInverse1),
					},
				],
			]),
		};

		it("specific", () => {
			const expectedInverse: ModularChangeset = {
				changes: new Map([
					[fieldA, { fieldKind: singleNodeField.identifier, change: brand(nodeInverse) }],
					[fieldB, { fieldKind: valueField.identifier, change: brand(valueInverse2) }],
				]),
			};

			assert.deepEqual(family.invert(makeAnonChange(rootChange1a), false), expectedInverse);
		});

		it("generic", () => {
			const fieldChange = genericFieldKind.changeHandler.editor.buildChildChange(
				0,
				nodeInverse,
			);
			const expectedInverse: ModularChangeset = {
				changes: new Map([
					[
						fieldA,
						{ fieldKind: genericFieldKind.identifier, change: brand(fieldChange) },
					],
					[fieldB, { fieldKind: valueField.identifier, change: brand(valueInverse2) }],
				]),
			};

			assert.deepEqual(
				family.invert(makeAnonChange(rootChange1aGeneric), false),
				expectedInverse,
			);
		});

		it("generate IDs", () => {
			const id0: ChangesetLocalId = brand(0);
			const id1: ChangesetLocalId = brand(1);
			const id2: ChangesetLocalId = brand(2);
			const id3: ChangesetLocalId = brand(3);
			const change: ModularChangeset = {
				maxId: id1,
				changes: new Map([
					[fieldA, { fieldKind: idField.identifier, change: brand(id0) }],
					[fieldB, { fieldKind: idField.identifier, change: brand(id1) }],
				]),
			};

			const expected: ModularChangeset = {
				maxId: id3,
				changes: new Map([
					[fieldA, { fieldKind: idField.identifier, change: brand(id2) }],
					[fieldB, { fieldKind: idField.identifier, change: brand(id3) }],
				]),
			};

			assert.deepEqual(family.invert(makeAnonChange(change), false), expected);
		});
	});

	describe("rebase", () => {
		it("rebase specific ↷ specific", () => {
			assert.deepEqual(
				family.rebase(rootChange1b, makeAnonChange(rootChange1a)),
				rootChange2,
			);
		});

		it("rebase specific ↷ generic", () => {
			assert.deepEqual(
				family.rebase(rootChange1b, makeAnonChange(rootChange1aGeneric)),
				rootChange2,
			);
		});

		it("rebase generic ↷ specific", () => {
			assert.deepEqual(
				family.rebase(rootChange1bGeneric, makeAnonChange(rootChange1a)),
				rootChange2,
			);
		});

		it("rebase generic ↷ generic", () => {
			assert.deepEqual(
				family.rebase(rootChange1bGeneric, makeAnonChange(rootChange1aGeneric)),
				rootChange2Generic,
			);
		});

		it("generate IDs", () => {
			const id0: ChangesetLocalId = brand(0);
			const id1: ChangesetLocalId = brand(1);
			const id2: ChangesetLocalId = brand(2);
			const id3: ChangesetLocalId = brand(3);
			const change: ModularChangeset = {
				maxId: id1,
				changes: new Map([
					[fieldA, { fieldKind: idField.identifier, change: brand(id0) }],
					[fieldB, { fieldKind: idField.identifier, change: brand(id1) }],
				]),
			};

			const base: ModularChangeset = {
				maxId: id0,
				changes: new Map([[fieldA, { fieldKind: idField.identifier, change: brand(id0) }]]),
			};

			const expected: ModularChangeset = {
				maxId: id2,
				changes: new Map([
					[fieldA, { fieldKind: idField.identifier, change: brand(id2) }],
					[fieldB, { fieldKind: idField.identifier, change: brand(id1) }],
				]),
			};

			assert.deepEqual(family.rebase(change, makeAnonChange(base)), expected);
		});
	});

	describe("intoDelta", () => {
		it("fieldChanges", () => {
			const valueDelta1: Delta.MarkList = [
				{
					type: Delta.MarkType.Modify,
					setValue: 1,
				},
			];

			const valueDelta2: Delta.MarkList = [
				{
					type: Delta.MarkType.Modify,
					setValue: 2,
				},
			];

			const nodeDelta: Delta.MarkList = [
				{
					type: Delta.MarkType.Modify,
					fields: new Map([[fieldA, valueDelta1]]),
				},
			];

			const expectedDelta: Delta.Root = new Map([
				[fieldA, nodeDelta],
				[fieldB, valueDelta2],
			]);

			assertDeltaEqual(family.intoDelta(rootChange1a), expectedDelta);
		});

		it("value overwrite", () => {
			const nodeDelta: Delta.MarkList = [
				{
					type: Delta.MarkType.Modify,
					setValue: testValue,
				},
			];
			const expectedDelta: Delta.Root = new Map([[fieldA, nodeDelta]]);
			assertDeltaEqual(family.intoDelta(nodeValueOverwrite), expectedDelta);
		});

		it("value revert", () => {
			const nodeDelta: Delta.MarkList = [
				{
					type: Delta.MarkType.Modify,
					setValue: testValue,
				},
			];
			const expectedDelta: Delta.Root = new Map([[fieldA, nodeDelta]]);
			const actual = family.intoDelta(nodeValueRevert);
			assertDeltaEqual(actual, expectedDelta);
		});
	});

	const encodingTestData: [string, ModularChangeset][] = [
		["without constrain", rootChange1a],
		["with constrain", rootChange3],
	];

	describe("Encoding", () => {
		const version = 0;
		for (const [name, data] of encodingTestData) {
			describe(name, () => {
				it("roundtrip", () => {
					const encoded = family.encoder.encodeForJson(version, data);
					const decoded = family.encoder.decodeJson(version, encoded);
					assert.deepEqual(decoded, data);
				});
				it("json roundtrip", () => {
					const encoded = JSON.stringify(family.encoder.encodeForJson(version, data));
					const decoded = family.encoder.decodeJson(version, JSON.parse(encoded));
					assert.deepEqual(decoded, data);
				});
			});
		}
	});

	it("build child change", () => {
		const editor = family.buildEditor((edit) => {}, new AnchorSet());
		const path: UpPath = {
			parent: undefined,
			parentField: fieldA,
			parentIndex: 0,
		};

		editor.submitChange(path, fieldB, valueField.identifier, brand(valueChange1a));
		const changes = editor.getChanges();
		const nodeChange: NodeChangeset = {
			fieldChanges: new Map([
				[fieldB, { fieldKind: valueField.identifier, change: brand(valueChange1a) }],
			]),
		};

		const fieldChange = genericFieldKind.changeHandler.editor.buildChildChange(0, nodeChange);
		const expectedChange: ModularChangeset = {
			changes: new Map([
				[fieldA, { fieldKind: genericFieldKind.identifier, change: brand(fieldChange) }],
			]),
		};

		assert.deepEqual(changes, [expectedChange]);
	});

	it("build value change", () => {
		const editor = family.buildEditor((edit) => {}, new AnchorSet());
		const path: UpPath = {
			parent: undefined,
			parentField: fieldA,
			parentIndex: 0,
		};

		editor.setValue(path, testValue);
		const changes = editor.getChanges();
		assert.deepEqual(changes, [nodeValueOverwrite]);
	});

	it("concatenates and indexes revisions", () => {
		const rev1 = mintRevisionTag();
		const rev2 = mintRevisionTag();
		const rev3 = mintRevisionTag();
		const rev4 = mintRevisionTag();

		let composeWasTested = false;
		const compose: FieldChangeRebaser<RevisionTag[]>["compose"] = (
			changes: TaggedChange<RevisionTag[]>[],
			composeChild,
			genId,
			crossFieldManager,
			{ getIndex, getInfo },
		): RevisionTag[] => {
			const relevantRevisions = [rev1, rev2, rev3, rev4];
			const revsIndices: number[] = relevantRevisions.map((c) => getIndex(c));
			const revsInfos: RevisionInfo[] = relevantRevisions.map((c) => getInfo(c));
			assert.deepEqual(revsIndices, [0, 1, 2, 3]);
			assert.deepEqual(revsInfos, [
				{ tag: rev1 },
				{ tag: rev2 },
				{ tag: rev3, isRollback: true },
				{ tag: rev4, isRollback: true },
			]);
			composeWasTested = true;
			return [];
		};

		let rebaseWasTested = false;
		const rebase: FieldChangeRebaser<RevisionTag[]>["rebase"] = (
			change: RevisionTag[],
			over: TaggedChange<RevisionTag[]>,
			rebaseChild,
			genId,
			crossFieldManager,
			{ getIndex, getInfo },
		): RevisionTag[] => {
			const relevantRevisions = [rev1, rev2, rev4];
			const revsIndices: number[] = relevantRevisions.map((c) => getIndex(c));
			const revsInfos: RevisionInfo[] = relevantRevisions.map((c) => getInfo(c));
			assert.deepEqual(revsIndices, [0, 1, 2]);
			assert.deepEqual(revsInfos, [
				{ tag: rev1 },
				{ tag: rev2 },
				{ tag: rev4, isRollback: true },
			]);
			rebaseWasTested = true;
			return change;
		};
		const handler = {
			rebaser: {
				compose,
				rebase,
			},
		} as unknown as FieldChangeHandler<RevisionTag[]>;
		const field = new FieldKind(
			brand("ChecksRevIndexing"),
			Multiplicity.Value,
			handler,
			(a, b) => false,
			new Set(),
		);
		const dummyFamily = new ModularChangeFamily(new Map([[field.identifier, field]]));

		const changeA: ModularChangeset = {
			changes: new Map([
				[
					fieldA,
					{
						fieldKind: field.identifier,
						change: brand([rev1, rev2]),
					},
				],
			]),
			revisions: [{ tag: rev1 }, { tag: rev2 }],
		};
		const changeB: ModularChangeset = {
			changes: new Map([
				[
					fieldA,
					{
						fieldKind: field.identifier,
						change: brand([rev3]),
					},
				],
			]),
		};
		const changeC: ModularChangeset = {
			changes: new Map([
				[
					fieldA,
					{
						fieldKind: field.identifier,
						change: brand([rev4]),
					},
				],
			]),
			revisions: [{ tag: rev4, isRollback: true }],
		};
		const composed = dummyFamily.compose([
			makeAnonChange(changeA),
			tagRollbackInverse(changeB, rev3),
			makeAnonChange(changeC),
		]);
		assert.deepEqual(composed.revisions, [
			{ tag: rev1 },
			{ tag: rev2 },
			{ tag: rev3, isRollback: true },
			{ tag: rev4, isRollback: true },
		]);
		assert(composeWasTested);
		const rebased = dummyFamily.rebase(changeC, makeAnonChange(changeA));
		assert.deepEqual(rebased.revisions, [{ tag: rev4, isRollback: true }]);
		assert(rebaseWasTested);
	});
});
