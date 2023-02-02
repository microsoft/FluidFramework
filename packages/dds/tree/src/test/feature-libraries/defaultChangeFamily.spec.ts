/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	AnchorSet,
	Delta,
	FieldKey,
	IForestSubscription,
	initializeForest,
	InMemoryStoredSchemaRepository,
	ITreeCursorSynchronous,
	JsonableTree,
	mapCursorField,
	moveToDetachedField,
	RevisionTag,
	rootFieldKeySymbol,
	TaggedChange,
	UpPath,
} from "../../core";
import { jsonNumber, jsonObject, jsonString } from "../../domains";
import {
	defaultChangeFamily,
	defaultChangeFamily as family,
	DefaultChangeset,
	DefaultEditBuilder,
	defaultSchemaPolicy,
	ForestRepairDataStore,
	buildForest,
	singleTextCursor,
	jsonableTreeFromCursor,
} from "../../feature-libraries";
import { brand } from "../../util";
import { assertDeltaEqual } from "../utils";

const rootKey = rootFieldKeySymbol;
const fooKey = brand<FieldKey>("foo");

const root: UpPath = {
	parent: undefined,
	parentField: rootKey,
	parentIndex: 0,
};

const root_foo2: UpPath = {
	parent: root,
	parentField: fooKey,
	parentIndex: 2,
};

const root_foo2_foo5: UpPath = {
	parent: root_foo2,
	parentField: fooKey,
	parentIndex: 5,
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
	const schema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy);
	const forest = buildForest(schema);
	if (data !== undefined) {
		initializeForest(forest, [singleTextCursor(data)]);
	}
	let currentRevision = 0;
	const repairStore = new ForestRepairDataStore((revision: RevisionTag) => {
		assert(
			revision === currentRevision,
			"The repair data store should only ask for the current forest state",
		);
		return forest;
	});
	const changes: TaggedChange<DefaultChangeset>[] = [];
	const deltas: Delta.Root[] = [];
	const builder = new DefaultEditBuilder(
		family,
		(change) => {
			const revision: RevisionTag = brand(currentRevision);
			changes.push({ revision, change });
			const delta = defaultChangeFamily.intoDelta(change, repairStore);
			repairStore.capture(delta, revision);
			deltas.push(delta);
			forest.applyDelta(delta);
			currentRevision += 1;
		},
		new AnchorSet(),
	);
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
			type: jsonNumber.name,
			value: 41,
		});
		assert.equal(deltas.length, 0);

		builder.setValue(root, 42);
		expectForest(forest, { type: jsonNumber.name, value: 42 });
		assert.equal(deltas.length, 1);

		builder.setValue(root, 43);
		expectForest(forest, { type: jsonNumber.name, value: 43 });
		assert.equal(deltas.length, 2);

		builder.setValue(root, 44);
		expectForest(forest, { type: jsonNumber.name, value: 44 });
		assert.equal(deltas.length, 3);
	});

	it("Allows repair data to flow in and out of the repair store", () => {
		const { builder, deltas, changes, forest } = initializeEditableForest({
			type: jsonNumber.name,
			value: 41,
		});

		builder.setValue(root, 42);
		expectForest(forest, { type: jsonNumber.name, value: 42 });

		const change = changes[0];
		const inverse = family.rebaser.invert(change);
		builder.apply(inverse);
		expectForest(forest, { type: jsonNumber.name, value: 41 });
	});

	describe("Node Edits", () => {
		it("Can set the root node value", () => {
			const { builder, forest } = initializeEditableForest({
				type: jsonNumber.name,
				value: 41,
			});
			builder.setValue(root, 42);
			expectForest(forest, { type: jsonNumber.name, value: 42 });
		});

		it("Can set a child node value", () => {
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
								],
							},
						},
					],
				},
			});
			builder.setValue(root_foo2_foo5, 42);
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
									{ type: jsonNumber.name, value: 42 },
								],
							},
						},
					],
				},
			};
			expectForest(forest, expected);
		});
	});

	describe("Value Field Edits", () => {
		it("Can overwrite a populated root field", () => {
			const { builder, forest } = initializeEditableForest({ type: jsonObject.name });
			builder.valueField(undefined, rootKey).set(singleTextCursor(nodeX));
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
			builder.valueField(root_foo2, fooKey).set(singleTextCursor(nodeX));
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
			builder.optionalField(undefined, rootKey).set(singleTextCursor(nodeX), false);
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
			builder.optionalField(root_foo2, fooKey).set(singleTextCursor(nodeX), false);
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
			builder.optionalField(undefined, rootKey).set(singleTextCursor(nodeX), true);
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
			builder.optionalField(root_foo2, fooKey).set(singleTextCursor(nodeX), true);
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
			builder.sequenceField(undefined, rootKey).insert(0, singleTextCursor(nodeX));
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
			builder.sequenceField(root_foo2, fooKey).insert(5, singleTextCursor(nodeX));
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
			builder.sequenceField(undefined, rootKey).delete(0, 1);
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
			builder.sequenceField(root_foo2, fooKey).delete(5, 2);
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
	});
});
