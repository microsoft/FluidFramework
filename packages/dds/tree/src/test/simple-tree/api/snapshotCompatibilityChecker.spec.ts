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
} from "../../../simple-tree/index.js";
import { strict as assert } from "node:assert";

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
});
