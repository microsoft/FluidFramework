/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { strict as assert, fail } from "assert";

import { noopValidator } from "../../../codec";
import {
	LazyFieldNode,
	LazyLeaf,
	LazyMap,
	LazyObjectNode,
	LazyTreeNode,
	buildLazyObjectNode,
} from "../../../feature-libraries/flex-tree/lazyNode";
import {
	Any,
	PrimitiveValue,
	isPrimitiveValue,
	jsonableTreeFromCursor,
	cursorForMapTreeNode,
	FlexTreeField,
	FlexTreeNode,
	Skip,
	bannedFieldNames,
	fieldApiPrefixes,
	validateObjectNodeFieldName,
	assertAllowedValue,
	FieldKind,
	AllowedTypes,
	typeNameSymbol,
	TreeNodeSchema,
	createMockNodeKeyManager,
	nodeKeyFieldKey,
	DefaultEditBuilder,
	DefaultChangeFamily,
	DefaultChangeset,
	cursorForJsonableTreeNode,
} from "../../../feature-libraries";
import {
	Anchor,
	AnchorNode,
	EmptyKey,
	FieldAnchor,
	FieldKey,
	ITreeSubscriptionCursor,
	MapTree,
	TreeNavigationResult,
	TreeValue,
	rootFieldKey,
} from "../../../core";
import { RestrictiveReadonlyRecord, brand } from "../../../util";
import {
	LazyField,
	LazyOptionalField,
	LazySequence,
	LazyValueField,
} from "../../../feature-libraries/flex-tree/lazyField";
import {
	FlexTreeEntity,
	boxedIterator,
	visitIterableTree,
} from "../../../feature-libraries/flex-tree";
import { Context, getTreeContext } from "../../../feature-libraries/flex-tree/context";
import { TreeContent } from "../../../shared-tree";
import { leaf as leafDomain, SchemaBuilder } from "../../../domains";
import { testTrees, treeContentFromTestTree } from "../../testTrees";
import { forestWithContent, flexTreeViewWithContent } from "../../utils";
import { contextWithContentReadonly } from "./utils";

function collectPropertyNames(obj: object): Set<string> {
	if (obj == null) {
		return new Set();
	}
	return new Set([
		...Object.getOwnPropertyNames(obj),
		...collectPropertyNames(Object.getPrototypeOf(obj)),
	]);
}

const rootFieldAnchor: FieldAnchor = { parent: undefined, fieldKey: rootFieldKey };

/**
 * Creates a cursor from the provided `context` and moves it to the provided `anchor`.
 */
function initializeCursor(context: Context, anchor: FieldAnchor): ITreeSubscriptionCursor {
	const cursor = context.forest.allocateCursor();

	assert.equal(context.forest.tryMoveCursorToField(anchor, cursor), TreeNavigationResult.Ok);
	return cursor;
}

/**
 * Initializes a test tree, context, and cursor, and moves the cursor to the tree's root.
 *
 * @returns The initialized context and cursor.
 */
function initializeTreeWithContent<Kind extends FieldKind, Types extends AllowedTypes>(
	treeContent: TreeContent,
): {
	context: Context;
	cursor: ITreeSubscriptionCursor;
} {
	const context = contextWithContentReadonly(treeContent);
	const cursor = initializeCursor(context, rootFieldAnchor);

	return {
		context,
		cursor,
	};
}

/**
 * Test {@link LazyTreeNode} implementation.
 */
class TestLazyTree<TSchema extends TreeNodeSchema> extends LazyTreeNode<TSchema> {}

/**
 * Creates an {@link Anchor} and an {@link AnchorNode} for the provided cursor's location.
 */
function createAnchors(
	context: Context,
	cursor: ITreeSubscriptionCursor,
): { anchor: Anchor; anchorNode: AnchorNode } {
	const anchor = context.forest.anchors.track(cursor.getPath() ?? fail());
	const anchorNode = context.forest.anchors.locate(anchor) ?? fail();

	return { anchor, anchorNode };
}

describe("LazyNode", () => {
	it("property names", () => {
		const builder = new SchemaBuilder({ scope: "LazyNode" });
		const emptyStruct = builder.object("empty", {});
		const testSchema = builder.intoSchema(SchemaBuilder.optional(emptyStruct));

		const { cursor, context } = initializeTreeWithContent({
			schema: testSchema,
			initialTree: {},
		});
		cursor.enterNode(0);

		const { anchor, anchorNode } = createAnchors(context, cursor);

		const struct = buildLazyObjectNode(context, emptyStruct, cursor, anchorNode, anchor);

		const existingProperties = collectPropertyNames(struct);
		const existingPropertiesExtended = new Set(existingProperties);

		for (const name of existingProperties) {
			for (const prefix of fieldApiPrefixes) {
				// Ensure properties won't collide with prefixed field name based properties.
				if (name.startsWith(prefix)) {
					// If the property does have a reserved prefix, that's okay as long as the rest of name after the prefix is also banned.
					const bannedName = name.substring(prefix.length);
					const lowercaseBannedName = `${bannedName[0].toLowerCase()}${bannedName.substring(
						1,
					)}`;
					assert(bannedFieldNames.has(lowercaseBannedName));
					existingPropertiesExtended.add(lowercaseBannedName);
				}
			}

			const errors: string[] = [];
			// Confirm validateStructFieldName rejects all used names:
			validateObjectNodeFieldName(name, () => "property test", errors);
			assert(errors.length > 0, name);
		}

		// Ensure all existing properties are banned as field names:
		// Note that this currently also ensure that there are no names that are unnecessary banned:
		// this restriction may need to be relaxed in the future to reserve names so they can be used in the API later as a non breaking change.
		assert.deepEqual(bannedFieldNames, new Set(existingPropertiesExtended));
	});

	it("is", () => {
		// #region Create schemas

		const schemaBuilder = new SchemaBuilder({
			scope: "testShared",
		});

		const fieldNodeOptionalAnySchema = schemaBuilder.fieldNode(
			"optionalAny",
			SchemaBuilder.optional(Any),
		);
		const fieldNodeOptionalStringSchema = schemaBuilder.fieldNode(
			"optionalString",
			SchemaBuilder.optional(leafDomain.string),
		);
		const fieldNodeRequiredAnySchema = schemaBuilder.fieldNode("requiredAny", Any);
		const fieldNodeRequiredStringSchema = schemaBuilder.fieldNode(
			"valueString",
			leafDomain.string,
		);
		const structNodeSchema = schemaBuilder.object("object", {});
		const mapNodeAnySchema = schemaBuilder.map("mapAny", SchemaBuilder.optional(Any));
		const mapNodeStringSchema = schemaBuilder.map(
			"mapString",
			SchemaBuilder.optional(leafDomain.string),
		);

		const schema = schemaBuilder.intoSchema(fieldNodeOptionalAnySchema);

		// #endregion

		const { context, cursor } = initializeTreeWithContent({ schema, initialTree: {} });
		cursor.enterNode(0);

		const { anchor, anchorNode } = createAnchors(context, cursor);

		const node = new TestLazyTree(
			context,
			fieldNodeOptionalAnySchema,
			cursor,
			anchorNode,
			anchor,
		);

		assert(node.is(fieldNodeOptionalAnySchema));

		assert(!node.is(fieldNodeOptionalStringSchema));
		assert(!node.is(fieldNodeRequiredAnySchema));
		assert(!node.is(fieldNodeRequiredStringSchema));
		assert(!node.is(mapNodeAnySchema));
		assert(!node.is(mapNodeStringSchema));
		assert(!node.is(leafDomain.string));
		assert(!node.is(structNodeSchema));
	});

	it("parent", () => {
		const schemaBuilder = new SchemaBuilder({
			scope: "test",
			libraries: [leafDomain.library],
		});
		const fieldNodeSchema = schemaBuilder.fieldNode(
			"field",
			SchemaBuilder.optional(leafDomain.string),
		);
		const schema = schemaBuilder.intoSchema(fieldNodeSchema);

		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: {
				[EmptyKey]: "Hello world",
			},
		});
		cursor.enterNode(0);

		const { anchor, anchorNode } = createAnchors(context, cursor);

		const node = new TestLazyTree(context, fieldNodeSchema, cursor, anchorNode, anchor);
		const { index, parent } = node.parentField;
		assert.equal(index, 0);
		assert.equal(parent.key, rootFieldKey);
	});

	describe("enumerable own properties", () => {
		describe("test trees", () => {
			for (const testTree of testTrees) {
				describe(testTree.name, () => {
					it("iterable traversal", () => {
						const context = contextWithContentReadonly(
							treeContentFromTestTree(testTree),
						);

						const mapTree = fieldToMapTree(context.root);
						const jsonable = mapTree
							.map(cursorForMapTreeNode)
							.map(jsonableTreeFromCursor);

						const expected = testTree.treeFactory();
						assert.deepEqual(jsonable, expected);
					});
					it("object traversal", () => {
						const context = contextWithContentReadonly(
							treeContentFromTestTree(testTree),
						);

						const viaJson = JSON.parse(JSON.stringify(context.root));
						checkPropertyInvariants(context.root);
						// assert.deepEqual(viaJson, {type:})
					});

					it("deepEquals self", () => {
						const content = treeContentFromTestTree(testTree);
						const context1 = contextWithContentReadonly(content);
						const context2 = contextWithContentReadonly(content);
						assert.deepEqual(context1.root, context2.root);
					});
				});
			}
		});
	});
});

describe("LazyFieldNode", () => {
	const schemaBuilder = new SchemaBuilder({
		scope: "test",
		libraries: [leafDomain.library],
	});
	const fieldNodeSchema = schemaBuilder.fieldNode(
		"field",
		SchemaBuilder.optional(leafDomain.string),
	);
	const schema = schemaBuilder.intoSchema(fieldNodeSchema);

	const { context, cursor } = initializeTreeWithContent({
		schema,
		initialTree: {
			[EmptyKey]: "Hello world",
		},
	});
	cursor.enterNode(0);
	const { anchor, anchorNode } = createAnchors(context, cursor);

	const node = new LazyFieldNode(context, fieldNodeSchema, cursor, anchorNode, anchor);

	it("value", () => {
		assert.equal(node.value, undefined); // FieldNode_s do not have a value
	});

	it("tryGetField", () => {
		const field = node.tryGetField(EmptyKey);
		assert(field !== undefined);
		assert(field.is(SchemaBuilder.optional(leafDomain.string)));
	});
});

describe("LazyLeaf", () => {
	const schemaBuilder = new SchemaBuilder({
		scope: "test",
		libraries: [leafDomain.library],
	});
	const schema = schemaBuilder.intoSchema(leafDomain.string);

	const { context, cursor } = initializeTreeWithContent({
		schema,
		initialTree: "Hello world",
	});
	cursor.enterNode(0);

	const { anchor, anchorNode } = createAnchors(context, cursor);

	const node = new LazyLeaf(context, leafDomain.string, cursor, anchorNode, anchor);

	it("value", () => {
		assert.equal(node.value, "Hello world");
	});
});

describe("LazyMap", () => {
	const schemaBuilder = new SchemaBuilder({
		scope: "test",
		libraries: [leafDomain.library],
	});
	const mapNodeSchema = schemaBuilder.map("mapString", SchemaBuilder.optional(leafDomain.string));
	const schema = schemaBuilder.intoSchema(mapNodeSchema);

	// Count the number of times edits have been generated.
	let editCallCount = 0;
	beforeEach(() => {
		editCallCount = 0;
	});

	const editBuilder = new DefaultEditBuilder(
		new DefaultChangeFamily({ jsonValidator: noopValidator }),
		(change: DefaultChangeset) => {
			editCallCount++;
		},
	);
	const forest = forestWithContent({
		schema,
		initialTree: {
			foo: "Hello",
			bar: "world",
		},
	});
	const context = getTreeContext(
		schema,
		forest,
		editBuilder,
		createMockNodeKeyManager(),
		brand(nodeKeyFieldKey),
	);

	const cursor = initializeCursor(context, rootFieldAnchor);
	cursor.enterNode(0);

	const { anchor, anchorNode } = createAnchors(context, cursor);

	const node = new LazyMap(context, mapNodeSchema, cursor, anchorNode, anchor);

	it("value", () => {
		assert.equal(node.value, undefined); // Map nodes do not have a value
	});

	it("tryGetField", () => {
		assert.notEqual(node.tryGetField(brand("foo")), undefined);
		assert.notEqual(node.tryGetField(brand("bar")), undefined);
		assert.equal(node.tryGetField(brand("baz")), undefined);
	});

	it("set", () => {
		const view = flexTreeViewWithContent({ schema, initialTree: {} });
		const mapNode = view.editableTree.content;
		assert(mapNode.is(mapNodeSchema));

		mapNode.set("baz", "First edit");
		mapNode.set("foo", "Second edit");
		assert.equal(mapNode.get("baz"), "First edit");
		assert.equal(mapNode.get("foo"), "Second edit");

		mapNode.set("foo", cursorForJsonableTreeNode({ type: leafDomain.string.name, value: "X" }));
		assert.equal(mapNode.get("foo"), "X");
		mapNode.set("foo", undefined);
		assert.equal(mapNode.get("foo"), undefined);
		assert.equal(mapNode.has("foo"), false);
	});

	it("getBoxed empty", () => {
		const view = flexTreeViewWithContent({ schema, initialTree: {} });
		const mapNode = view.editableTree.content;
		assert(mapNode.is(mapNodeSchema));

		const empty = mapNode.getBoxed("foo");
		assert.equal(empty.parent, mapNode);
		assert.equal(empty.key, "foo");
	});

	it("delete", () => {
		assert.equal(editCallCount, 0);

		// Even though there is no value currently associated with "baz", we still need to
		// emit a delete op, so this should generate an edit.
		node.delete(brand("baz"));
		assert.equal(editCallCount, 1);

		node.delete(brand("foo"));
		assert.equal(editCallCount, 2);
	});
});

describe("LazyObjectNode", () => {
	const schemaBuilder = new SchemaBuilder({
		scope: "test",
		libraries: [leafDomain.library],
	});
	const structNodeSchema = schemaBuilder.object("object", {
		foo: SchemaBuilder.optional(leafDomain.string),
		bar: SchemaBuilder.sequence(leafDomain.number),
	});
	const schema = schemaBuilder.intoSchema(SchemaBuilder.optional(Any));

	// Count the number of times edits have been generated.
	let editCallCount = 0;
	beforeEach(() => {
		editCallCount = 0;
	});

	const editBuilder = new DefaultEditBuilder(
		new DefaultChangeFamily({ jsonValidator: noopValidator }),
		(change: DefaultChangeset) => {
			editCallCount++;
		},
	);
	const initialTree = {
		[typeNameSymbol]: structNodeSchema.name,
		foo: "Hello world", // Will unbox
		bar: [], // Won't unbox
	};
	const forest = forestWithContent({ schema, initialTree });
	const context = getTreeContext(
		schema,
		forest,
		editBuilder,
		createMockNodeKeyManager(),
		brand(nodeKeyFieldKey),
	);

	const cursor = initializeCursor(context, rootFieldAnchor);
	cursor.enterNode(0);

	const { anchor, anchorNode } = createAnchors(context, cursor);

	const node = buildLazyObjectNode(context, structNodeSchema, cursor, anchorNode, anchor);

	it("boxing", () => {
		assert.equal(node.foo, node.boxedFoo.content);
		assert(node.bar.isSameAs(node.boxedBar));
	});

	it("value", () => {
		assert.equal(node.value, undefined); // object nodes do not have a value
	});

	it("tryGetField", () => {
		assert.notEqual(node.tryGetField(brand("foo")), undefined);
		assert.equal(node.tryGetField(brand("bar")), undefined); // TODO: this is presumably wrong - empty array shouldn't yield undefined
		assert.equal(node.tryGetField(brand("baz")), undefined);
	});

	it("Value assignment generates edits", () => {
		assert.equal(editCallCount, 0);

		node.foo = "First edit";
		assert.equal(editCallCount, 1);

		node.setFoo("Second edit");
		assert.equal(editCallCount, 2);
	});
});

describe("buildLazyObjectNode", () => {
	const schemaBuilder = new SchemaBuilder({ scope: "test" });
	const objectNodeSchema = schemaBuilder.object("object", {
		optional: SchemaBuilder.optional(leafDomain.string),
		required: SchemaBuilder.required(leafDomain.boolean),
		sequence: SchemaBuilder.sequence(leafDomain.number),
	});
	const schema = schemaBuilder.intoSchema(SchemaBuilder.optional(Any));

	const context = contextWithContentReadonly({
		schema,
		initialTree: {
			optional: "Hello",
			required: true,
			sequence: [1, 2, 3],
		},
	});

	const cursor = initializeCursor(context, rootFieldAnchor);
	cursor.enterNode(0);

	const { anchor, anchorNode } = createAnchors(context, cursor);

	const node = buildLazyObjectNode(context, objectNodeSchema, cursor, anchorNode, anchor);

	it("Binds setter properties for values, but not other field kinds", () => {
		assert(Object.getOwnPropertyDescriptor(node, "optional")?.set !== undefined);
		assert(Object.getOwnPropertyDescriptor(node, "required")?.set !== undefined);
		assert(Object.getOwnPropertyDescriptor(node, "sequence")?.set === undefined);
	});

	it('Binds "set" methods for values, but not other field kinds', () => {
		const record = node as unknown as Record<string | number | symbol, unknown>;
		assert(record.setOptional !== undefined);
		assert(record.setRequired !== undefined);
		assert(record.setSequence === undefined);
	});
});

function fieldToMapTree(field: FlexTreeField): MapTree[] {
	const results: MapTree[] = [];
	for (const child of field[boxedIterator]()) {
		results.push(nodeToMapTree(child));
	}
	return results;
}

function nodeToMapTree(node: FlexTreeNode): MapTree {
	const fields: Map<FieldKey, MapTree[]> = new Map();
	for (const field of node[boxedIterator]()) {
		fields.set(field.key, fieldToMapTree(field));
	}

	return { fields, type: node.type, value: node.value };
}

function checkPropertyInvariants(root: FlexTreeEntity): void {
	const treeValues = new Map<unknown, number>();
	// Assert all nodes and fields traversed, and all values found.
	// TODO: checking that unboxed fields and nodes were traversed is not fully implemented here.
	visitIterableTree(
		root,
		(tree) => tree[boxedIterator](),
		(item) => {
			if (item instanceof LazyLeaf) {
				const value = item.value;
				treeValues.set(value, (treeValues.get(value) ?? 0) + 1);
			}
		},
	);

	// TODO: generic typed traverse first, collect leaves use in asserts.
	// TODO: add extra items needed to traverse map nodes and in leaves.
	const allowedPrototypes = new Set([
		LazyMap.prototype,
		LazyFieldNode.prototype,
		LazyLeaf.prototype,
		LazySequence.prototype,
		LazyValueField.prototype,
		LazyOptionalField.prototype,
		null,
		Array.prototype,
	]);

	const visited: Set<unknown> = new Set([root]);
	const primitivesAndValues = new Map<PrimitiveValue | TreeValue, number>();
	// TODO: add cycle handler to not error on Fluid handles.
	visitOwnPropertiesRecursive(root, (parent, key, child): Skip | void => {
		assert(typeof child !== "function");
		assert(typeof key !== "symbol");

		if (typeof child === "object" && child !== null) {
			if (treeValues.has(child)) {
				assertAllowedValue(child);
				primitivesAndValues.set(child, (primitivesAndValues.get(child) ?? 0) + 1);
				return Skip;
			}

			assert(!visited.has(child));
			visited.add(child);

			const prototype = Object.getPrototypeOf(child);
			if (!allowedPrototypes.has(prototype)) {
				const prototypeInner = Object.getPrototypeOf(prototype);
				assert(prototypeInner === LazyObjectNode.prototype);
			}
		} else if (isPrimitiveValue(child) || child === null) {
			// TODO: more robust check for schema names
			if (key === "type") {
				assert(typeof child === "string");
				assert(root.context.schema.nodeSchema.has(brand(child)));
			} else {
				primitivesAndValues.set(child, (primitivesAndValues.get(child) ?? 0) + 1);
			}
		}
	});

	const unboxable = new Set([
		LazyLeaf.prototype,
		LazyValueField.prototype,
		LazyOptionalField.prototype,
	]);

	// Assert all nodes and fields traversed, and all values found.
	// TODO: checking that unboxed fields and nodes were traversed is not fully implemented here.
	visitIterableTree(
		root,
		(tree) => tree[boxedIterator](),
		(item) => {
			if (!unboxable.has(Object.getPrototypeOf(item))) {
				if (!primitivesAndValues.has(item as unknown as TreeValue) && !visited.has(item)) {
					// Fields don't have stable object identity, so they can fail the above test.
					// Nothing else should fail it.
					assert(item instanceof LazyField);
				}
			}
		},
	);

	assert.deepEqual(primitivesAndValues, treeValues);
}

function visitOwnPropertiesRecursive(
	root: unknown,
	visitor: (parent: object, key: string | symbol, data: unknown) => void | Skip,
	cycleHandler: (item: object) => void = () => fail("cycle"),
	stack: Set<unknown> = new Set(),
): void {
	if (typeof root !== "object" || root === null) {
		return;
	}

	if (stack.has(root)) {
		cycleHandler(root);
		return;
	}
	stack.add(root);

	// There does not seem to be an API that lists both string and symbol own properties without also including non-enumerable properties.
	// So using Object.getOwnPropertyDescriptors to get everything, then filtering.
	// TypeScript has the wrong type for getOwnPropertyDescriptors (it omits symbols) so fix that:
	const descriptors = Object.getOwnPropertyDescriptors(root) as RestrictiveReadonlyRecord<
		string | symbol,
		PropertyDescriptor
	>;

	for (const key of Reflect.ownKeys(descriptors)) {
		const descriptor = descriptors[key];
		if (descriptor.enumerable === true) {
			const value = Reflect.get(root, key);
			if (visitor(root, key, value) !== Skip) {
				visitOwnPropertiesRecursive(value, visitor, cycleHandler, stack);
			}
		}
	}

	stack.delete(root);
}
