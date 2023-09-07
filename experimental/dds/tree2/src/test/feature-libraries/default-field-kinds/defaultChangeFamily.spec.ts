/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	Delta,
	FieldKey,
	mintRevisionTag,
	IForestSubscription,
	initializeForest,
	ITreeCursorSynchronous,
	JsonableTree,
	mapCursorField,
	moveToDetachedField,
	rootFieldKey,
	TaggedChange,
	UpPath,
	applyDelta,
} from "../../../core";
import { jsonNumber, jsonObject, jsonString } from "../../../domains";
import {
	DefaultChangeFamily,
	DefaultChangeset,
	DefaultEditBuilder,
	buildForest,
	singleTextCursor,
	jsonableTreeFromCursor,
	ModularChangeset,
} from "../../../feature-libraries";
import { brand } from "../../../util";
import { assertDeltaEqual } from "../../utils";
import { noopValidator } from "../../../codec";

const defaultChangeFamily = new DefaultChangeFamily({ jsonValidator: noopValidator });
const defaultIntoDelta = (change: ModularChangeset) => defaultChangeFamily.intoDelta(change);
const family = defaultChangeFamily;

const rootKey = rootFieldKey;
const fooKey = brand<FieldKey>("foo");
const barKey = brand<FieldKey>("bar");

const root: UpPath = {
	parent: undefined,
	parentField: rootKey,
	parentIndex: 0,
};

const root_foo0: UpPath = {
	parent: root,
	parentField: fooKey,
	parentIndex: 0,
};

const root_foo1: UpPath = {
	parent: root,
	parentField: fooKey,
	parentIndex: 1,
};

const root_foo2: UpPath = {
	parent: root,
	parentField: fooKey,
	parentIndex: 2,
};

const root_foo0_foo0: UpPath = {
	parent: root_foo0,
	parentField: fooKey,
	parentIndex: 0,
};

const root_foo2_foo5: UpPath = {
	parent: root_foo2,
	parentField: fooKey,
	parentIndex: 5,
};

const root_bar0: UpPath = {
	parent: root,
	parentField: barKey,
	parentIndex: 0,
};

const root_bar0_bar0: UpPath = {
	parent: root_bar0,
	parentField: barKey,
	parentIndex: 0,
};

const nodeX = { type: jsonString.name, value: "X" };
const nodeXCursor: ITreeCursorSynchronous = singleTextCursor(nodeX);

function assertDeltasEqual(actual: Delta.Root[], expected: Delta.Root[]): void {
	assert.equal(actual.length, expected.length);
	for (let i = 0; i < actual.length; ++i) {
		assertDeltaEqual(actual[i], expected[i]);
	}
}

/**
 * @param data - The data to initialize the forest with.
 */
function initializeEditableForest(data?: JsonableTree): {
	forest: IForestSubscription;
	builder: DefaultEditBuilder;
	changes: TaggedChange<DefaultChangeset>[];
	deltas: Delta.Root[];
} {
	const forest = buildForest();
	if (data !== undefined) {
		initializeForest(forest, [singleTextCursor(data)]);
	}
	let currentRevision = mintRevisionTag();
	const changes: TaggedChange<DefaultChangeset>[] = [];
	const deltas: Delta.Root[] = [];
	const builder = new DefaultEditBuilder(family, (change) => {
		changes.push({ revision: currentRevision, change });
		const delta = defaultChangeFamily.intoDelta(change);
		deltas.push(delta);
		applyDelta(delta, forest);
		currentRevision = mintRevisionTag();
	});
	return {
		forest,
		builder,
		changes,
		deltas,
	};
}

function expectForest(actual: IForestSubscription, expected: JsonableTree | JsonableTree[]): void {
	const reader = actual.allocateCursor();
	moveToDetachedField(actual, reader);
	const copy = mapCursorField(reader, jsonableTreeFromCursor);
	reader.free();
	const expectedArray = Array.isArray(expected) ? expected : [expected];
	assert.deepEqual(copy, expectedArray);
}

describe("DefaultEditBuilder", () => {
	it("Does not produces deltas if no editing calls are made to it", () => {
		const { builder, deltas } = initializeEditableForest();
		assertDeltasEqual(deltas, []);
	});

	it("Produces one delta for each editing call made to it", () => {
		const { builder, deltas, forest } = initializeEditableForest({
			type: jsonObject.name,
			fields: {
				foo: [{ type: jsonNumber.name, value: 0 }],
			},
		});
		assert.equal(deltas.length, 0);

		const fooPath = { parent: root, field: fooKey };
		const fooEditor = builder.sequenceField(fooPath);
		fooEditor.delete(0, 1);
		assert.equal(deltas.length, 1);
		fooEditor.insert(0, singleTextCursor({ type: jsonNumber.name, value: 42 }));
		expectForest(forest, {
			type: jsonObject.name,
			fields: {
				foo: [{ type: jsonNumber.name, value: 42 }],
			},
		});
		assert.equal(deltas.length, 2);

		fooEditor.delete(0, 1);
		assert.equal(deltas.length, 3);
	});

	describe("Value Field Edits", () => {
		it("Can overwrite a populated root field", () => {
			const { builder, forest } = initializeEditableForest({ type: jsonObject.name });
			builder.valueField({ parent: undefined, field: rootKey }).set(singleTextCursor(nodeX));
			expectForest(forest, nodeX);
		});

		it("Can overwrite a populated child field", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: jsonNumber.name, value: 0 },
						{ type: jsonNumber.name, value: 1 },
						{
							type: jsonObject.name,
							fields: {
								foo: [{ type: jsonNumber.name, value: 0 }],
							},
						},
					],
				},
			});
			builder.valueField({ parent: root_foo2, field: fooKey }).set(singleTextCursor(nodeX));
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: jsonNumber.name, value: 0 },
						{ type: jsonNumber.name, value: 1 },
						{
							type: jsonObject.name,
							fields: {
								foo: [nodeX],
							},
						},
					],
				},
			};
			expectForest(forest, expected);
		});
	});

	describe("Optional Field Edits", () => {
		it("Can overwrite a populated root field", () => {
			const { builder, forest } = initializeEditableForest({ type: jsonObject.name });
			builder
				.optionalField({ parent: undefined, field: rootKey })
				.set(singleTextCursor(nodeX), false);
			expectForest(forest, nodeX);
		});

		it("Can overwrite a populated child field", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: jsonNumber.name, value: 0 },
						{ type: jsonNumber.name, value: 1 },
						{
							type: jsonObject.name,
							fields: {
								foo: [{ type: jsonNumber.name, value: 0 }],
							},
						},
					],
				},
			});
			builder
				.optionalField({ parent: root_foo2, field: fooKey })
				.set(singleTextCursor(nodeX), false);
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: jsonNumber.name, value: 0 },
						{ type: jsonNumber.name, value: 1 },
						{
							type: jsonObject.name,
							fields: {
								foo: [nodeX],
							},
						},
					],
				},
			};
			expectForest(forest, expected);
		});

		it("Can set an empty root field", () => {
			const { builder, forest } = initializeEditableForest();
			builder
				.optionalField({ parent: undefined, field: rootKey })
				.set(singleTextCursor(nodeX), true);
			expectForest(forest, nodeX);
		});

		it("Can set an empty child field", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: jsonNumber.name, value: 0 },
						{ type: jsonNumber.name, value: 1 },
						{ type: jsonObject.name },
					],
				},
			});
			builder
				.optionalField({ parent: root_foo2, field: fooKey })
				.set(singleTextCursor(nodeX), true);
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: jsonNumber.name, value: 0 },
						{ type: jsonNumber.name, value: 1 },
						{ type: jsonObject.name, fields: { foo: [nodeX] } },
					],
				},
			};
			expectForest(forest, expected);
		});
	});

	describe("Sequence Field Edits", () => {
		it("Can insert a root node", () => {
			const { builder, forest } = initializeEditableForest();
			builder
				.sequenceField({ parent: undefined, field: rootKey })
				.insert(0, singleTextCursor(nodeX));
			expectForest(forest, nodeX);
		});

		it("Can insert a child node", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: jsonNumber.name, value: 0 },
						{ type: jsonNumber.name, value: 1 },
						{
							type: jsonObject.name,
							fields: {
								foo: [
									{ type: jsonNumber.name, value: 0 },
									{ type: jsonNumber.name, value: 1 },
									{ type: jsonNumber.name, value: 2 },
									{ type: jsonNumber.name, value: 3 },
									{ type: jsonNumber.name, value: 4 },
								],
							},
						},
					],
				},
			});
			builder
				.sequenceField({ parent: root_foo2, field: fooKey })
				.insert(5, singleTextCursor(nodeX));
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: jsonNumber.name, value: 0 },
						{ type: jsonNumber.name, value: 1 },
						{
							type: jsonObject.name,
							fields: {
								foo: [
									{ type: jsonNumber.name, value: 0 },
									{ type: jsonNumber.name, value: 1 },
									{ type: jsonNumber.name, value: 2 },
									{ type: jsonNumber.name, value: 3 },
									{ type: jsonNumber.name, value: 4 },
									nodeX,
								],
							},
						},
					],
				},
			};
			expectForest(forest, expected);
		});

		it("Can delete a root node", () => {
			const { builder, forest } = initializeEditableForest(nodeX);
			builder.sequenceField({ parent: undefined, field: rootKey }).delete(0, 1);
			expectForest(forest, []);
		});

		it("Can delete child nodes", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: jsonNumber.name, value: 0 },
						{ type: jsonNumber.name, value: 1 },
						{
							type: jsonObject.name,
							fields: {
								foo: [
									{ type: jsonNumber.name, value: 0 },
									{ type: jsonNumber.name, value: 1 },
									{ type: jsonNumber.name, value: 2 },
									{ type: jsonNumber.name, value: 3 },
									{ type: jsonNumber.name, value: 4 },
									{ type: jsonNumber.name, value: 5 },
									{ type: jsonNumber.name, value: 6 },
								],
							},
						},
					],
				},
			});
			builder.sequenceField({ parent: root_foo2, field: fooKey }).delete(5, 2);
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: jsonNumber.name, value: 0 },
						{ type: jsonNumber.name, value: 1 },
						{
							type: jsonObject.name,
							fields: {
								foo: [
									{ type: jsonNumber.name, value: 0 },
									{ type: jsonNumber.name, value: 1 },
									{ type: jsonNumber.name, value: 2 },
									{ type: jsonNumber.name, value: 3 },
									{ type: jsonNumber.name, value: 4 },
								],
							},
						},
					],
				},
			};
			expectForest(forest, expected);
		});

		it("Can move nodes to the right within a field", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: jsonNumber.name, value: 0 },
						{ type: jsonNumber.name, value: 1 },
						{ type: jsonNumber.name, value: 2 },
						{ type: jsonNumber.name, value: 3 },
					],
				},
			});
			builder.move({ parent: root, field: fooKey }, 0, 3, { parent: root, field: fooKey }, 1);
			const treeView = toJsonableTreeFromForest(forest);
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: jsonNumber.name, value: 3 },
						{ type: jsonNumber.name, value: 0 },
						{ type: jsonNumber.name, value: 1 },
						{ type: jsonNumber.name, value: 2 },
					],
				},
			};
			assert.deepEqual(treeView, [expected]);
		});

		it("Can move nodes to the left within a field", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: jsonNumber.name, value: 0 },
						{ type: jsonNumber.name, value: 1 },
						{ type: jsonNumber.name, value: 2 },
						{ type: jsonNumber.name, value: 3 },
					],
				},
			});
			builder.move({ parent: root, field: fooKey }, 1, 3, { parent: root, field: fooKey }, 0);
			const treeView = toJsonableTreeFromForest(forest);
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: jsonNumber.name, value: 1 },
						{ type: jsonNumber.name, value: 2 },
						{ type: jsonNumber.name, value: 3 },
						{ type: jsonNumber.name, value: 0 },
					],
				},
			};
			assert.deepEqual(treeView, [expected]);
		});

		it("Can move nodes across fields of the same parent", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: jsonNumber.name, value: 0 },
						{ type: jsonNumber.name, value: 1 },
						{ type: jsonNumber.name, value: 2 },
						{ type: jsonNumber.name, value: 3 },
					],
					bar: [{ type: jsonNumber.name, value: 0 }],
				},
			});
			builder.move({ parent: root, field: fooKey }, 1, 3, { parent: root, field: barKey }, 1);
			const treeView = toJsonableTreeFromForest(forest);
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [{ type: jsonNumber.name, value: 0 }],
					bar: [
						{ type: jsonNumber.name, value: 0 },
						{ type: jsonNumber.name, value: 1 },
						{ type: jsonNumber.name, value: 2 },
						{ type: jsonNumber.name, value: 3 },
					],
				},
			};
			assert.deepEqual(treeView, [expected]);
		});

		it("Can move nodes to the right across subtrees of the same field", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{
							type: jsonObject.name,
							fields: {
								foo: [
									{ type: jsonNumber.name, value: 0 },
									{ type: jsonNumber.name, value: 1 },
									{ type: jsonNumber.name, value: 2 },
									{ type: jsonNumber.name, value: 3 },
								],
							},
						},
						{
							type: jsonObject.name,
							fields: {
								foo: [{ type: jsonNumber.name, value: 0 }],
							},
						},
					],
				},
			});
			builder.move(
				{ parent: root_foo0, field: fooKey },
				1,
				3,
				{ parent: root_foo1, field: fooKey },
				1,
			);
			const treeView = toJsonableTreeFromForest(forest);
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [
						{
							type: jsonObject.name,
							fields: {
								foo: [{ type: jsonNumber.name, value: 0 }],
							},
						},
						{
							type: jsonObject.name,
							fields: {
								foo: [
									{ type: jsonNumber.name, value: 0 },
									{ type: jsonNumber.name, value: 1 },
									{ type: jsonNumber.name, value: 2 },
									{ type: jsonNumber.name, value: 3 },
								],
							},
						},
					],
				},
			};
			assert.deepEqual(treeView, [expected]);
		});

		it("Can move nodes to the left across subtrees of the same field", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{
							type: jsonObject.name,
							fields: {
								foo: [{ type: jsonNumber.name, value: 0 }],
							},
						},
						{
							type: jsonObject.name,
							fields: {
								foo: [
									{ type: jsonNumber.name, value: 0 },
									{ type: jsonNumber.name, value: 1 },
									{ type: jsonNumber.name, value: 2 },
									{ type: jsonNumber.name, value: 3 },
								],
							},
						},
					],
				},
			});
			builder.move(
				{ parent: root_foo1, field: fooKey },
				1,
				3,
				{ parent: root_foo0, field: fooKey },
				1,
			);
			const treeView = toJsonableTreeFromForest(forest);
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [
						{
							type: jsonObject.name,
							fields: {
								foo: [
									{ type: jsonNumber.name, value: 0 },
									{ type: jsonNumber.name, value: 1 },
									{ type: jsonNumber.name, value: 2 },
									{ type: jsonNumber.name, value: 3 },
								],
							},
						},
						{
							type: jsonObject.name,
							fields: {
								foo: [{ type: jsonNumber.name, value: 0 }],
							},
						},
					],
				},
			};
			assert.deepEqual(treeView, [expected]);
		});

		it("Can move nodes across subtrees of different fields", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{
							type: jsonObject.name,
							fields: {
								foo: [
									{ type: jsonNumber.name, value: 0 },
									{ type: jsonNumber.name, value: 1 },
									{ type: jsonNumber.name, value: 2 },
									{ type: jsonNumber.name, value: 3 },
								],
							},
						},
					],
					bar: [
						{
							type: jsonObject.name,
							fields: {
								bar: [{ type: jsonNumber.name, value: 0 }],
							},
						},
					],
				},
			});
			builder.move(
				{ parent: root_foo0, field: fooKey },
				1,
				3,
				{ parent: root_bar0, field: barKey },
				1,
			);
			const treeView = toJsonableTreeFromForest(forest);
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [
						{
							type: jsonObject.name,
							fields: {
								foo: [{ type: jsonNumber.name, value: 0 }],
							},
						},
					],
					bar: [
						{
							type: jsonObject.name,
							fields: {
								bar: [
									{ type: jsonNumber.name, value: 0 },
									{ type: jsonNumber.name, value: 1 },
									{ type: jsonNumber.name, value: 2 },
									{ type: jsonNumber.name, value: 3 },
								],
							},
						},
					],
				},
			};
			assert.deepEqual(treeView, [expected]);
		});

		it("Can move nodes across deep subtrees of different fields", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{
							type: jsonObject.name,
							fields: {
								foo: [
									{
										type: jsonObject.name,
										fields: {
											foo: [
												{ type: jsonNumber.name, value: 0 },
												{ type: jsonNumber.name, value: 1 },
												{ type: jsonNumber.name, value: 2 },
												{ type: jsonNumber.name, value: 3 },
											],
										},
									},
								],
							},
						},
					],
					bar: [
						{
							type: jsonObject.name,
							fields: {
								bar: [
									{
										type: jsonNumber.name,
										fields: {
											bar: [{ type: jsonNumber.name, value: 0 }],
										},
									},
								],
							},
						},
					],
				},
			});
			builder.move(
				{ parent: root_foo0_foo0, field: fooKey },
				1,
				3,
				{ parent: root_bar0_bar0, field: barKey },
				1,
			);
			const treeView = toJsonableTreeFromForest(forest);
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [
						{
							type: jsonObject.name,
							fields: {
								foo: [
									{
										type: jsonObject.name,
										fields: {
											foo: [{ type: jsonNumber.name, value: 0 }],
										},
									},
								],
							},
						},
					],
					bar: [
						{
							type: jsonObject.name,
							fields: {
								bar: [
									{
										type: jsonNumber.name,
										fields: {
											bar: [
												{ type: jsonNumber.name, value: 0 },
												{ type: jsonNumber.name, value: 1 },
												{ type: jsonNumber.name, value: 2 },
												{ type: jsonNumber.name, value: 3 },
											],
										},
									},
								],
							},
						},
					],
				},
			};
			assert.deepEqual(treeView, [expected]);
		});

		it("Can move all nodes into another field", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: jsonNumber.name, value: 1 },
						{ type: jsonNumber.name, value: 2 },
						{ type: jsonNumber.name, value: 3 },
					],
					bar: [{ type: jsonNumber.name, value: 0 }],
				},
			});
			builder.move({ parent: root, field: fooKey }, 0, 3, { parent: root, field: barKey }, 1);
			const treeView = toJsonableTreeFromForest(forest);
			const expected = {
				type: jsonObject.name,
				fields: {
					bar: [
						{ type: jsonNumber.name, value: 0 },
						{ type: jsonNumber.name, value: 1 },
						{ type: jsonNumber.name, value: 2 },
						{ type: jsonNumber.name, value: 3 },
					],
				},
			};
			assert.deepEqual(treeView, [expected]);
		});
	});
});

function toJsonableTreeFromForest(forest: IForestSubscription): JsonableTree[] {
	const readCursor = forest.allocateCursor();
	moveToDetachedField(forest, readCursor);
	const jsonable = mapCursorField(readCursor, jsonableTreeFromCursor);
	readCursor.free();
	return jsonable;
}
