/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	normalizeFieldSchema,
	SchemaFactoryAlpha,
	type TreeNodeSchema,
} from "../../simple-tree/index.js";
import {
	walkAllowedTypes,
	type AnnotatedAllowedSchema,
	type SchemaVisitor,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/core/index.js";

function makeAnnotated(type: TreeNodeSchema): AnnotatedAllowedSchema {
	return {
		metadata: {
			custom: "test",
		},
		type,
	};
}

describe("walk schema", () => {
	let visitedNodes: TreeNodeSchema[];
	let visitedAllowedTypes: Iterable<AnnotatedAllowedSchema>[];

	const mockVisitor: SchemaVisitor = {
		node: (schema) => visitedNodes.push(schema),
		allowedTypes: (types) => visitedAllowedTypes.push(types),
	};

	const sf = new SchemaFactoryAlpha("walk schema tests");

	beforeEach(() => {
		visitedNodes = [];
		visitedAllowedTypes = [];
	});

	it("calls visitor on single allowed type", () => {
		const annotated = makeAnnotated(sf.string);

		walkAllowedTypes([annotated], mockVisitor);

		assert.deepEqual(visitedNodes, [annotated.type]);
		assert.equal(visitedAllowedTypes.length, 1);
		assert.deepEqual(Array.from(visitedAllowedTypes[0]), [annotated]);
	});

	it("calls visitor on nested allowed types", () => {
		const annotatedString = makeAnnotated(sf.string);
		const annotatedObject = makeAnnotated(
			sf.objectAlpha("annotatedObject", { name: annotatedString }),
		);
		const schema = sf.arrayAlpha("schema", annotatedObject);

		walkAllowedTypes(normalizeFieldSchema(schema).annotatedAllowedTypeSet, mockVisitor);

		assert.deepEqual(visitedNodes, [annotatedString.type, annotatedObject.type, schema]);
		assert.equal(visitedAllowedTypes.length, 3);
		assert.deepEqual(Array.from(visitedAllowedTypes[0]), [annotatedString]);
		assert.deepEqual(Array.from(visitedAllowedTypes[0])[0].metadata.custom, "test");
		assert.deepEqual(Array.from(visitedAllowedTypes[1])[0].metadata.custom, "test");
	});

	it("calls visitor on all child allowed types", () => {
		const annotatedString = makeAnnotated(sf.string);
		const annotatedNumber = makeAnnotated(sf.number);
		const schema = sf.arrayAlpha("schema", [annotatedNumber, annotatedString]);

		walkAllowedTypes(normalizeFieldSchema(schema).annotatedAllowedTypeSet, mockVisitor);

		assert.deepEqual(visitedNodes, [annotatedNumber.type, annotatedString.type, schema]);
		assert.equal(visitedAllowedTypes.length, 2);
		assert.deepEqual(Array.from(visitedAllowedTypes[0]), [annotatedNumber, annotatedString]);
		assert.deepEqual(Array.from(visitedAllowedTypes[0])[0].metadata.custom, "test");
		assert.deepEqual(Array.from(visitedAllowedTypes[0])[1].metadata.custom, "test");
	});

	it("does not revisit the same schema", () => {
		const annotated = makeAnnotated(sf.string);
		walkAllowedTypes([annotated, annotated], mockVisitor);

		assert.equal(visitedNodes.length, 1);
		assert.equal(visitedAllowedTypes.length, 1);
		assert.equal(Array.from(visitedAllowedTypes[0]).length, 2);
	});

	it("does not fail if visitor has no callbacks", () => {
		const annotatedString = makeAnnotated(sf.string);

		assert.doesNotThrow(() => walkAllowedTypes([annotatedString], {}));
	});
});
