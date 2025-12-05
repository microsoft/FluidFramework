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
	type SchemaCompatibilityStatus,
	SnapshotCompatibilityChecker,
} from "../../../simple-tree/index.js";
import { strict as assert } from "node:assert";
import { testSrcPath } from "../../testSrcPath.cjs";
import path from "node:path";
import fs from "node:fs";

describe("snapshotCompatibilityChecker", () => {
	it("parse and snapshot can roundtrip schema", () => {
		const factory = new SchemaFactory("test");
		const Schema = factory.optional(factory.string, {});

		const view = new TreeViewConfiguration({ schema: Schema });
		const snapshot = exportCompatibilitySchemaSnapshot(view);
		const parsedView = importCompatibilitySchemaSnapshot(snapshot);

		const normalizedView = normalizeFieldSchema(view.schema);

		assert.equal(normalizedView.allowedTypeSet.size, 1);
		assert.equal(
			normalizedView.allowedTypesIdentifiers.has("com.fluidframework.leaf.string"),
			true,
		);
	});

	it("checkCompatibility detects incompatible schemas", () => {
		const factory = new SchemaFactory("test");
		class Point2D extends factory.object("Point", {
			x: factory.number,
			y: factory.number,
		}) {}
		class Point3D extends factory.object("Point", {
			x: factory.number,
			y: factory.number,
			z: factory.optional(factory.number),
		}) {}

		const storedAsView = new TreeViewConfiguration({ schema: Point2D });
		const view = new TreeViewConfiguration({ schema: Point3D });
		const compatibility = checkCompatibility(storedAsView, view);

		const expected: Omit<SchemaCompatibilityStatus, "canInitialize"> = {
			canView: false,
			canUpgrade: true,
			isEquivalent: false,
		};
		assert.deepEqual(compatibility, expected);
	});

	it("checkCompatibility detects compatible schemas", () => {
		const factory = new SchemaFactory("test");

		// The past view schema, for the purposes of illustration. This wouldn't normally appear as a concrete schema in the test
		// checking compatibility, but rather would be loaded from a snapshot.
		class Point2D extends factory.object("Point", {
			x: factory.number,
			y: factory.number,
		}) {}
		const viewSchema = new TreeViewConfiguration({ schema: Point2D });
		const encodedSchema = JSON.stringify(exportCompatibilitySchemaSnapshot(viewSchema));

		// Load the past view schema from the snapshot (in-memory for the purposes of this test)
		// This snapshot is assumed to be the same as Point3D, except missing `z`.
		const oldViewSchema = importCompatibilitySchemaSnapshot(JSON.parse(encodedSchema));

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
	});
});

describe("snapshotCompatibilityChecker - high-level API", () => {
	const checker = new SnapshotCompatibilityChecker(
		path.join(testSrcPath, "schemaSnapshots", "point"),
		{
			...fs,
			...path,
		},
	);

	it("write current view schema snapshot", () => {
		const factory = new SchemaFactory("test");

		class Point2D extends factory.object("Point", {
			x: factory.number,
			y: factory.number,
		}) {}

		class Point3D extends factory.object("Point", {
			x: factory.number,
			y: factory.number,
			z: factory.optional(factory.number),
		}) {}

		checker.checkCompatibility(
			"1.0.0",
			new TreeViewConfiguration({ schema: Point2D }),
			"update",
		);

		checker.checkCompatibility(
			"2.0.0",
			new TreeViewConfiguration({ schema: Point3D }),
			"update",
		);
	});

	it.skip("check current view schema against historical persisted schemas", () => {
		const factory = new SchemaFactory("test");

		class Point3D extends factory.object("Point", {
			x: factory.number,
			y: factory.number,
			z: factory.optional(factory.number),
		}) {}

		const results = checker.checkCompatibility(
			"2.0.0",
			new TreeViewConfiguration({ schema: Point3D }),
			"test",
		);

		assert.equal(results.size, 2);

		const resultV1 = results.get("1.0.0");
		assert(resultV1 !== undefined);
		assert.equal(resultV1.backwardsCompatibilityStatus.canView, false);
		assert.equal(resultV1.backwardsCompatibilityStatus.canUpgrade, true);
		assert.equal(resultV1.forwardsCompatibilityStatus.canView, false);

		const resultV2 = results.get("2.0.0");
		assert(resultV2 !== undefined);
		assert.equal(resultV2.backwardsCompatibilityStatus.canView, true);
		assert.equal(resultV2.backwardsCompatibilityStatus.canUpgrade, true);
		assert.equal(resultV2.forwardsCompatibilityStatus.canView, true);
	});
});
