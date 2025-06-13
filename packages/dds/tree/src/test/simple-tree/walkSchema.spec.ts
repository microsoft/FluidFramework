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

function mockWalkAllowedTypes(
	annotatedAllowedTypes: Iterable<AnnotatedAllowedSchema>,
): [TreeNodeSchema[], AnnotatedAllowedSchema[][]] {
	const visitedNodes: TreeNodeSchema[] = [];
	const visitedAllowedTypes: AnnotatedAllowedSchema[][] = [];

	const mockVisitor: SchemaVisitor = {
		node: (schema) => visitedNodes.push(schema),
		allowedTypes: (types) => visitedAllowedTypes.push(Array.from(types)),
	};

	walkAllowedTypes(annotatedAllowedTypes, mockVisitor);

	return [visitedNodes, visitedAllowedTypes];
}

describe("walk schema", () => {
	const sf = new SchemaFactoryAlpha("walk schema tests");

	it("calls visitor on single allowed type", () => {
		const annotated = makeAnnotated(sf.string);

		const [visitedNodes, visitedAllowedTypes] = mockWalkAllowedTypes([annotated]);

		assert.deepEqual(visitedNodes, [annotated.type]);
		assert.deepEqual(visitedAllowedTypes, [[annotated]]);
	});

	it("calls visitor on nested allowed types", () => {
		const annotatedString = makeAnnotated(sf.string);
		const annotatedObject = makeAnnotated(
			sf.objectAlpha("annotatedObject", { name: annotatedString }),
		);
		const schema = sf.arrayAlpha("schema", annotatedObject);

		const [visitedNodes, visitedAllowedTypes] = mockWalkAllowedTypes(
			normalizeFieldSchema(schema).annotatedAllowedTypeSet,
		);

		assert.deepEqual(visitedNodes, [annotatedString.type, annotatedObject.type, schema]);
		assert.deepEqual(visitedAllowedTypes, [
			[annotatedString],
			[annotatedObject],
			[{ metadata: {}, type: schema }],
		]);
	});

	it("calls visitor on all child allowed types", () => {
		const annotatedString = makeAnnotated(sf.string);
		const annotatedNumber = makeAnnotated(sf.number);
		const schema = sf.arrayAlpha("schema", [annotatedNumber, annotatedString]);

		const [visitedNodes, visitedAllowedTypes] = mockWalkAllowedTypes(
			normalizeFieldSchema(schema).annotatedAllowedTypeSet,
		);

		assert.deepEqual(visitedNodes, [annotatedNumber.type, annotatedString.type, schema]);
		assert.deepEqual(visitedAllowedTypes, [
			[annotatedNumber, annotatedString],
			[{ metadata: {}, type: schema }],
		]);
	});

	it("handles empty allowed types", () => {
		const [visitedNodes, visitedAllowedTypes] = mockWalkAllowedTypes([]);

		assert.deepEqual(visitedNodes, []);
		assert.deepEqual(visitedAllowedTypes, []);
	});

	it("does not revisit the same schema", () => {
		const annotated = makeAnnotated(sf.string);
		const [visitedNodes, visitedAllowedTypes] = mockWalkAllowedTypes([annotated, annotated]);

		assert.deepEqual(visitedNodes, [annotated.type]);
		assert.deepEqual(visitedAllowedTypes, [[annotated, annotated]]);
	});

	it("does not fail if visitor has no callbacks", () => {
		const annotatedString = makeAnnotated(sf.string);

		assert.doesNotThrow(() => walkAllowedTypes([annotatedString], {}));
	});
});
