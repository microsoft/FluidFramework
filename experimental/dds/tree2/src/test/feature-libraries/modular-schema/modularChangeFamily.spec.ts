/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	FieldChangeHandler,
	FieldChangeRebaser,
	Multiplicity,
	FieldEditor,
	NodeChangeset,
	genericFieldKind,
	FieldChange,
	ModularChangeset,
	RevisionInfo,
	FieldKindWithEditor,
	NodeChangeInverter,
} from "../../../feature-libraries";
import {
	makeAnonChange,
	RevisionTag,
	tagChange,
	TaggedChange,
	FieldKindIdentifier,
	Delta,
	FieldKey,
	UpPath,
	mintRevisionTag,
	tagRollbackInverse,
	assertIsRevisionTag,
	deltaForSet,
} from "../../../core";
import { brand, fail } from "../../../util";
import { makeCodecFamily, noopValidator } from "../../../codec";
import { typeboxValidator } from "../../../external-utilities";
import {
	EncodingTestData,
	assertDeltaEqual,
	deepFreeze,
	makeEncodingTestSuite,
	testChangeReceiver,
} from "../../utils";
// eslint-disable-next-line import/no-internal-modules
import { ModularChangeFamily } from "../../../feature-libraries/modular-schema/modularChangeFamily";
import { singleJsonCursor } from "../../../domains";
// Allows typechecking test data used in modulaChangeFamily's codecs.
// eslint-disable-next-line import/no-internal-modules
import { EncodedModularChangeset } from "../../../feature-libraries/modular-schema/modularChangeFormat";
import { ValueChangeset, valueField } from "./basicRebasers";

const singleNodeRebaser: FieldChangeRebaser<NodeChangeset> = {
	compose: (changes, composeChild) => composeChild(changes),
	invert: (change, invertChild) => invertChild(change.change),
	rebase: (change, base, rebaseChild) => rebaseChild(change, base.change) ?? {},
	amendCompose: () => fail("Not supported"),
	prune: (change) => change,
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
	intoDelta: ({ change }, deltaFromChild): Delta.FieldChanges => ({
		local: [{ count: 1, fields: deltaFromChild(change) }],
	}),
	relevantRemovedTrees: (change, removedTreesFromChild) => removedTreesFromChild(change),
	isEmpty: (change) => change.fieldChanges === undefined,
};

const singleNodeField = new FieldKindWithEditor(
	"SingleNode",
	Multiplicity.Single,
	singleNodeHandler,
	(a, b) => false,
	new Set(),
);

const fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor> = new Map(
	[singleNodeField, valueField].map((field) => [field.identifier, field]),
);

const family = new ModularChangeFamily(fieldKinds, { jsonValidator: typeboxValidator });

const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();

const fieldA: FieldKey = brand("a");
const fieldB: FieldKey = brand("b");

const detachId = { minor: 424242 };
const buildId = { minor: 424243 };

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
};

const nodeChange4: NodeChangeset = {
	fieldChanges: new Map([
		[fieldA, { fieldKind: valueField.identifier, change: brand(valueChange1a) }],
	]),
	nodeExistsConstraint: {
		violated: false,
	},
};

const nodeChangeWithoutFieldChanges: NodeChangeset = {
	nodeExistsConstraint: {
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

const dummyMaxId = 10;
const dummyRevisionTag = assertIsRevisionTag("00000000-0000-4000-8000-000000000000");
const rootChange4: ModularChangeset = {
	maxId: brand(dummyMaxId),
	revisions: [{ revision: dummyRevisionTag }],
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: singleNodeField.identifier,
				change: brand(nodeChange4),
			},
		],
	]),
};

const rootChangeWithoutNodeFieldChanges: ModularChangeset = {
	maxId: brand(dummyMaxId),
	revisions: [{ revision: dummyRevisionTag }],
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: singleNodeField.identifier,
				change: brand(nodeChangeWithoutFieldChanges),
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

		it("prioritizes earlier build entries when faced with duplicates", () => {
			const change1: ModularChangeset = {
				fieldChanges: new Map(),
				builds: new Map([[undefined, new Map([[brand(0), singleJsonCursor(1)]])]]),
			};
			const change2: ModularChangeset = {
				fieldChanges: new Map(),
				builds: new Map([[undefined, new Map([[brand(0), singleJsonCursor(2)]])]]),
			};
			assert.deepEqual(
				family.compose([makeAnonChange(change1), makeAnonChange(change2)]),
				change1,
			);
		});

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

			const change1: TaggedChange<ModularChangeset> = tagChange(
				{
					fieldChanges: new Map([[fieldA, change1A]]),
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
			const rebased = family.rebase(rootChange1b, makeAnonChange(rootChange1a));
			assert.deepEqual(rebased, rootChange2);
		});

		it("rebase specific ↷ generic", () => {
			const rebased = family.rebase(rootChange1b, makeAnonChange(rootChange1aGeneric));
			assert.deepEqual(rebased, rootChange2);
		});

		it("rebase generic ↷ specific", () => {
			const rebased = family.rebase(rootChange1bGeneric, makeAnonChange(rootChange1a));
			assert.deepEqual(rebased, rootChange2);
		});

		it("rebase generic ↷ generic", () => {
			const rebased = family.rebase(rootChange1bGeneric, makeAnonChange(rootChange1aGeneric));
			assert.deepEqual(rebased, rootChange2Generic);
		});
	});

	describe("intoDelta", () => {
		it("fieldChanges", () => {
			const nodeDelta: Delta.FieldChanges = {
				local: [
					{
						count: 1,
						fields: new Map([
							[fieldA, deltaForSet(singleJsonCursor(1), buildId, detachId)],
						]),
					},
				],
			};

			const expectedDelta: Delta.Root = {
				fields: new Map([
					[fieldA, nodeDelta],
					[fieldB, deltaForSet(singleJsonCursor(2), buildId, detachId)],
				]),
			};

			const actual = family.intoDelta(makeAnonChange(rootChange1a));
			assertDeltaEqual(actual, expectedDelta);
		});
	});

	describe("Encoding", () => {
		const encodingTestData: EncodingTestData<ModularChangeset, EncodedModularChangeset> = {
			successes: [
				["without constrain", rootChange1a],
				["with constrain", rootChange3],
				["with node existence constraint", rootChange4],
				["without node field changes", rootChangeWithoutNodeFieldChanges],
			],
		};

		makeEncodingTestSuite(family.codecs, encodingTestData);
	});

	it("build child change", () => {
		const [changeReceiver, getChanges] = testChangeReceiver(family);
		const editor = family.buildEditor(changeReceiver);
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
			{ getIndex, tryGetInfo },
		): RevisionTag[] => {
			const relevantRevisions = [rev1, rev2, rev3, rev4];
			const revsIndices: number[] = relevantRevisions.map((c) =>
				ensureIndexDefined(getIndex(c)),
			);
			const revsInfos: RevisionInfo[] = relevantRevisions.map(
				(c) => tryGetInfo(c) ?? assert.fail(),
			);
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
			{ getIndex, tryGetInfo },
		): RevisionTag[] => {
			const relevantRevisions = [rev1, rev2, rev4];
			const revsIndices: number[] = relevantRevisions.map((c) =>
				ensureIndexDefined(getIndex(c)),
			);
			const revsInfos: RevisionInfo[] = relevantRevisions.map(
				(c) => tryGetInfo(c) ?? assert.fail(),
			);
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
		let invertWasTested = false;
		const invert: FieldChangeRebaser<RevisionTag[]>["invert"] = (
			change: TaggedChange<RevisionTag[]>,
			invertChild: NodeChangeInverter,
			genId,
			crossFieldManager,
			{ getIndex, tryGetInfo },
		): RevisionTag[] => {
			const relevantRevisions = [rev3];
			const revsIndices: number[] = relevantRevisions.map((c) =>
				ensureIndexDefined(getIndex(c)),
			);
			const revsInfos: RevisionInfo[] = relevantRevisions.map(
				(c) => tryGetInfo(c) ?? assert.fail(),
			);
			assert.deepEqual(revsIndices, [0]);
			const expected: RevisionInfo[] = [{ revision: rev3, rollbackOf: rev0 }];
			assert.deepEqual(revsInfos, expected);
			invertWasTested = true;
			return change.change;
		};

		const throwCodec = {
			encode: () => fail("Should not be called"),
			decode: () => fail("Should not be called"),
		};
		const handler = {
			rebaser: {
				compose,
				rebase,
				invert,
				prune: (change: RevisionTag[]) => change,
			},
			isEmpty: (change: RevisionTag[]) => change.length === 0,
			codecsFactory: () => makeCodecFamily([[0, throwCodec]]),
		} as unknown as FieldChangeHandler<RevisionTag[]>;
		const field = new FieldKindWithEditor(
			"ChecksRevIndexing",
			Multiplicity.Single,
			handler,
			(a, b) => false,
			new Set(),
		);
		const dummyFamily = new ModularChangeFamily(new Map([[field.identifier, field]]), {
			jsonValidator: noopValidator,
		});

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
		dummyFamily.invert(tagRollbackInverse(changeB, rev3, rev0), false);
		assert(invertWasTested);
	});

	function ensureIndexDefined(index: number | undefined): number {
		assert(index !== undefined, "Unexpected undefined index");
		return index;
	}
});
