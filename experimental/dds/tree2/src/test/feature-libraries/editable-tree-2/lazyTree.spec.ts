/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";

import {
	buildLazyStruct,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/editable-tree-2/lazyTree";
import {
	DefaultEditBuilder,
	SchemaBuilder,
	createMockNodeKeyManager,
} from "../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { Context } from "../../../feature-libraries/editable-tree-2/editableTreeContext";
import { IEditableForest, TreeNavigationResult, rootFieldKey } from "../../../core";
import { forestWithContent } from "../../utils";

const builder = new SchemaBuilder("lazyTree");
const emptyStruct = builder.struct("empty", {});
const schema = builder.intoDocumentSchema(SchemaBuilder.fieldOptional(emptyStruct));

function getReadonlyEditableTreeContext(forest: IEditableForest): Context {
	// This will error if someone tries to call mutation methods on it
	const dummyEditor = {} as unknown as DefaultEditBuilder;
	return new Context(schema, forest, dummyEditor, createMockNodeKeyManager());
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
		const context = getReadonlyEditableTreeContext(forest);
		const cursor = forest.allocateCursor();
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
});
