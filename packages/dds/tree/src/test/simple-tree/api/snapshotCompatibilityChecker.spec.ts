/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	checkCompatibility,
	normalizeFieldSchema,
	importCompatibilitySchemaSnapshot,
	SchemaFactory,
	exportCompatibilitySchemaSnapshot,
	TreeViewConfiguration,
	SchemaFactoryBeta,
	stringSchema,
	numberSchema,
} from "../../../simple-tree/index.js";
import { strict as assert } from "node:assert";

describe("snapshotCompatibilityChecker", () => {
	it("parse and snapshot can roundtrip schema", () => {
		const factory = new SchemaFactory("test");
		const Schema = factory.optional(factory.string, {});

		const view = new TreeViewConfiguration({ schema: Schema });
		const snapshot = exportCompatibilitySchemaSnapshot(view);
		const parsedView = importCompatibilitySchemaSnapshot(snapshot);

		const normalizedView = normalizeFieldSchema(parsedView.schema);

		assert.equal(normalizedView.allowedTypeSet.size, 1);
		assert.equal(
			normalizedView.allowedTypesIdentifiers.has("com.fluidframework.leaf.string"),
			true,
		);
	});

	function checkCompatibilityDetectsUpgradeableSchemas(roundtripSnapshot: boolean): void {
		const factory = new SchemaFactory("test");

		// The past view schema, for the purposes of illustration. This wouldn't normally appear as a concrete schema in the test
		// checking compatibility, but rather would be loaded from a snapshot.
		class Point2D extends factory.object("Point", {
			x: factory.number,
			y: factory.number,
		}) {}

		// This is the same as Point3D, except missing `z`.
		let oldViewSchema: TreeViewConfiguration = new TreeViewConfiguration({ schema: Point2D });

		// If roundtripSnapshot is true, store the old schema as a JSON string and then load it.
		if (roundtripSnapshot) {
			const encodedSchema = JSON.stringify(exportCompatibilitySchemaSnapshot(oldViewSchema));
			oldViewSchema = importCompatibilitySchemaSnapshot(JSON.parse(encodedSchema));
		}

		// Build the current view schema
		class Point3D extends factory.object("Point", {
			x: factory.number,
			y: factory.number,

			// The current schema has a new optional field that was not present on Point2D
			z: factory.optional(factory.number),
		}) {}
		const currentViewSchema = new TreeViewConfiguration({ schema: Point3D });

		// Check to see if the document created by the historical view schema can be opened with the current view schema
		const backwardsCompatibilityStatus = checkCompatibility(oldViewSchema, currentViewSchema);

		// z is not present in Point2D, so the schema must be upgraded
		assert.equal(backwardsCompatibilityStatus.canView, false);

		// The schema can be upgraded to add the new optional field
		assert.equal(backwardsCompatibilityStatus.canUpgrade, true);

		// Test what the old version of the application would do with a tree using the new schema:
		const forwardsCompatibilityStatus = checkCompatibility(currentViewSchema, oldViewSchema);

		// If the old schema set allowUnknownOptionalFields, this would be true, but since it did not,
		// we assert that there is forwards compatibility break:
		// this means these two versions of the application cannot collaborate on content using these schema.
		assert.equal(forwardsCompatibilityStatus.canView, false);
	}

	it("checkCompatibility detects upgradeable schemas", () => {
		checkCompatibilityDetectsUpgradeableSchemas(false);
	});

	it("checkCompatibility detects upgradeable schemas - snapshot test", () => {
		checkCompatibilityDetectsUpgradeableSchemas(true);
	});

	it("checkCompatibility: allowUnknownOptionalFields", () => {
		const factory = new SchemaFactoryBeta("test");

		// Point2D is constructed with allowUnknownOptionalFields, so it can read Point3D trees
		// even though it does not know about the optional field `z`.
		class Point2D extends factory.object(
			"Point",
			{
				x: factory.number,
				y: factory.number,
			},
			{ allowUnknownOptionalFields: true },
		) {}
		class Point3D extends factory.object("Point", {
			x: factory.number,
			y: factory.number,
			z: factory.optional(factory.number),
		}) {}

		const oldViewSchema = new TreeViewConfiguration({ schema: Point2D });
		const currentViewSchema = new TreeViewConfiguration({ schema: Point3D });

		// Check to see if a document created with the current view schema can be opened with the historical view schema
		const backwardsCompatibilityStatus = checkCompatibility(oldViewSchema, currentViewSchema);

		// The current view schema has a superset of the fields on the old view schema, so the schema must be upgraded to add the new
		// optional field `z`.
		assert.equal(backwardsCompatibilityStatus.canView, false);
		assert.equal(backwardsCompatibilityStatus.canUpgrade, true);

		// Test what the old version of the application would do with a tree using the new schema:
		const forwardsCompatibilityStatus = checkCompatibility(currentViewSchema, oldViewSchema);

		// Content created with the current schema can be viewed by the old schema due to allowUnknownOptionalFields
		assert.equal(forwardsCompatibilityStatus.canView, true);
	});

	it("checkCompatibility: staged schema", () => {
		const factory = new SchemaFactoryBeta("test");
		const oldSchema = factory.optional(
			factory.types([numberSchema, factory.staged(stringSchema)]),
		);
		const currentSchema = factory.optional([stringSchema, numberSchema]);

		const oldViewSchema = new TreeViewConfiguration({ schema: oldSchema });
		const currentViewSchema = new TreeViewConfiguration({ schema: currentSchema });

		// Check to see if the document created by the historical view schema can be opened with the current view schema
		const backwardsCompatibilityStatus = checkCompatibility(oldViewSchema, currentViewSchema);

		// The current view schema has a superset of the non-staged allowed types on the old schema, and therefore the old
		// stored schema must be upgraded before it can be viewed.
		assert.equal(backwardsCompatibilityStatus.canView, false);
		assert.equal(backwardsCompatibilityStatus.canUpgrade, true);

		// Check to see if a document created with the current view schema can be opened with the historical view schema
		const forwardsCompatibilityStatus = checkCompatibility(currentViewSchema, oldViewSchema);

		// The current schema's string schema is supported by the old schema's staged string schema
		assert.equal(forwardsCompatibilityStatus.canView, true);
	});
});
