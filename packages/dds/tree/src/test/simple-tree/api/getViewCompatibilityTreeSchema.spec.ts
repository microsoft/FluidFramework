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
			schemaFactory.types([schemaFactory.staged(leafSchema)]),
		);

		const stagedSchemaUpgrades = root.stagedSchemaUpgrades;

		it("Should preserve staged schema upgrades when converting to SimpleTreeSchema", () => {
			const expected: SimpleTreeSchema = {
				root: {
					kind: FieldKind.Optional,
					allowedTypesIdentifiers: new Set([leafSchema.identifier]),
					metadata: {},
					persistedMetadata: undefined,
					stagedSchemaUpgrades,
				},
				definitions: new Map([[leafSchema.identifier, leafSchema]]),
			};

			const treeView = new TreeViewConfigurationAlpha({ schema: root });
			const actual = toViewCompatibilityTreeSchema(treeView, true);
			assert.deepEqual(actual.root.stagedSchemaUpgrades, expected.root.stagedSchemaUpgrades);
		});

		it("view compatibility schema - hasStagedSchemaUpgrades", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: root });
			const actual = toSerializableCompatibilitySchema(treeView);
			takeJsonSnapshot(actual);
		});
	});
});
