/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TUnsafe, Type } from "@sinclair/typebox";
import {
	FieldChangeHandler,
	FieldChangeRebaser,
	FieldKind,
	Multiplicity,
	ModularChangeFamily,
	FieldEditor,
	NodeChangeset,
	genericFieldKind,
	FieldChange,
	ModularChangeset,
	RevisionInfo,
} from "../../../feature-libraries";
// TODO: this is not the file being tests, importing it should not be required here.
// eslint-disable-next-line import/no-internal-modules
import * as FieldKinds from "../../../feature-libraries/defaultFieldKinds";
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
import { brand, fail } from "../../../util";
import {
	assertDeltaEqual,
	deepFreeze,
	makeEncodingTestSuite,
	testChangeReceiver,
} from "../../utils";
import { makeCodecFamily, makeValueCodec } from "../../../codec";

type ValueChangeset = FieldKinds.ReplaceOp<number>;

const valueHandler: FieldChangeHandler<ValueChangeset> = {
	rebaser: FieldKinds.replaceRebaser(),
	codecsFactory: () =>
		makeCodecFamily([[0, makeValueCodec<TUnsafe<ValueChangeset>>(Type.Any())]]),
	editor: { buildChildChange: (index, change) => fail("Child changes not supported") },

	intoDelta: (change, deltaFromChild) =>
		change === 0 ? [] : [{ type: Delta.MarkType.Modify, setValue: change.new }],

	isEmpty: (change) => change === 0,
};

const valueField = new FieldKind(
	brand("Value"),
	Multiplicity.Value,
	valueHandler,
	(a, b) => false,
	new Set(),
);

const singleNodeRebaser: FieldChangeRebaser<NodeChangeset> = {
	compose: (changes, composeChild) => composeChild(changes),
	invert: (change, invertChild) => invertChild(change.change, 0),
	rebase: (change, base, rebaseChild) => rebaseChild(change, base.change) ?? {},
	amendCompose: () => fail("Not supported"),
	amendInvert: () => fail("Not supported"),
	amendRebase: (change, base, rebaseChild) => change,
};

const singleNodeEditor: FieldEditor<NodeChangeset> = {
	buildChildChange: (index: number, change: NodeChangeset): NodeChangeset => {
		assert(index === 0, "This field kind only supports one node in its field");
		return change;
	},
};

const singleNodeHandler: FieldChangeHandler<NodeChangeset> = {
	rebaser: singleNodeRebaser,
	codecsFactory: (childCodec) => makeCodecFamily([[0, childCodec]]),
	editor: singleNodeEditor,
	intoDelta: (change, deltaFromChild) => [deltaFromChild(change)],
	isEmpty: (change) => change.fieldChanges === undefined && change.valueChange === undefined,
};

const singleNodeField = new FieldKind(
	brand("SingleNode"),
	Multiplicity.Value,
	singleNodeHandler,
	(a, b) => false,
	new Set(),
);

const fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind> = new Map(
	[singleNodeField, valueField].map((field) => [field.identifier, field]),
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
	fieldChanges: new Map([
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
	fieldChanges: new Map([
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
	fieldChanges: new Map([
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
	fieldChanges: new Map([
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
	fieldChanges: new Map([
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
	fieldChanges: new Map([
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
	fieldChanges: new Map([
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
	fieldChanges: new Map([
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
	fieldChanges: new Map([
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
				fieldChanges: new Map([
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
				fieldChanges: new Map([
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
				fieldChanges: new Map([
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
				fieldChanges: new Map([
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
					fieldChanges: new Map([
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
					fieldChanges: new Map([[fieldB, change2B]]),
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
							fieldKind: valueField.identifier,
							change: brand(valueChange2),
						},
					],
				]),
			};

			const expected: ModularChangeset = {
				fieldChanges: new Map([
					[
						fieldA,
						{
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
				revisions: [{ revision: tag1 }, { revision: tag2 }],
			};

			assert.deepEqual(composed, expected);
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
				fieldChanges: new Map([
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
				fieldChanges: new Map([
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

	describe("Encoding", () => {
		const encodingTestData: [string, ModularChangeset][] = [
			["without constrain", rootChange1a],
			["with constrain", rootChange3],
		];

		makeEncodingTestSuite(family.codecs, encodingTestData);
	});

	it("build child change", () => {
		const [changeReceiver, getChanges] = testChangeReceiver(family);
		const editor = family.buildEditor(changeReceiver, new AnchorSet());
		const path: UpPath = {
			parent: undefined,
			parentField: fieldA,
			parentIndex: 0,
		};

		editor.submitChange(
			{ parent: path, field: fieldB },
			valueField.identifier,
			brand(valueChange1a),
		);
		const changes = getChanges();
		const nodeChange: NodeChangeset = {
			fieldChanges: new Map([
				[fieldB, { fieldKind: valueField.identifier, change: brand(valueChange1a) }],
			]),
		};

		const fieldChange = genericFieldKind.changeHandler.editor.buildChildChange(0, nodeChange);
		const expectedChange: ModularChangeset = {
			fieldChanges: new Map([
				[fieldA, { fieldKind: genericFieldKind.identifier, change: brand(fieldChange) }],
			]),
		};

		assert.deepEqual(changes, [expectedChange]);
	});

	it("build value change", () => {
		const [changeReceiver, getChanges] = testChangeReceiver(family);
		const editor = family.buildEditor(changeReceiver, new AnchorSet());
		const path: UpPath = {
			parent: undefined,
			parentField: fieldA,
			parentIndex: 0,
		};

		editor.setValue(path, testValue);
		const changes = getChanges();
		assert.deepEqual(changes, [nodeValueOverwrite]);
	});

	it("Revision metadata", () => {
		const rev0 = mintRevisionTag();
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
			const expected: RevisionInfo[] = [
				{ revision: rev1 },
				{ revision: rev2 },
				{ revision: rev3, rollbackOf: rev0 },
				{ revision: rev4, rollbackOf: rev2 },
			];
			assert.deepEqual(revsInfos, expected);
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
			const expected: RevisionInfo[] = [
				{ revision: rev1 },
				{ revision: rev2 },
				{ revision: rev4, rollbackOf: rev2 },
			];
			assert.deepEqual(revsInfos, expected);
			rebaseWasTested = true;
			return change;
		};
		const throwCodec = {
			encode: () => fail("Should not be called"),
			decode: () => fail("Should not be called"),
		};
		const handler = {
			rebaser: {
				compose,
				rebase,
				amendRebase: (change: RevisionTag[]) => change,
			},
			isEmpty: (change: RevisionTag[]) => change.length === 0,
			codecsFactory: () => makeCodecFamily([[0, throwCodec]]),
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
			fieldChanges: new Map([
				[
					fieldA,
					{
						fieldKind: field.identifier,
						change: brand([rev1, rev2]),
					},
				],
			]),
			revisions: [{ revision: rev1 }, { revision: rev2 }],
		};
		const changeB: ModularChangeset = {
			fieldChanges: new Map([
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
			fieldChanges: new Map([
				[
					fieldA,
					{
						fieldKind: field.identifier,
						change: brand([rev4]),
					},
				],
			]),
			revisions: [{ revision: rev4, rollbackOf: rev2 }],
		};
		const composed = dummyFamily.compose([
			makeAnonChange(changeA),
			tagRollbackInverse(changeB, rev3, rev0),
			makeAnonChange(changeC),
		]);
		const expectedComposeInfo: RevisionInfo[] = [
			{ revision: rev1 },
			{ revision: rev2 },
			{ revision: rev3, rollbackOf: rev0 },
			{ revision: rev4, rollbackOf: rev2 },
		];
		assert.deepEqual(composed.revisions, expectedComposeInfo);
		assert(composeWasTested);
		const rebased = dummyFamily.rebase(changeC, makeAnonChange(changeA));
		const expectedRebaseInfo: RevisionInfo[] = [{ revision: rev4, rollbackOf: rev2 }];
		assert.deepEqual(rebased.revisions, expectedRebaseInfo);
		assert(rebaseWasTested);
	});
});
