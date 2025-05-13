/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	CursorLocationType,
	EmptyKey,
	type FieldKey,
	type FieldUpPath,
	type ITreeCursor,
	type JsonableTree,
	type PathRootPrefix,
	type TreeNodeSchemaIdentifier,
	type UpPath,
	compareFieldUpPaths,
	rootFieldKey,
	setGenericTreeField,
} from "../core/index.js";
import {
	cursorForJsonableTreeNode,
	jsonableTreeFromCursor,
	prefixFieldPath,
	prefixPath,
} from "../feature-libraries/index.js";
import { brand } from "../util/index.js";
import { expectEqualFieldPaths, expectEqualPaths, IdentifierSchema } from "./utils.js";
import {
	booleanSchema,
	numberSchema,
	SchemaFactory,
	stringSchema,
} from "../simple-tree/index.js";
import { JsonAsTree } from "../jsonDomainSchema.js";

const sf = new SchemaFactory("Cursor Test Suite");

export class EmptyObject extends sf.object("Empty object", {}) {}
class EmptyObject2 extends sf.object("Empty object 2", {}) {}
class EmptyObject3 extends sf.object("Empty object 3", {}) {}

const emptyObjectIdentifier: TreeNodeSchemaIdentifier = brand(EmptyObject.identifier);
const emptyObjectIdentifier2: TreeNodeSchemaIdentifier = brand(EmptyObject2.identifier);
const emptyObjectIdentifier3: TreeNodeSchemaIdentifier = brand(EmptyObject3.identifier);

export const testTreeSchema = [
	EmptyObject,
	EmptyObject2,
	EmptyObject3,
	IdentifierSchema,
	JsonAsTree.Array,
];

export const testTrees: readonly (readonly [string, JsonableTree])[] = [
	["minimal", { type: emptyObjectIdentifier }],
	["true boolean", { type: brand(booleanSchema.identifier), value: true }],
	["false boolean", { type: brand(booleanSchema.identifier), value: false }],
	["integer", { type: brand(numberSchema.identifier), value: Number.MIN_SAFE_INTEGER - 1 }],
	["string", { type: brand(stringSchema.identifier), value: "test" }],
	[
		"string with escaped characters",
		{ type: brand(stringSchema.identifier), value: '\\"\b\f\n\r\t' },
	],
	["string with emoticon", { type: brand(stringSchema.identifier), value: "😀" }],
	[
		"field",
		{
			type: brand(JsonAsTree.JsonObject.identifier),
			fields: {
				x: [
					{ type: emptyObjectIdentifier },
					{ type: brand(numberSchema.identifier), value: 6 },
				],
			},
		},
	],
	[
		"multiple fields",
		{
			type: brand(JsonAsTree.JsonObject.identifier),
			fields: {
				a: [{ type: emptyObjectIdentifier }],
				b: [{ type: emptyObjectIdentifier2 }],
			},
		},
	],
	[
		"double nested",
		{
			type: brand(JsonAsTree.JsonObject.identifier),
			fields: {
				a: [
					{
						type: brand(JsonAsTree.JsonObject.identifier),
						fields: { b: [{ type: emptyObjectIdentifier }] },
					},
				],
			},
		},
	],
	[
		"complex",
		{
			type: brand(JsonAsTree.JsonObject.identifier),
			fields: {
				a: [{ type: brand(JsonAsTree.JsonObject.identifier) }],
				b: [
					{
						type: brand(JsonAsTree.JsonObject.identifier),
						fields: {
							c: [{ type: brand(numberSchema.identifier), value: 6 }],
						},
					},
				],
			},
		},
	],
	[
		"siblings restored on up",
		{
			type: brand(JsonAsTree.JsonObject.identifier),
			fields: {
				X: [
					{
						type: brand(JsonAsTree.JsonObject.identifier),
						// Inner node so that when navigating up from it,
						// The cursor's siblings value needs to be restored.
						fields: { q: [{ type: emptyObjectIdentifier2 }] },
					},
					{ type: emptyObjectIdentifier3 },
				],
			},
		},
	],
	[
		"fixed shape object",
		{
			type: brand(JsonAsTree.JsonObject.identifier),
			fields: {
				child: [
					{
						type: brand(numberSchema.identifier),
						value: 1,
					},
				],
			},
		},
	],
	[
		"nested object",
		{
			type: brand(JsonAsTree.JsonObject.identifier),
			fields: {
				X: [
					{ type: emptyObjectIdentifier2 },
					{
						type: brand(JsonAsTree.JsonObject.identifier),
						fields: {
							child: [
								{
									type: brand(numberSchema.identifier),
									value: 1,
								},
							],
						},
					},
					{ type: emptyObjectIdentifier3 },
				],
			},
		},
	],
	[
		"longer sequence",
		{
			type: brand(JsonAsTree.JsonObject.identifier),
			fields: {
				X: [
					{ type: emptyObjectIdentifier3 },
					{ type: emptyObjectIdentifier3 },
					{ type: emptyObjectIdentifier2 },
					{ type: emptyObjectIdentifier3 },
					{ type: emptyObjectIdentifier3 },
					{ type: emptyObjectIdentifier3 },
					{ type: brand(numberSchema.identifier), value: 1 },
					{ type: emptyObjectIdentifier3 },
				],
			},
		},
	],
];

/**
 * Tests a cursor implementation.
 * This test suite has a built in set of test cases (based on `testTrees`), so the provided cursor implementation must support all tree contents
 * (not just some specific domain).
 * More specialized cursor implementations should use `testTreeCursor` instead.
 *
 * @param cursorName - The name of the cursor used as part of the test suite name.
 * @param cursorFactory - Creates the cursor to be tested from the provided `TData`.
 * @param dataFromCursor - Constructs a `TData` from the provided cursor (which might not be a `TCursor`).
 * @param extraRoot - setting this to `true` makes the tests expect that `cursorFactory` includes a dummy node above the root,
 * with the data under {@link rootFieldKey}.
 *
 * @typeParam TData - Format which the cursor reads. Must be JSON compatible.
 * @typeParam TCursor - Type of the cursor being tested.
 */
export function testGeneralPurposeTreeCursor<TData, TCursor extends ITreeCursor>(
	cursorName: string,
	cursorFactory: (data: TData) => TCursor,
	dataFromCursor: (cursor: ITreeCursor) => TData,
	extraRoot?: true,
): void {
	function dataFromJsonableTree(data: JsonableTree): TData {
		// Use text cursor to provide input data
		return dataFromCursor(cursorForJsonableTreeNode(data));
	}

	testTreeCursor<TData, TCursor>({
		cursorName,
		cursorFactory,
		builders: dataFromJsonableTree,
		dataFromCursor,
		testData: testTrees.map(([name, data]) => ({
			name,
			dataFactory: () => dataFromJsonableTree(data),
			expected: data,
		})),
		extraRoot,
	});
}

/**
 * Collection of builders for special cases.
 */
export interface SpecialCaseBuilder<TData> {
	/**
	 * Build data for a tree which has the provided keys on its root node.
	 * The content of the tree under these keys is arbitrary and up to the implementation.
	 */
	withKeys?(keys: FieldKey[]): TData;
}

export interface TestTree<TData> {
	readonly name: string;
	readonly dataFactory: () => TData;
	readonly reference?: JsonableTree;
	readonly path?: UpPath;
}

export interface TestField<TData> {
	readonly name: string;
	readonly dataFactory: () => TData;
	readonly reference: JsonableTree[];
	readonly path: FieldUpPath;
}

/**
 * Tests a cursor implementation that is rooted at a node.
 * Prefer using `testGeneralPurposeTreeCursor` when possible:
 * `testTreeCursor` should only be used when testing a cursor that is not truly general purpose (can not be build from any arbitrary tree).
 *
 * @param cursorName - The name of the cursor used as part of the test suite name.
 * @param builders - a collection of optional `TData` builders. The more of these are provided, the larger the test suite will be.
 * If provided with a JsonableTree, it will either be from testData or comply with testTreeSchema.
 * @param cursorFactory - Creates the cursor to be tested from the provided `TData`.
 * @param dataFromCursor - Constructs a `TData` from the provided cursor (which might not be a `TCursor`).
 * @param testData - A collection of test cases to evaluate the cursor with. Actual content of the tree is only validated if a `reference` is provided:
 * otherwise only basic traversal and API consistency will be checked.
 *
 * @typeParam TData - Format which the cursor reads. Must be JSON compatible.
 * @typeParam TCursor - Type of the cursor being tested.
 */
export function testSpecializedCursor<TData, TCursor extends ITreeCursor>(config: {
	cursorName: string;
	builders: SpecialCaseBuilder<TData>;
	cursorFactory: (data: TData) => TCursor;
	dataFromCursor?: (cursor: ITreeCursor) => TData;
	testData: readonly TestTree<TData>[];
}): Mocha.Suite {
	return testTreeCursor(config);
}

/**
 * Tests a cursor implementation that is rooted at a field.
 * Prefer using `testGeneralPurposeTreeCursor` when possible:
 * `testTreeCursor` should only be used when testing a cursor that is not truly general purpose (cannot be built from any arbitrary tree).
 *
 * @param cursorName - The name of the cursor used as part of the test suite name.
 * @param builders - a collection of optional `TData` builders. The more of these are provided, the larger the test suite will be.
 * If provided with a JsonableTree, it will either be from testData or comply with testTreeSchema.
 * @param cursorFactory - Creates the cursor to be tested from the provided `TData`.
 * @param dataFromCursor - Constructs a `TData` from the provided cursor (which might not be a `TCursor`).
 * @param testData - A collection of test cases to evaluate the cursor with. Actual content of the tree is only validated if a `reference` is provided:
 * otherwise only basic traversal and API consistency will be checked.
 *
 * @typeParam TData - Format which the cursor reads. Must be JSON compatible.
 * @typeParam TCursor - Type of the cursor being tested.
 */
export function testSpecializedFieldCursor<TData, TCursor extends ITreeCursor>(config: {
	cursorName: string;
	builders: SpecialCaseBuilder<TData>;
	cursorFactory: (data: TData) => TCursor;
	dataFromCursor?: (cursor: ITreeCursor) => TData;
	testData: readonly TestField<TData>[];
}): Mocha.Suite {
	// testing is per node, and our data can have multiple nodes at the root, so split tests as needed:
	const testData: TestTree<[number, TData]>[] = config.testData.flatMap(
		({ name, dataFactory, reference, path }) => {
			const out: TestTree<[number, TData]>[] = [];
			for (let index = 0; index < reference.length; index++) {
				out.push({
					name: reference.length > 1 ? `${name} part ${index + 1}` : name,
					dataFactory: () => [index, dataFactory()],
					reference: reference[index],
					path: { parent: path.parent, parentIndex: index, parentField: path.field },
				});
			}
			return out;
		},
	);

	return describe(`${config.cursorName} testSpecializedFieldCursor suite`, () => {
		// Add tests which validate top level field itself.
		describe("with root field", () => {
			for (const data of config.testData) {
				it(data.name, () => {
					const cursor = config.cursorFactory(data.dataFactory());
					assert.equal(cursor.mode, CursorLocationType.Fields);
					assert.equal(cursor.getFieldLength(), data.reference.length);
					checkFieldTraversal(cursor, data.path);
				});
			}
		});

		// Run test suite on each top level node from each test data.
		testTreeCursor<[number, TData], TCursor>({
			cursorName: config.cursorName,
			builders: {
				withKeys:
					config.builders.withKeys !== undefined
						? // This is known to be non-null from check above, but typescript can't infer it.
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							(keys) => [0, config.builders.withKeys!(keys)]
						: undefined,
			},
			cursorFactory: (data: [number, TData]): TCursor => {
				const cursor = config.cursorFactory(data[1]);
				cursor.enterNode(data[0]);
				return cursor;
			},
			testData,
			extraRoot: true,
		});
	});
}

const unusedKey: FieldKey = brand("unusedKey");
const testKeys: readonly FieldKey[] = [
	// keys likely to cause issues due to JS object non-own keys
	brand("__proto__"),
	brand("toString"),
	brand("toFixed"),
	brand("hasOwnProperty"),
	// numeric keys, which can be problematic for array like node and/or due to implicit conversions.
	brand("0"),
	brand("-1"),
	brand("0.0"),
	// Misc test keys
	EmptyKey,
	rootFieldKey,
	unusedKey,
];

/**
 * Tests a cursor implementation.
 * Prefer using `testGeneralPurposeTreeCursor` when possible:
 * `testTreeCursor` should only be used when testing a cursor that is not truly general purpose (can not be build from any arbitrary tree).
 *
 * If neither `dataFromCursor` nor  `(data: JsonableTree) => TData` builders, no round trip testing will be performed.
 *
 * @param cursorName - The name of the cursor used as part of the test suite name.
 * @param builders - `TData` builders. `(data: JsonableTree) => TData` is ideal and supports all tests.
 * If provided with a JsonableTree, it will either be from testData or comply with testTreeSchema.
 * @param cursorFactory - Creates the cursor to be tested from the provided `TData`.
 * @param dataFromCursor - Constructs a `TData` from the provided cursor `TCursor`. This is tested by round tripping data.
 * @param testData - A collection of test cases to evaluate the cursor with. Actual content of the tree is only validated if a `reference` is provided:
 * otherwise only basic traversal and API consistency will be checked.
 * @param extraRoot - setting this to `true` makes the tests expect that `cursorFactory` includes a dummy node above the root,
 * with the data under {@link rootFieldKey}.
 *
 * @typeParam TData - Format which the cursor reads. Must be JSON compatible.
 * @typeParam TCursor - Type of the cursor being tested.
 */
function testTreeCursor<TData, TCursor extends ITreeCursor>(config: {
	cursorName: string;
	builders: SpecialCaseBuilder<TData> | ((data: JsonableTree) => TData);
	cursorFactory: (data: TData) => TCursor;
	dataFromCursor?: (cursor: TCursor) => TData;
	testData: readonly TestTree<TData>[];
	extraRoot?: true;
}): Mocha.Suite {
	const {
		cursorName,
		cursorFactory,
		dataFromCursor,
		testData,
		extraRoot,
		builders: builder,
	} = config;

	const dataFromJsonableTree = typeof builder === "object" ? undefined : builder;
	const withKeys: undefined | ((keys: FieldKey[]) => TData) =
		typeof builder === "object"
			? builder.withKeys === undefined
				? undefined
				: builder.withKeys.bind(builder.withKeys)
			: (keys: FieldKey[]) => {
					const root: JsonableTree = {
						type: brand(JsonAsTree.JsonObject.identifier),
					};
					for (const key of keys) {
						const child: JsonableTree = {
							type: emptyObjectIdentifier,
						};
						setGenericTreeField(root, key, [child]);
					}
					return builder(root);
				};

	const parent = !extraRoot
		? undefined
		: {
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 0,
			};

	return describe(`${cursorName} cursor implementation`, () => {
		describe("test trees", () => {
			for (const { name, dataFactory, reference, path } of testData) {
				describe(name, () => {
					let data: TData;
					before(() => {
						data = dataFactory();
					});
					it("jsonableTreeFromCursor", () => {
						const cursor = cursorFactory(data);
						const jsonableClone = jsonableTreeFromCursor(cursor);
						// Check jsonable objects are actually json compatible
						const text = JSON.stringify(jsonableClone);
						const parsed = JSON.parse(text);
						assert.deepEqual(parsed, jsonableClone);
					});

					it("traversal", () => {
						checkTraversal(cursorFactory(data), path ?? parent);
					});

					if (reference !== undefined) {
						it("equals reference", () => {
							if (dataFromJsonableTree !== undefined) {
								const dataClone = dataFromJsonableTree(reference);
								// This assumes `TData` works with deepEqual.
								assert.deepEqual(data, dataClone);
							}

							const clone = jsonableTreeFromCursor(cursorFactory(data));
							assert.deepEqual(clone, reference);
						});
					}

					if (dataFromCursor !== undefined) {
						it("roundtrip with dataFromCursor", () => {
							const cursor = cursorFactory(data);
							const cursorClonedData = dataFromCursor(cursor);
							// This assumes `T` works with deepEqual.
							assert.deepEqual(cursorClonedData, data);
						});
					}

					if (dataFromJsonableTree !== undefined) {
						it("roundtrip with dataFromJsonableTree", () => {
							const cursor = cursorFactory(data);
							const jsonableClone = jsonableTreeFromCursor(cursor);
							const dataClone = dataFromJsonableTree(jsonableClone);
							assert.deepEqual(data, dataClone);
						});
					}
				});
			}
		});

		// TODO: replace some of these tests with ones that do not require dataFromJsonableTree
		if (dataFromJsonableTree !== undefined) {
			const factory = (data: JsonableTree): ITreeCursor => {
				return cursorFactory(dataFromJsonableTree(data));
			};

			// TODO: revisit spec for forest cursors and root and clarify what should be tested for them regarding Up from root.
			if (!extraRoot) {
				it("up from root", () => {
					const cursor = factory({ type: emptyObjectIdentifier });
					assert.throws(() => {
						cursor.exitNode();
					});
				});
			}
			describe("getPath() and getFieldPath()", () => {
				it("at root", () => {
					const cursor = factory({
						type: emptyObjectIdentifier,
					});
					expectEqualPaths(cursor.getPath(), parent);
				});

				it("getFieldPath in root field", () => {
					const cursor = factory({
						type: emptyObjectIdentifier,
					});
					cursor.enterField(brand("key"));
					expectEqualFieldPaths(cursor.getFieldPath(), {
						parent,
						field: brand("key"),
					});
				});

				it("first node in a root field", () => {
					const cursor = factory({
						type: brand(JsonAsTree.JsonObject.identifier),
						fields: { key: [{ type: brand(numberSchema.identifier), value: 0 }] },
					});
					cursor.enterField(brand("key"));
					cursor.firstNode();
					expectEqualPaths(cursor.getPath(), {
						parent,
						parentField: brand<FieldKey>("key"),
						parentIndex: 0,
					});
				});

				it("node in a root field", () => {
					const cursor = factory({
						type: brand(JsonAsTree.JsonObject.identifier),
						fields: {
							key: [
								{ type: brand(numberSchema.identifier), value: 0 },
								{ type: brand(numberSchema.identifier), value: 1 },
							],
						},
					});
					cursor.enterField(brand("key"));
					cursor.enterNode(1);
					expectEqualPaths(cursor.getPath(), {
						parent,
						parentField: brand<FieldKey>("key"),
						parentIndex: 1,
					});
				});

				it("in a nested field", () => {
					const cursor = factory({
						type: brand(JsonAsTree.JsonObject.identifier),
						fields: {
							a: [
								{
									type: brand(JsonAsTree.JsonObject.identifier),
									fields: { [EmptyKey]: [{ type: emptyObjectIdentifier }] },
								},
								{
									type: brand(JsonAsTree.JsonObject.identifier),
									fields: { [EmptyKey]: [{ type: emptyObjectIdentifier }] },
								},
							],
						},
					});
					cursor.enterField(brand("a"));
					cursor.enterNode(1);
					cursor.enterField(EmptyKey);
					const initialPath: UpPath = {
						parent,
						parentField: brand("a"),
						parentIndex: 1,
					};
					expectEqualFieldPaths(cursor.getFieldPath(), {
						parent: initialPath,
						field: EmptyKey,
					});
					cursor.enterNode(0);
					expectEqualPaths(cursor.getPath(), {
						parent: initialPath,
						parentField: EmptyKey,
						parentIndex: 0,
					});
				});
			});
		}
		if (withKeys !== undefined) {
			describe("key tests", () => {
				const unrelatedKey: FieldKey = brand("unrelated");
				for (const key of testKeys) {
					it(`returns no values for key: ${key.toString()}`, () => {
						// Test an empty tree, and one with unrelated fields
						const trees: TData[] = [withKeys([]), withKeys([unrelatedKey])];
						// We have a builder: use it to make a tree with unrelatedKey.
						trees.push(withKeys([unrelatedKey]));

						for (const data of trees) {
							const cursor = cursorFactory(data);
							cursor.enterField(key);
							assert.equal(cursor.getFieldLength(), 0);
						}
					});

					const dataFactory = () => withKeys([key]);

					if (dataFactory !== undefined) {
						it(`handles values for key: ${key.toString()}`, () => {
							const dataWithKey = dataFactory();
							const cursor = cursorFactory(dataWithKey);
							cursor.enterField(key);
							assert.equal(cursor.getFieldLength(), 1);
							cursor.enterNode(0);
						});

						it(`traversal with key: ${key.toString()}`, () => {
							const dataWithKey = dataFactory();
							const cursor = cursorFactory(dataWithKey);
							checkTraversal(cursor, parent);
						});
					}
				}
			});

			it("traverse with no keys", () => {
				const data = withKeys([]);
				const cursor = cursorFactory(data);
				checkTraversal(cursor, parent);
			});

			describe("cursor prefix tests", () => {
				it("at root", () => {
					const data = withKeys([]);
					const cursor = cursorFactory(data);
					expectEqualPaths(cursor.getPath(), parent);

					const prefixParent: UpPath = {
						parent: undefined,
						parentField: brand("prefixParentField"),
						parentIndex: 5,
					};

					const prefixes: (PathRootPrefix | undefined)[] = [
						undefined,
						{},
						{ indexOffset: 10, rootFieldOverride: EmptyKey },
						{ parent: prefixParent },
					];

					for (const prefix of prefixes) {
						// prefixPath has its own tests, so we can use it to test cursors here:
						expectEqualPaths(cursor.getPath(prefix), prefixPath(prefix, parent));
					}

					cursor.enterField(brand("testField"));
					assert(
						compareFieldUpPaths(cursor.getFieldPath(), {
							field: brand("testField"),
							parent,
						}),
					);

					for (const prefix of prefixes) {
						assert(
							compareFieldUpPaths(
								cursor.getFieldPath(prefix),
								prefixFieldPath(prefix, { field: brand("testField"), parent }),
							),
						);
					}
				});
			});
		}
	});
}

/**
 * Test that cursor works as a cursor.
 * This does NOT test that the data the cursor exposes is correct,
 * it simply checks that the traversal APIs function, and that a few aspects of them conform with the spec.
 */
function checkTraversal(cursor: ITreeCursor, expectedPath: UpPath | undefined) {
	assert.equal(cursor.mode, CursorLocationType.Nodes);
	assert.equal(cursor.pending, false);
	// Keep track of current node properties to check it during ascent
	const originalNodeValue = cursor.value;
	const originalNodeType = cursor.type;

	const path = cursor.getPath();
	expectEqualPaths(path, expectedPath);

	const fieldLengths: Map<FieldKey, number> = new Map();

	for (let inField: boolean = cursor.firstField(); inField; inField = cursor.nextField()) {
		const expectedFieldLength = cursor.getFieldLength();
		const key = cursor.getFieldKey();
		assert(!fieldLengths.has(key), "no duplicate keys");
		fieldLengths.set(cursor.getFieldKey(), expectedFieldLength);
		assert(expectedFieldLength > 0, "only non empty fields should show up in field iteration");
		checkFieldTraversal(cursor, { parent: path, field: key });
	}

	// Add some fields which should be empty to check:
	for (const key of testKeys) {
		if (!fieldLengths.has(key)) {
			fieldLengths.set(key, 0);
		}
	}

	// Cheek field access by key
	for (const [key, length] of fieldLengths) {
		assert.equal(cursor.mode, CursorLocationType.Nodes);
		cursor.enterField(key);
		assert.equal(cursor.mode, CursorLocationType.Fields);
		assert.equal(cursor.getFieldLength(), length);
		assert.equal(cursor.getFieldKey(), key);
		cursor.exitField();

		// nextField should work after enterField (though might just exit since order is not stable):
		cursor.enterField(key);
		if (cursor.nextField()) {
			const newKey = cursor.getFieldKey();
			assert(newKey !== key);
			assert(fieldLengths.get(newKey) ?? 0 > 0);
			cursor.exitField();
		}
	}

	assert.equal(cursor.mode, CursorLocationType.Nodes);
	assert.equal(cursor.value, originalNodeValue);
	assert.equal(cursor.type, originalNodeType);
}

/**
 * Test that cursor works as a cursor, starting in `Fields` mode.
 *
 * This does NOT test that the data the cursor exposes is correct,
 * it simply checks that the traversal APIs function, and that a few aspects of them conform with the spec.
 */
export function checkFieldTraversal(cursor: ITreeCursor, expectedPath: FieldUpPath): void {
	assert.equal(cursor.mode, CursorLocationType.Fields);
	assert.equal(cursor.pending, false);
	const expectedFieldLength = cursor.getFieldLength();
	const key = cursor.getFieldKey();
	assert(compareFieldUpPaths(cursor.getFieldPath(), expectedPath));

	// Check that iterating nodes of this field works as expected.
	let actualChildNodesTraversed = 0;
	for (let inNode = cursor.firstNode(); inNode; inNode = cursor.nextNode()) {
		assert.equal(cursor.fieldIndex, actualChildNodesTraversed);
		assert(cursor.chunkStart <= actualChildNodesTraversed);
		assert(cursor.chunkLength > actualChildNodesTraversed - cursor.chunkStart);
		assert(cursor.chunkLength + cursor.chunkStart <= expectedFieldLength);

		// Make sure down+up navigation gets back to where it started.
		// Testing this explicitly here before recursing makes debugging issues with this easier.
		assert.equal(cursor.fieldIndex, actualChildNodesTraversed);
		cursor.enterField(EmptyKey);
		cursor.exitField();
		assert.equal(cursor.fieldIndex, actualChildNodesTraversed);
		if (cursor.firstField()) {
			cursor.enterNode(0);
			cursor.exitNode();
			cursor.exitField();
		}
		assert.equal(cursor.fieldIndex, actualChildNodesTraversed);
		actualChildNodesTraversed++;
	}

	assert.equal(
		actualChildNodesTraversed,
		expectedFieldLength,
		"Did not traverse expected number of children",
	);

	// Check node access by index
	for (let index = 0; index < expectedFieldLength; index++) {
		assert.equal(cursor.mode, CursorLocationType.Fields);
		cursor.enterNode(index);
		assert.equal(cursor.mode, CursorLocationType.Nodes);
		assert(cursor.seekNodes(0));
		assert.equal(cursor.fieldIndex, index);
		cursor.exitNode();
		assert.equal(cursor.mode, CursorLocationType.Fields);

		// Seek to node should work:
		cursor.enterNode(0);
		cursor.seekNodes(index);
		assert.equal(cursor.fieldIndex, index);
		// Seek backwards should be supported
		if (index > 0) {
			assert(cursor.seekNodes(-1));
			assert.equal(cursor.fieldIndex, index - 1);
			// Seek should mix with nextNode
			assert(cursor.nextNode());
			assert.equal(cursor.fieldIndex, index);
		}
		cursor.exitNode();
		assert.equal(cursor.mode, CursorLocationType.Fields);

		// Seek past end should exit
		cursor.enterNode(index);
		assert(!cursor.seekNodes(expectedFieldLength - index));
		cursor.enterNode(index);
		assert(!cursor.seekNodes(Number.POSITIVE_INFINITY));

		// Seek before beginning should exit
		cursor.enterNode(index);
		assert(!cursor.seekNodes(-(index + 1)));
		cursor.enterNode(index);
		assert(!cursor.seekNodes(Number.NEGATIVE_INFINITY));
	}

	// skipPendingFields should have no effect since not pending
	assert(cursor.skipPendingFields());
	assert.equal(cursor.getFieldKey(), key);

	// Recursively validate.
	actualChildNodesTraversed = 0;
	for (let inNode = cursor.firstNode(); inNode; inNode = cursor.nextNode()) {
		assert.equal(cursor.fieldIndex, actualChildNodesTraversed);
		checkTraversal(cursor, {
			parent: expectedPath.parent,
			parentField: expectedPath.field,
			parentIndex: actualChildNodesTraversed,
		});
		assert.equal(cursor.fieldIndex, actualChildNodesTraversed);
		actualChildNodesTraversed++;
	}
}
