/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";

import {
	LazyFieldNode,
	LazyLeaf,
	LazyMap,
	LazyStruct,
	buildLazyStruct,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/editable-tree-2/lazyTree";
import {
	Any,
	DefaultEditBuilder,
	PrimitiveValue,
	SchemaBuilder,
	TypedSchemaCollection,
	createMockNodeKeyManager,
	isPrimitiveValue,
	jsonableTreeFromCursor,
	singleMapTreeCursor,
	typeNameSymbol,
} from "../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { Context } from "../../../feature-libraries/editable-tree-2/editableTreeContext";
import {
	FieldKey,
	IEditableForest,
	MapTree,
	TreeNavigationResult,
	TreeValue,
	rootFieldKey,
} from "../../../core";
import { forestWithContent } from "../../utils";
import { TreeContent } from "../../../shared-tree";
import { RestrictiveReadonlyRecord, brand } from "../../../util";
import {
	LazyField,
	LazyOptionalField,
	LazySequence,
	LazyValueField,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/editable-tree-2/lazyField";

import {
	visitIterableTree,
	UntypedEntity,
	UntypedField,
	UntypedTree,
	Skip,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/editable-tree-2";
import { testTrees, treeContentFromTestTree } from "../../testTrees";
import { jsonSchema } from "../../../domains";

function getReadonlyContext(forest: IEditableForest, schema: TypedSchemaCollection): Context {
	// This will error if someone tries to call mutation methods on it
	const dummyEditor = {} as unknown as DefaultEditBuilder;
	return new Context(schema, forest, dummyEditor, createMockNodeKeyManager());
}

function contextWithContentReadonly(content: TreeContent): Context {
	const forest = forestWithContent(content);
	return getReadonlyContext(forest, content.schema);
}

function collectPropertyNames(obj: object): Set<string> {
	if (obj == null) {
		return new Set();
	}
	return new Set([
		...Object.getOwnPropertyNames(obj),
		...collectPropertyNames(Object.getPrototypeOf(obj)),
	]);
}

describe("lazyTree", () => {
	it("property names", () => {
		const builder = new SchemaBuilder("lazyTree");
		const emptyStruct = builder.struct("empty", {});
		const testSchema = builder.intoDocumentSchema(SchemaBuilder.fieldOptional(emptyStruct));

		const forest = forestWithContent({ schema: testSchema, initialTree: {} });
		const context = getReadonlyContext(forest, testSchema);
		const cursor = context.forest.allocateCursor();
		assert.equal(
			forest.tryMoveCursorToField({ fieldKey: rootFieldKey, parent: undefined }, cursor),
			TreeNavigationResult.Ok,
		);
		cursor.enterNode(0);
		const anchor = forest.anchors.track(cursor.getPath() ?? fail());

		const struct = buildLazyStruct(
			context,
			emptyStruct,
			cursor,
			forest.anchors.locate(anchor) ?? fail(),
			anchor,
		);

		// TODO: move these constants for validation of struct field names into schema builder.
		// TODO: adjust private/protected names used in implementation to follow some documentable pattern that can be banned more generally (ex: _ prefix).
		const bannedNames = new Set([
			"anchor",
			"anchorNode",
			"constructor",
			"context",
			"cursor",
			"forgetAnchor",
			"is",
			"isFreed",
			"on",
			"parentField",
			"prepareForEdit",
			"schema",
			"treeStatus",
			"tryGetField",
			"tryMoveCursorToAnchor",
			"type",
			"value",
		]);
		// Names starting with these must not be followed by an upper case letter
		// TODO: add this to name validation in field names in schema builder.
		const prefixes = new Set(["set", "boxed"]);

		const existingProperties = collectPropertyNames(struct);

		// Ensure all existing properties are banned as field names:
		assert.deepEqual(bannedNames, new Set(existingProperties));

		for (const name of existingProperties) {
			for (const prefix of prefixes) {
				// Ensure properties won't collide with prefixed field name based properties.
				// This could be less strict.
				assert(!name.startsWith(prefix));
			}
		}
	});

	describe("struct", () => {
		const structBuilder = new SchemaBuilder("boxing", {}, jsonSchema);
		const emptyStruct = structBuilder.struct("empty", {});
		const testStruct = structBuilder.struct("mono", {
			willUnbox: SchemaBuilder.fieldOptional(emptyStruct),
			notUnboxed: SchemaBuilder.fieldSequence(emptyStruct),
		});
		const schema = structBuilder.intoDocumentSchema(SchemaBuilder.fieldOptional(Any));

		it("boxing", () => {
			const context = contextWithContentReadonly({
				schema,
				initialTree: {
					[typeNameSymbol]: testStruct.name,
					willUnbox: {},
					notUnboxed: [],
				},
			});
			const cursor = context.forest.allocateCursor();
			assert.equal(
				context.forest.tryMoveCursorToField(
					{ fieldKey: rootFieldKey, parent: undefined },
					cursor,
				),
				TreeNavigationResult.Ok,
			);
			cursor.enterNode(0);
			const anchor = context.forest.anchors.track(cursor.getPath() ?? fail());
			const struct = buildLazyStruct(
				context,
				testStruct,
				cursor,
				context.forest.anchors.locate(anchor) ?? fail(),
				anchor,
			);

			assert.equal(struct.willUnbox, struct.boxedWillUnbox.content);
			assert(struct.notUnboxed.isSameAs(struct.boxedNotUnboxed));
		});
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
							.map(singleMapTreeCursor)
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

function fieldToMapTree(field: UntypedField): MapTree[] {
	const results: MapTree[] = [];
	for (const child of field) {
		results.push(nodeToMapTree(child));
	}
	return results;
}

function nodeToMapTree(node: UntypedTree): MapTree {
	const fields: Map<FieldKey, MapTree[]> = new Map();
	for (const field of node) {
		fields.set(field.key, fieldToMapTree(field));
	}

	return { fields, type: node.type, value: node.value };
}

function checkPropertyInvariants(root: UntypedEntity): void {
	const treeValues = new Map<TreeValue, number>();
	// Assert all nodes and fields traversed, and all values found.
	// TODO: checking that unboxed fields and nodes were traversed is not fully implemented here.
	visitIterableTree(root, (item) => {
		if (item instanceof LazyLeaf) {
			const value = item.value;
			treeValues.set(value, (treeValues.get(value) ?? 0) + 1);
		}
		return undefined;
	});

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
	// TODO: add cycle handler to not error on fluid handles.
	visitOwnPropertiesRecursive(root, (parent, key, child): typeof Skip | undefined => {
		assert(typeof child !== "function");
		assert(typeof key !== "symbol");

		if (typeof child === "object") {
			if (treeValues.has(child)) {
				primitivesAndValues.set(child, (primitivesAndValues.get(child) ?? 0) + 1);
				return Skip;
			}

			assert(!visited.has(child));
			visited.add(child);

			const prototype = Object.getPrototypeOf(child);
			if (!allowedPrototypes.has(prototype)) {
				const prototypeInner = Object.getPrototypeOf(prototype);
				assert(prototypeInner === LazyStruct.prototype);
			}
		} else if (isPrimitiveValue(child)) {
			// TODO: more robust check for schema names
			if (key === "type") {
				assert(typeof child === "string");
				assert(root.context.schema.treeSchema.has(brand(child)));
			} else {
				primitivesAndValues.set(child, (primitivesAndValues.get(child) ?? 0) + 1);
			}
		}
	});

	const unboxable = new Set([
		LazyLeaf.prototype,
		LazyFieldNode.prototype,
		LazyValueField.prototype,
		LazyOptionalField.prototype,
	]);

	// Assert all nodes and fields traversed, and all values found.
	// TODO: checking that unboxed fields and nodes were traversed is not fully implemented here.
	visitIterableTree(root, (item) => {
		if (!unboxable.has(Object.getPrototypeOf(item))) {
			if (!primitivesAndValues.has(item) && !visited.has(item)) {
				// Fields don't have stable object identity, so they can fail the above test.
				// Nothing else should fail it.
				assert(item instanceof LazyField);
			}
		}
		return undefined;
	});

	assert.deepEqual(primitivesAndValues, treeValues);
}

function visitOwnPropertiesRecursive(
	root: unknown,
	visitor: (parent: object, key: string | symbol, data: unknown) => undefined | typeof Skip,
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
