/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	deserializeCompatibilitySchema,
	FieldKind,
	SchemaFactoryAlpha,
	serializeCompatibilitySchema,
	stringSchema,
	toViewCompatibilityTreeSchema,
	TreeViewConfigurationAlpha,
	type SimpleTreeSchema,
} from "../../../simple-tree/index.js";
import { strict as assert } from "node:assert";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";

describe("getViewCompatibilityTreeSchema", () => {
	useSnapshotDirectory("get-view-compatibility-tree-schema");

	describe("With staged schema upgrades", () => {
		const leafSchema = stringSchema;
		const schemaFactory = new SchemaFactoryAlpha("test");
		const root = schemaFactory.optional(
			// Staged allowed types are read-only for the sake of schema migrations
			schemaFactory.types([schemaFactory.staged(leafSchema)]),
		);

		it("Should preserve isReadOnly when converting to SimpleTreeSchema", () => {
			const expected: SimpleTreeSchema = {
				root: {
					kind: FieldKind.Optional,
					simpleAllowedTypes: new Map([[leafSchema.identifier, { isStaged: true }]]),
					metadata: {},
					persistedMetadata: undefined,
				},
				definitions: new Map([[leafSchema.identifier, leafSchema]]),
			};

			const treeView = new TreeViewConfigurationAlpha({ schema: root });
			const actual = toViewCompatibilityTreeSchema(treeView, true);
			assert.deepEqual(actual.root.simpleAllowedTypes, expected.root.simpleAllowedTypes);
		});

		it("view compatibility schema - simpleAllowedTypes", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: root });
			const actual = serializeCompatibilitySchema(
				toViewCompatibilityTreeSchema(treeView, true),
			);
			takeJsonSnapshot(actual);
		});

		it("Roundtrip view compatibility schema serialization - simpleAllowedTypes", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: root });
			const actual = deserializeCompatibilitySchema(serializeCompatibilitySchema(treeView));
			assert.deepEqual(actual, treeView);
		});
	});
});
