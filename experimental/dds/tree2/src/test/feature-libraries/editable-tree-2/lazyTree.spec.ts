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
	DefaultEditBuilder,
	PrimitiveValue,
	SchemaBuilder,
	createMockNodeKeyManager,
	isPrimitiveValue,
} from "../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { Context } from "../../../feature-libraries/editable-tree-2/editableTreeContext";
import { IEditableForest, TreeNavigationResult, rootFieldKey } from "../../../core";
import { forestWithContent } from "../../utils";
import { TreeContent } from "../../../shared-tree";
import { RestrictiveReadonlyRecord, brand } from "../../../util";
import {
	LazyOptionalField,
	LazySequence,
	LazyValueField,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/editable-tree-2/lazyField";
// eslint-disable-next-line import/no-internal-modules
import { visitIterableTree, UntypedEntity } from "../../../feature-libraries/editable-tree-2";

const builder = new SchemaBuilder("lazyTree");
const emptyStruct = builder.struct("empty", {});
const schema = builder.intoDocumentSchema(SchemaBuilder.fieldOptional(emptyStruct));

function getReadonlyContext(forest: IEditableForest): Context {
	// This will error if someone tries to call mutation methods on it
	const dummyEditor = {} as unknown as DefaultEditBuilder;
	return new Context(schema, forest, dummyEditor, createMockNodeKeyManager());
}

function contextWithContentReadonly(content: TreeContent): Context {
	const forest = forestWithContent(content);
	return getReadonlyContext(forest);
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
		const forest = forestWithContent({ schema, initialTree: {} });
		const context = getReadonlyContext(forest);
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
			"__defineGetter__",
			"__defineSetter__",
			"__lookupGetter__",
			"__lookupSetter__",
			"__proto__",
			"anchor",
			"anchorNode",
			"constructor",
			"context",
			"currentIndex",
			"cursor",
			"fieldLength",
			"forgetAnchor",
			"free",
			"getField",
			"getFieldSchema",
			"has",
			"hasOwnProperty",
			"is",
			"isFreed",
			"isPrototypeOf",
			"lazyCursor",
			"lookupFieldKind",
			"on",
			"parentField",
			"prepareForEdit",
			"propertyIsEnumerable",
			"removeDeleteCallback",
			"schema",
			"toLocaleString",
			"toString",
			"treeStatus",
			"tryGetField",
			"tryMoveCursorToAnchor",
			"type",
			"typeName",
			"value",
			"valueOf",
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

	describe("enumerable own properties", () => {
		it("provide access to full tree data", () => {
			const context = contextWithContentReadonly({ schema, initialTree: {} });

			// assert.deepEqual(viaJson, {type:})
			checkPropertyInvariants(context.root);
			const viaJson = JSON.parse(JSON.stringify(context.root));
		});
	});
});

function checkPropertyInvariants(root: UntypedEntity): void {
	// TODO: add extra items needed to traverse map nodes and in leaves.
	const allowedPrototypes = new Set([
		LazyMap.prototype,
		LazyFieldNode.prototype,
		LazyLeaf.prototype,
		LazySequence.prototype,
		LazyValueField.prototype,
		LazyOptionalField.prototype,
	]);

	const visited: Set<unknown> = new Set([root]);
	const primitives = new Map<PrimitiveValue, number>();
	// TODO: add cycle handler to not error on fluid handles.
	visitOwnPropertiesRecursive(root, (parent, key, child) => {
		assert(typeof child !== "function");
		assert(typeof key !== "symbol");

		if (typeof child === "object") {
			// TODO: add exception to allow shared leaf values.
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
				primitives.set(child, (primitives.get(child) ?? 0) + 1);
			}
		}
	});

	const unboxable = new Set([
		LazyFieldNode.prototype,
		LazyValueField.prototype,
		LazyOptionalField.prototype,
	]);

	const primitives2 = new Map<PrimitiveValue, number>();
	// Assert all nodes and fields traversed, and all values found.
	// TODO: checking that unboxed fields and nodes were traversed is not fully implemented here.
	visitIterableTree(root, (item) => {
		if (item instanceof LazyLeaf) {
			const value = item.value;
			primitives2.set(value, (primitives2.get(value) ?? 0) + 1);
		} else {
			if (unboxable.has(Object.getPrototypeOf(item))) {
				assert(visited.has(item));
			}
		}

		return undefined;
	});

	assert.deepEqual(primitives, primitives2);
}

function visitOwnPropertiesRecursive(
	root: unknown,
	visitor: (parent: object, key: string | symbol, data: unknown) => void,
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
			visitor(root, key, value);
			visitOwnPropertiesRecursive(value, visitor, cycleHandler, stack);
		}
	}

	stack.delete(root);
}
