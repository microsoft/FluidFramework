/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	type DeltaRoot,
	type FieldKey,
	type IForestSubscription,
	type JsonableTree,
	type TaggedChange,
	type UpPath,
	applyDelta,
	initializeForest,
	makeDetachedFieldIndex,
	mapCursorField,
	moveToDetachedField,
	rootFieldKey,
} from "../../../core/index.js";
import { jsonObject, leaf } from "../../../domains/index.js";
import {
	DefaultChangeFamily,
	type DefaultChangeset,
	DefaultEditBuilder,
	buildForest,
	cursorForJsonableTreeNode,
	intoDelta,
	jsonableTreeFromCursor,
} from "../../../feature-libraries/index.js";
import { brand } from "../../../util/index.js";
import {
	assertDeltaEqual,
	failCodecFamily,
	mintRevisionTag,
	testIdCompressor,
	testRevisionTagCodec,
} from "../../utils.js";

const defaultChangeFamily = new DefaultChangeFamily(failCodecFamily);
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

const nodeX = { type: leaf.string.name, value: "X" };

function assertDeltasEqual(actual: DeltaRoot[], expected: DeltaRoot[]): void {
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
	deltas: DeltaRoot[];
} {
	const forest = buildForest();
	if (data !== undefined) {
		initializeForest(
			forest,
			[cursorForJsonableTreeNode(data)],
			testRevisionTagCodec,
			testIdCompressor,
		);
	}
	let currentRevision = mintRevisionTag();
	const changes: TaggedChange<DefaultChangeset>[] = [];
	const deltas: DeltaRoot[] = [];
	const detachedFieldIndex = makeDetachedFieldIndex(
		undefined,
		testRevisionTagCodec,
		testIdCompressor,
	);
	const builder = new DefaultEditBuilder(family, (change) => {
		const taggedChange = { revision: currentRevision, change };
		changes.push(taggedChange);
		const delta = intoDelta(taggedChange);
		deltas.push(delta);
		applyDelta(delta, forest, detachedFieldIndex);
		currentRevision = mintRevisionTag();
	});
	return {
		forest,
		builder,
		changes,
		deltas,
	};
}

function expectForest(
	actual: IForestSubscription,
	expected: JsonableTree | JsonableTree[],
): void {
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
				foo: [{ type: leaf.number.name, value: 0 }],
			},
		});
		assert.equal(deltas.length, 0);

		const fooPath = { parent: root, field: fooKey };
		const fooEditor = builder.sequenceField(fooPath);
		fooEditor.remove(0, 1);
		assert.equal(deltas.length, 1);
		fooEditor.insert(0, cursorForJsonableTreeNode({ type: leaf.number.name, value: 42 }));
		expectForest(forest, {
			type: jsonObject.name,
			fields: {
				foo: [{ type: leaf.number.name, value: 42 }],
			},
		});
		assert.equal(deltas.length, 2);

		fooEditor.remove(0, 1);
		assert.equal(deltas.length, 3);
	});

	describe("Value Field Edits", () => {
		it("Can overwrite a populated root field", () => {
			const { builder, forest } = initializeEditableForest({ type: jsonObject.name });
			builder
				.valueField({ parent: undefined, field: rootKey })
				.set(cursorForJsonableTreeNode(nodeX));
			expectForest(forest, nodeX);
		});

		it("Can overwrite a populated child field", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: leaf.number.name, value: 0 },
						{ type: leaf.number.name, value: 1 },
						{
							type: jsonObject.name,
							fields: {
								foo: [{ type: leaf.number.name, value: 0 }],
							},
						},
					],
				},
			});
			builder
				.valueField({ parent: root_foo2, field: fooKey })
				.set(cursorForJsonableTreeNode(nodeX));
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: leaf.number.name, value: 0 },
						{ type: leaf.number.name, value: 1 },
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
				.set(cursorForJsonableTreeNode(nodeX), false);
			expectForest(forest, nodeX);
		});

		it("Can overwrite a populated child field", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: leaf.number.name, value: 0 },
						{ type: leaf.number.name, value: 1 },
						{
							type: jsonObject.name,
							fields: {
								foo: [{ type: leaf.number.name, value: 0 }],
							},
						},
					],
				},
			});
			builder
				.optionalField({ parent: root_foo2, field: fooKey })
				.set(cursorForJsonableTreeNode(nodeX), false);
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: leaf.number.name, value: 0 },
						{ type: leaf.number.name, value: 1 },
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
				.set(cursorForJsonableTreeNode(nodeX), true);
			expectForest(forest, nodeX);
		});

		it("Can set an empty child field", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: leaf.number.name, value: 0 },
						{ type: leaf.number.name, value: 1 },
						{ type: jsonObject.name },
					],
				},
			});
			builder
				.optionalField({ parent: root_foo2, field: fooKey })
				.set(cursorForJsonableTreeNode(nodeX), true);
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: leaf.number.name, value: 0 },
						{ type: leaf.number.name, value: 1 },
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
				.insert(0, cursorForJsonableTreeNode(nodeX));
			expectForest(forest, nodeX);
		});

		it("Can insert a child node", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: leaf.number.name, value: 0 },
						{ type: leaf.number.name, value: 1 },
						{
							type: jsonObject.name,
							fields: {
								foo: [
									{ type: leaf.number.name, value: 0 },
									{ type: leaf.number.name, value: 1 },
									{ type: leaf.number.name, value: 2 },
									{ type: leaf.number.name, value: 3 },
									{ type: leaf.number.name, value: 4 },
								],
							},
						},
					],
				},
			});
			builder
				.sequenceField({ parent: root_foo2, field: fooKey })
				.insert(5, cursorForJsonableTreeNode(nodeX));
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: leaf.number.name, value: 0 },
						{ type: leaf.number.name, value: 1 },
						{
							type: jsonObject.name,
							fields: {
								foo: [
									{ type: leaf.number.name, value: 0 },
									{ type: leaf.number.name, value: 1 },
									{ type: leaf.number.name, value: 2 },
									{ type: leaf.number.name, value: 3 },
									{ type: leaf.number.name, value: 4 },
									nodeX,
								],
							},
						},
					],
				},
			};
			expectForest(forest, expected);
		});

		it("Can remove a root node", () => {
			const { builder, forest } = initializeEditableForest(nodeX);
			builder.sequenceField({ parent: undefined, field: rootKey }).remove(0, 1);
			expectForest(forest, []);
		});

		it("Can remove child nodes", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: leaf.number.name, value: 0 },
						{ type: leaf.number.name, value: 1 },
						{
							type: jsonObject.name,
							fields: {
								foo: [
									{ type: leaf.number.name, value: 0 },
									{ type: leaf.number.name, value: 1 },
									{ type: leaf.number.name, value: 2 },
									{ type: leaf.number.name, value: 3 },
									{ type: leaf.number.name, value: 4 },
									{ type: leaf.number.name, value: 5 },
									{ type: leaf.number.name, value: 6 },
								],
							},
						},
					],
				},
			});
			builder.sequenceField({ parent: root_foo2, field: fooKey }).remove(5, 2);
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: leaf.number.name, value: 0 },
						{ type: leaf.number.name, value: 1 },
						{
							type: jsonObject.name,
							fields: {
								foo: [
									{ type: leaf.number.name, value: 0 },
									{ type: leaf.number.name, value: 1 },
									{ type: leaf.number.name, value: 2 },
									{ type: leaf.number.name, value: 3 },
									{ type: leaf.number.name, value: 4 },
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
						{ type: leaf.number.name, value: 0 },
						{ type: leaf.number.name, value: 1 },
						{ type: leaf.number.name, value: 2 },
						{ type: leaf.number.name, value: 3 },
					],
				},
			});
			builder.move({ parent: root, field: fooKey }, 0, 3, { parent: root, field: fooKey }, 4);
			const treeView = toJsonableTreeFromForest(forest);
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: leaf.number.name, value: 3 },
						{ type: leaf.number.name, value: 0 },
						{ type: leaf.number.name, value: 1 },
						{ type: leaf.number.name, value: 2 },
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
						{ type: leaf.number.name, value: 0 },
						{ type: leaf.number.name, value: 1 },
						{ type: leaf.number.name, value: 2 },
						{ type: leaf.number.name, value: 3 },
					],
				},
			});
			builder.move({ parent: root, field: fooKey }, 1, 3, { parent: root, field: fooKey }, 0);
			const treeView = toJsonableTreeFromForest(forest);
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: leaf.number.name, value: 1 },
						{ type: leaf.number.name, value: 2 },
						{ type: leaf.number.name, value: 3 },
						{ type: leaf.number.name, value: 0 },
					],
				},
			};
			assert.deepEqual(treeView, [expected]);
		});

		it("Can move nodes in their own midst", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: leaf.number.name, value: 0 },
						{ type: leaf.number.name, value: 1 },
						{ type: leaf.number.name, value: 2 },
						{ type: leaf.number.name, value: 3 },
					],
				},
			});
			builder.move({ parent: root, field: fooKey }, 1, 2, { parent: root, field: fooKey }, 2);
			const treeView = toJsonableTreeFromForest(forest);
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: leaf.number.name, value: 0 },
						{ type: leaf.number.name, value: 1 },
						{ type: leaf.number.name, value: 2 },
						{ type: leaf.number.name, value: 3 },
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
						{ type: leaf.number.name, value: 0 },
						{ type: leaf.number.name, value: 1 },
						{ type: leaf.number.name, value: 2 },
						{ type: leaf.number.name, value: 3 },
					],
					bar: [{ type: leaf.number.name, value: 0 }],
				},
			});
			builder.move({ parent: root, field: fooKey }, 1, 3, { parent: root, field: barKey }, 1);
			const treeView = toJsonableTreeFromForest(forest);
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [{ type: leaf.number.name, value: 0 }],
					bar: [
						{ type: leaf.number.name, value: 0 },
						{ type: leaf.number.name, value: 1 },
						{ type: leaf.number.name, value: 2 },
						{ type: leaf.number.name, value: 3 },
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
									{ type: leaf.number.name, value: 0 },
									{ type: leaf.number.name, value: 1 },
									{ type: leaf.number.name, value: 2 },
									{ type: leaf.number.name, value: 3 },
								],
							},
						},
						{
							type: jsonObject.name,
							fields: {
								foo: [{ type: leaf.number.name, value: 0 }],
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
								foo: [{ type: leaf.number.name, value: 0 }],
							},
						},
						{
							type: jsonObject.name,
							fields: {
								foo: [
									{ type: leaf.number.name, value: 0 },
									{ type: leaf.number.name, value: 1 },
									{ type: leaf.number.name, value: 2 },
									{ type: leaf.number.name, value: 3 },
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
								foo: [{ type: leaf.number.name, value: 0 }],
							},
						},
						{
							type: jsonObject.name,
							fields: {
								foo: [
									{ type: leaf.number.name, value: 0 },
									{ type: leaf.number.name, value: 1 },
									{ type: leaf.number.name, value: 2 },
									{ type: leaf.number.name, value: 3 },
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
									{ type: leaf.number.name, value: 0 },
									{ type: leaf.number.name, value: 1 },
									{ type: leaf.number.name, value: 2 },
									{ type: leaf.number.name, value: 3 },
								],
							},
						},
						{
							type: jsonObject.name,
							fields: {
								foo: [{ type: leaf.number.name, value: 0 }],
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
									{ type: leaf.number.name, value: 0 },
									{ type: leaf.number.name, value: 1 },
									{ type: leaf.number.name, value: 2 },
									{ type: leaf.number.name, value: 3 },
								],
							},
						},
					],
					bar: [
						{
							type: jsonObject.name,
							fields: {
								bar: [{ type: leaf.number.name, value: 0 }],
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
								foo: [{ type: leaf.number.name, value: 0 }],
							},
						},
					],
					bar: [
						{
							type: jsonObject.name,
							fields: {
								bar: [
									{ type: leaf.number.name, value: 0 },
									{ type: leaf.number.name, value: 1 },
									{ type: leaf.number.name, value: 2 },
									{ type: leaf.number.name, value: 3 },
								],
							},
						},
					],
				},
			};
			assert.deepEqual(treeView, [expected]);
		});

		it("Can move nodes before an ancestor of the moved node", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{
							type: jsonObject.name,
							fields: {
								foo: [
									{ type: leaf.number.name, value: 0 },
									{ type: leaf.number.name, value: 1 },
									{ type: leaf.number.name, value: 2 },
									{ type: leaf.number.name, value: 3 },
								],
							},
						},
					],
				},
			});
			builder.move(
				{ parent: root_foo0, field: fooKey },
				1,
				3,
				{ parent: root, field: fooKey },
				0,
			);
			const treeView = toJsonableTreeFromForest(forest);
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: leaf.number.name, value: 1 },
						{ type: leaf.number.name, value: 2 },
						{ type: leaf.number.name, value: 3 },
						{
							type: jsonObject.name,
							fields: {
								foo: [{ type: leaf.number.name, value: 0 }],
							},
						},
					],
				},
			};
			assert.deepEqual(treeView, [expected]);
		});

		it("Can move nodes after an ancestor of the moved node", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{
							type: jsonObject.name,
							fields: {
								foo: [
									{ type: leaf.number.name, value: 0 },
									{ type: leaf.number.name, value: 1 },
									{ type: leaf.number.name, value: 2 },
									{ type: leaf.number.name, value: 3 },
								],
							},
						},
					],
				},
			});
			builder.move(
				{ parent: root_foo0, field: fooKey },
				1,
				3,
				{ parent: root, field: fooKey },
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
								foo: [{ type: leaf.number.name, value: 0 }],
							},
						},
						{ type: leaf.number.name, value: 1 },
						{ type: leaf.number.name, value: 2 },
						{ type: leaf.number.name, value: 3 },
					],
				},
			};
			assert.deepEqual(treeView, [expected]);
		});

		it("Errors when attempting to move a node under itself", () => {
			const statingState = {
				type: jsonObject.name,
				fields: {
					foo: [
						{
							type: jsonObject.name,
						},
					],
				},
			};
			const { builder, forest } = initializeEditableForest(statingState);
			assert.throws(() =>
				builder.move(
					{ parent: root, field: fooKey },
					0,
					1,
					{ parent: root_foo0, field: fooKey },
					0,
				),
			);
			const treeView = toJsonableTreeFromForest(forest);
			assert.deepEqual(treeView, [statingState]);
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
												{ type: leaf.number.name, value: 0 },
												{ type: leaf.number.name, value: 1 },
												{ type: leaf.number.name, value: 2 },
												{ type: leaf.number.name, value: 3 },
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
										type: leaf.number.name,
										fields: {
											bar: [{ type: leaf.number.name, value: 0 }],
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
											foo: [{ type: leaf.number.name, value: 0 }],
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
										type: leaf.number.name,
										fields: {
											bar: [
												{ type: leaf.number.name, value: 0 },
												{ type: leaf.number.name, value: 1 },
												{ type: leaf.number.name, value: 2 },
												{ type: leaf.number.name, value: 3 },
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
						{ type: leaf.number.name, value: 1 },
						{ type: leaf.number.name, value: 2 },
						{ type: leaf.number.name, value: 3 },
					],
					bar: [{ type: leaf.number.name, value: 0 }],
				},
			});
			builder.move({ parent: root, field: fooKey }, 0, 3, { parent: root, field: barKey }, 1);
			const treeView = toJsonableTreeFromForest(forest);
			const expected = {
				type: jsonObject.name,
				fields: {
					bar: [
						{ type: leaf.number.name, value: 0 },
						{ type: leaf.number.name, value: 1 },
						{ type: leaf.number.name, value: 2 },
						{ type: leaf.number.name, value: 3 },
					],
				},
			};
			assert.deepEqual(treeView, [expected]);
		});

		it("Moving 0 items does nothing.", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [],
				},
			});
			builder.move({ parent: root, field: fooKey }, 0, 0, { parent: root, field: fooKey }, 0);
			const treeView = toJsonableTreeFromForest(forest);
			const expected = {
				type: jsonObject.name,
				fields: {
					foo: [],
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
