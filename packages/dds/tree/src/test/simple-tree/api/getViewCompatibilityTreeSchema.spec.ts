import {
	FieldKind,
	SchemaFactoryAlpha,
	stringSchema,
	toSerializableCompatibilitySchema,
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
					allowedTypesInfo: new Map([[leafSchema.identifier, { isStaged: true }]]),
					allowedTypesIdentifiers: new Set([leafSchema.identifier]),
					metadata: {},
					persistedMetadata: undefined,
				},
				definitions: new Map([[leafSchema.identifier, leafSchema]]),
			};

			const treeView = new TreeViewConfigurationAlpha({ schema: root });
			const actual = toViewCompatibilityTreeSchema(treeView, true);
			assert.deepEqual(actual.root.allowedTypesInfo, expected.root.allowedTypesInfo);
		});

		it("view compatibility schema - allowedTypesIdentifiers", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: root });
			const actual = toSerializableCompatibilitySchema(treeView);
			takeJsonSnapshot(actual);
		});
	});
});
