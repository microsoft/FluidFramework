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
	type AnnotatedAllowedType,
	type NormalizedAnnotatedAllowedTypes,
	type SchemaVisitor,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/core/index.js";

function makeAnnotated(
	type: TreeNodeSchema,
	customValue = "test",
): AnnotatedAllowedType<TreeNodeSchema> {
	return {
		metadata: {
			custom: customValue,
		},
		type,
	};
}

function mockWalkAllowedTypes(
	annotatedAllowedTypes: NormalizedAnnotatedAllowedTypes,
	walkStagedAllowedTypes?: true,
): [TreeNodeSchema[], readonly NormalizedAnnotatedAllowedTypes[]] {
	const visitedNodes: TreeNodeSchema[] = [];
	const visitedAllowedTypes: NormalizedAnnotatedAllowedTypes[] = [];

	const mockVisitor: SchemaVisitor = {
		node: (schema) => visitedNodes.push(schema),
		allowedTypes: (types) => visitedAllowedTypes.push(types),
		walkStagedAllowedTypes,
	};

	walkAllowedTypes(annotatedAllowedTypes, mockVisitor);

	return [visitedNodes, visitedAllowedTypes];
}

describe("walk schema", () => {
	const sf = new SchemaFactoryAlpha("walk schema tests");

	it("calls visitor on single allowed type", () => {
		const annotated = makeAnnotated(sf.string);
		const annotatedTypes = {
			metadata: {},
			types: [annotated],
		};

		const [visitedNodes, visitedAllowedTypes] = mockWalkAllowedTypes(annotatedTypes);

		assert.deepEqual(visitedNodes, [annotated.type]);
		assert.deepEqual(visitedAllowedTypes, [annotatedTypes]);
	});

	it("calls visitor on nested allowed types", () => {
		const annotatedString = makeAnnotated(sf.string);
		const annotatedObject = makeAnnotated(
			sf.objectAlpha("annotatedObject", { name: annotatedString }),
		);
		const schema = sf.arrayAlpha("schema", annotatedObject);

		const [visitedNodes, visitedAllowedTypes] = mockWalkAllowedTypes(
			normalizeFieldSchema(schema).annotatedAllowedTypesNormalized,
		);

		assert.deepEqual(visitedNodes, [annotatedString.type, annotatedObject.type, schema]);
		assert.deepEqual(visitedAllowedTypes, [
			{ metadata: {}, types: [annotatedString] },
			{ metadata: {}, types: [annotatedObject] },
			{ metadata: {}, types: [{ metadata: {}, type: schema }] },
		]);
	});

	it("calls visitor on nested objects", () => {
		const annotatedString = makeAnnotated(sf.string);
		const annotatedObject3 = makeAnnotated(
			sf.objectAlpha("annotatedObject3", { name: annotatedString }),
		);
		const annotatedObject2 = makeAnnotated(
			sf.objectAlpha("annotatedObject2", { bar: annotatedObject3 }),
		);
		const annotatedObject = makeAnnotated(
			sf.objectAlpha("annotatedObject", { foo: annotatedObject2 }),
		);
		const schema = sf.arrayAlpha("schema", annotatedObject);

		const [visitedNodes, visitedAllowedTypes] = mockWalkAllowedTypes(
			normalizeFieldSchema(schema).annotatedAllowedTypesNormalized,
		);

		assert.deepEqual(visitedNodes, [
			annotatedString.type,
			annotatedObject3.type,
			annotatedObject2.type,
			annotatedObject.type,
			schema,
		]);
		assert.deepEqual(visitedAllowedTypes, [
			{ metadata: {}, types: [annotatedString] },
			{ metadata: {}, types: [annotatedObject3] },
			{ metadata: {}, types: [annotatedObject2] },
			{ metadata: {}, types: [annotatedObject] },
			{ metadata: {}, types: [{ metadata: {}, type: schema }] },
		]);
	});

	it("calls visitor on all child allowed types", () => {
		const annotatedString = makeAnnotated(sf.string);
		const annotatedNumber = makeAnnotated(sf.number);
		const schema = sf.arrayAlpha("schema", [annotatedNumber, annotatedString]);

		const [visitedNodes, visitedAllowedTypes] = mockWalkAllowedTypes(
			normalizeFieldSchema(schema).annotatedAllowedTypesNormalized,
		);

		assert.deepEqual(visitedNodes, [annotatedNumber.type, annotatedString.type, schema]);
		assert.deepEqual(visitedAllowedTypes, [
			{ metadata: {}, types: [annotatedNumber, annotatedString] },
			{ metadata: {}, types: [{ metadata: {}, type: schema }] },
		]);
	});

	it("calls visitor on different fields with the same allowed types", () => {
		const annotatedString = makeAnnotated(sf.string);
		const otherAnnotatedString = makeAnnotated(sf.string, "other");
		const annotatedObject = makeAnnotated(
			sf.objectAlpha("annotatedObject", {
				name: annotatedString,
				title: otherAnnotatedString,
			}),
		);

		const [visitedNodes, visitedAllowedTypes] = mockWalkAllowedTypes(
			normalizeFieldSchema(annotatedObject).annotatedAllowedTypesNormalized,
		);

		assert.deepEqual(visitedNodes, [annotatedString.type, annotatedObject.type]);
		assert.deepEqual(visitedAllowedTypes, [
			{ metadata: {}, types: [annotatedString] },
			{ metadata: {}, types: [otherAnnotatedString] },
			{ metadata: {}, types: [annotatedObject] },
		]);
	});

	it("handles empty allowed types", () => {
		const [visitedNodes, visitedAllowedTypes] = mockWalkAllowedTypes({
			metadata: {},
			types: [],
		});

		assert.deepEqual(visitedNodes, []);
		assert.deepEqual(visitedAllowedTypes, [{ metadata: {}, types: [] }]);
	});

	it("does not fail if visitor has no callbacks", () => {
		const annotatedString = makeAnnotated(sf.string);

		assert.doesNotThrow(() =>
			walkAllowedTypes({ metadata: {}, types: [annotatedString] }, {}),
		);
	});

	it("does not call visitor on staged allowed types by default", () => {
		const stagedString = sf.staged(SchemaFactoryAlpha.string);
		class TestObject extends sf.objectAlpha("TestObject", {
			name: stagedString,
		}) {}

		const [visitedNodes, visitedAllowedTypes] = mockWalkAllowedTypes(
			normalizeFieldSchema(TestObject).annotatedAllowedTypesNormalized,
		);

		assert.deepEqual(visitedNodes, [TestObject]);
		assert.deepEqual(visitedAllowedTypes, [
			{ metadata: {}, types: [stagedString] },
			{ metadata: {}, types: [{ metadata: {}, type: TestObject }] },
		]);
	});

	it("calls visitor on staged allowed types when walkStagedAllowedTypes is set to true", () => {
		const stagedString = sf.staged(SchemaFactoryAlpha.string);
		class TestObject extends sf.objectAlpha("TestObject", {
			name: stagedString,
		}) {}

		const [visitedNodes, visitedAllowedTypes] = mockWalkAllowedTypes(
			normalizeFieldSchema(TestObject).annotatedAllowedTypesNormalized,
			true,
		);

		assert.deepEqual(visitedNodes, [stagedString.type, TestObject]);
		assert.deepEqual(visitedAllowedTypes, [
			{ metadata: {}, types: [stagedString] },
			{ metadata: {}, types: [{ metadata: {}, type: TestObject }] },
		]);
	});
});
