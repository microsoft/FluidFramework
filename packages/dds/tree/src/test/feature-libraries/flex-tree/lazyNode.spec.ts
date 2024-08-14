/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { strict as assert, fail } from "assert";

import {
	type Anchor,
	type AnchorNode,
	EmptyKey,
	type FieldAnchor,
	type FieldKey,
	type ITreeSubscriptionCursor,
	type MapTree,
	TreeNavigationResult,
	rootFieldKey,
} from "../../../core/index.js";
import {
	SchemaBuilder,
	leaf as leafDomain,
	singleJsonCursor,
	typedJsonCursor,
} from "../../../domains/index.js";
import { type Context, getTreeContext } from "../../../feature-libraries/flex-tree/context.js";
import {
	type PropertyNameFromFieldKey,
	reservedObjectNodeFieldPropertyNamePrefixes,
} from "../../../feature-libraries/flex-tree/flexTreeTypes.js";
import {
	LazyFieldNode,
	LazyLeaf,
	LazyMap,
	LazyTreeNode,
	buildLazyObjectNode,
	propertyNameFromFieldKey,
	reservedObjectNodeFieldPropertyNameSet,
} from "../../../feature-libraries/flex-tree/lazyNode.js";
import {
	Any,
	DefaultChangeFamily,
	type DefaultChangeset,
	DefaultEditBuilder,
	type FlexAllowedTypes,
	type FlexFieldKind,
	type FlexTreeField,
	type FlexTreeNode,
	type FlexTreeNodeSchema,
	mapTreeFromCursor,
} from "../../../feature-libraries/index.js";
import type { TreeContent, ITreeCheckout } from "../../../shared-tree/index.js";
import { brand, capitalize } from "../../../util/index.js";
import { failCodecFamily, flexTreeViewWithContent, forestWithContent } from "../../utils.js";

import { contextWithContentReadonly } from "./utils.js";
import { MockNodeKeyManager } from "../../../feature-libraries/node-key/mockNodeKeyManager.js";

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
	const cursor = context.checkout.forest.allocateCursor();

	assert.equal(
		context.checkout.forest.tryMoveCursorToField(anchor, cursor),
		TreeNavigationResult.Ok,
	);
	return cursor;
}

/**
 * Initializes a test tree, context, and cursor, and moves the cursor to the tree's root.
 *
 * @returns The initialized context and cursor.
 */
function initializeTreeWithContent<Kind extends FlexFieldKind, Types extends FlexAllowedTypes>(
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
class TestLazyTree<TSchema extends FlexTreeNodeSchema> extends LazyTreeNode<TSchema> {}

/**
 * Creates an {@link Anchor} and an {@link AnchorNode} for the provided cursor's location.
 */
function createAnchors(
	context: Context,
	cursor: ITreeSubscriptionCursor,
): { anchor: Anchor; anchorNode: AnchorNode } {
	const anchor = context.checkout.forest.anchors.track(cursor.getPath() ?? fail());
	const anchorNode = context.checkout.forest.anchors.locate(anchor) ?? fail();

	return { anchor, anchorNode };
}

describe("LazyNode", () => {
	describe("LazyNode", () => {
		it("property names", () => {
			const builder = new SchemaBuilder({ scope: "LazyNode" });
			const emptyStruct = builder.object("empty", {});
			const testSchema = builder.intoSchema(SchemaBuilder.optional(emptyStruct));

			const { cursor, context } = initializeTreeWithContent({
				schema: testSchema,
				initialTree: singleJsonCursor({}),
			});
			cursor.enterNode(0);

			const { anchor, anchorNode } = createAnchors(context, cursor);

			const struct = buildLazyObjectNode(context, emptyStruct, cursor, anchorNode, anchor);

			const existingProperties = collectPropertyNames(struct);
			const existingPropertiesExtended = new Set(existingProperties);

			for (const name of existingProperties) {
				for (const prefix of reservedObjectNodeFieldPropertyNamePrefixes) {
					// Ensure properties won't collide with prefixed field name based properties.
					if (name.startsWith(prefix)) {
						// If the property does have a reserved prefix, that's okay as long as the rest of name after the prefix is also banned.
						const bannedName = name.substring(prefix.length);
						const lowercaseBannedName = `${bannedName[0].toLowerCase()}${bannedName.substring(
							1,
						)}`;
						assert(
							reservedObjectNodeFieldPropertyNameSet.has(lowercaseBannedName),
							lowercaseBannedName,
						);
						existingPropertiesExtended.add(lowercaseBannedName);
					}
				}

				// Confirm escapeFieldKey escapes all used names:
				assert.equal(propertyNameFromFieldKey(name), `field${capitalize(name)}`);
			}

			// Ensure all existing properties are banned as field names:
			// Note that this currently also ensure that there are no names that are unnecessary banned:
			// this restriction may need to be relaxed in the future to reserve names so they can be used in the API later as a non breaking change.
			assert.deepEqual(
				reservedObjectNodeFieldPropertyNameSet,
				new Set(existingPropertiesExtended),
			);
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

			const { context, cursor } = initializeTreeWithContent({
				schema,
				initialTree: singleJsonCursor({}),
			});
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
				initialTree: typedJsonCursor({
					[typedJsonCursor.type]: fieldNodeSchema,
					[EmptyKey]: "Hello world",
				}),
			});
			cursor.enterNode(0);

			const { anchor, anchorNode } = createAnchors(context, cursor);

			const node = new TestLazyTree(context, fieldNodeSchema, cursor, anchorNode, anchor);
			const { index, parent } = node.parentField;
			assert.equal(index, 0);
			assert.equal(parent.key, rootFieldKey);
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
			initialTree: typedJsonCursor({
				[typedJsonCursor.type]: fieldNodeSchema,
				[EmptyKey]: "Hello world",
			}),
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
			initialTree: singleJsonCursor("Hello world"),
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
		const mapNodeSchema = schemaBuilder.map(
			"mapString",
			SchemaBuilder.optional(leafDomain.string),
		);
		const schema = schemaBuilder.intoSchema(mapNodeSchema);

		// Count the number of times edits have been generated.
		let editCallCount = 0;
		beforeEach(() => {
			editCallCount = 0;
		});

		const editBuilder = new DefaultEditBuilder(
			new DefaultChangeFamily(failCodecFamily),
			(change: DefaultChangeset) => {
				editCallCount++;
			},
		);
		const forest = forestWithContent({
			schema,
			initialTree: typedJsonCursor({
				[typedJsonCursor.type]: mapNodeSchema,
				foo: "Hello",
				bar: "world",
			}),
		});
		const context = getTreeContext(
			schema,
			{ forest, editor: editBuilder } as unknown as ITreeCheckout,
			new MockNodeKeyManager(),
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

		it("getBoxed empty", () => {
			const view = flexTreeViewWithContent({
				schema,
				initialTree: typedJsonCursor({ [typedJsonCursor.type]: mapNodeSchema }),
			});
			const mapNode = view.flexTree.content;
			assert(mapNode.is(mapNodeSchema));

			const empty = mapNode.getBoxed("foo");
			assert.equal(empty.parent, mapNode);
			assert.equal(empty.key, "foo");
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
			new DefaultChangeFamily(failCodecFamily),
			(change: DefaultChangeset) => {
				editCallCount++;
			},
		);
		const initialTree = typedJsonCursor({
			[typedJsonCursor.type]: structNodeSchema,
			foo: "Hello world", // Will unbox
			bar: [], // Won't unbox
		});
		const forest = forestWithContent({ schema, initialTree });
		const context = getTreeContext(
			schema,
			{ forest, editor: editBuilder } as unknown as ITreeCheckout,
			new MockNodeKeyManager(),
		);

		const cursor = initializeCursor(context, rootFieldAnchor);
		cursor.enterNode(0);

		const { anchor, anchorNode } = createAnchors(context, cursor);

		const node = buildLazyObjectNode(context, structNodeSchema, cursor, anchorNode, anchor);

		it("boxing", () => {
			assert.equal(node.foo, node.boxedFoo.content);
			assert(node.bar === node.boxedBar);
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

			node.setFoo(mapTreeFromCursor(singleJsonCursor("First edit")));
			assert.equal(editCallCount, 1);

			node.setFoo(mapTreeFromCursor(singleJsonCursor("Second edit")));
			assert.equal(editCallCount, 2);
		});
	});

	describe("buildLazyObjectNode", () => {
		const schemaBuilder = new SchemaBuilder({ scope: "test" });
		const objectNodeSchema = schemaBuilder.object("object", {
			optional: SchemaBuilder.optional(leafDomain.string),
			required: SchemaBuilder.required(leafDomain.boolean),
			sequence: SchemaBuilder.sequence(leafDomain.number),
			// Gets escaped
			value: SchemaBuilder.optional(leafDomain.string),
		});
		const schema = schemaBuilder.intoSchema(SchemaBuilder.optional(Any));

		const context = contextWithContentReadonly({
			schema,
			initialTree: typedJsonCursor({
				[typedJsonCursor.type]: objectNodeSchema,
				optional: "Hello",
				required: true,
				sequence: [1, 2, 3],
				value: "x",
			}),
		});

		const cursor = initializeCursor(context, rootFieldAnchor);
		cursor.enterNode(0);

		const { anchor, anchorNode } = createAnchors(context, cursor);

		const node = buildLazyObjectNode(context, objectNodeSchema, cursor, anchorNode, anchor);

		it("Binds setter properties for values, but not other field kinds", () => {
			assert(
				Object.getOwnPropertyDescriptor(Reflect.getPrototypeOf(node), "optional")?.set !==
					undefined,
			);
			assert(
				Object.getOwnPropertyDescriptor(Reflect.getPrototypeOf(node), "required")?.set !==
					undefined,
			);
			assert(
				Object.getOwnPropertyDescriptor(Reflect.getPrototypeOf(node), "sequence")?.set ===
					undefined,
			);
		});

		it('Binds "set" methods for values, but not other field kinds', () => {
			const record = node as unknown as Record<string | number | symbol, unknown>;
			assert(record.setOptional !== undefined);
			assert(record.setRequired !== undefined);
			assert(record.setSequence === undefined);
		});

		it("escaped fields handled correctly", () => {
			assert(
				Object.getOwnPropertyDescriptor(Reflect.getPrototypeOf(node), "fieldValue")?.set !==
					undefined,
			);
			const s: string | undefined = node.fieldValue;
			assert.equal(s, "x");
			assert.equal(node.value, undefined); // Not the field, but the node's value.
			assert.equal(node.boxedFieldValue?.content, "x");
		});
	});

	it("PropertyNameFromFieldKey", () => {
		// Strict typing on this allow testing of compile time PropertyNameFromFieldKey and runtime both by calling this function
		function expect<const In extends string, const Out extends PropertyNameFromFieldKey<In>>(
			input: In,
			out: Out,
		): void {
			assert.equal(propertyNameFromFieldKey(input), out);
		}
		// Unescaped
		expect("", "");
		expect("simpleCase", "simpleCase");
		expect("setting", "setting"); // has "set" prefix, but lower case afterwards

		// Escaped
		expect("constructor", "fieldConstructor");
		expect("field", "fieldField"); // Name collides with prefix.
		expect("setExample", "fieldSetExample"); // Prefix, then capitalized
		expect("set-", "fieldSet-"); // Prefix, then non-lowercase
	});
});

function fieldToMapTree(field: FlexTreeField): MapTree[] {
	const results: MapTree[] = [];
	for (const child of field.boxedIterator()) {
		results.push(nodeToMapTree(child));
	}
	return results;
}

function nodeToMapTree(node: FlexTreeNode): MapTree {
	const fields: Map<FieldKey, MapTree[]> = new Map();
	for (const field of node.boxedIterator()) {
		fields.set(field.key, fieldToMapTree(field));
	}

	return { fields, type: node.schema.name, value: node.value };
}
