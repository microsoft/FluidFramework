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

describe("DefaultEditBuilder", () => {
	it("Does not produces deltas if no editing calls are made to it", () => {
		const { builder, deltas } = initializeEditableForest();
		assertDeltasEqual(deltas, []);
	});

	it("Produces one delta for each editing call made to it", () => {
		const { builder, deltas } = initializeEditableForest({ type: jsonNumber.name, value: 41 });
		const expected: Delta.Root[] = [];

		builder.setValue(root, 42);
		expected.push(
			new Map([
				[
					rootKey,
					[
						{
							type: Delta.MarkType.Modify,
							setValue: 42,
						},
					],
				],
			]),
		);
		assertDeltasEqual(deltas, expected);

		builder.setValue(root, 43);
		expected.push(
			new Map([
				[
					rootKey,
					[
						{
							type: Delta.MarkType.Modify,
							setValue: 43,
						},
					],
				],
			]),
		);
		assertDeltasEqual(deltas, expected);

		builder.setValue(root, 44);
		expected.push(
			new Map([
				[
					rootKey,
					[
						{
							type: Delta.MarkType.Modify,
							setValue: 44,
						},
					],
				],
			]),
		);
		assertDeltasEqual(deltas, expected);
	});

	it("Allows repair data to flow in and out of the repair store", () => {
		const { builder, deltas, changes } = initializeEditableForest({
			type: jsonNumber.name,
			value: 41,
		});

		builder.setValue(root, 42);
		const change = changes[0];
		const inverse = family.rebaser.invert(change);
		builder.apply(inverse);

		const expected: Delta.Root = new Map([
			[
				rootKey,
				[
					{
						type: Delta.MarkType.Modify,
						setValue: 41,
					},
				],
			],
		]);
		assertDeltaEqual(deltas[1], expected);
	});

	describe("Node Edits", () => {
		it("Can set the root node value", () => {
			const { builder, deltas } = initializeEditableForest({
				type: jsonNumber.name,
				value: 41,
			});
			builder.setValue(root, 42);
			const expected: Delta.Root = new Map([
				[
					rootKey,
					[
						{
							type: Delta.MarkType.Modify,
							setValue: 42,
						},
					],
				],
			]);
			assertDeltasEqual(deltas, [expected]);
		});

		it("Can set a child node value", () => {
			const { builder, deltas } = initializeEditableForest({
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
			const expected: Delta.Root = new Map([
				[
					rootKey,
					[
						{
							type: Delta.MarkType.Modify,
							fields: new Map([
								[
									fooKey,
									[
										2,
										{
											type: Delta.MarkType.Modify,
											fields: new Map([
												[
													fooKey,
													[
														5,
														{
															type: Delta.MarkType.Modify,
															setValue: 42,
														},
													],
												],
											]),
										},
									],
								],
							]),
						},
					],
				],
			]);
			builder.setValue(root_foo2_foo5, 42);
			assertDeltasEqual(deltas, [expected]);
		});
	});

	describe("Value Field Edits", () => {
		it("Can overwrite a populated root field", () => {
			const { builder, deltas } = initializeEditableForest({ type: jsonObject.name });
			builder.valueField(undefined, rootKey).set(singleTextCursor(nodeX));
			const expected: Delta.Root = new Map([
				[
					rootKey,
					[
						{
							type: Delta.MarkType.Delete,
							count: 1,
						},
						{
							type: Delta.MarkType.Insert,
							content: [nodeXCursor],
						},
					],
				],
			]);
			assertDeltasEqual(deltas, [expected]);
		});

		it("Can overwrite a populated child field", () => {
			const { builder, deltas } = initializeEditableForest({
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
			const expected: Delta.Root = new Map([
				[
					rootKey,
					[
						{
							type: Delta.MarkType.Modify,
							fields: new Map([
								[
									fooKey,
									[
										2,
										{
											type: Delta.MarkType.Modify,
											fields: new Map([
												[
													fooKey,
													[
														{
															type: Delta.MarkType.Delete,
															count: 1,
														},
														{
															type: Delta.MarkType.Insert,
															content: [nodeXCursor],
														},
													],
												],
											]),
										},
									],
								],
							]),
						},
					],
				],
			]);
			builder.valueField(root_foo2, fooKey).set(singleTextCursor(nodeX));
			assertDeltasEqual(deltas, [expected]);
		});
	});

	describe("Optional Field Edits", () => {
		it("Can overwrite a populated root field", () => {
			const { builder, deltas } = initializeEditableForest({ type: jsonObject.name });
			builder.optionalField(undefined, rootKey).set(singleTextCursor(nodeX), false);
			const expected: Delta.Root = new Map([
				[
					rootKey,
					[
						{
							type: Delta.MarkType.Delete,
							count: 1,
						},
						{
							type: Delta.MarkType.Insert,
							content: [nodeXCursor],
						},
					],
				],
			]);
			assertDeltasEqual(deltas, [expected]);
		});

		it("Can overwrite a populated child field", () => {
			const { builder, deltas } = initializeEditableForest({
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
			const expected: Delta.Root = new Map([
				[
					rootKey,
					[
						{
							type: Delta.MarkType.Modify,
							fields: new Map([
								[
									fooKey,
									[
										2,
										{
											type: Delta.MarkType.Modify,
											fields: new Map([
												[
													fooKey,
													[
														{
															type: Delta.MarkType.Delete,
															count: 1,
														},
														{
															type: Delta.MarkType.Insert,
															content: [nodeXCursor],
														},
													],
												],
											]),
										},
									],
								],
							]),
						},
					],
				],
			]);
			builder.optionalField(root_foo2, fooKey).set(singleTextCursor(nodeX), false);
			assertDeltasEqual(deltas, [expected]);
		});

		it("Can set an empty root field", () => {
			const { builder, deltas } = initializeEditableForest();
			builder.optionalField(undefined, rootKey).set(singleTextCursor(nodeX), true);
			const expected: Delta.Root = new Map([
				[
					rootKey,
					[
						{
							type: Delta.MarkType.Insert,
							content: [nodeXCursor],
						},
					],
				],
			]);
			assertDeltasEqual(deltas, [expected]);
		});

		it("Can set an empty child field", () => {
			const { builder, deltas } = initializeEditableForest({
				type: jsonObject.name,
				fields: {
					foo: [
						{ type: jsonNumber.name, value: 0 },
						{ type: jsonNumber.name, value: 1 },
						{ type: jsonObject.name },
					],
				},
			});
			const expected: Delta.Root = new Map([
				[
					rootKey,
					[
						{
							type: Delta.MarkType.Modify,
							fields: new Map([
								[
									fooKey,
									[
										2,
										{
											type: Delta.MarkType.Modify,
											fields: new Map([
												[
													fooKey,
													[
														{
															type: Delta.MarkType.Insert,
															content: [nodeXCursor],
														},
													],
												],
											]),
										},
									],
								],
							]),
						},
					],
				],
			]);
			builder.optionalField(root_foo2, fooKey).set(singleTextCursor(nodeX), true);
			assertDeltasEqual(deltas, [expected]);
		});
	});

	describe("Sequence Field Edits", () => {
		it("Can insert a root node", () => {
			const { builder, deltas } = initializeEditableForest();
			const expected: Delta.Root = new Map([
				[
					rootKey,
					[
						{
							type: Delta.MarkType.Insert,
							content: [nodeXCursor],
						},
					],
				],
			]);
			builder.sequenceField(undefined, rootKey).insert(0, singleTextCursor(nodeX));
			assertDeltasEqual(deltas, [expected]);
		});

		it("Can insert a child node", () => {
			const { builder, deltas } = initializeEditableForest({
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
			const expected: Delta.Root = new Map([
				[
					rootKey,
					[
						{
							type: Delta.MarkType.Modify,
							fields: new Map([
								[
									fooKey,
									[
										2,
										{
											type: Delta.MarkType.Modify,
											fields: new Map([
												[
													fooKey,
													[
														5,
														{
															type: Delta.MarkType.Insert,
															content: [nodeXCursor],
														},
													],
												],
											]),
										},
									],
								],
							]),
						},
					],
				],
			]);
			builder.sequenceField(root_foo2, fooKey).insert(5, singleTextCursor(nodeX));
			assertDeltasEqual(deltas, [expected]);
		});

		it("Can delete a root node", () => {
			const { builder, deltas } = initializeEditableForest({
				type: jsonNumber.name,
				value: 41,
			});
			const expected: Delta.Root = new Map([
				[
					rootKey,
					[
						{
							type: Delta.MarkType.Delete,
							count: 1,
						},
					],
				],
			]);
			builder.sequenceField(undefined, rootKey).delete(0, 1);
			assertDeltasEqual(deltas, [expected]);
		});

		it("Can delete child nodes", () => {
			const { builder, deltas } = initializeEditableForest({
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
			const expected: Delta.Root = new Map([
				[
					rootKey,
					[
						{
							type: Delta.MarkType.Modify,
							fields: new Map([
								[
									fooKey,
									[
										2,
										{
											type: Delta.MarkType.Modify,
											fields: new Map([
												[
													fooKey,
													[
														5,
														{
															type: Delta.MarkType.Delete,
															count: 2,
														},
													],
												],
											]),
										},
									],
								],
							]),
						},
					],
				],
			]);
			builder.sequenceField(root_foo2, fooKey).delete(5, 2);
			assertDeltasEqual(deltas, [expected]);
		});
	});
});
