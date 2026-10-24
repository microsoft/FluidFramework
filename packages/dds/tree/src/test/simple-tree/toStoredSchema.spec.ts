/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import {
	EmptyKey,
	ObjectNodeStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeStoredSchema,
} from "../../core/index.js";
import {
	cursorForJsonableTreeField,
	defaultSchemaPolicy,
	FieldKinds,
	isFieldInSchema,
	mapTreeFieldFromCursor,
} from "../../feature-libraries/index.js";
import { exportSimpleSchema } from "../../shared-tree/index.js";
import {
	ExpectStored,
	getTreeNodeSchemaPrivateData,
	StagedSchemaUpgradePolicy,
	Unchanged,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { getUnhydratedContext } from "../../simple-tree/createContext.js";
import {
	generateSchemaFromSimpleSchema,
	isObjectNodeSchema,
	SchemaFactory,
	SchemaFactoryAlpha,
	type SimpleAllowedTypeAttributes,
} from "../../simple-tree/index.js";
import {
	getStoredSchema,
	hasStagedSchema,
	toInitialSchema,
	simpleStoredSchemaToStoredSchema,
	toStoredSchema,
	transformSimpleNodeSchema,
	filterAllowedTypes,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/toStoredSchema.js";
// eslint-disable-next-line import-x/no-internal-modules
import { getSchemaDerivedData } from "../../simple-tree/treeSchema.js";
import { brand } from "../../util/index.js";
import {
	getStagedSchemaUpgrades,
	HasStagedAllowedTypes,
	HasStagedAllowedTypesAfterUpdate,
	HasStagedOptionalField,
	HasStagedOptionalFieldAfterUpdate,
	testDocuments,
} from "../testTrees.js";

function getTestDocumentSchemaData(name: string): TreeStoredSchema {
	return testDocuments.find((test) => test.name === name)?.schemaData ?? assert.fail();
}

function getObjectNodeSchema(
	schema: TreeStoredSchema,
	identifier: string,
): ObjectNodeStoredSchema {
	const node = schema.nodeSchema.get(brand(identifier)) ?? assert.fail();
	assert(node instanceof ObjectNodeStoredSchema);
	return node;
}

function typeSet(...identifiers: string[]): Set<TreeNodeSchemaIdentifier> {
	return new Set(identifiers.map((identifier) => brand<TreeNodeSchemaIdentifier>(identifier)));
}

describe("toStoredSchema", () => {
	describe("staging reachability", () => {
		for (const staged of [false, true]) {
			for (const descendantFirst of [false, true]) {
				it(`reuses descendant analysis (${staged ? "staged" : "unstaged"}, ${descendantFirst ? "C" : "B"} first)`, () => {
					const sf = new SchemaFactoryAlpha("stagingDescendants");
					class C extends sf.object("C", {
						value: staged ? sf.stagedOptional(sf.number) : sf.optional(sf.number),
					}) {}
					class B extends sf.object("B", { child: C }) {}
					class A extends sf.object("A", { child: B }) {}
					let bReads = 0;
					let cReads = 0;
					const bSchema = B;
					const cSchema = C;
					assert(isObjectNodeSchema(bSchema));
					assert(isObjectNodeSchema(cSchema));
					const bFields = bSchema.fields;
					const cFields = cSchema.fields;
					// Count annotation inspections, not schema discovery, which must still validate every root.
					Object.defineProperty(B, "fields", {
						get() {
							bReads++;
							return bFields;
						},
					});
					Object.defineProperty(C, "fields", {
						get() {
							cReads++;
							return cFields;
						},
					});

					assert.equal(getTreeNodeSchemaPrivateData(B).component?.hasStagedSchema, undefined);
					assert.equal(getTreeNodeSchemaPrivateData(C).component?.hasStagedSchema, undefined);
					if (descendantFirst) {
						assert.equal(hasStagedSchema(C), staged);
					}
					assert.equal(hasStagedSchema(B), staged);
					assert.equal(getTreeNodeSchemaPrivateData(B).component?.hasStagedSchema, staged);
					assert.equal(getTreeNodeSchemaPrivateData(C).component?.hasStagedSchema, staged);
					assert.equal(getSchemaDerivedData(B).unhydratedContext, undefined);
					assert.equal(hasStagedSchema(C), staged);
					assert.equal(hasStagedSchema(A), staged);
					assert.equal(getTreeNodeSchemaPrivateData(A).component?.hasStagedSchema, staged);
					assert.equal(bReads, 1);
					assert.equal(cReads, 1);
				});
			}
		}

		for (const reverse of [false, true]) {
			it(`detects staging through a cycle (${reverse ? "B" : "A"} first)`, () => {
				const sf = new SchemaFactoryAlpha("stagingCycle");
				class A extends sf.objectRecursive("A", {
					child: sf.optionalRecursive([() => B]),
					staged: sf.stagedOptional(sf.number),
				}) {}
				class B extends sf.objectRecursive("B", {
					child: sf.optionalRecursive([() => A]),
				}) {}

				// Both roots reach A's staged field; visiting the cycle must not cache an incomplete negative answer for B.
				for (const root of reverse ? [B, A] : [A, B]) {
					assert.equal(hasStagedSchema(root), true);
					assert.equal(getTreeNodeSchemaPrivateData(A).component?.hasStagedSchema, true);
					assert.equal(getTreeNodeSchemaPrivateData(B).component?.hasStagedSchema, true);
					assert.notDeepEqual(
						toStoredSchema(root, StagedSchemaUpgradePolicy.restrictive),
						toStoredSchema(root, StagedSchemaUpgradePolicy.permissive),
					);
				}
			});
		}

		it("resolves unstaged cycles separately from staged ancestors and cycles", () => {
			const sf = new SchemaFactoryAlpha("stagingComponents");
			class Unstaged extends sf.objectRecursive("Unstaged", {
				child: sf.optionalRecursive([() => Unstaged]),
			}) {}
			class A extends sf.objectRecursive("A", {
				child: sf.optionalRecursive([() => B]),
				unstaged: sf.optional(Unstaged),
			}) {}
			class B extends sf.objectRecursive("B", {
				child: sf.optionalRecursive([() => A]),
				staged: sf.stagedOptional(sf.number),
			}) {}
			class Parent extends sf.object("Parent", { child: A }) {}

			assert.equal(hasStagedSchema(Parent), true);
			for (const node of [Parent, A, B]) {
				assert.equal(getTreeNodeSchemaPrivateData(node).component?.hasStagedSchema, true);
			}
			assert.equal(getTreeNodeSchemaPrivateData(Unstaged).component?.hasStagedSchema, false);
			assert.equal(hasStagedSchema(Unstaged), false);
		});

		it("attributes staged references to the parent, not the referenced class", () => {
			const sf = new SchemaFactoryAlpha("stagingReference");
			class Child extends sf.object("Child", {}) {}
			class Parent extends sf.objectAlpha("Parent", {
				child: sf.types([sf.staged(Child)]),
			}) {}

			assert.equal(hasStagedSchema(Parent), true);
			assert.equal(getTreeNodeSchemaPrivateData(Parent).component?.hasStagedSchema, true);
			assert.equal(getTreeNodeSchemaPrivateData(Child).component?.hasStagedSchema, false);
			assert.equal(hasStagedSchema(Child), false);
		});

		it("still validates identifier conflicts between previously analyzed classes", () => {
			const sf = new SchemaFactoryAlpha("stagingConflicts");
			class A extends sf.object("Duplicate", {}) {}
			class B extends sf.object("Duplicate", {}) {}
			assert.equal(hasStagedSchema(A), false);
			assert.equal(hasStagedSchema(B), false);
			assert.throws(
				() => hasStagedSchema([A, B]),
				validateUsageError(/Multiple schema encountered with the identifier/),
			);
		});

		// Context creation calls toStoredSchema, so staging detection must not initialize contexts itself.
		for (const initializeContextFirst of [false, true]) {
			it(`works ${initializeContextFirst ? "after" : "before"} context initialization`, () => {
				const sf = new SchemaFactoryAlpha("stagingContext");
				class Staged extends sf.objectRecursive("Staged", {
					child: sf.optionalRecursive([() => Staged]),
					staged: sf.stagedOptional(sf.number),
				}) {}
				class Unstaged extends sf.objectRecursive("Unstaged", {
					child: sf.optionalRecursive([() => Unstaged]),
				}) {}

				for (const [root, expected] of [
					[Staged, true],
					[Unstaged, false],
				] as const) {
					if (initializeContextFirst) {
						getTreeNodeSchemaPrivateData(root).idempotentInitialize();
					}
					const data = getSchemaDerivedData(root);
					if (!initializeContextFirst) {
						assert.equal(data.unhydratedContext, undefined);
					}
					assert.equal(hasStagedSchema(root), expected);
					const context = getUnhydratedContext(root);
					assert.strictEqual(getSchemaDerivedData(root), data);
					assert.strictEqual(data.unhydratedContext, context);
					assert.strictEqual(getUnhydratedContext(root), context);
					assert.strictEqual(
						getTreeNodeSchemaPrivateData(root).idempotentInitialize().context,
						context,
					);
					assert.deepEqual(
						[...context.schema.values()],
						[...data.treeSchema.definitions.values()],
					);
					const permissive = toStoredSchema(root, StagedSchemaUpgradePolicy.permissive);
					assert.strictEqual(context.flexContext.schema, permissive);
					const restrictive = toStoredSchema(root, StagedSchemaUpgradePolicy.restrictive);
					assert.equal(restrictive === permissive, !expected);
				}
			});
		}

		it("does not confuse root staging with staging in the referenced node", () => {
			const sf = new SchemaFactoryAlpha("stagingRoot");
			const optional = sf.stagedOptional(sf.number);
			const allowedTypes = sf.types([sf.number, sf.staged(sf.string)]);
			assert.equal(hasStagedSchema(optional), true);
			assert.equal(hasStagedSchema(allowedTypes), true);
			assert.equal(hasStagedSchema(sf.number), false);
			assert.equal(hasStagedSchema(sf.string), false);
		});
	});

	describe("toStoredSchema", () => {
		it("minimal", () => {
			const schema = new SchemaFactory("com.example");
			class A extends schema.object("A", {}) {}
			const stored = toStoredSchema(A, StagedSchemaUpgradePolicy.restrictive);
			assert.equal(stored.rootFieldSchema.kind, FieldKinds.required.identifier);
			assert.deepEqual(stored.rootFieldSchema.types, new Set([A.identifier]));
			const storedNodeSchema = stored.nodeSchema.get(brand(A.identifier));
			assert(storedNodeSchema !== undefined);
			assert.deepEqual(storedNodeSchema.encodeV1(), {
				object: Object.create(null) as Record<string, never>,
			});
		});
		it("name collision", () => {
			const schema = new SchemaFactory("com.example");
			class A extends schema.object("A", {}) {}
			class B extends schema.object("A", {}) {}

			assert.throws(
				() => toStoredSchema([A, B], StagedSchemaUpgradePolicy.restrictive),
				/identifier "com.example.A"/,
			);
		});
		it("builtins are the same", () => {
			const schema = new SchemaFactory("com.example");
			const schema2 = new SchemaFactory("com.example");
			assert.equal(schema.number, schema2.number);
		});

		describe("test documents", () => {
			for (const testCase of testDocuments) {
				describe(testCase.name, () => {
					if (
						testCase.requiresStagedSchema === true ||
						testCase.hasUnknownOptionalFieldSchema === true
					) {
						// If the document is relying on forwards compatibility options (staged schema or unknown optional fields),
						// then we do not expect to be able to get the same stored schema as in the document by deriving a stored schema from the view schema.
						// For cases just using staged schema, this validates that the staged schema is being discarded due to StagedSchemaUpgradePolicy.restrictive,
						// but the main reason for this conditional is to avoid these cases breaking the "Matches document" case below.
						it("Does not match document", () => {
							const restrictive = toStoredSchema(
								testCase.schema,
								StagedSchemaUpgradePolicy.restrictive,
							);
							assert.notDeepEqual(restrictive, testCase.schemaData);
						});
					} else {
						// Ensure that the stored schema captured in these test documents matches what we would generate from the view schema.
						// We can only test this in cases where the document is not relying on forwards compatibility options.
						it("Matches document", () => {
							const restrictive = toStoredSchema(
								testCase.schema,
								StagedSchemaUpgradePolicy.restrictive,
							);
							assert.deepEqual(restrictive, testCase.schemaData);
						});
					}

					it("Restrictive and Permissive", () => {
						const restrictive = toStoredSchema(
							testCase.schema,
							StagedSchemaUpgradePolicy.restrictive,
						);
						const permissive = toStoredSchema(
							testCase.schema,
							StagedSchemaUpgradePolicy.permissive,
						);

						// The restrictive case, used for initial schemas and upgrades, does not include any staged schema features.
						// The permissive case, used for unhydrated trees, includes all staged schema features.
						// They should be equal if and only if there are no staged schema features.
						if (getStagedSchemaUpgrades(testCase.schema).size > 0) {
							assert.notDeepEqual(restrictive, permissive);
						} else {
							assert.deepEqual(restrictive, permissive);
						}

						const tree = mapTreeFieldFromCursor(
							cursorForJsonableTreeField(testCase.treeFactory()),
						);

						// Our test case has an actual tree which is known to comply with its existing stored schema, and the test case's view schema.
						// Therefore, the tree must be in schema for the permissive case, with the exception of any unknown optional fields.
						// We can assert this here.
						// This is a sanity check that the produced permissive schema actually allows the trees it's supposed to.
						// This could catch bugs where simple to stored to simple round trip is correct, but the corresponding stored schema is wrong.
						isFieldInSchema(
							tree,
							permissive.rootFieldSchema,
							{
								schema: permissive,
								policy: defaultSchemaPolicy,
							},
							() => {
								assert(testCase.hasUnknownOptionalFields);
								return true;
							},
						);

						const restrictiveOutOfSchema = isFieldInSchema(
							tree,
							restrictive.rootFieldSchema,
							{
								schema: restrictive,
								policy: defaultSchemaPolicy,
							},
							() => true,
						);
						// Similar to above, we check the produced restrictive schema actually behaves correctly for the test tree.
						assert.equal(
							restrictiveOutOfSchema === true,
							testCase.requiresStagedSchema === true ||
								testCase.hasUnknownOptionalFields === true,
						);

						// These aren't the tests for "exportSimpleSchema", but toStored should work with them, so we can use them to check consistency and round trip.
						const simpleFromRestrictive = exportSimpleSchema(restrictive);
						const simpleFromPermissive = exportSimpleSchema(permissive);

						if (getStagedSchemaUpgrades(testCase.schema).size > 0) {
							assert.notDeepEqual(simpleFromRestrictive, simpleFromPermissive);
						} else {
							assert.deepEqual(simpleFromRestrictive, simpleFromPermissive);
						}

						const restrictive2 = simpleStoredSchemaToStoredSchema(simpleFromRestrictive);
						const permissive2 = simpleStoredSchemaToStoredSchema(simpleFromPermissive);

						assert.deepEqual(restrictive2, restrictive);
						assert.deepEqual(permissive2, permissive);

						// To further ensure toStoredSchema works with the other schema transforming APIs,
						// validate it with generateSchemaFromSimpleSchema to round trip through view schema.
						// View schema generated from stored schema will never contain staged schema:
						// they will either have been removed, or baked in (with the fact they were staged having been lost).
						const restrictive3 = toStoredSchema(
							generateSchemaFromSimpleSchema(simpleFromRestrictive).root,
							{
								includeStaged: () => assert.fail(),
								includeStagedOptional: () => assert.fail(),
							},
						);
						const permissive3 = toStoredSchema(
							generateSchemaFromSimpleSchema(simpleFromPermissive).root,
							{
								includeStaged: () => assert.fail(),
								includeStagedOptional: () => assert.fail(),
							},
						);

						assert.deepEqual(restrictive3, restrictive);
						assert.deepEqual(permissive3, permissive);
					});
				});
			}

			it("partially includes staged schema by upgrade identity", () => {
				// Test that the filtering logic in `toStoredSchema` works correctly.
				// These test trees compare the upgrade identity of the staged schema to implement the filter.
				// Schemas that are included by the filter should be present in the resulting stored schema, and any other staged schema should not.
				// See testTrees.ts for the test cases: "NestedMultiStage with one upgrade" and "NestedStagedOptional with one upgrade".
				const allowedTypesNode = getObjectNodeSchema(
					getTestDocumentSchemaData("NestedMultiStage with one upgrade"),
					"test.NestedMultiStage",
				);

				// See NestedMultiStage in testTrees.ts for the definition.
				// Field a: optional([staged(number)]) -> optional, empty types.
				// Field b: required([staged(MapWithStaged), null]) -> required, null only.
				// Field c: required([staged(ArrayWithStaged), null]) -> required, null and ArrayWithStaged.
				const fieldA = allowedTypesNode.getFieldSchema(brand("a"));
				assert.equal(fieldA.kind, FieldKinds.optional.identifier);
				assert.deepEqual(fieldA.types, typeSet());

				const fieldB = allowedTypesNode.getFieldSchema(brand("b"));
				assert.equal(fieldB.kind, FieldKinds.required.identifier);
				assert.deepEqual(fieldB.types, typeSet("com.fluidframework.leaf.null"));

				const fieldC = allowedTypesNode.getFieldSchema(brand("c"));
				assert.equal(fieldC.kind, FieldKinds.required.identifier);
				assert.deepEqual(
					fieldC.types,
					typeSet("com.fluidframework.leaf.null", "test.ArrayWithStaged"),
				);

				const stagedOptionalNode = getObjectNodeSchema(
					getTestDocumentSchemaData("NestedStagedOptional with one upgrade"),
					"test.NestedStagedOptional",
				);

				// See NestedStagedOptional in testTrees.ts for the definition.
				// Field a: stagedOptional(number) -> optional number.
				// Field b: stagedOptional(string) -> required string.
				const stagedOptionalFieldA = stagedOptionalNode.getFieldSchema(brand("a"));
				assert.equal(stagedOptionalFieldA.kind, FieldKinds.optional.identifier);
				assert.deepEqual(
					stagedOptionalFieldA.types,
					typeSet("com.fluidframework.leaf.number"),
				);

				const stagedOptionalFieldB = stagedOptionalNode.getFieldSchema(brand("b"));
				assert.equal(stagedOptionalFieldB.kind, FieldKinds.required.identifier);
				assert.deepEqual(
					stagedOptionalFieldB.types,
					typeSet("com.fluidframework.leaf.string"),
				);
			});
		});
	});

	describe("toInitialSchema with staged schema", () => {
		it("root", () => {
			const converted = toInitialSchema(
				SchemaFactoryAlpha.types([
					SchemaFactoryAlpha.number,
					SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
				]),
			);
			const field = converted.rootFieldSchema;
			assert.equal(field.types.size, 1);
		});

		it("shallow", () => {
			const schemaFactory = new SchemaFactoryAlpha("com.example");
			class TestArray extends schemaFactory.arrayAlpha(
				"TestArray",
				SchemaFactoryAlpha.types([
					SchemaFactoryAlpha.number,
					SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
				]),
			) {}

			const converted = toInitialSchema(TestArray);
			const node = converted.nodeSchema.get(brand(TestArray.identifier)) ?? assert.fail();
			const field = node.getFieldSchema(EmptyKey);
			assert.equal(field.types.size, 1);
		});

		it("nested", () => {
			const schemaFactory = new SchemaFactoryAlpha("com.example");
			class TestArray extends schemaFactory.arrayAlpha(
				"TestArray",
				SchemaFactoryAlpha.types([
					SchemaFactoryAlpha.number,
					SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
				]),
			) {}
			class Root extends schemaFactory.objectAlpha("TestObject", {
				foo: TestArray,
			}) {}
			const converted = toInitialSchema(Root);
			const node = converted.nodeSchema.get(brand(TestArray.identifier)) ?? assert.fail();
			const field = node.getFieldSchema(EmptyKey);
			assert.equal(field.types.size, 1);
		});
	});

	describe("filterAllowedTypes", () => {
		it("minimal", () => {
			const stored = filterAllowedTypes(
				SchemaFactoryAlpha.required(SchemaFactory.number).simpleAllowedTypes,
				StagedSchemaUpgradePolicy.restrictive,
			);
			assert.deepEqual(
				stored,
				new Map([[SchemaFactory.number.identifier, { isStaged: undefined }]]),
			);
		});

		it("staged", () => {
			const storedRestrictive = filterAllowedTypes(
				SchemaFactoryAlpha.required(
					SchemaFactoryAlpha.types([SchemaFactoryAlpha.staged(SchemaFactory.number)]),
				).simpleAllowedTypes,
				StagedSchemaUpgradePolicy.restrictive,
			);
			const staged = SchemaFactoryAlpha.staged(SchemaFactory.number);
			const storedPermissive = filterAllowedTypes(
				SchemaFactoryAlpha.required(SchemaFactoryAlpha.types([staged])).simpleAllowedTypes,
				StagedSchemaUpgradePolicy.permissive,
			);
			const view = filterAllowedTypes(
				SchemaFactoryAlpha.required(
					SchemaFactoryAlpha.types([SchemaFactoryAlpha.staged(SchemaFactory.number)]),
				).simpleAllowedTypes,
				Unchanged,
			);
			assert.deepEqual(storedRestrictive, new Map());
			assert.deepEqual(
				storedPermissive,
				new Map([[SchemaFactory.number.identifier, { isStaged: undefined }]]),
			);
			assert.deepEqual(
				view,
				new Map([
					[
						SchemaFactory.number.identifier,
						{
							isStaged: staged.metadata.stagedSchemaUpgrade,
						} satisfies SimpleAllowedTypeAttributes,
					],
				]),
			);

			assert.throws(
				() =>
					filterAllowedTypes(
						SchemaFactoryAlpha.required(
							SchemaFactoryAlpha.types([SchemaFactoryAlpha.staged(SchemaFactory.number)]),
						).simpleAllowedTypes,
						ExpectStored,
					),
				validateUsageError(
					/use of `ExpectStored`, but view schema specific content was encountered/,
				),
			);
		});
	});

	describe("getStoredSchema", () => {
		it("options", () => {
			const v1 = getStoredSchema(
				transformSimpleNodeSchema(
					HasStagedAllowedTypes,
					StagedSchemaUpgradePolicy.restrictive,
				),
			);
			const v2 = getStoredSchema(
				transformSimpleNodeSchema(
					HasStagedAllowedTypesAfterUpdate,
					StagedSchemaUpgradePolicy.restrictive,
				),
			);
			const v1Permissive = getStoredSchema(
				transformSimpleNodeSchema(HasStagedAllowedTypes, StagedSchemaUpgradePolicy.permissive),
			);
			assert.notDeepEqual(v1.encodeV1(), v1Permissive.encodeV1());
			assert.deepEqual(v1Permissive.encodeV1(), v2.encodeV1());

			const stagedOptionalV1 = getStoredSchema(
				transformSimpleNodeSchema(
					HasStagedOptionalField,
					StagedSchemaUpgradePolicy.restrictive,
				),
			);
			const stagedOptionalV2 = getStoredSchema(
				transformSimpleNodeSchema(
					HasStagedOptionalFieldAfterUpdate,
					StagedSchemaUpgradePolicy.restrictive,
				),
			);
			const stagedOptionalV1Permissive = getStoredSchema(
				transformSimpleNodeSchema(
					HasStagedOptionalField,
					StagedSchemaUpgradePolicy.permissive,
				),
			);
			assert.notDeepEqual(stagedOptionalV1.encodeV1(), stagedOptionalV1Permissive.encodeV1());
			assert.deepEqual(stagedOptionalV1Permissive.encodeV1(), stagedOptionalV2.encodeV1());
		});
	});
});
