/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { currentVersion } from "../../codec/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Tests persisted schema encoding.
import { schemaCodecBuilder } from "../../feature-libraries/schema-index/codec.js";
// eslint-disable-next-line import-x/no-internal-modules
import { createFieldSchema } from "../../simple-tree/fieldSchema.js";
import {
	computeSchemaHash,
	encodeSchemaCompatibilitySnapshot,
	normalizeFieldSchema,
} from "../../simple-tree/index.js";
import { createSchemaGraph } from "./schemaTestUtils.js";

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
	StagedSchemaUpgradePolicy,
	Unchanged,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/core/index.js";
import {
	generateSchemaFromSimpleSchema,
	isObjectNodeSchema,
	SchemaFactory,
	SchemaFactoryAlpha,
	TreeViewConfigurationAlpha,
	type ImplicitFieldSchema,
	type SimpleAllowedTypeAttributes,
} from "../../simple-tree/index.js";
import {
	getStoredSchema,
	simpleStoredSchemaToStoredSchema,
	transformSimpleNodeSchema,
	filterAllowedTypes,
	transformSimpleSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/toStoredSchema.js";
import {
	createTreeSchema,
	getRootSchemaDerivedData,
	toInitialSchema,
	toStoredSchema,
	// eslint-disable-next-line import-x/no-internal-modules -- Tests cached view-schema conversion.
} from "../../simple-tree/treeSchema.js";
import { brand } from "../../util/index.js";
import {
	getStagedSchemaUpgrades,
	HasStagedAllowedTypes,
	HasStagedAllowedTypesAfterUpdate,
	HasStagedOptionalField,
	HasStagedOptionalFieldAfterUpdate,
	testDocuments,
	testSchema,
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

// Context identity, initialization order, and failed context construction are covered in createContext.spec.ts.
describe("toStoredSchema", () => {
	describe("root and policy caching", () => {
		/**
		 * Converts through the uncached graph and transformation path, independently of policy-result caches.
		 */
		function reference(
			root: ImplicitFieldSchema,
			policy: StagedSchemaUpgradePolicy,
		): TreeStoredSchema {
			return simpleStoredSchemaToStoredSchema(
				transformSimpleSchema(createTreeSchema(root), policy),
			);
		}

		it("reuses cached view-schema data for each policy without materializing descendant maps", () => {
			const sf = new SchemaFactoryAlpha("cachedViewSchema");
			class Child extends sf.object("Child", {}) {}
			class Node extends sf.object("Node", { child: Child }) {}
			const root = sf.types([sf.staged(Node)]);
			const data = getRootSchemaDerivedData(root);
			const components = new Set(data.components);
			for (const component of components) {
				for (const dependency of component.dependencies) {
					components.add(dependency);
				}
			}
			for (const component of components) {
				Object.defineProperty(component, "definitions", {
					get: () => assert.fail("Conversion must reuse the root's cached view schema"),
				});
				Object.defineProperty(component, "members", {
					get: () => assert.fail("Conversion must not repeat component traversal"),
				});
			}
			const restrictive = toStoredSchema(root, StagedSchemaUpgradePolicy.restrictive);
			const permissive = toStoredSchema(root, StagedSchemaUpgradePolicy.permissive);
			assert.equal(restrictive.nodeSchema.size, 0);
			assert.deepEqual(
				new Set(permissive.nodeSchema.keys()),
				typeSet(Node.identifier, Child.identifier),
			);
			assert.strictEqual(
				toStoredSchema(root, StagedSchemaUpgradePolicy.restrictive),
				restrictive,
			);
			assert.strictEqual(
				toStoredSchema(root, StagedSchemaUpgradePolicy.permissive),
				permissive,
			);
			assert.strictEqual(getRootSchemaDerivedData(root), data);
		});

		for (const reverse of [false, true]) {
			it(`caches cyclic schemas by root and policy (${reverse})`, () => {
				const sf = new SchemaFactoryAlpha("filteredPolicyCycle");
				class A extends sf.objectRecursive("A", {
					child: sf.optionalRecursive([() => B]),
				}) {}
				class B extends sf.objectRecursive("B", {
					child: sf.optionalRecursive([() => A]),
					value: sf.stagedOptional(sf.number),
				}) {}
				const policies = [
					{ ...StagedSchemaUpgradePolicy.restrictive },
					{ ...StagedSchemaUpgradePolicy.permissive },
				];
				const roots = reverse ? [B, A] : [A, B];
				getRootSchemaDerivedData(A);
				const expected = policies.map((policy) =>
					roots.map((root) => reference(root, policy)),
				);
				let reads = 0;
				for (const node of roots) {
					const fields = node.fields;
					Object.defineProperty(node, "fields", {
						get() {
							reads++;
							return fields;
						},
					});
				}
				for (const [i, policy] of policies.entries()) {
					const first = toStoredSchema(roots[0] ?? assert.fail(), policy);
					const firstReads = reads;
					assert.strictEqual(toStoredSchema(roots[0] ?? assert.fail(), policy), first);
					assert.equal(reads, firstReads);
					const second = toStoredSchema(roots[1] ?? assert.fail(), policy);
					const secondReads = reads;
					assert.strictEqual(toStoredSchema(roots[1] ?? assert.fail(), policy), second);
					assert.equal(reads, secondReads);
					assert.notStrictEqual(first, second);
					assert.deepEqual(first.nodeSchema, second.nodeSchema);
					assert.deepEqual(first, expected[i]?.[0]);
					assert.deepEqual(second, expected[i]?.[1]);
				}
				assert.notStrictEqual(
					toStoredSchema(A, policies[0] ?? assert.fail()).nodeSchema,
					toStoredSchema(A, policies[1] ?? assert.fail()).nodeSchema,
				);
			});
		}

		it("preserves staging-free descendants when ancestor and root-field policies differ", () => {
			const sf = new SchemaFactoryAlpha("commonPolicyComponent");
			class Leaf extends sf.object("Leaf", { value: sf.number }) {}
			class Staged extends sf.objectAlpha("Staged", {
				child: Leaf,
				future: sf.stagedOptional(sf.string),
			}) {}
			const restrictive = toStoredSchema(Staged, { ...StagedSchemaUpgradePolicy.restrictive });
			const permissive = toStoredSchema(Staged, { ...StagedSchemaUpgradePolicy.permissive });
			const leaf = toStoredSchema(Leaf, StagedSchemaUpgradePolicy.permissive);
			const id = brand<TreeNodeSchemaIdentifier>(Leaf.identifier);
			assert.deepEqual(restrictive.nodeSchema.get(id), permissive.nodeSchema.get(id));
			assert.deepEqual(leaf.nodeSchema.get(id), restrictive.nodeSchema.get(id));
			const stagedRoot = sf.stagedOptional(Leaf);
			const strictField = toStoredSchema(stagedRoot, StagedSchemaUpgradePolicy.restrictive);
			const permissiveField = toStoredSchema(stagedRoot, StagedSchemaUpgradePolicy.permissive);
			assert.notEqual(strictField.rootFieldSchema.kind, permissiveField.rootFieldSchema.kind);
			assert.deepEqual(strictField.nodeSchema, leaf.nodeSchema);
			assert.deepEqual(permissiveField.nodeSchema, leaf.nodeSchema);
		});

		it("converts each reachable node once per root in a diamond", () => {
			const sf = new SchemaFactoryAlpha("policyDiamond");
			class Leaf extends sf.object("Leaf", { value: sf.stagedOptional(sf.number) }) {}
			class Left extends sf.object("Left", { child: Leaf }) {}
			class Right extends sf.object("Right", { child: Leaf }) {}
			class Root extends sf.object("Root", { left: Left, right: Right }) {}
			const policy = { ...StagedSchemaUpgradePolicy.restrictive };
			getRootSchemaDerivedData(Root);
			const expected = reference(Root, policy);
			let reads = 0;
			for (const node of [Root, Left, Right, Leaf]) {
				assert(isObjectNodeSchema(node));
				const fields = node.fields;
				Object.defineProperty(node, "fields", {
					get() {
						reads++;
						return fields;
					},
				});
			}
			const root = toStoredSchema(Root, policy);
			assert.equal(reads, 4);
			assert.strictEqual(toStoredSchema(Root, policy), root);
			assert.equal(reads, 4);
			const left = toStoredSchema(Left, policy);
			const right = toStoredSchema(Right, policy);
			const leaf = toStoredSchema(Leaf, policy);
			assert.deepEqual(root, expected);
			assert.equal(left.nodeSchema.size, 3);
			assert.equal(right.nodeSchema.size, 3);
			assert.notStrictEqual(left.nodeSchema, right.nodeSchema);
			const id = brand<TreeNodeSchemaIdentifier>(Leaf.identifier);
			assert.deepEqual(left.nodeSchema.get(id), leaf.nodeSchema.get(id));
			assert.deepEqual(right.nodeSchema.get(id), leaf.nodeSchema.get(id));
		});

		it("does not normalize a policy merely because filtering removed reachable staging", () => {
			const sf = new SchemaFactoryAlpha("filteredNotNormalized");
			class Child extends sf.object("Child", {}) {}
			class Root extends sf.objectAlpha("Root", {
				future: sf.optional(sf.types([sf.staged(Child)])),
			}) {}
			const restrictive = toStoredSchema(Root, StagedSchemaUpgradePolicy.restrictive);
			assert.equal(restrictive.nodeSchema.size, 1);
			const permissive = toStoredSchema(Root, StagedSchemaUpgradePolicy.permissive);
			assert.equal(permissive.nodeSchema.size, 2);
			assert.notStrictEqual(restrictive.nodeSchema, permissive.nodeSchema);
			assert.deepEqual(restrictive, reference(Root, StagedSchemaUpgradePolicy.restrictive));
			assert.deepEqual(permissive, reference(Root, StagedSchemaUpgradePolicy.permissive));
			const empty = toStoredSchema(
				sf.types([sf.staged(Root)]),
				StagedSchemaUpgradePolicy.restrictive,
			);
			assert.equal(empty.nodeSchema.size, 0);
		});

		it("propagates stored-schema conversion errors", () => {
			const sf = new SchemaFactoryAlpha("policyFailure");
			class A extends sf.objectRecursive("A", {
				value: sf.stagedOptional(sf.number),
				child: sf.optionalRecursive([() => B]),
			}) {}
			class B extends sf.objectRecursive("B", {
				child: sf.optionalRecursive([() => A]),
			}) {}
			getRootSchemaDerivedData(A);
			Object.defineProperty(B, "persistedMetadata", {
				get() {
					throw new Error("conversion failure");
				},
			});
			const policy = { ...StagedSchemaUpgradePolicy.restrictive };
			assert.throws(() => toStoredSchema(A, policy), /conversion failure/);
		});

		for (const staged of [false, true]) {
			it(`rejects recursive standalone conversion from metadata (staged: ${staged})`, () => {
				const sf = new SchemaFactoryAlpha("recursiveConversion");
				class Node extends sf.object("Node", {
					value: staged ? sf.stagedOptional(sf.number) : sf.optional(sf.number),
				}) {}
				const policy = StagedSchemaUpgradePolicy.restrictive;
				Object.defineProperty(Node, "persistedMetadata", {
					get() {
						toStoredSchema(Node, policy);
						return undefined;
					},
				});
				assert.throws(
					() => toStoredSchema(Node, policy),
					validateUsageError(/Schema initialization must not be reentrant/),
				);
			});
		}

		for (const callback of ["includeStaged", "includeStagedOptional"] as const) {
			it(`rejects node initialization from a ${callback} policy callback`, () => {
				const sf = new SchemaFactoryAlpha("reentrantPolicy");
				class Other extends sf.object("Other", {}) {}
				class Node extends sf.object("Node", {
					stagedType: sf.optional(sf.types([sf.staged(sf.number)])),
					stagedField: sf.stagedOptional(sf.number),
				}) {}
				const policy: StagedSchemaUpgradePolicy = {
					...StagedSchemaUpgradePolicy.permissive,
					[callback]: () => {
						new Other({});
						return true;
					},
				};
				assert.throws(
					() =>
						new TreeViewConfigurationAlpha({
							schema: Node,
							stagedUpgradePolicy: policy,
						}),
					validateUsageError(/Schema initialization must not be reentrant/),
				);
			});
		}

		for (const reverse of [false, true]) {
			it(`keeps policy-specific topology separate when a staged edge splits a component (${reverse})`, () => {
				const sf = new SchemaFactoryAlpha("split");
				class A extends sf.objectRecursive("A", {
					child: sf.optionalRecursive([() => B]),
				}) {}
				class B extends sf.objectRecursive("B", {
					child: sf.optionalRecursive(sf.types([sf.staged(() => A)])),
				}) {}
				for (const root of reverse ? [B, A] : [A, B]) {
					assert.deepEqual(
						toStoredSchema(root, StagedSchemaUpgradePolicy.restrictive),
						reference(root, StagedSchemaUpgradePolicy.restrictive),
					);
				}
				assert.equal(
					toStoredSchema(A, StagedSchemaUpgradePolicy.restrictive).nodeSchema.size,
					2,
				);
				assert.equal(
					toStoredSchema(B, StagedSchemaUpgradePolicy.restrictive).nodeSchema.size,
					1,
				);
				assert.equal(
					toStoredSchema(B, StagedSchemaUpgradePolicy.permissive).nodeSchema.size,
					2,
				);
				assert.deepEqual(
					toStoredSchema(A, StagedSchemaUpgradePolicy.permissive).nodeSchema,
					toStoredSchema(B, StagedSchemaUpgradePolicy.permissive).nodeSchema,
				);
				const customPermissive = { ...StagedSchemaUpgradePolicy.permissive };
				assert.deepEqual(
					toStoredSchema(A, customPermissive).nodeSchema,
					toStoredSchema(B, customPermissive).nodeSchema,
				);
			});
		}
		it("shares staging-free conversions across policies without evaluating them", () => {
			const sf = new SchemaFactoryAlpha("unstagedPolicies");
			class Node extends sf.object("Node", {}) {}
			const unusedPolicy: StagedSchemaUpgradePolicy = {
				includeStaged: () => assert.fail("Staging-free conversion must not evaluate policies"),
				includeStagedOptional: () =>
					assert.fail("Staging-free conversion must not evaluate policies"),
			};
			const stored = toStoredSchema(Node, unusedPolicy);
			assert.strictEqual(toStoredSchema(Node, unusedPolicy), stored);
			assert.strictEqual(toStoredSchema(Node, StagedSchemaUpgradePolicy.restrictive), stored);
			assert.strictEqual(toStoredSchema(Node, StagedSchemaUpgradePolicy.permissive), stored);
			assert.deepEqual(stored, reference(Node, StagedSchemaUpgradePolicy.permissive));
		});
		it("preserves root field kind and metadata in separate root caches", () => {
			const sf = new SchemaFactoryAlpha("rootCaches");
			class A extends sf.objectRecursive("A", {
				child: sf.optionalRecursive([() => B]),
			}) {}
			class B extends sf.objectRecursive("B", {
				child: sf.optionalRecursive([() => A]),
			}) {}
			getRootSchemaDerivedData(A);
			let reads = 0;
			for (const node of [A, B]) {
				const fields = node.fields;
				Object.defineProperty(node, "fields", {
					get() {
						reads++;
						return fields;
					},
				});
			}
			const a = toStoredSchema(A, StagedSchemaUpgradePolicy.permissive);
			assert.equal(reads, 2);
			assert.strictEqual(toStoredSchema(A, StagedSchemaUpgradePolicy.permissive), a);
			assert.equal(reads, 2);
			const b = toStoredSchema(B, StagedSchemaUpgradePolicy.permissive);
			const optional = sf.optional(A, { persistedMetadata: { description: "optional" } });
			const field = toStoredSchema(optional, StagedSchemaUpgradePolicy.permissive);
			assert.deepEqual(a.nodeSchema, b.nodeSchema);
			assert.deepEqual(a.nodeSchema, field.nodeSchema);
			assert.notDeepEqual(a.rootFieldSchema, b.rootFieldSchema);
			assert.notEqual(a.rootFieldSchema.kind, field.rootFieldSchema.kind);
			assert.deepEqual(field.rootFieldSchema.persistedMetadata, { description: "optional" });
		});
		for (const first of [0, 1, 2]) {
			it(`preserves serialized schema when component analysis starts at root ${first}`, () => {
				const [a, b, parent] = createSchemaGraph([[1], [0], [1]]);
				assert(a !== undefined && b !== undefined && parent !== undefined);
				getRootSchemaDerivedData([a, b, parent][first] ?? assert.fail());
				// Captured from schemas with these identifiers and structure at pre-refactor commit 1099dc048df.
				assert.equal(computeSchemaHash(a), "0aec93b1d34f96c13c2a92a5e494939e");
				assert.equal(computeSchemaHash(b), "0458eb955807e91b2f7e1db31fa60da6");
				const codec = schemaCodecBuilder.build({
					jsonValidator: FormatValidatorBasic,
					minVersionForCollab: currentVersion,
				});
				for (const root of [a, b]) {
					const baseline = createTreeSchema(root);
					assert.equal(
						JSON.stringify(
							encodeSchemaCompatibilitySnapshot(getRootSchemaDerivedData(root).treeSchema),
						),
						JSON.stringify(encodeSchemaCompatibilitySnapshot(baseline)),
					);
					for (const policy of [
						StagedSchemaUpgradePolicy.restrictive,
						StagedSchemaUpgradePolicy.permissive,
					]) {
						const expected = simpleStoredSchemaToStoredSchema(
							transformSimpleSchema(baseline, policy),
						);
						assert.deepEqual(toStoredSchema(root, policy), expected);
						assert.equal(
							JSON.stringify(codec.encode(toStoredSchema(root, policy))),
							JSON.stringify(codec.encode(expected)),
						);
					}
				}
			});
		}
		// Catalog metadata is independently checked in ../testTrees.spec.ts.
		describe("catalog reference conversions", () => {
			for (const testCase of testSchema) {
				for (const permissiveFirst of [false, true]) {
					it(`${testCase.name}: ${permissiveFirst ? "permissive" : "restrictive"} first`, () => {
						const original = normalizeFieldSchema(testCase.schema);
						// A fresh field wrapper avoids root-result cache hits, but deliberately retains reusable component analysis.
						const root = createFieldSchema(
							original.kind,
							original.allowedTypes,
							original.props ?? {},
						);
						const treeSchema = createTreeSchema(root);
						const expectedRestrictive = simpleStoredSchemaToStoredSchema(
							transformSimpleSchema(treeSchema, StagedSchemaUpgradePolicy.restrictive),
						);
						const expectedPermissive = simpleStoredSchemaToStoredSchema(
							transformSimpleSchema(treeSchema, StagedSchemaUpgradePolicy.permissive),
						);
						const restrictivePolicy = { ...StagedSchemaUpgradePolicy.restrictive };
						const permissivePolicy = { ...StagedSchemaUpgradePolicy.permissive };
						const policies = permissiveFirst
							? [permissivePolicy, restrictivePolicy]
							: [restrictivePolicy, permissivePolicy];
						for (const policy of policies) {
							toStoredSchema(root, policy);
						}
						const restrictive = toStoredSchema(root, restrictivePolicy);
						const permissive = toStoredSchema(root, permissivePolicy);
						assert.deepEqual(restrictive, expectedRestrictive);
						assert.deepEqual(permissive, expectedPermissive);
						assert.equal(restrictive === permissive, !testCase.hasStagedSchema);
						assert.strictEqual(toStoredSchema(root, restrictivePolicy), restrictive);
						if (!testCase.hasStagedSchema) {
							assert.strictEqual(
								toStoredSchema(root, {
									...restrictivePolicy,
									includeAlreadyEnabledUpgrades: true,
								}),
								permissive,
							);
							assert.strictEqual(
								toStoredSchema(root, StagedSchemaUpgradePolicy.permissive),
								permissive,
							);
						}
					});
				}
			}
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
