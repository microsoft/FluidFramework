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
	AnnotatedAllowedTypesInternal,
	walkAllowedTypes,
	type AllowedTypesFullEvaluated,
	type AnnotatedAllowedType,
	type SchemaVisitor,
	// eslint-disable-next-line import-x/no-internal-modules
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

function recordWalkAllowedTypes(
	annotatedAllowedTypes: AllowedTypesFullEvaluated,
	walkStagedAllowedTypes?: true,
): [TreeNodeSchema[], readonly AllowedTypesFullEvaluated[]] {
	const visitedNodes: TreeNodeSchema[] = [];
	const visitedAllowedTypes: AllowedTypesFullEvaluated[] = [];

	const visitor: SchemaVisitor = {
		node: (schema) => visitedNodes.push(schema),
		allowedTypes: (types) => visitedAllowedTypes.push(types),
		allowedTypeFilter: (type) =>
			type.metadata.stagedSchemaUpgrade === undefined || (walkStagedAllowedTypes ?? false),
	};

	walkAllowedTypes(annotatedAllowedTypes, visitor);

	return [visitedNodes, visitedAllowedTypes];
}

describe("walk schema", () => {
	const sf = new SchemaFactoryAlpha("walk schema tests");

	it("calls visitor on single allowed type", () => {
		const annotated = makeAnnotated(sf.string);
		const annotatedTypes = AnnotatedAllowedTypesInternal.create([annotated]);

		const [visitedNodes, visitedAllowedTypes] = recordWalkAllowedTypes(annotatedTypes);

		assert.deepEqual(visitedNodes, [annotated.type]);
		assert.deepEqual(visitedAllowedTypes, [annotatedTypes]);
	});

	it("calls visitor on nested allowed types", () => {
		const annotatedString = SchemaFactoryAlpha.types([makeAnnotated(sf.string)]);
		const annotatedObject = SchemaFactoryAlpha.types([
			makeAnnotated(sf.objectAlpha("annotatedObject", { name: annotatedString })),
		]);
		const schema = sf.arrayAlpha("schema", annotatedObject);

		const [visitedNodes, visitedAllowedTypes] = recordWalkAllowedTypes(
			normalizeFieldSchema(schema).allowedTypesFull.evaluate(),
		);

		assert.deepEqual(visitedNodes, [annotatedString[0], annotatedObject[0], schema]);
		assert.equal(visitedAllowedTypes.length, 3);
		assert.equal(visitedAllowedTypes[0], annotatedString);
		assert.equal(visitedAllowedTypes[1], annotatedObject);
		assert.deepEqual(visitedAllowedTypes[2], SchemaFactoryAlpha.types([schema]));
	});

	it("calls visitor on nested objects", () => {
		const annotatedString = SchemaFactoryAlpha.types([makeAnnotated(sf.string)]);
		const annotatedObject3 = SchemaFactoryAlpha.types([
			makeAnnotated(
				sf.objectAlpha("annotatedObject3", {
					name: annotatedString,
				}),
			),
		]);
		const annotatedObject2 = SchemaFactoryAlpha.types([
			makeAnnotated(
				sf.objectAlpha("annotatedObject2", {
					bar: annotatedObject3,
				}),
			),
		]);
		const annotatedObject = SchemaFactoryAlpha.types([
			makeAnnotated(sf.objectAlpha("annotatedObject", { foo: annotatedObject2 })),
		]);
		const schema = sf.arrayAlpha("schema", annotatedObject);

		const [visitedNodes, visitedAllowedTypes] = recordWalkAllowedTypes(
			normalizeFieldSchema(schema).allowedTypesFull.evaluate(),
		);

		assert.deepEqual(visitedNodes, [
			annotatedString[0],
			annotatedObject3[0],
			annotatedObject2[0],
			annotatedObject[0],
			schema,
		]);
		assert.deepEqual(visitedAllowedTypes, [
			annotatedString,
			annotatedObject3,
			annotatedObject2,
			annotatedObject,
			SchemaFactoryAlpha.types([schema]),
		]);
	});

	it("calls visitor on all child allowed types", () => {
		const annotatedString = makeAnnotated(sf.string);
		const annotatedNumber = makeAnnotated(sf.number);
		const annotatedUnion = SchemaFactoryAlpha.types([annotatedNumber, annotatedString]);
		const schema = sf.arrayAlpha("schema", annotatedUnion);

		const [visitedNodes, visitedAllowedTypes] = recordWalkAllowedTypes(
			normalizeFieldSchema(schema).allowedTypesFull.evaluate(),
		);

		assert.deepEqual(visitedNodes, [annotatedNumber.type, annotatedString.type, schema]);
		assert.deepEqual(visitedAllowedTypes, [
			annotatedUnion,
			SchemaFactoryAlpha.types([schema]),
		]);
	});

	it("calls visitor on different fields with the same allowed types", () => {
		const annotatedString = SchemaFactoryAlpha.types([makeAnnotated(sf.string)]);
		const otherAnnotatedString = SchemaFactoryAlpha.types([makeAnnotated(sf.string, "other")]);
		const annotatedObject = SchemaFactoryAlpha.types([
			makeAnnotated(
				sf.objectAlpha("annotatedObject", {
					name: annotatedString,
					title: otherAnnotatedString,
				}),
			),
		]);

		const [visitedNodes, visitedAllowedTypes] = recordWalkAllowedTypes(
			normalizeFieldSchema(annotatedObject).allowedTypesFull.evaluate(),
		);

		assert.deepEqual(visitedNodes, [annotatedString[0], annotatedObject[0]]);
		assert.deepEqual(visitedAllowedTypes, [
			annotatedString,
			otherAnnotatedString,
			annotatedObject,
		]);
	});

	it("handles empty allowed types", () => {
		const [visitedNodes, visitedAllowedTypes] = recordWalkAllowedTypes(
			AnnotatedAllowedTypesInternal.create([]),
		);

		assert.deepEqual(visitedNodes, []);
		assert.deepEqual(visitedAllowedTypes, [SchemaFactoryAlpha.types([])]);
	});

	it("does not fail if visitor has no callbacks", () => {
		const annotatedString = makeAnnotated(sf.string);

		assert.doesNotThrow(() =>
			walkAllowedTypes(AnnotatedAllowedTypesInternal.create([annotatedString]), {}),
		);
	});

	it("does not call visitor on staged allowed types by default", () => {
		const stagedString = SchemaFactoryAlpha.types([
			SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
		]);
		class TestObject extends sf.objectAlpha("TestObject", {
			name: stagedString,
		}) {}

		const [visitedNodes, visitedAllowedTypes] = recordWalkAllowedTypes(
			normalizeFieldSchema(TestObject).allowedTypesFull.evaluate(),
		);

		assert.deepEqual(visitedNodes, [TestObject]);
		assert.deepEqual(visitedAllowedTypes, [
			stagedString,
			SchemaFactoryAlpha.types([TestObject]),
		]);
	});

	it("calls visitor on staged allowed types when walkStagedAllowedTypes is set to true", () => {
		const stagedString = SchemaFactoryAlpha.types([
			SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
		]);
		class TestObject extends sf.objectAlpha("TestObject", {
			name: stagedString,
		}) {}

		const [visitedNodes, visitedAllowedTypes] = recordWalkAllowedTypes(
			normalizeFieldSchema(TestObject).allowedTypesFull.evaluate(),
			true,
		);

		assert.deepEqual(visitedNodes, [stagedString[0], TestObject]);
		assert.deepEqual(visitedAllowedTypes, [
			stagedString,
			SchemaFactoryAlpha.types([TestObject]),
		]);
	});
});
