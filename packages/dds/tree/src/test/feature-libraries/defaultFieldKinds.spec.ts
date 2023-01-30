/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	FieldChangeHandler,
	FieldKinds,
	IdAllocator,
	NodeChangeset,
	NodeReviver,
	singleTextCursor,
} from "../../feature-libraries";
import { makeAnonChange, RevisionTag, TaggedChange, TreeSchemaIdentifier, Delta } from "../../core";
import { brand, JsonCompatibleReadOnly } from "../../util";
import { assertMarkListEqual, noRepair } from "../utils";

const nodeType: TreeSchemaIdentifier = brand("Node");
const tree1 = { type: nodeType, value: "value1" };
const tree2 = { type: nodeType, value: "value2" };
const tree3 = { type: nodeType, value: "value3" };
const nodeChange1: NodeChangeset = { valueChange: { value: "value3" } };
const nodeChange2: NodeChangeset = { valueChange: { value: "value4" } };
const nodeChange3: NodeChangeset = { valueChange: { value: "value5" } };

const idAllocator: IdAllocator = () => assert.fail("Should not be called");

const deltaFromChild1 = (child: NodeChangeset): Delta.Modify => {
	assert.deepEqual(child, nodeChange1);
	return { type: Delta.MarkType.Modify, setValue: "value3" };
};

const deltaFromChild2 = (child: NodeChangeset): Delta.Modify => {
	assert.deepEqual(child, nodeChange2);
	return { type: Delta.MarkType.Modify, setValue: "value4" };
};

const encodedChild = "encoded child";

const childEncoder1 = (change: NodeChangeset) => {
	assert.deepEqual(change, nodeChange1);
	return encodedChild;
};

const childDecoder1 = (encodedChange: JsonCompatibleReadOnly) => {
	assert.equal(encodedChange, encodedChild);
	return nodeChange1;
};

const childComposer1_2 = (changes: TaggedChange<NodeChangeset>[]): NodeChangeset => {
	assert(changes.length === 2);
	assert.deepEqual(
		changes.map((c) => c.change),
		[nodeChange1, nodeChange2],
	);
	return nodeChange3;
};

describe("Value field changesets", () => {
	const fieldHandler: FieldChangeHandler<FieldKinds.ValueChangeset, FieldKinds.ValueFieldEditor> =
		FieldKinds.value.changeHandler;

	const change1WithChildChange: FieldKinds.ValueChangeset = {
		value: { set: tree1 },
		changes: nodeChange1,
	};
	const childChange1: FieldKinds.ValueChangeset = { changes: nodeChange1 };
	const childChange2: FieldKinds.ValueChangeset = { changes: nodeChange2 };
	const childChange3: FieldKinds.ValueChangeset = { changes: nodeChange3 };

	const change1 = fieldHandler.editor.set(singleTextCursor(tree1));
	const change2 = fieldHandler.editor.set(singleTextCursor(tree2));

	const detachedBy: RevisionTag = brand(42);
	const revertChange2: FieldKinds.ValueChangeset = {
		value: { revert: detachedBy },
	};

	const simpleChildComposer = (changes: TaggedChange<NodeChangeset>[]) => {
		assert.equal(changes.length, 1);
		return changes[0].change;
	};

	it("can be created", () => {
		const expected: FieldKinds.ValueChangeset = { value: { set: tree1 } };
		assert.deepEqual(change1, expected);
	});

	it("can be composed", () => {
		const composed = fieldHandler.rebaser.compose(
			[makeAnonChange(change1), makeAnonChange(change2)],
			simpleChildComposer,
			idAllocator,
		);

		assert.deepEqual(composed, change2);
	});

	it("can be composed with child changes", () => {
		assert.deepEqual(
			fieldHandler.rebaser.compose(
				[makeAnonChange(change1), makeAnonChange(childChange1)],
				simpleChildComposer,
				idAllocator,
			),
			change1WithChildChange,
		);

		const expected: FieldKinds.ValueChangeset = {
			value: { set: tree1 },
			changes: nodeChange1,
		};

		assert.deepEqual(change1WithChildChange, expected);
		assert.deepEqual(
			fieldHandler.rebaser.compose(
				[makeAnonChange(childChange1), makeAnonChange(change1)],
				simpleChildComposer,
				idAllocator,
			),
			change1,
		);

		assert.deepEqual(
			fieldHandler.rebaser.compose(
				[makeAnonChange(childChange1), makeAnonChange(childChange2)],
				childComposer1_2,
				idAllocator,
			),
			childChange3,
		);
	});

	it("can invert children", () => {
		const childInverter = (child: NodeChangeset): NodeChangeset => {
			assert.deepEqual(child, nodeChange1);
			return nodeChange2;
		};

		const inverted = fieldHandler.rebaser.invert(
			makeAnonChange(change1WithChildChange),
			childInverter,
			idAllocator,
		);

		assert.deepEqual(inverted.changes, nodeChange2);
	});

	it("can be rebased", () => {
		const childRebaser = (_1: NodeChangeset, _2: NodeChangeset) =>
			assert.fail("Should not be called");

		assert.deepEqual(
			fieldHandler.rebaser.rebase(
				change2,
				makeAnonChange(change1WithChildChange),
				childRebaser,
				idAllocator,
			),
			change2,
		);
	});

	it("can rebase child changes", () => {
		const childRebaser = (change: NodeChangeset, base: NodeChangeset) => {
			assert.deepEqual(change, nodeChange2);
			assert.deepEqual(base, nodeChange1);
			return nodeChange3;
		};

		const baseChange = fieldHandler.editor.buildChildChange(0, nodeChange1);
		const changeToRebase = fieldHandler.editor.buildChildChange(0, nodeChange2);

		assert.deepEqual(
			fieldHandler.rebaser.rebase(
				changeToRebase,
				makeAnonChange(baseChange),
				childRebaser,
				idAllocator,
			),
			childChange3,
		);
	});

	it("can be converted to a delta when overwriting content", () => {
		const expected: Delta.MarkList = [
			{ type: Delta.MarkType.Delete, count: 1 },
			{ type: Delta.MarkType.Insert, content: [singleTextCursor(tree3)] },
		];

		const delta = fieldHandler.intoDelta(change1WithChildChange, deltaFromChild1, noRepair);
		assertMarkListEqual(delta, expected);
	});

	it("can be converted to a delta when restoring content", () => {
		const expected: Delta.MarkList = [
			{ type: Delta.MarkType.Delete, count: 1 },
			{ type: Delta.MarkType.Insert, content: [singleTextCursor(tree1)] },
		];

		const repair: NodeReviver = (revision: RevisionTag, index: number, count: number) => {
			assert.equal(revision, detachedBy);
			assert.equal(index, 0);
			assert.equal(count, 1);
			return [singleTextCursor(tree1)];
		};
		const actual = fieldHandler.intoDelta(revertChange2, deltaFromChild1, repair);
		assertMarkListEqual(actual, expected);
	});

	it("can be encoded in JSON", () => {
		const version = 0;

		const encoded = JSON.stringify(
			fieldHandler.encoder.encodeForJson(version, change1WithChildChange, childEncoder1),
		);

		const decoded = fieldHandler.encoder.decodeJson(
			version,
			JSON.parse(encoded),
			childDecoder1,
		);
		assert.deepEqual(decoded, change1WithChildChange);
	});
});

describe("Optional field changesets", () => {
	const fieldHandler: FieldChangeHandler<FieldKinds.OptionalChangeset> =
		FieldKinds.optional.changeHandler;
	const editor: FieldKinds.OptionalFieldEditor =
		fieldHandler.editor as FieldKinds.OptionalFieldEditor;

	const change1: FieldKinds.OptionalChangeset = {
		fieldChange: { newContent: { set: tree1 }, wasEmpty: true },
		childChange: nodeChange1,
	};

	const detachedBy: RevisionTag = brand(42);
	const revertChange2: FieldKinds.OptionalChangeset = {
		fieldChange: { newContent: { revert: detachedBy }, wasEmpty: false },
	};

	const change2: FieldKinds.OptionalChangeset = editor.set(singleTextCursor(tree2), false);
	const change3: FieldKinds.OptionalChangeset = editor.set(singleTextCursor(tree2), true);
	const change4: FieldKinds.OptionalChangeset = editor.buildChildChange(0, nodeChange2);

	it("can be created", () => {
		const actual: FieldKinds.OptionalChangeset = editor.set(singleTextCursor(tree1), true);
		const expected: FieldKinds.OptionalChangeset = {
			fieldChange: { newContent: { set: tree1 }, wasEmpty: true },
		};
		assert.deepEqual(actual, expected);
	});

	it("can be composed", () => {
		const childComposer = (_: TaggedChange<NodeChangeset>[]) =>
			assert.fail("Should not be called");
		const composed = fieldHandler.rebaser.compose(
			[makeAnonChange(change1), makeAnonChange(change2)],
			childComposer,
			idAllocator,
		);
		assert.deepEqual(composed, change3);
	});

	it("can compose child changes", () => {
		const expected: FieldKinds.OptionalChangeset = {
			fieldChange: change1.fieldChange,
			childChange: nodeChange3,
		};

		assert.deepEqual(
			fieldHandler.rebaser.compose(
				[makeAnonChange(change1), makeAnonChange(change4)],
				childComposer1_2,
				idAllocator,
			),
			expected,
		);
	});

	it("can be inverted", () => {
		const childInverter = (change: NodeChangeset) => {
			assert.deepEqual(change, nodeChange1);
			return nodeChange2;
		};

		const expected: FieldKinds.OptionalChangeset = {
			fieldChange: { wasEmpty: false },
			childChange: nodeChange2,
		};

		assert.deepEqual(
			fieldHandler.rebaser.invert(makeAnonChange(change1), childInverter, idAllocator),
			expected,
		);
	});

	it("can be rebased", () => {
		const childRebaser = (_change: NodeChangeset, _base: NodeChangeset) =>
			assert.fail("Should not be called");
		assert.deepEqual(
			fieldHandler.rebaser.rebase(
				change3,
				makeAnonChange(change1),
				childRebaser,
				idAllocator,
			),
			change2,
		);
	});

	it("can rebase child change", () => {
		const baseChange: FieldKinds.OptionalChangeset = { childChange: nodeChange1 };
		const changeToRebase: FieldKinds.OptionalChangeset = { childChange: nodeChange2 };

		const childRebaser = (change: NodeChangeset, base: NodeChangeset) => {
			assert.deepEqual(change, nodeChange2);
			assert.deepEqual(base, nodeChange1);
			return nodeChange3;
		};

		const expected: FieldKinds.OptionalChangeset = { childChange: nodeChange3 };

		assert.deepEqual(
			fieldHandler.rebaser.rebase(
				changeToRebase,
				makeAnonChange(baseChange),
				childRebaser,
				idAllocator,
			),
			expected,
		);
	});

	it("can be converted to a delta when field was empty", () => {
		const expected: Delta.MarkList = [
			{
				type: Delta.MarkType.Insert,
				content: [singleTextCursor(tree3)],
			},
		];

		assertMarkListEqual(fieldHandler.intoDelta(change1, deltaFromChild1, noRepair), expected);
	});

	it("can be converted to a delta when replacing content", () => {
		const expected: Delta.MarkList = [
			{ type: Delta.MarkType.Delete, count: 1 },
			{ type: Delta.MarkType.Insert, content: [singleTextCursor(tree2)] },
		];

		assertMarkListEqual(fieldHandler.intoDelta(change2, deltaFromChild1, noRepair), expected);
	});

	it("can be converted to a delta when restoring content", () => {
		const expected: Delta.MarkList = [
			{ type: Delta.MarkType.Delete, count: 1 },
			{ type: Delta.MarkType.Insert, content: [singleTextCursor(tree1)] },
		];

		const repair: NodeReviver = (revision: RevisionTag, index: number, count: number) => {
			assert.equal(revision, detachedBy);
			assert.equal(index, 0);
			assert.equal(count, 1);
			return [singleTextCursor(tree1)];
		};
		const actual = fieldHandler.intoDelta(revertChange2, deltaFromChild1, repair);
		assertMarkListEqual(actual, expected);
	});

	it("can be converted to a delta with only child changes", () => {
		const expected: Delta.MarkList = [{ type: Delta.MarkType.Modify, setValue: "value4" }];

		assertMarkListEqual(fieldHandler.intoDelta(change4, deltaFromChild2, noRepair), expected);
	});

	it("can be encoded in JSON", () => {
		const version = 0;

		const encoded = JSON.stringify(
			fieldHandler.encoder.encodeForJson(version, change1, childEncoder1),
		);

		const decoded = fieldHandler.encoder.decodeJson(
			version,
			JSON.parse(encoded),
			childDecoder1,
		);
		assert.deepEqual(decoded, change1);
	});
});
