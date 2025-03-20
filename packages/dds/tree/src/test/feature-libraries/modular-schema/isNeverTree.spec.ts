/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type FieldKindIdentifier,
	MapNodeStoredSchema,
	type MutableTreeStoredSchema,
	ObjectNodeStoredSchema,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	TreeStoredSchemaRepository,
	storedEmptyFieldSchema,
} from "../../../core/index.js";
import { FieldKinds, defaultSchemaPolicy } from "../../../feature-libraries/index.js";
/* eslint-disable-next-line import/no-internal-modules */
import { allowsTreeSuperset } from "../../../feature-libraries/modular-schema/index.js";
import {
	isNeverField,
	isNeverTree,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../../feature-libraries/modular-schema/isNeverTree.js";
import { brand } from "../../../util/index.js";

/**
 * Empty readonly map.
 */
const emptyMap: ReadonlyMap<never, never> = new Map<never, never>();

/**
 * Helper for building {@link TreeFieldStoredSchema}.
 */
function fieldSchema(
	kind: { identifier: FieldKindIdentifier },
	types: Iterable<TreeNodeSchemaIdentifier>,
): TreeFieldStoredSchema {
	return {
		kind: kind.identifier,
		types: new Set(types),
	};
}

describe("Schema Comparison", () => {
	/**
	 * TreeFieldStoredSchema which is impossible for any data to be in schema with.
	 */
	const neverField = fieldSchema(FieldKinds.required, []);

	/**
	 * TreeNodeStoredSchema which is impossible for any data to be in schema with.
	 */
	const neverTree: TreeNodeStoredSchema = new MapNodeStoredSchema(neverField);

	const neverTree2: TreeNodeStoredSchema = new ObjectNodeStoredSchema(
		new Map([[brand("x"), neverField]]),
	);

	const emptyTree = {
		name: brand<TreeNodeSchemaIdentifier>("empty"),
		schema: new ObjectNodeStoredSchema(new Map()),
	};

	const emptyLocalFieldTree = {
		name: brand<TreeNodeSchemaIdentifier>("emptyLocalFieldTree"),
		schema: new ObjectNodeStoredSchema(new Map([[brand("x"), storedEmptyFieldSchema]])),
	};

	const optionalLocalFieldTree = {
		name: brand<TreeNodeSchemaIdentifier>("optionalLocalFieldTree"),
		schema: new ObjectNodeStoredSchema(
			new Map([[brand("x"), fieldSchema(FieldKinds.optional, [emptyTree.name])]]),
		),
	};
	const valueLocalFieldTree = {
		name: brand<TreeNodeSchemaIdentifier>("valueLocalFieldTree"),
		schema: new ObjectNodeStoredSchema(
			new Map([[brand("x"), fieldSchema(FieldKinds.required, [emptyTree.name])]]),
		),
	};
	const valueEmptyTreeField = fieldSchema(FieldKinds.required, [emptyTree.name]);
	const optionalEmptyTreeField = fieldSchema(FieldKinds.optional, [emptyTree.name]);

	function updateTreeSchema(
		repo: MutableTreeStoredSchema,
		identifier: TreeNodeSchemaIdentifier,
		schema: TreeNodeStoredSchema,
	) {
		repo.apply({
			rootFieldSchema: repo.rootFieldSchema,
			nodeSchema: new Map([...repo.nodeSchema, [identifier, schema]]),
		});
	}

	it("isNeverField", () => {
		const repo = new TreeStoredSchemaRepository();
		assert(isNeverField(defaultSchemaPolicy, repo, neverField));
		updateTreeSchema(repo, brand("never"), neverTree);
		const neverField2: TreeFieldStoredSchema = fieldSchema(FieldKinds.required, [
			brand("never"),
		]);
		assert(isNeverField(defaultSchemaPolicy, repo, neverField2));
		assert.equal(isNeverField(defaultSchemaPolicy, repo, storedEmptyFieldSchema), false);
		assert.equal(isNeverField(defaultSchemaPolicy, repo, valueEmptyTreeField), true);
		updateTreeSchema(repo, brand("empty"), emptyTree.schema);
		assert.equal(
			isNeverField(
				defaultSchemaPolicy,
				repo,
				fieldSchema(FieldKinds.required, [brand("empty")]),
			),
			false,
		);
		assert.equal(isNeverField(defaultSchemaPolicy, repo, valueEmptyTreeField), false);
		assert.equal(isNeverField(defaultSchemaPolicy, repo, optionalEmptyTreeField), false);
	});

	it("isNeverTree", () => {
		const repo = new TreeStoredSchemaRepository();
		assert(isNeverTree(defaultSchemaPolicy, repo, neverTree));
		assert(isNeverTree(defaultSchemaPolicy, repo, new MapNodeStoredSchema(neverField)));
		assert(isNeverTree(defaultSchemaPolicy, repo, neverTree2));
		assert(isNeverTree(defaultSchemaPolicy, repo, undefined));
		assert.equal(
			isNeverTree(defaultSchemaPolicy, repo, new ObjectNodeStoredSchema(emptyMap)),
			false,
		);

		assert(
			allowsTreeSuperset(
				defaultSchemaPolicy,
				repo,
				repo.nodeSchema.get(emptyTree.name),
				emptyTree.schema,
			),
		);
		updateTreeSchema(repo, emptyTree.name, emptyTree.schema);

		assert.equal(isNeverTree(defaultSchemaPolicy, repo, emptyLocalFieldTree.schema), false);
		assert.equal(isNeverTree(defaultSchemaPolicy, repo, valueLocalFieldTree.schema), false);
		assert.equal(isNeverTree(defaultSchemaPolicy, repo, optionalLocalFieldTree.schema), false);
	});

	it("isNeverTreeRecursive", () => {
		const repo = new TreeStoredSchemaRepository();
		const recursiveField = fieldSchema(FieldKinds.required, [brand("recursive")]);
		const recursiveType = new MapNodeStoredSchema(recursiveField);
		updateTreeSchema(repo, brand("recursive"), recursiveType);
		assert(isNeverTree(defaultSchemaPolicy, repo, recursiveType));
	});

	it("isNeverTreeRecursive non-never", () => {
		const repo = new TreeStoredSchemaRepository();
		const recursiveField = fieldSchema(FieldKinds.required, [
			brand("recursive"),
			emptyTree.name,
		]);
		const recursiveType = new MapNodeStoredSchema(recursiveField);
		updateTreeSchema(repo, emptyTree.name, emptyTree.schema);
		updateTreeSchema(repo, brand("recursive"), recursiveType);
		assert(isNeverTree(defaultSchemaPolicy, repo, recursiveType));
	});
});
