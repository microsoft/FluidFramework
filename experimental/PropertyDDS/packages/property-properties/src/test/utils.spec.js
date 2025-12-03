/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* globals assert */

/**
 * @fileoverview In this file, we will test the utils described in /src/utils.js
 */

const { ChangeSet } = require("@fluid-experimental/property-changeset");
const { Utils } = require("@fluid-experimental/property-changeset");
const { MSG } = require("@fluid-experimental/property-common").constants;
const _ = require("lodash");

const { PropertyFactory } = require("..");
const { BaseProperty } = require("..");
const { NodeProperty } = require("../properties/nodeProperty");

describe("Utils", function () {
	before(function () {
		var TaskStatus = {
			// inherits : 'Enum',
			typeid: "autodesk.test:utils.spec.task.status-1.0.0",
			/* values : {
              running   : 'running',
              created   : 'created',
              succeeded : 'succeeded',
              failed    : 'failed',
              canceled  : 'canceled'
            },
            default : 'created' */
		};

		// The subject property template to be tracked
		var TaskSubject = {
			inherits: ["NodeProperty"],
			typeid: "autodesk.test:utils.spec.task.subject-1.0.0",
			properties: [
				// {id: 'status', typeid: 'autodesk.test:utils_spec_status-1.0.0'},
				{ id: "errorMsg", typeid: "String" },
				// {id: 'result', typeid: 'BaseProperty'},
				{ id: "progress", typeid: "Uint32", annotation: { min: 0, max: 100 } },
				// {id: 'timeRemaining' , typeid : 'autodesk.test:utils_spec_datedelta-1.0.0'}
			],
		};

		// The observer tracking subject(s)
		var TaskObserver = {
			inherits: "autodesk.test:utils.spec.task.subject-1.0.0",
			typeid: "autodesk.test:utils.spec.task.observer-1.0.0",
			properties: [
				{ id: "name", typeid: "String" },
				{ id: "creator", typeid: "autodesk.test:utils.spec.user-1.0.0" },
				{
					id: "subjects",
					typeid: "autodesk.test:utils.spec.task.subjectentry-1.0.0",
					context: "array",
				},
				{ id: "startTime", typeid: "autodesk.test:utils.spec.date-1.0.0" },
				{ id: "endTime", typeid: "autodesk.test:utils.spec.date-1.0.0" },
			],
		};

		// Subject entries passed in to the 'subjects' field of the task observer
		var TaskSubjectEntries = {
			typeid: "autodesk.test:utils.spec.task.subjectentry-1.0.0",
			properties: [{ id: "path", typeid: "String" }],
		};

		// Example usage of task subjects to be tracked
		var Sim = {
			inherits: ["NodeProperty"],
			typeid: "autodesk.test:utils.spec.pan.sim-1.0.0",
			properties: [
				{ id: "costEstimated", typeid: "autodesk.test:utils.spec.task.subject-1.0.0" },
				{ id: "costFinal", typeid: "autodesk.test:utils.spec.task.subject-1.0.0" },

				// set by client to start or cancel the simulation
				{ id: "start", typeid: "Bool", default: false },
				{ id: "cancel", typeid: "Bool", default: false },

				// { id: 'inputs'   , typeid: 'autodesk.test:utils_spec_pan.input-1.0.0' },

				{ id: "thermalResults", typeid: "autodesk.test:utils.spec.task.subject-1.0.0" },
				{ id: "mechanicalResults", typeid: "autodesk.test:utils.spec.task.subject-1.0.0" },
			],
		};

		var nestedTemplate = {
			typeid: "autodesk.tests:nestedTemplate-1.0.0",
			properties: [
				{
					id: "a",
					typeid: "String",
				},
				{
					id: "b",
					typeid: "String",
				},
				{
					id: "c",
					properties: [
						{
							id: "myNestedProp",
							typeid: "autodesk.test:utils.spec.task.subject-1.0.0",
						},
					],
				},
			],
		};
		var QuoatablePropertyObject = {
			typeid: "autodesk.tests:property.with.quotable.characters-1.0.0",
			properties: [
				{
					id: "simple_property",
					typeid: "String",
				},
				{
					id: "test.property",
					typeid: "String",
				},
				{
					id: 'test"property"',
					typeid: "String",
				},
				{
					id: "test[property]",
					properties: [
						{
							id: ".property.",
							properties: [
								{
									id: "test",
									typeid: "String",
								},
							],
						},
					],
				},
			],
		};

		var ContainedTemplate = {
			typeid: "autodesk.test:utilsTestContained-1.0.0",
			properties: [{ id: 'error"Msg"', typeid: "String" }],
		};

		var StaticNodeChild = {
			typeid: "autodesk.test:staticNodeChild-1.0.0",
			inherits: ["NodeProperty"],
			properties: [{ id: "nodeProperty", typeid: "NodeProperty" }],
		};

		var ParentTemplate = {
			typeid: "autodesk.test:utilsTestParent-1.0.0",
			properties: [
				{ id: "errorMsg", typeid: "String" },
				{ id: "progress", typeid: "Uint32" },
				{
					id: "nested",
					properties: [{ id: 'en"t"ry', typeid: "String" }],
				},
				{ id: "contained", typeid: "autodesk.test:utilsTestContained-1.0.0" },
				{
					id: "containedMap",
					typeid: "autodesk.test:utilsTestContained-1.0.0",
					context: "map",
				},
			],
		};

		PropertyFactory._reregister(TaskStatus);
		PropertyFactory._reregister(TaskSubject);
		PropertyFactory._reregister(TaskObserver);
		PropertyFactory._reregister(TaskSubjectEntries);
		PropertyFactory._reregister(Sim);
		PropertyFactory._reregister(nestedTemplate);
		PropertyFactory._reregister(QuoatablePropertyObject);
		PropertyFactory._reregister(ParentTemplate);
		PropertyFactory._reregister(ContainedTemplate);
		PropertyFactory._reregister(StaticNodeChild);
	});

	describe("Utils.traverseChangeSetRecursively", function () {
		var testRoot, contexts, namedNodePropForSet;
		it("should report correctly for inserts", function () {
			testRoot = PropertyFactory.create("NodeProperty");
			testRoot.insert("string", PropertyFactory.create("String"));
			testRoot.insert(
				'test"Templated"Property',
				PropertyFactory.create("autodesk.test:utilsTestParent-1.0.0"),
			);
			testRoot
				.resolvePath('"test\\"Templated\\"Property".containedMap')
				.insert("entry", PropertyFactory.create("autodesk.test:utilsTestContained-1.0.0"));
			testRoot.insert("reference", PropertyFactory.create("Reference<String>"));

			// Test an array with a primitive
			testRoot.insert("floatArray", PropertyFactory.create("Float32", "array"));
			testRoot._properties.floatArray.insertRange(0, [1, 2, 3, 4, 5]);

			// Test an array with a complex type
			testRoot.insert("array", PropertyFactory.create("array<>"));
			var arrayNode = PropertyFactory.create("NodeProperty");
			testRoot._properties.array.push(arrayNode);
			arrayNode.insert("string", PropertyFactory.create("String"));

			// Test a map with a primitive
			testRoot.insert("floatMap", PropertyFactory.create("Float32", "map"));
			testRoot._properties.floatMap.insert("test", 1);
			testRoot._properties.floatMap.insert("test2", 2);
			testRoot._properties.floatMap.insert("test3", 3);

			// Test a map with complex types
			testRoot.insert("map", PropertyFactory.create("map<>"));

			// add members
			// Simple string
			testRoot._properties.map.insert("string", PropertyFactory.create("String"));

			// String with name that has to be escaped
			testRoot._properties.map.insert('s"tr"ing', PropertyFactory.create("String"));

			// A map in a map
			testRoot._properties.map.insert("map", PropertyFactory.create("map<>"));
			testRoot._properties.map.get("map").insert("string", PropertyFactory.create("String"));

			// An array in a map
			testRoot._properties.map.insert("array", PropertyFactory.create("array<>"));
			testRoot._properties.map.get("array").insert(0, PropertyFactory.create("NodeProperty"));
			testRoot._properties.map
				.get("array")
				.get(0)
				.insert("string", PropertyFactory.create("String"));

			// A composed property
			testRoot._properties.map.insert(
				"testParent",
				PropertyFactory.create("autodesk.test:utilsTestParent-1.0.0"),
			);

			// A NodeProperty
			testRoot._properties.map.insert("nodeProperty", PropertyFactory.create("NodeProperty"));
			testRoot._properties.map
				.get("nodeProperty")
				.insert("string", PropertyFactory.create("String"));

			// Test a set property
			testRoot.insert("set", PropertyFactory.create("set<>"));
			namedNodePropForSet = PropertyFactory.create("NamedNodeProperty");
			testRoot._properties.set.insert(namedNodePropForSet);
			namedNodePropForSet.insert("string", PropertyFactory.create("String"));

			contexts = [];
			Utils.traverseChangeSetRecursively(testRoot.serialize({ dirtyOnly: false }), {
				preCallback: function (in_context) {
					// Do some basic sanity checks
					var node = testRoot.resolvePath(in_context.getFullPath() + "*");
					expect(node).to.be.instanceof(BaseProperty);
					expect(node.getTypeid()).to.equal(in_context._splitTypeId.typeid);

					if (in_context._fullPath !== "") {
						expect(in_context.getOperationType()).to.equal("insert");
					} else {
						expect(in_context.getOperationType()).to.equal("modify");
					}

					contexts.push(in_context.clone());
				},
			});
			expect(contexts.length).to.equal(38);
		});

		it("should work for modifications of primitive types", function () {
			// Clean the old modifications
			testRoot.cleanDirty();

			var modifiedStringCount = 0;
			for (var i = 0; i < contexts.length; i++) {
				var modifyNode = testRoot.resolvePath(contexts[i].getFullPath());

				// modify strings
				if (contexts[i].getTypeid() === "String" && modifyNode.getId() !== "guid") {
					modifyNode.setValue("modified");
					modifiedStringCount++;
				}

				// modify float arrays
				if (contexts[i].getTypeid() === "array<Float32>") {
					modifyNode.push(15);
				}
			}

			// modify a float map
			// note: set removed, setValue not implemented yet
			testRoot._properties.floatMap.set("test", 5);
			testRoot._properties.floatMap.set("new_test", 7);

			var reportedStringModifiedCount = 0;
			Utils.traverseChangeSetRecursively(testRoot.serialize({ dirtyOnly: true }), {
				preCallback: function (in_context) {
					// Do some basic sanity checks
					var node = testRoot.resolvePath(in_context.getFullPath());
					expect(node).to.be.instanceof(BaseProperty);
					expect(node.getTypeid()).to.equal(in_context._splitTypeId.typeid);
					expect(in_context.getOperationType()).to.equal("modify");

					if (node.getTypeid() === "String") {
						reportedStringModifiedCount++;
						expect(in_context.getNestedChangeSet()).to.equal("modified");
					}

					if (in_context.getTypeid() === "array<Float32>") {
						expect(in_context.getNestedChangeSet()).to.deep.equal({
							insert: [[5, [15]]],
						});
					}

					if (in_context.getTypeid() === "map<Float32>") {
						expect(in_context.getNestedChangeSet()).to.deep.equal({
							insert: {
								new_test: 7,
							},
							modify: {
								test: 5,
							},
						});
					}
				},
			});

			// Make sure all modified strings have been reported
			expect(reportedStringModifiedCount).to.equal(modifiedStringCount);
		});

		it("should work for inserts in strings", function () {
			// Clean the old modifications
			testRoot.cleanDirty();

			for (var i = 0; i < contexts.length; i++) {
				if (contexts[i].getTypeid() === "String") {
					var modifyNode = testRoot.resolvePath(contexts[i].getFullPath());
					if (modifyNode.getId() !== "guid") {
						modifyNode.insert(3, "_inserted_");
					}
				}
			}

			Utils.traverseChangeSetRecursively(testRoot.serialize({ dirtyOnly: true }), {
				preCallback: function (in_context) {
					// Do some basic sanity checks
					var node = testRoot.resolvePath(in_context.getFullPath());
					expect(node).to.be.instanceof(BaseProperty);
					expect(node.getTypeid()).to.equal(in_context._splitTypeId.typeid);
					expect(in_context.getOperationType()).to.equal("modify");

					if (node.getTypeid() === "String") {
						expect(in_context.getNestedChangeSet()).to.deep.equal({
							insert: [[3, "_inserted_"]],
						});
					}
				},
			});
		});

		it("should work for inserts in arrays", function () {
			// Clean the old modifications
			testRoot.cleanDirty();

			var newArrayNode = PropertyFactory.create("NodeProperty");
			testRoot._properties.array.push(newArrayNode);
			newArrayNode.insert("string", PropertyFactory.create("String"));
			newArrayNode._properties.string.value = "test";

			Utils.traverseChangeSetRecursively(testRoot.serialize({ dirtyOnly: true }), {
				preCallback: function (in_context) {
					// Do some basic sanity checks
					var node = testRoot.resolvePath(in_context.getFullPath());
					expect(node).to.be.instanceof(BaseProperty);
					expect(node.getTypeid()).to.equal(in_context._splitTypeId.typeid);

					if (in_context.getFullPath() !== "" && in_context.getFullPath() !== "array") {
						expect(in_context.getOperationType()).to.equal("insert");
					} else {
						expect(in_context.getOperationType()).to.equal("modify");
					}

					if (node.getTypeid() === "String") {
						expect(in_context.getNestedChangeSet()).to.equal("test");
					}
				},
			});
		});

		it("should work for inserts in sets", function () {
			// Clean the old modifications
			testRoot.cleanDirty();

			var newSetNode = PropertyFactory.create("NamedNodeProperty");
			testRoot._properties.set.insert(newSetNode);
			newSetNode.insert("string", PropertyFactory.create("String"));
			newSetNode._properties.string.setValue("test");

			Utils.traverseChangeSetRecursively(testRoot.serialize({ dirtyOnly: true }), {
				preCallback: function (in_context) {
					// Do some basic sanity checks
					var node = testRoot.resolvePath(in_context.getFullPath());
					expect(node).to.be.instanceof(BaseProperty);
					expect(node.getTypeid()).to.equal(in_context._splitTypeId.typeid);

					if (in_context.getFullPath() !== "" && in_context.getFullPath() !== "set") {
						expect(in_context.getOperationType()).to.equal("insert");
					} else {
						expect(in_context.getOperationType()).to.equal("modify");
					}

					if (node.getTypeid() === "String") {
						expect(in_context.getNestedChangeSet()).to.equal(node.value);
					}
				},
			});
		});

		it("should work for node property removals", function () {
			// Clean the old modifications
			testRoot.cleanDirty();

			var removedStrings = [];
			for (var i = 0; i < contexts.length; i++) {
				if (contexts[i].getTypeid() === "NodeProperty") {
					var modifyNode = testRoot.resolvePath(contexts[i].getFullPath());
					removedStrings.push(modifyNode._properties.string.getAbsolutePath());

					modifyNode.remove("string");
				}
			}

			var actualStringRemoveCount = 0;
			Utils.traverseChangeSetRecursively(testRoot.serialize({ dirtyOnly: true }), {
				preCallback: function (in_context) {
					var node = testRoot.resolvePath(in_context.getFullPath());
					if (node) {
						expect(in_context.getOperationType()).to.equal("modify");
					} else {
						expect(in_context.getOperationType()).to.equal("remove");
						expect(removedStrings.indexOf("/" + in_context.getFullPath())).to.not.equal(-1);
						actualStringRemoveCount++;
					}
				},
			});
			expect(removedStrings.length).to.equal(actualStringRemoveCount);
		});

		it("should work for array removals", function () {
			// Clean the old modifications
			testRoot.cleanDirty();

			testRoot._properties.array.removeRange(0, 2);
			var arrayRemovalCount = 0;
			Utils.traverseChangeSetRecursively(testRoot.serialize({ dirtyOnly: true }), {
				preCallback: function (in_context) {
					if (in_context.getFullPath() === "" || in_context.getFullPath() === "array") {
						expect(in_context.getOperationType()).to.equal("modify");
					} else {
						expect(in_context.getOperationType()).to.equal("remove");
						arrayRemovalCount++;
					}
				},
			});
			expect(arrayRemovalCount).to.equal(2);
		});

		it("should work for map removals", function () {
			// Clean the old modifications
			testRoot.cleanDirty();

			testRoot._properties.map.remove("string");
			var mapRemovalCount = 0;
			Utils.traverseChangeSetRecursively(testRoot.serialize({ dirtyOnly: true }), {
				preCallback: function (in_context) {
					if (in_context.getFullPath() === "" || in_context.getFullPath() === "map") {
						expect(in_context.getOperationType()).to.equal("modify");
					} else {
						expect(in_context.getOperationType()).to.equal("remove");
						mapRemovalCount++;
					}
				},
			});
			expect(mapRemovalCount).to.equal(1);
		});

		it("should work for set removals", function () {
			// Clean the old modifications
			testRoot.cleanDirty();

			testRoot._properties.set.remove(namedNodePropForSet);

			var setRemovalCount = 0;
			Utils.traverseChangeSetRecursively(testRoot.serialize({ dirtyOnly: true }), {
				preCallback: function (in_context) {
					if (in_context.getFullPath() === "" || in_context.getFullPath() === "set") {
						expect(in_context.getOperationType()).to.equal("modify");
					} else {
						expect(in_context.getOperationType()).to.equal("remove");
						setRemovalCount++;
					}
				},
			});
			expect(setRemovalCount).to.equal(1);
		});

		it("should clone the context correctly", function () {
			testRoot.insert("setClone", PropertyFactory.create("set<>"));
			var namedNodePropForSet1 = PropertyFactory.create("NamedNodeProperty");
			var namedNodePropForSet2 = PropertyFactory.create("NamedNodeProperty");
			var namedNodePropForSet3 = PropertyFactory.create("NamedNodeProperty");
			testRoot._properties.setClone.insert(namedNodePropForSet1);
			testRoot._properties.setClone.insert(namedNodePropForSet2);
			testRoot._properties.setClone.insert(namedNodePropForSet3);
			namedNodePropForSet1.insert("string1", PropertyFactory.create("String"));
			namedNodePropForSet2.insert("string2", PropertyFactory.create("String"));
			namedNodePropForSet3.insert("string3", PropertyFactory.create("String"));
			// Clean the old modifications
			testRoot.cleanDirty();

			testRoot._properties.setClone.remove(namedNodePropForSet1);
			testRoot._properties.setClone.remove(namedNodePropForSet2);
			testRoot._properties.setClone.remove(namedNodePropForSet3);

			var setRemovalCount = 0;
			var contextCloneCount = 0;
			Utils.traverseChangeSetRecursively(testRoot.serialize({ dirtyOnly: true }), {
				preCallback: function (in_context) {
					if (in_context.getFullPath() === "" || in_context.getFullPath() === "setClone") {
						expect(in_context.getOperationType()).to.equal("modify");
					} else {
						expect(in_context.getOperationType()).to.equal("remove");
						setRemovalCount++;
					}
					var cloneContext = in_context.clone();
					expect(cloneContext).to.deep.equal(in_context);
					contextCloneCount++;
				},
			});
			expect(setRemovalCount).to.equal(3);
			expect(contextCloneCount >= 3).to.be.true; // we should clone at least 3 times (probably more)
		});

		it("@regression should work when replacing a map element", function () {
			// Clean the old modifications
			testRoot.cleanDirty();
			testRoot._properties.map.set(
				"nodeProperty",
				PropertyFactory.create("NamedNodeProperty"),
			);
			var operationtypes = [];
			Utils.traverseChangeSetRecursively(testRoot.serialize({ dirtyOnly: true }), {
				preCallback: function (in_context) {
					// expect operations to be 'remove' and 'insert'
					if (in_context.getFullPath() === "map[nodeProperty]") {
						operationtypes.push(in_context.getOperationType());
					}
				},
			});
			expect(operationtypes).to.deep.equal(["remove", "insert"]);
		});
	});

	describe("Utils.traverseChangeSetRecursivelyAsync", function () {
		var testRoot, contexts, namedNodePropForSet;
		it("should report correctly for inserts", function (done) {
			testRoot = PropertyFactory.create("NodeProperty");
			testRoot.insert("string", PropertyFactory.create("String"));
			testRoot.insert(
				'test"Templated"Property',
				PropertyFactory.create("autodesk.test:utilsTestParent-1.0.0"),
			);
			testRoot
				.resolvePath('"test\\"Templated\\"Property".containedMap')
				.insert("entry", PropertyFactory.create("autodesk.test:utilsTestContained-1.0.0"));
			testRoot.insert("reference", PropertyFactory.create("Reference<String>"));

			// Test an array with a primitive
			testRoot.insert("floatArray", PropertyFactory.create("Float32", "array"));
			testRoot._properties.floatArray.insertRange(0, [1, 2, 3, 4, 5]);

			// Test an array with a complex type
			testRoot.insert("array", PropertyFactory.create("array<>"));
			var arrayNode = PropertyFactory.create("NodeProperty");
			testRoot._properties.array.push(arrayNode);
			arrayNode.insert("string", PropertyFactory.create("String"));

			// Test a map with a primitive
			testRoot.insert("floatMap", PropertyFactory.create("Float32", "map"));
			testRoot._properties.floatMap.insert("test", 1);
			testRoot._properties.floatMap.insert("test2", 2);
			testRoot._properties.floatMap.insert("test3", 3);

			// Test a map with complex types
			testRoot.insert("map", PropertyFactory.create("map<>"));

			// add members
			// Simple string
			testRoot._properties.map.insert("string", PropertyFactory.create("String"));

			// String with name that has to be escaped
			testRoot._properties.map.insert('s"tr"ing', PropertyFactory.create("String"));

			// A map in a map
			testRoot._properties.map.insert("map", PropertyFactory.create("map<>"));
			testRoot._properties.map.get("map").insert("string", PropertyFactory.create("String"));

			// An array in a map
			testRoot._properties.map.insert("array", PropertyFactory.create("array<>"));
			testRoot._properties.map.get("array").insert(0, PropertyFactory.create("NodeProperty"));
			testRoot._properties.map
				.get("array")
				.get(0)
				.insert("string", PropertyFactory.create("String"));

			// A composed property
			testRoot._properties.map.insert(
				"testParent",
				PropertyFactory.create("autodesk.test:utilsTestParent-1.0.0"),
			);

			// A NodeProperty
			testRoot._properties.map.insert("nodeProperty", PropertyFactory.create("NodeProperty"));
			testRoot._properties.map
				.get("nodeProperty")
				.insert("string", PropertyFactory.create("String"));

			// Test a set property
			testRoot.insert("set", PropertyFactory.create("set<>"));
			namedNodePropForSet = PropertyFactory.create("NamedNodeProperty");
			testRoot._properties.set.insert(namedNodePropForSet);
			namedNodePropForSet.insert("string", PropertyFactory.create("String"));

			contexts = [];
			Utils.traverseChangeSetRecursivelyAsync(
				testRoot.serialize({ dirtyOnly: false }),
				{
					preCallback: function (in_context, cb) {
						// Do some basic sanity checks
						var node = testRoot.resolvePath(in_context.getFullPath() + "*");
						expect(node).to.be.instanceof(BaseProperty);
						expect(node.getTypeid()).to.equal(in_context._splitTypeId.typeid);

						if (in_context._fullPath !== "") {
							expect(in_context.getOperationType()).to.equal("insert");
						} else {
							expect(in_context.getOperationType()).to.equal("modify");
						}

						contexts.push(in_context.clone());
						setImmediate(cb);
					},
				},
				function () {
					expect(contexts.length).to.equal(38);
					done();
				},
			);
		});

		it("should work for modifications of primitive types", function (done) {
			// Clean the old modifications
			testRoot.cleanDirty();

			var modifiedStringCount = 0;
			for (var i = 0; i < contexts.length; i++) {
				var modifyNode = testRoot.resolvePath(contexts[i].getFullPath());

				// modify strings
				if (contexts[i].getTypeid() === "String" && modifyNode.getId() !== "guid") {
					modifyNode.setValue("modified");
					modifiedStringCount++;
				}

				// modify float arrays
				if (contexts[i].getTypeid() === "array<Float32>") {
					modifyNode.push(15);
				}
			}

			// modify a float map
			// note: set removed, setValue not implemented yet
			testRoot._properties.floatMap.set("test", 5);
			testRoot._properties.floatMap.set("new_test", 7);

			var reportedStringModifiedCount = 0;
			Utils.traverseChangeSetRecursivelyAsync(
				testRoot.serialize({ dirtyOnly: true }),
				{
					preCallback: function (in_context, cb) {
						// Do some basic sanity checks
						var node = testRoot.resolvePath(in_context.getFullPath());
						expect(node).to.be.instanceof(BaseProperty);
						expect(node.getTypeid()).to.equal(in_context._splitTypeId.typeid);
						expect(in_context.getOperationType()).to.equal("modify");

						if (node.getTypeid() === "String") {
							reportedStringModifiedCount++;
							expect(in_context.getNestedChangeSet()).to.equal("modified");
						}

						if (in_context.getTypeid() === "array<Float32>") {
							expect(in_context.getNestedChangeSet()).to.deep.equal({
								insert: [[5, [15]]],
							});
						}

						if (in_context.getTypeid() === "map<Float32>") {
							expect(in_context.getNestedChangeSet()).to.deep.equal({
								insert: {
									new_test: 7,
								},
								modify: {
									test: 5,
								},
							});
						}
						setImmediate(cb);
					},
				},
				function () {
					// Make sure all modified strings have been reported
					expect(reportedStringModifiedCount).to.equal(modifiedStringCount);
					done();
				},
			);
		});

		it("should work for inserts in strings", function (done) {
			// Clean the old modifications
			testRoot.cleanDirty();

			for (var i = 0; i < contexts.length; i++) {
				if (contexts[i].getTypeid() === "String") {
					var modifyNode = testRoot.resolvePath(contexts[i].getFullPath());
					if (modifyNode.getId() !== "guid") {
						modifyNode.insert(3, "_inserted_");
					}
				}
			}

			Utils.traverseChangeSetRecursivelyAsync(
				testRoot.serialize({ dirtyOnly: true }),
				{
					preCallback: function (in_context, cb) {
						// Do some basic sanity checks
						var node = testRoot.resolvePath(in_context.getFullPath());
						expect(node).to.be.instanceof(BaseProperty);
						expect(node.getTypeid()).to.equal(in_context._splitTypeId.typeid);
						expect(in_context.getOperationType()).to.equal("modify");

						if (node.getTypeid() === "String") {
							expect(in_context.getNestedChangeSet()).to.deep.equal({
								insert: [[3, "_inserted_"]],
							});
						}
						setImmediate(cb);
					},
				},
				function () {
					done();
				},
			);
		});

		it("should work for inserts in arrays", function (done) {
			// Clean the old modifications
			testRoot.cleanDirty();

			var newArrayNode = PropertyFactory.create("NodeProperty");
			testRoot._properties.array.push(newArrayNode);
			newArrayNode.insert("string", PropertyFactory.create("String"));
			newArrayNode._properties.string.value = "test";

			Utils.traverseChangeSetRecursivelyAsync(
				testRoot.serialize({ dirtyOnly: true }),
				{
					preCallback: function (in_context, cb) {
						// Do some basic sanity checks
						var node = testRoot.resolvePath(in_context.getFullPath());
						expect(node).to.be.instanceof(BaseProperty);
						expect(node.getTypeid()).to.equal(in_context._splitTypeId.typeid);

						if (in_context.getFullPath() !== "" && in_context.getFullPath() !== "array") {
							expect(in_context.getOperationType()).to.equal("insert");
						} else {
							expect(in_context.getOperationType()).to.equal("modify");
						}

						if (node.getTypeid() === "String") {
							expect(in_context.getNestedChangeSet()).to.equal("test");
						}
						setImmediate(cb);
					},
				},
				function () {
					done();
				},
			);
		});

		it("should work for inserts in sets", function (done) {
			// Clean the old modifications
			testRoot.cleanDirty();

			var newSetNode = PropertyFactory.create("NamedNodeProperty");
			testRoot._properties.set.insert(newSetNode);
			newSetNode.insert("string", PropertyFactory.create("String"));
			newSetNode._properties.string.setValue("test");

			Utils.traverseChangeSetRecursivelyAsync(
				testRoot.serialize({ dirtyOnly: true }),
				{
					preCallback: function (in_context, cb) {
						// Do some basic sanity checks
						var node = testRoot.resolvePath(in_context.getFullPath());
						expect(node).to.be.instanceof(BaseProperty);
						expect(node.getTypeid()).to.equal(in_context._splitTypeId.typeid);

						if (in_context.getFullPath() !== "" && in_context.getFullPath() !== "set") {
							expect(in_context.getOperationType()).to.equal("insert");
						} else {
							expect(in_context.getOperationType()).to.equal("modify");
						}

						if (node.getTypeid() === "String") {
							expect(in_context.getNestedChangeSet()).to.equal(node.value);
						}
						setImmediate(cb);
					},
				},
				done,
			);
		});

		it("should work for node property removals", function (done) {
			// Clean the old modifications
			testRoot.cleanDirty();

			var removedStrings = [];
			for (var i = 0; i < contexts.length; i++) {
				if (contexts[i].getTypeid() === "NodeProperty") {
					var modifyNode = testRoot.resolvePath(contexts[i].getFullPath());
					removedStrings.push(modifyNode._properties.string.getAbsolutePath());

					modifyNode.remove("string");
				}
			}

			var actualStringRemoveCount = 0;
			Utils.traverseChangeSetRecursivelyAsync(
				testRoot.serialize({ dirtyOnly: true }),
				{
					preCallback: function (in_context, cb) {
						var node = testRoot.resolvePath(in_context.getFullPath());
						if (node) {
							expect(in_context.getOperationType()).to.equal("modify");
						} else {
							expect(in_context.getOperationType()).to.equal("remove");
							expect(removedStrings.indexOf("/" + in_context.getFullPath())).to.not.equal(-1);
							actualStringRemoveCount++;
						}
						setImmediate(cb);
					},
				},
				function () {
					expect(removedStrings.length).to.equal(actualStringRemoveCount);
					done();
				},
			);
		});

		it("should work for array removals", function (done) {
			// Clean the old modifications
			testRoot.cleanDirty();

			testRoot._properties.array.removeRange(0, 2);
			var arrayRemovalCount = 0;
			Utils.traverseChangeSetRecursivelyAsync(
				testRoot.serialize({ dirtyOnly: true }),
				{
					preCallback: function (in_context, cb) {
						if (in_context.getFullPath() === "" || in_context.getFullPath() === "array") {
							expect(in_context.getOperationType()).to.equal("modify");
						} else {
							expect(in_context.getOperationType()).to.equal("remove");
							arrayRemovalCount++;
						}
						setImmediate(cb);
					},
				},
				function () {
					expect(arrayRemovalCount).to.equal(2);
					done();
				},
			);
		});

		it("should work for map removals", function (done) {
			// Clean the old modifications
			testRoot.cleanDirty();

			testRoot._properties.map.remove("string");
			var mapRemovalCount = 0;
			Utils.traverseChangeSetRecursivelyAsync(
				testRoot.serialize({ dirtyOnly: true }),
				{
					preCallback: function (in_context, cb) {
						if (in_context.getFullPath() === "" || in_context.getFullPath() === "map") {
							expect(in_context.getOperationType()).to.equal("modify");
						} else {
							expect(in_context.getOperationType()).to.equal("remove");
							mapRemovalCount++;
						}
						setImmediate(cb);
					},
				},
				function () {
					expect(mapRemovalCount).to.equal(1);
					done();
				},
			);
		});

		it("should work for set removals", function (done) {
			// Clean the old modifications
			testRoot.cleanDirty();

			testRoot._properties.set.remove(namedNodePropForSet);

			var setRemovalCount = 0;
			Utils.traverseChangeSetRecursivelyAsync(
				testRoot.serialize({ dirtyOnly: true }),
				{
					preCallback: function (in_context, cb) {
						if (in_context.getFullPath() === "" || in_context.getFullPath() === "set") {
							expect(in_context.getOperationType()).to.equal("modify");
						} else {
							expect(in_context.getOperationType()).to.equal("remove");
							setRemovalCount++;
						}
						setImmediate(cb);
					},
				},
				function () {
					expect(setRemovalCount).to.equal(1);
					done();
				},
			);
		});

		it("should clone the context correctly", function (done) {
			testRoot.insert("setClone", PropertyFactory.create("set<>"));
			var namedNodePropForSet1 = PropertyFactory.create("NamedNodeProperty");
			var namedNodePropForSet2 = PropertyFactory.create("NamedNodeProperty");
			var namedNodePropForSet3 = PropertyFactory.create("NamedNodeProperty");
			testRoot._properties.setClone.insert(namedNodePropForSet1);
			testRoot._properties.setClone.insert(namedNodePropForSet2);
			testRoot._properties.setClone.insert(namedNodePropForSet3);
			namedNodePropForSet1.insert("string1", PropertyFactory.create("String"));
			namedNodePropForSet2.insert("string2", PropertyFactory.create("String"));
			namedNodePropForSet3.insert("string3", PropertyFactory.create("String"));
			// Clean the old modifications
			testRoot.cleanDirty();

			testRoot._properties.setClone.remove(namedNodePropForSet1);
			testRoot._properties.setClone.remove(namedNodePropForSet2);
			testRoot._properties.setClone.remove(namedNodePropForSet3);

			var setRemovalCount = 0;
			var contextCloneCount = 0;
			Utils.traverseChangeSetRecursivelyAsync(
				testRoot.serialize({ dirtyOnly: true }),
				{
					preCallback: function (in_context, cb) {
						if (in_context.getFullPath() === "" || in_context.getFullPath() === "setClone") {
							expect(in_context.getOperationType()).to.equal("modify");
						} else {
							expect(in_context.getOperationType()).to.equal("remove");
							setRemovalCount++;
						}
						var cloneContext = in_context.clone();
						expect(cloneContext).to.deep.equal(in_context);
						contextCloneCount++;
						setImmediate(cb);
					},
				},
				function () {
					expect(setRemovalCount).to.equal(3);
					expect(contextCloneCount >= 3).to.be.true; // we should clone at least 3 times (probably more)
					done();
				},
			);
		});

		it("@regression should work for mixed modifications and removals", function (done) {
			// This test uses its own property sets tree
			var ownRoot = PropertyFactory.create("NodeProperty");
			var userInfo = PropertyFactory.create("NodeProperty");
			userInfo.insert("name", PropertyFactory.create("String", "single", "John Doe"));
			userInfo.insert("isResident", PropertyFactory.create("Bool", "single", true));
			ownRoot.insert("userInfo", userInfo);
			var numberOfResidents = PropertyFactory.create("Int32", "single", 1);
			ownRoot.insert("numberOfResidents", numberOfResidents);

			ownRoot.cleanDirty();

			ownRoot.get(["userInfo", "name"]).setValue("Johnny B. Goode");
			ownRoot.get("userInfo").remove("isResident");
			ownRoot.get("numberOfResidents").setValue(0);

			var modifiedCount = 0;
			var serializedCS = ownRoot.serialize({ dirtyOnly: true });
			Utils.traverseChangeSetRecursivelyAsync(
				serializedCS,
				{
					preCallback: function (in_context, cb) {
						var node = ownRoot.resolvePath(in_context.getFullPath());
						if (node) {
							expect(in_context.getOperationType()).to.equal("modify");
							if (
								in_context.getLastSegment() === "name" ||
								in_context.getLastSegment() === "numberOfResidents"
							) {
								modifiedCount++;
							}
						} else {
							expect(in_context.getOperationType()).to.equal("remove");
							expect(in_context.getLastSegment()).to.equal("isResident");
						}
						setImmediate(cb);
					},
				},
				function () {
					expect(modifiedCount).to.equal(2);
					done();
				},
			);
		});

		it("@regression should work when replacing a map element", function (done) {
			// Clean the old modifications
			testRoot.cleanDirty();

			testRoot._properties.map.set(
				"testParent",
				PropertyFactory.create("autodesk.test:utilsTestParent-1.0.0", "single", {
					errorMsg: "another element",
					progress: 99,
				}),
			);

			var operations = [];
			Utils.traverseChangeSetRecursivelyAsync(
				testRoot.serialize({ dirtyOnly: true }),
				{
					preCallback: function (in_context, cb) {
						if (in_context.getFullPath() === "map[testParent]") {
							operations.push(in_context.getOperationType());
						} else if (in_context.getFullPath() === "map[testParent].errorMsg") {
							expect(in_context.getNestedChangeSet() === "another element");
						} else if (in_context.getFullPath() === "map[testParent].progress") {
							expect(in_context.getNestedChangeSet() === 99);
						}
						setImmediate(cb);
					},
				},
				function () {
					expect(operations).to.deep.equal(["remove", "insert"]);
					done();
				},
			);
		});
	});

	describe("Utils.enumerateSchemas", function () {
		var serializedChangeSet = {
			insertTemplates: {
				"autodesk.tests:property.set.SimpleNamedPoint-1.0.0": {
					typeid: "autodesk.tests:property.set.SimpleNamedPoint-1.0.0",
					inherits: "NamedProperty",
					properties: [
						{ id: "x", typeid: "Uint32" },
						{ id: "y", typeid: "Uint32" },
					],
				},
				"autodesk.tests:property.set.SimpleNamedPoint-1.2.0": {
					typeid: "autodesk.tests:property.set.SimpleNamedPoint-1.0.0",
					inherits: "NamedProperty",
					properties: [
						{ id: "x", typeid: "Uint64" },
						{ id: "y", typeid: "Uint64" },
					],
				},
			},
		};

		it("should return the schemas, and then call the finalizer", function (done) {
			var countedTemplates = 0;
			Utils.enumerateSchemas(
				serializedChangeSet,
				function (t, cb) {
					countedTemplates++;
					if (t.key === "autodesk.tests:property.set.SimpleNamedPoint-1.0.0") {
						expect(t.value).to.eql(
							serializedChangeSet.insertTemplates[
								"autodesk.tests:property.set.SimpleNamedPoint-1.0.0"
							],
						);
					}
					if (t.key === "autodesk.tests:property.set.SimpleNamedPoint-1.2.0") {
						expect(t.value).to.eql(
							serializedChangeSet.insertTemplates[
								"autodesk.tests:property.set.SimpleNamedPoint-1.2.0"
							],
						);
					}
					setImmediate(cb);
				},
				function () {
					expect(countedTemplates).to.eql(2);
					done();
				},
			);
		});
	});

	describe("Utils.extractTypeids", function () {
		it("Should work for a simple templated property", function () {
			var property = PropertyFactory.create("autodesk.test:utilsTestParent-1.0.0");

			var typeids = Utils.extractTypeids(
				property.serialize({ dirtyOnly: false, includeRootTypeid: true }),
			);
			typeids.sort();
			// Note the map from the template isn't included in the ChangeSet since it is empty
			expect(typeids).to.deep.equal([
				"String",
				"Uint32",
				"autodesk.test:utilsTestContained-1.0.0",
				"autodesk.test:utilsTestParent-1.0.0",
				"map<autodesk.test:utilsTestContained-1.0.0>",
			]);
		});

		it("Should work for inserts into a NodePropertý", function () {
			var property = PropertyFactory.create("NodeProperty");
			var child = PropertyFactory.create("autodesk.test:utilsTestParent-1.0.0");
			property.insert("child", child);

			var typeids = Utils.extractTypeids(
				property.serialize({ dirtyOnly: false, includeRootTypeid: true }),
			);
			typeids.sort();
			expect(typeids).to.deep.equal([
				"NodeProperty",
				"String",
				"Uint32",
				"autodesk.test:utilsTestContained-1.0.0",
				"autodesk.test:utilsTestParent-1.0.0",
				"map<autodesk.test:utilsTestContained-1.0.0>",
			]);
		});

		it("Should work for inserts into a map", function () {
			var property = PropertyFactory.create("map<>");
			var child = PropertyFactory.create("autodesk.test:utilsTestParent-1.0.0");
			property.insert("child", child);

			var typeids = Utils.extractTypeids(property._serialize(false, true));
			typeids.sort();

			expect(typeids).to.deep.equal([
				"String",
				"Uint32",
				"autodesk.test:utilsTestContained-1.0.0",
				"autodesk.test:utilsTestParent-1.0.0",
				"map<>",
				"map<autodesk.test:utilsTestContained-1.0.0>",
			]);
		});

		it("Should work for inserts into an array", function () {
			var property = PropertyFactory.create("array<>");
			var child = PropertyFactory.create("autodesk.test:utilsTestParent-1.0.0");
			property.push(child);

			var typeids = Utils.extractTypeids(property._serialize(false, true));
			typeids.sort();

			expect(typeids).to.deep.equal([
				"String",
				"Uint32",
				"array<>",
				"autodesk.test:utilsTestContained-1.0.0",
				"autodesk.test:utilsTestParent-1.0.0",
				"map<autodesk.test:utilsTestContained-1.0.0>",
			]);
		});

		it("Should work for modifications of a NodeProperty", function () {
			var property = PropertyFactory.create("NodeProperty");
			var child = PropertyFactory.create("autodesk.test:utilsTestParent-1.0.0");
			property.insert("child", child);
			property.cleanDirty();
			property.resolvePath('child.contained."error\\"Msg\\""').value = "modified";

			var typeids = Utils.extractTypeids(
				property.serialize({ dirtyOnly: true, in_includeRootTypeid: true }),
			);
			typeids.sort();
			expect(typeids).to.deep.equal([
				"NodeProperty",
				"String",
				"autodesk.test:utilsTestContained-1.0.0",
				"autodesk.test:utilsTestParent-1.0.0",
			]);
		});

		it("Should work for modifications of a map", function () {
			var property = PropertyFactory.create("map<>");
			var child = PropertyFactory.create("autodesk.test:utilsTestParent-1.0.0");
			property.insert("child", child);
			property.cleanDirty();
			property.resolvePath('[child].contained."error\\"Msg\\""').value = "modified";

			var typeids = Utils.extractTypeids(property._serialize(true, true));
			typeids.sort();
			expect(typeids).to.deep.equal([
				"String",
				"autodesk.test:utilsTestContained-1.0.0",
				"autodesk.test:utilsTestParent-1.0.0",
				"map<>",
			]);
		});

		it("Should work for modifications of an array", function () {
			var property = PropertyFactory.create("array<>");
			var child = PropertyFactory.create("autodesk.test:utilsTestParent-1.0.0");
			property.push(child);
			property.cleanDirty();
			property.resolvePath('[0].contained."error\\"Msg\\""').setValue("modified");

			var typeids = Utils.extractTypeids(property._serialize(true, true));
			typeids.sort();
			expect(typeids).to.deep.equal([
				"String",
				"array<>",
				"autodesk.test:utilsTestContained-1.0.0",
				"autodesk.test:utilsTestParent-1.0.0",
			]);
		});

		it("Should work for removals", function () {
			var typeids = Utils.extractTypeids({ remove: ["xxx-yyy-zzz"] });

			expect(typeids).to.have.lengthOf(1);
			expect(typeids[0]).to.equal("NodeProperty");
		});
	});

	describe("Change set helper functions", function () {
		var root, sim, subject1, subject2, subject3;
		// Create a simple test data-set
		before(function () {
			root = PropertyFactory.create("NodeProperty");
			sim = PropertyFactory.create("autodesk.test:utils.spec.pan.sim-1.0.0");
			subject1 = PropertyFactory.create("autodesk.test:utils.spec.task.subject-1.0.0");
			subject2 = PropertyFactory.create("autodesk.test:utils.spec.task.subject-1.0.0");

			root.insert("simulation", sim);
			sim.insert("subject1", subject1);
			sim.insert("subject2", subject2);

			var arrayProp = PropertyFactory.create("array<>");
			root.insert("array", arrayProp);
			arrayProp.push(PropertyFactory.create("autodesk.test:utils.spec.task.subject-1.0.0"));
			arrayProp.push(PropertyFactory.create("autodesk.test:utils.spec.task.subject-1.0.0"));
			arrayProp.get(1)._properties.progress.value = 1;

			var mapProp = PropertyFactory.create("map<>");
			root.insert("map", mapProp);
			mapProp.insert(
				"entry",
				PropertyFactory.create("autodesk.test:utils.spec.task.subject-1.0.0"),
			);
		});

		it("should work correctly for inserts", function () {
			var insertedResults = Utils.getChangesByType(
				"autodesk.test:utils.spec.task.subject-1.0.0",
				root.serialize({ dirtyOnly: true }),
			);
			assert(_.keys(insertedResults.insert).length === 9);
			for (var i = 0; i < 9; i++) {
				assert(root.resolvePath(_.keys(insertedResults.insert)[i]) !== undefined);
				assert(
					Utils.getChangesByPath(
						_.keys(insertedResults.insert)[i],
						root,
						root.serialize(),
						false,
					).insert !== undefined,
				);
			}
		});

		it("should work correctly for the root path", function () {
			var AnonymousTestPropertyTemplate = {
				typeid: "autodesk.tests:AnonymousMapTestPropertyID-1.0.0",
				properties: [{ id: "stringProperty", typeid: "String" }],
			};
			PropertyFactory._reregister(AnonymousTestPropertyTemplate);

			var prop = PropertyFactory.create("NodeProperty");
			prop.insert(
				"A",
				PropertyFactory.create("autodesk.tests:AnonymousMapTestPropertyID-1.0.0"),
			);
			var result = Utils.getChangesByPath("", null, prop.serialize());
			expect(result).to.deep.equal({
				modify: {
					insert: {
						"autodesk.tests:AnonymousMapTestPropertyID-1.0.0": {
							A: {
								String: {
									stringProperty: "",
								},
							},
						},
					},
				},
			});
		});

		it("should correctly strip typeids in insertions", function () {
			var insertionChangeSet = root.serialize({ dirtyOnly: true });
			Utils._stripTypeids(insertionChangeSet);
			expect(insertionChangeSet).to.deep.equal({
				insert: {
					simulation: {
						insert: {
							subject1: {
								errorMsg: "",
								progress: 0,
							},
							subject2: {
								errorMsg: "",
								progress: 0,
							},
						},
						costEstimated: {
							errorMsg: "",
							progress: 0,
						},
						costFinal: {
							errorMsg: "",
							progress: 0,
						},
						thermalResults: {
							errorMsg: "",
							progress: 0,
						},
						mechanicalResults: {
							errorMsg: "",
							progress: 0,
						},
						start: false,
						cancel: false,
					},
					map: {
						insert: {
							entry: {
								errorMsg: "",
								progress: 0,
							},
						},
					},
					array: {
						insert: [
							[
								0,
								[
									{
										errorMsg: "",
										progress: 0,
									},
									{
										errorMsg: "",
										progress: 1,
									},
								],
							],
						],
					},
				},
			});
		});

		it("should work correctly for modifies", function () {
			root.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE |
					BaseProperty.MODIFIED_STATE_FLAGS.DIRTY,
			);

			subject3 = PropertyFactory.create("autodesk.test:utils.spec.task.subject-1.0.0");
			subject2.insert("subject3", subject3);

			subject1._properties.errorMsg.value = "test";
			subject2._properties.errorMsg.value = "test";
			sim._properties.thermalResults.errorMsg.value = "test44";

			// Test array modification
			root.resolvePath("array[1].errorMsg").value = "test";

			// Test array insertion
			root
				.resolvePath("array")
				.insertRange(1, [
					PropertyFactory.create("autodesk.test:utils.spec.task.subject-1.0.0"),
					PropertyFactory.create("autodesk.test:utils.spec.task.subject-1.0.0"),
				]);
			root
				.resolvePath("array")
				.insertRange(0, [
					PropertyFactory.create("autodesk.test:utils.spec.task.subject-1.0.0"),
				]);

			// Test map modification
			root.resolvePath("map[entry].errorMsg").value = "test";

			// Test map insertion
			root
				.resolvePath("map")
				.insert(
					"entry2",
					PropertyFactory.create("autodesk.test:utils.spec.task.subject-1.0.0"),
				);

			var modifiedResults = Utils.getChangesByType(
				"autodesk.test:utils.spec.task.subject-1.0.0",
				root.serialize({ dirtyOnly: true }),
				true,
			);

			assert(_.keys(modifiedResults.insert).length === 5);
			assert(_.keys(modifiedResults.modify).length === 5);

			for (var i = 0; i < 5; i++) {
				assert(
					Utils.getChangesByPath(
						_.keys(modifiedResults.modify)[i],
						root,
						root.serialize({ dirtyOnly: true }),
						false,
					).modify !== undefined,
				);
			}
			for (var i = 0; i < 5; i++) {
				assert(
					Utils.getChangesByPath(
						_.keys(modifiedResults.insert)[i],
						root,
						root.serialize({ dirtyOnly: true }),
						false,
					).insert !== undefined,
				);
			}
		});

		it("should correctly strip typeids in modifies", function () {
			var modifyChangeSet = root.serialize({ dirtyOnly: true });
			Utils._stripTypeids(modifyChangeSet);
			expect(modifyChangeSet).to.deep.equal({
				modify: {
					simulation: {
						modify: {
							subject1: {
								errorMsg: "test",
							},
							subject2: {
								insert: {
									subject3: {
										errorMsg: "",
										progress: 0,
									},
								},
								errorMsg: "test",
							},
						},
						thermalResults: {
							errorMsg: "test44",
						},
					},
					array: {
						insert: [
							[
								0,
								[
									{
										errorMsg: "",
										progress: 0,
									},
								],
							],
							[
								1,
								[
									{
										errorMsg: "",
										progress: 0,
									},
									{
										errorMsg: "",
										progress: 0,
									},
								],
							],
						],
						modify: [
							[
								1,
								[
									{
										errorMsg: "test",
									},
								],
							],
						],
					},
					map: {
						insert: {
							entry2: {
								errorMsg: "",
								progress: 0,
							},
						},
						modify: {
							entry: {
								errorMsg: "test",
							},
						},
					},
				},
			});
		});

		it("should correctly work for removes", function () {
			root.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE |
					BaseProperty.MODIFIED_STATE_FLAGS.DIRTY,
			);
			subject2.remove(subject3.getId());

			assert(
				Utils.getChangesByPath(
					sim.getId() + "." + subject2.getId() + "." + subject3.getId(),
					root,
					root.serialize({ dirtyOnly: true }),
					false,
				).removed === true,
			);

			root.remove(sim.getId());
			assert(
				Utils.getChangesByPath(
					sim.getId() + "." + subject2.getId() + "." + subject3.getId(),
					root,
					root.serialize({ dirtyOnly: true }),
					false,
				).removed === true,
			);
			assert(
				Utils.getChangesByPath(
					sim.getId() + "." + subject2.getId(),
					root,
					root.serialize({ dirtyOnly: true }),
					false,
				).removed === true,
			);
			assert(
				Utils.getChangesByPath(sim.getId(), root, root.serialize({ dirtyOnly: true }), false)
					.removed === true,
			);

			root.resolvePath("map").remove("entry2");
			root.resolvePath("array").remove(0);
			root.resolvePath("array").removeRange(1, 2);
		});

		it("should correctly strip typeids in removes", function () {
			var modifyChangeSet = root._serialize(true);
			Utils._stripTypeids(modifyChangeSet);
			expect(modifyChangeSet).to.deep.equal({
				modify: {
					array: {
						remove: [
							[0, 1],
							[2, 2],
						],
					},
					map: {
						remove: ["entry2"],
					},
				},
				remove: ["simulation"],
			});
		});

		it("should work for nested templates", function () {
			var nestedTemplate = PropertyFactory.create("autodesk.tests:nestedTemplate-1.0.0");
			nestedTemplate._properties.c.myNestedProp.errorMsg.value = "testString";
			var changeSet = nestedTemplate._serialize(true);

			var changes = Utils.getChangesByType("String", changeSet);
			expect(changes.modify["c.myNestedProp.errorMsg"]).to.equal("testString");

			expect(
				Utils.getChangesByPath("c.myNestedProp.errorMsg", nestedTemplate, changeSet, false),
			).to.have.keys("modify");
		});

		it("should work for an object with characters that have to be quoted", function () {
			var node = PropertyFactory.create(
				"autodesk.tests:property.with.quotable.characters-1.0.0",
			);
			node.get("simple_property").value = "test";
			node.get("test.property").value = "test";
			node.get('test"property"').value = "test";
			node.get("test[property]").get(".property.").get("test").value = "test";

			var changeSet = node._serialize(true);
			var changes = Utils.getChangesByType("String", changeSet);
			expect(changes.modify).to.have.keys(
				"simple_property",
				'"test.property"',
				'"test\\"property\\""',
				'"test[property]".".property.".test',
			);

			expect(Utils.getChangesByPath("simple_property", node, changeSet, false)).to.have.keys(
				"modify",
			);
			expect(Utils.getChangesByPath('"test.property"', node, changeSet, false)).to.have.keys(
				"modify",
			);
			expect(
				Utils.getChangesByPath('"test\\"property\\""', node, changeSet, false),
			).to.have.keys("modify");
			expect(
				Utils.getChangesByPath('"test[property]".".property.".test', node, changeSet, false),
			).to.have.keys("modify");
		});

		it("should work for a node property with characters that have to be quoted", function () {
			var node = PropertyFactory.create("NodeProperty");
			node.insert("simple_property", PropertyFactory.create("String", undefined, "test"));
			node.insert("test.property", PropertyFactory.create("String", undefined, "test"));
			node.insert('test"property"', PropertyFactory.create("String", undefined, "test"));
			node.insert("test[property]", PropertyFactory.create("NodeProperty"));
			node.get("test[property]").insert(".property.", PropertyFactory.create("NodeProperty"));
			node
				.get("test[property]")
				.get(".property.")
				.insert("test", PropertyFactory.create("String", undefined, "test"));

			var changeSet = node._serialize(true);
			var changes = Utils.getChangesByType("String", changeSet);
			expect(changes.insert).to.have.keys(
				"simple_property",
				'"test.property"',
				'"test\\"property\\""',
				'"test[property]".".property.".test',
			);

			expect(Utils.getChangesByPath("simple_property", node, changeSet, false)).to.have.keys(
				"insert",
			);
			expect(Utils.getChangesByPath('"test.property"', node, changeSet, false)).to.have.keys(
				"insert",
			);
			expect(
				Utils.getChangesByPath('"test\\"property\\""', node, changeSet, false),
			).to.have.keys("insert");
			expect(
				Utils.getChangesByPath('"test[property]".".property.".test', node, changeSet, false),
			).to.have.keys("insert");
		});
	});

	describe("Utils.getChangesToTokenizedPaths", function () {
		var CS = {
			insert: {
				"NodeProperty": {
					nested1: {
						insert: {
							NodeProperty: {
								nested2: {
									insert: {
										String: {
											string: "text",
											__doubleUnderscore: "text",
										},
									},
								},
							},
						},
					},
					nested2: {},
				},
				"array<>": {
					nestedArray: {
						insert: [
							[
								0,
								[
									{
										typeid: "NodeProperty",
									},
									{
										typeid: "NodeProperty",
										insert: {
											String: {
												text: "",
											},
										},
									},
								],
							],
						],
					},
				},
				"String": {
					string: "text",
				},
			},
		};

		it("should work using objects", function () {
			var visitedPaths = [];
			Utils.getChangesToTokenizedPaths(
				{
					String: {},
					nested1: {
						nested2: {
							string: {
								__hidden: {
									myCallback: function () {
										return "hello";
									},
									myValue: 1,
								},
							},
							___doubleUnderscore: {}, // Yes, there are 3 '_', as escapeLeadingDoubleUnderscore = true
						},
					},
					nestedArray: {
						1: {
							String: {},
						},
					},
				},
				CS,
				function (in_context, in_nested, in_tokenizedPath) {
					var currentPath = in_tokenizedPath.join(".");
					visitedPaths.push(currentPath);
					if (currentPath === "nested1.nested2.string") {
						expect(in_nested).to.exist;
						expect(in_nested.__hidden).to.exist;
						expect(in_nested.__hidden.myCallback).to.exist;
						expect(in_nested.__hidden.myCallback()).to.eql("hello");
						expect(in_nested.__hidden.myValue).to.eql(1);
					}
				},
				{
					rootOperation: "modify",
					rootTypeid: "NodeProperty",
					escapeLeadingDoubleUnderscore: true,
				},
			);
			expect(visitedPaths).to.deep.equal([
				"",
				"nested1",
				"nested1.nested2",
				"nested1.nested2.string",
				"nested1.nested2.__doubleUnderscore",
				"nestedArray",
				"nestedArray.1",
			]);
		});

		it("should work using maps", function () {
			var visitedPaths = [];
			Utils.getChangesToTokenizedPaths(
				new Map([
					["String", new Map()],
					[
						"nested1",
						new Map([
							[
								"nested2",
								new Map([
									[
										"string",
										new Map([
											[
												"__hidden",
												new Map([
													[
														"myCallback",
														function () {
															return "hello";
														},
													],
													["myValue", 1],
												]),
											],
										]),
									],
									["___doubleUnderscore", new Map()], // Yes, there are 3 '_', as escapeLeadingDoubleUnderscore = true
								]),
							],
						]),
					],
					["nestedArray", new Map([["1", new Map([["String", new Map()]])]])],
				]),
				CS,
				function (in_context, in_nested, in_tokenizedPath) {
					var currentPath = in_tokenizedPath.join(".");
					visitedPaths.push(currentPath);
					if (currentPath === "nested1.nested2.string") {
						expect(in_nested).to.exist;
						expect(in_nested).to.have.key("__hidden");
						expect(in_nested.get("__hidden")).to.have.all.keys("myCallback", "myValue");
						expect(in_nested.get("__hidden").get("myCallback")()).to.eql("hello");
						expect(in_nested.get("__hidden").get("myValue")).to.eql(1);
					}
				},
				{
					rootOperation: "modify",
					rootTypeid: "NodeProperty",
					escapeLeadingDoubleUnderscore: true,
				},
			);
			expect(visitedPaths).to.deep.equal([
				"",
				"nested1",
				"nested1.nested2",
				"nested1.nested2.string",
				"nested1.nested2.__doubleUnderscore",
				"nestedArray",
				"nestedArray.1",
			]);
		});

		it("should assume paths as literal when the escapeLeadingDoubleUnderscore flag is off ", function () {
			var visitedPaths = [];
			Utils.getChangesToTokenizedPaths(
				{
					nested1: {
						nested2: {
							__doubleUnderscore: {}, // The amount of underscores is the same as in the changeSet
						},
					},
				},
				CS,
				function (in_context, in_nested, in_tokenizedPath) {
					visitedPaths.push(in_tokenizedPath.join("."));
				},
				{
					rootOperation: "modify",
					rootTypeid: "NodeProperty",
					escapeLeadingDoubleUnderscore: false,
				},
			);
			expect(visitedPaths).to.deep.equal([
				"",
				"nested1",
				"nested1.nested2",
				"nested1.nested2.__doubleUnderscore",
			]);
		});
	});

	/*    describe('Utils.insertPropertyChangeIntoChangeset', function() {
          var checkPropertyForModifications = function(in_property, in_arrayTests) {
            // Prepare the check by appending a float Property
            var floatProperty = PropertyFactory.create('Float64', undefined, 10);
            in_property.insert('float', floatProperty);
            var rootProperty = in_property.getRoot();
            rootProperty.cleanDirty();

            var expectedTarget = in_arrayTests ?
                                   {insert: {Float64: {'float': 10}}, typeid: 'NodeProperty'} :
                                   {insert: {Float64: {'float': 10}}};

            // Check that creating a new insert operation works
            var emptyChangeSet = {};
            if (!in_arrayTests) {
              var result = Utils.insertPropertyChangeIntoChangeset(floatProperty.getParent(), rootProperty,
                                                                   emptyChangeSet, true);
              expect(result.propertyChangeSet).to.exist;
              expect(result.insert).to.be.true;
              result.propertyChangeSet.insert = {Float64: {'float': 10}};
              expect(emptyChangeSet).to.deep.equal(rootProperty._serialize(false));
            }

            // Check that inserting into a full serialization is a NOP
            var serializedChangeSet = rootProperty._serialize(false);
            var result = Utils.insertPropertyChangeIntoChangeset(floatProperty.getParent(), rootProperty,
                                                                 serializedChangeSet, true);
            expect(result.propertyChangeSet).to.exist;
            expect(result.propertyChangeSet).to.deep.equal(expectedTarget);
            expect(result.insert).to.be.true;
            expect(serializedChangeSet).to.deep.equal(rootProperty._serialize(false));

            // Check that a modify becomes an insert
            serializedChangeSet = rootProperty._serialize(false);
            result = Utils.insertPropertyChangeIntoChangeset(floatProperty.getParent(), rootProperty,
                                                             serializedChangeSet, false);
            expect(result.propertyChangeSet).to.exist;
            expect(result.propertyChangeSet).to.deep.equal(expectedTarget);
            expect(result.insert).to.be.true;
            expect(serializedChangeSet).to.deep.equal(rootProperty._serialize(false));

            // Modify the property to have a baseline to compare to
            floatProperty.value = 15;
            expectedTarget = in_arrayTests ?
                                 {modify: {Float64: {'float': 15}}, typeid: 'NodeProperty'} :
                                 {modify: {Float64: {'float': 15}}};

            // Check that creating a new modify operation works
            emptyChangeSet = {};
            result = Utils.insertPropertyChangeIntoChangeset(floatProperty.getParent(), rootProperty,
                                                             emptyChangeSet, false);
            expect(result.propertyChangeSet).to.exist;
            result.propertyChangeSet.modify = {Float64: {'float': 15}};
            expect(result.insert).to.be.false;
            expect(emptyChangeSet).to.deep.equal(rootProperty._serialize(true));

            // Check that retrieving an existing modify operation is possible
            serializedChangeSet = rootProperty._serialize(true);
            result = Utils.insertPropertyChangeIntoChangeset(floatProperty.getParent(), rootProperty,
                                                             serializedChangeSet, false);
            expect(result.propertyChangeSet).to.exist;
            expect(result.propertyChangeSet).to.deep.equal(expectedTarget);
            expect(result.insert).to.be.false;
            expect(serializedChangeSet).to.deep.equal(rootProperty._serialize(true));

            // Check that deleting properties returns the correct result
            var currentProperty = floatProperty.getParent();
            while (currentProperty && currentProperty.getParent()) {
              var parent = currentProperty.getParent();
              if (parent instanceof NodeProperty &&
                  parent._getDynamicChildrenReadOnly()[currentProperty.getId()]) {
                rootProperty.cleanDirty();
                parent.remove(currentProperty.getId());
                serializedChangeSet = rootProperty._serialize(true);

                result = Utils.insertPropertyChangeIntoChangeset(floatProperty.getParent(), rootProperty,
                                                                 serializedChangeSet, false);
                expect(result.remove).to.be.true;

                parent.insert(currentProperty.getId(), currentProperty);
                result = Utils.insertPropertyChangeIntoChangeset(floatProperty.getParent(), rootProperty,
                                                                 serializedChangeSet, false);
                expect(result.remove).to.be.true;
              }
              currentProperty = currentProperty.getParent();
            }
          };

          it('should work for nested NodeProperties', function() {
            var root = PropertyFactory.create('NodeProperty');
            var child1 = PropertyFactory.create('NodeProperty');
            root.insert('child', child1);
            var child2 = PropertyFactory.create('NodeProperty');
            child1.insert('child', child2);

            checkPropertyForModifications(child2, false);
          });

          it('should work for NodeProperties in a template', function() {
            var root = PropertyFactory.create('NodeProperty');
            var child = PropertyFactory.create('autodesk.test:staticNodeChild-1.0.0');
            root.insert('child', child);

            checkPropertyForModifications(child.get('nodeProperty'), false);
          });

          it('should work for NodeProperties in a map', function() {
            var root = PropertyFactory.create('NodeProperty');
            var child =  PropertyFactory.create('NodeProperty', 'map');
            root.insert('map', child);
            child.insert('entry', PropertyFactory.create('NodeProperty'));

            checkPropertyForModifications(child.get('entry'), false);
          });

          it('should work for NodeProperties in an array', function() {
            var root = PropertyFactory.create('NodeProperty');
            var arrayProp = PropertyFactory.create('NodeProperty', 'array');
            root.insert('array', arrayProp);
            arrayProp.push(PropertyFactory.create('NodeProperty'));

            checkPropertyForModifications(arrayProp.get(0), true);
          });

          it('should work for NodeProperties in an array with complex modifications', function() {
            var root = PropertyFactory.create('NodeProperty');
            var arrayProp = PropertyFactory.create('NodeProperty', 'array');
            root.insert('array', arrayProp);
            arrayProp.push(PropertyFactory.create('NodeProperty'));
            arrayProp.push(PropertyFactory.create('NodeProperty'));
            arrayProp.push(PropertyFactory.create('NodeProperty'));
            arrayProp.push(PropertyFactory.create('NodeProperty'));
            arrayProp.push(PropertyFactory.create('NodeProperty'));
            var floatProperty = PropertyFactory.create('Float64', undefined, 10);
            arrayProp.get(3).insert('float', floatProperty);
            root.cleanDirty();

            // Create a complex modification set
            floatProperty.value = 15;
            arrayProp.removeRange(0, 2);
            arrayProp.insertRange(0, [PropertyFactory.create('NodeProperty')]);
            arrayProp.push(PropertyFactory.create('NodeProperty'));
            var serializedChangeSet = root.serialize({'dirtyOnly': true});
            var expectedChangeset = floatProperty.getParent().serialize({'dirtyOnly': true, 'includeRootTypeid': true});

            var result = Utils.insertPropertyChangeIntoChangeset(floatProperty.getParent(), root,
                                                             serializedChangeSet, false);
            expect(result.propertyChangeSet).to.deep.equal(expectedChangeset);
            expect(result.insert).to.be.false;
          });
        }); */

	describe("Utils.getFilteredChangeSetByPaths", function () {
		var changeSet = {
			insert: {
				"NodeProperty": {
					nested1: {
						insert: {
							"NodeProperty": {
								nested2: {
									insert: {
										String: {
											string: "text",
										},
									},
								},
							},
							"array<>": {
								nestedArray: {
									insert: [
										[
											0,
											[
												{
													typeid: "NodeProperty",
												},
												{
													typeid: "NodeProperty",
													insert: {
														String: {
															text: "",
														},
													},
												},
											],
										],
									],
								},
							},
							"map<>": {
								trulyNestedMap: {
									insert: {
										String: {
											key1: "The value is 1",
										},
									},
								},
							},
						},
					},
					nested3: {},
				},
				"map<>": {
					nestedMap: {
						insert: {
							String: {
								nestedMapString: "Sirius",
							},
							Bool: {
								nestedMapBoolean: true,
							},
						},
					},
				},
				"map<mysample:asset-1.0.0>": {
					assetMap: {
						insert: {
							"mysample:asset-1.0.0": {
								1: {
									String: {
										name: "test asset 1",
									},
									NodeProperty: {
										components: {},
									},
								},
							},
						},
					},
				},
				"Reference<String>": {
					refProp: "/test.prop",
				},
				"RepositoryReferenceProperty": {
					refRepoProp: {
						Bool: {
							followBranch: false,
						},
						String: {
							branchGUID: "846fe4a1-e595-44bf-8cc0-f1d8f6d104a6",
							commitGUID: "4c611c89-8241-4764-958e-77470bba3b9b",
							repositoryGUID: "f438bed5-d8f2-4c70-a7e0-aa52b8929d2a",
						},
					},
				},
				"NamedProperty": {
					namedProp: {
						String: {
							guid: "e763527c-7f49-417c-8df3-9fb7f90a1932",
						},
					},
				},
				"NamedNodeProperty": {
					namedNodeProp: {
						String: {
							guid: "efc68477-53b1-49ac-bd3f-e05a21f85a32",
						},
						insert: {
							"enum<autodesk.core:UnitsEnum-1.0.0>": {
								enumProp: 0,
							},
							"String": {
								test: "blah",
							},
						},
					},
				},
				"autodesk.test:testProp-1.0.0": {
					customTemplate: {
						"Uint32": {
							a: 922337203685,
						},
						"String": {
							"b": "hello",
							"nested.c.d.e": "world",
							"nested.c.d.f": "hello",
						},
						"set<NamedProperty>": {
							nestedSet: {
								insert: {
									NamedProperty: {
										"91a59cb6-9881-2b5f-2366-84dbdc8b6838": {
											String: {
												guid: "91a59cb6-9881-2b5f-2366-84dbdc8b6838",
											},
										},
									},
								},
							},
						},
					},
				},
				"String": {
					emptyString: "",
				},
			},
			modify: {
				"NodeProperty": {
					nested4: {
						insert: {
							Uint32: {
								number: 4,
							},
						},
						remove: ["nested5", "nested6"],
					},
				},
				"array<Float32>": {
					nestedArray2: {
						modify: [[0, [0.707, 0.707, 0], [0, 0, 1]]],
					},
				},
			},
			remove: ["nested7"],
		};

		it("should filter change sets by paths resolving to all types (NodeProperty, array, map, set, NamedNodeProperty, Reference, Primitive types)", function () {
			var filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, [
				"nested1",
				"nested4.nested5",
				"nested4.number",
			]);
			expect(filteredCS).to.eql({
				insert: {
					NodeProperty: {
						nested1: {
							insert: {
								"NodeProperty": {
									nested2: {
										insert: {
											String: {
												string: "text",
											},
										},
									},
								},
								"array<>": {
									nestedArray: {
										insert: [
											[
												0,
												[
													{
														typeid: "NodeProperty",
													},
													{
														typeid: "NodeProperty",
														insert: {
															String: {
																text: "",
															},
														},
													},
												],
											],
										],
									},
								},
								"map<>": {
									trulyNestedMap: {
										insert: {
											String: {
												key1: "The value is 1",
											},
										},
									},
								},
							},
						},
					},
				},
				modify: {
					NodeProperty: {
						nested4: {
							remove: ["nested5"],
							insert: {
								Uint32: {
									number: 4,
								},
							},
						},
					},
				},
			});

			filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, [
				"nested7",
				"nested4",
				"nested1.nested2",
			]);

			expect(filteredCS).to.eql({
				insert: {
					NodeProperty: {
						nested1: {
							insert: {
								NodeProperty: {
									nested2: {
										insert: {
											String: {
												string: "text",
											},
										},
									},
								},
							},
						},
					},
				},
				modify: {
					NodeProperty: {
						nested4: {
							insert: {
								Uint32: {
									number: 4,
								},
							},
							remove: ["nested5", "nested6"],
						},
					},
				},
				remove: ["nested7"],
			});

			filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, [
				"nested1.nestedArray",
				"nestedMap.nestedMapBoolean",
				"nestedArray2",
			]);

			expect(filteredCS).to.eql({
				insert: {
					"NodeProperty": {
						nested1: {
							insert: {
								"array<>": {
									nestedArray: {
										insert: [
											[
												0,
												[
													{
														typeid: "NodeProperty",
													},
													{
														typeid: "NodeProperty",
														insert: {
															String: {
																text: "",
															},
														},
													},
												],
											],
										],
									},
								},
							},
						},
					},
					"map<>": {
						nestedMap: {
							insert: {
								Bool: {
									nestedMapBoolean: true,
								},
							},
						},
					},
				},
				modify: {
					"array<Float32>": {
						nestedArray2: {
							modify: [[0, [0.707, 0.707, 0], [0, 0, 1]]],
						},
					},
				},
			});

			filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, [
				"namedProp.guid",
				"namedNodeProp.enumProp",
				"namedNodeProp.guid",
			]);

			expect(filteredCS).to.eql({
				insert: {
					NamedProperty: {
						namedProp: {
							String: {
								guid: "e763527c-7f49-417c-8df3-9fb7f90a1932",
							},
						},
					},
					NamedNodeProperty: {
						namedNodeProp: {
							String: {
								guid: "efc68477-53b1-49ac-bd3f-e05a21f85a32",
							},
							insert: {
								"enum<autodesk.core:UnitsEnum-1.0.0>": {
									enumProp: 0,
								},
							},
						},
					},
				},
			});

			filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, [
				"customTemplate.a",
				"customTemplate.nested.c.d.e",
				"customTemplate.nestedSet",
			]);

			expect(filteredCS).to.eql({
				insert: {
					"autodesk.test:testProp-1.0.0": {
						customTemplate: {
							"Uint32": {
								a: 922337203685,
							},
							"String": {
								"nested.c.d.e": "world",
							},
							"set<NamedProperty>": {
								nestedSet: {
									insert: {
										NamedProperty: {
											"91a59cb6-9881-2b5f-2366-84dbdc8b6838": {
												String: {
													guid: "91a59cb6-9881-2b5f-2366-84dbdc8b6838",
												},
											},
										},
									},
								},
							},
						},
					},
				},
			});

			filteredCS = Utils.getFilteredChangeSetByPaths(
				changeSet,
				new Map([
					[
						"customTemplate",
						new Map([
							["a", new Map()],
							["nested", new Map([["c", new Map([["d", new Map([["e", new Map()]])]])]])],
							["nestedSet", new Map()],
						]),
					],
				]),
			);

			expect(filteredCS).to.eql({
				insert: {
					"autodesk.test:testProp-1.0.0": {
						customTemplate: {
							"Uint32": {
								a: 922337203685,
							},
							"String": {
								"nested.c.d.e": "world",
							},
							"set<NamedProperty>": {
								nestedSet: {
									insert: {
										NamedProperty: {
											"91a59cb6-9881-2b5f-2366-84dbdc8b6838": {
												String: {
													guid: "91a59cb6-9881-2b5f-2366-84dbdc8b6838",
												},
											},
										},
									},
								},
							},
						},
					},
				},
			});

			var filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, [
				"customTemplate.nested.c",
			]);

			expect(filteredCS).to.eql({
				insert: {
					"autodesk.test:testProp-1.0.0": {
						customTemplate: {
							String: {
								"nested.c.d.e": "world",
								"nested.c.d.f": "hello",
							},
						},
					},
				},
			});

			var filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, [
				"customTemplate.nested.c.d",
			]);

			expect(filteredCS).to.eql({
				insert: {
					"autodesk.test:testProp-1.0.0": {
						customTemplate: {
							String: {
								"nested.c.d.e": "world",
								"nested.c.d.f": "hello",
							},
						},
					},
				},
			});

			filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, [
				"refProp",
				"refRepoProp.commitGUID",
				"refRepoProp.followBranch",
			]);

			expect(filteredCS).to.eql({
				insert: {
					"Reference<String>": {
						refProp: "/test.prop",
					},
					"RepositoryReferenceProperty": {
						refRepoProp: {
							Bool: {
								followBranch: false,
							},
							String: {
								commitGUID: "4c611c89-8241-4764-958e-77470bba3b9b",
							},
						},
					},
				},
			});

			filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, ["assetMap[1].name"]);
			expect(filteredCS).to.eql({
				insert: {
					"map<mysample:asset-1.0.0>": {
						assetMap: {
							insert: {
								"mysample:asset-1.0.0": {
									1: {
										String: {
											name: "test asset 1",
										},
									},
								},
							},
						},
					},
				},
			});

			// For maps, using dots as separators, instead of brackets, is also supported.
			filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, ["assetMap.1.name"]);
			expect(filteredCS).to.eql({
				insert: {
					"map<mysample:asset-1.0.0>": {
						assetMap: {
							insert: {
								"mysample:asset-1.0.0": {
									1: {
										String: {
											name: "test asset 1",
										},
									},
								},
							},
						},
					},
				},
			});
		});

		it("should ignore overlapping paths", function () {
			var filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, [
				"customTemplate",
				"customTemplate.a",
				"customTemplate.nested.c.d.e",
				"customTemplate.nestedSet",
			]);

			expect(filteredCS).to.eql({
				insert: {
					"autodesk.test:testProp-1.0.0": {
						customTemplate: {
							"Uint32": {
								a: 922337203685,
							},
							"String": {
								"b": "hello",
								"nested.c.d.e": "world",
								"nested.c.d.f": "hello",
							},
							"set<NamedProperty>": {
								nestedSet: {
									insert: {
										NamedProperty: {
											"91a59cb6-9881-2b5f-2366-84dbdc8b6838": {
												String: {
													guid: "91a59cb6-9881-2b5f-2366-84dbdc8b6838",
												},
											},
										},
									},
								},
							},
						},
					},
				},
			});

			var filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, [
				"customTemplate.nestedSet[91a59cb6-9881-2b5f-2366-84dbdc8b6838].guid",
			]);

			expect(filteredCS).to.eql({
				insert: {
					"autodesk.test:testProp-1.0.0": {
						customTemplate: {
							"set<NamedProperty>": {
								nestedSet: {
									insert: {
										NamedProperty: {
											"91a59cb6-9881-2b5f-2366-84dbdc8b6838": {
												String: {
													guid: "91a59cb6-9881-2b5f-2366-84dbdc8b6838",
												},
											},
										},
									},
								},
							},
						},
					},
				},
			});

			// Flip order
			var filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, [
				"customTemplate.a",
				"customTemplate.nested.c.d.e",
				"customTemplate",
				"customTemplate.nestedSet",
			]);

			expect(filteredCS).to.eql({
				insert: {
					"autodesk.test:testProp-1.0.0": {
						customTemplate: {
							"Uint32": {
								a: 922337203685,
							},
							"String": {
								"b": "hello",
								"nested.c.d.e": "world",
								"nested.c.d.f": "hello",
							},
							"set<NamedProperty>": {
								nestedSet: {
									insert: {
										NamedProperty: {
											"91a59cb6-9881-2b5f-2366-84dbdc8b6838": {
												String: {
													guid: "91a59cb6-9881-2b5f-2366-84dbdc8b6838",
												},
											},
										},
									},
								},
							},
						},
					},
				},
			});

			// Duplicate paths
			var filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, [
				"customTemplate.a",
				"customTemplate",
				"customTemplate.nested.c.d.e",
				"customTemplate",
				"customTemplate.nestedSet",
			]);

			expect(filteredCS).to.eql({
				insert: {
					"autodesk.test:testProp-1.0.0": {
						customTemplate: {
							"Uint32": {
								a: 922337203685,
							},
							"String": {
								"b": "hello",
								"nested.c.d.e": "world",
								"nested.c.d.f": "hello",
							},
							"set<NamedProperty>": {
								nestedSet: {
									insert: {
										NamedProperty: {
											"91a59cb6-9881-2b5f-2366-84dbdc8b6838": {
												String: {
													guid: "91a59cb6-9881-2b5f-2366-84dbdc8b6838",
												},
											},
										},
									},
								},
							},
						},
					},
				},
			});

			var filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, ["emptyString"]);

			expect(filteredCS).to.eql({
				insert: {
					String: {
						emptyString: "",
					},
				},
			});
		});

		it("should return an empty change set when filtering by a path that does not exist", function () {
			var filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, [
				"path.that.does.not.exist",
				"dontExist",
				"does.not.exist",
			]);

			expect(filteredCS).to.be.eql({});

			filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, [
				"nested7",
				"nested4",
				"nested1.nested2",
				"path.that.does.not.exist",
				"dontExist",
				"does.not.exist",
			]);

			expect(filteredCS).to.eql({
				insert: {
					NodeProperty: {
						nested1: {
							insert: {
								NodeProperty: {
									nested2: {
										insert: {
											String: {
												string: "text",
											},
										},
									},
								},
							},
						},
					},
				},
				modify: {
					NodeProperty: {
						nested4: {
							insert: {
								Uint32: {
									number: 4,
								},
							},
							remove: ["nested5", "nested6"],
						},
					},
				},
				remove: ["nested7"],
			});

			filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, [
				"nested1.nested2",
				"nested1.nested6",
			]);

			expect(filteredCS).to.eql({
				insert: {
					NodeProperty: {
						nested1: {
							insert: {
								NodeProperty: {
									nested2: {
										insert: {
											String: {
												string: "text",
											},
										},
									},
								},
							},
						},
					},
				},
			});

			// Partially matched paths are included
			var filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, ["assetMap[2]"]);
			expect(filteredCS).to.eql({
				insert: {
					"map<mysample:asset-1.0.0>": {
						assetMap: {},
					},
				},
			});

			// Closest partially matched path 'customTemplate.nested.c.d' cannot be included
			var filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, [
				"customTemplate.nested.c.d.g",
			]);
			expect(filteredCS).to.eql({
				insert: {
					"autodesk.test:testProp-1.0.0": {
						customTemplate: {},
					},
				},
			});

			// Partial match should also work with nested properties
			var filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, [
				"nested1.trulyNestedMap[newKey]",
			]);
			expect(filteredCS).to.eql({
				insert: {
					NodeProperty: {
						nested1: {
							insert: {
								"map<>": {
									trulyNestedMap: {},
								},
							},
						},
					},
				},
			});

			// Filter a nested non existing entry from a templated property
			var filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, [
				"customTemplate.nestedSet.nonExisting",
				"customTemplate.a",
			]);
			expect(filteredCS).to.eql({
				insert: {
					"autodesk.test:testProp-1.0.0": {
						customTemplate: {
							"Uint32": {
								a: 922337203685,
							},
							"set<NamedProperty>": {
								nestedSet: {},
							},
						},
					},
				},
			});

			// Make sure, nested removes are treated correctly
			var filteredCS = Utils.getFilteredChangeSetByPaths(changeSet, ["nested7.abcd"]);
			expect(filteredCS).to.eql({
				remove: ["nested7"],
			});
		});

		it("should fail filtering change sets with paths that resolve into arrays and sets", function () {
			var failedFilteredFunc = Utils.getFilteredChangeSetByPaths.bind(null, changeSet, [
				"nested1.nestedArray[0]",
			]);

			expect(failedFilteredFunc).to.throw(Error, MSG.FILTER_PATH_WITHIN_ARRAY);

			// With valid paths
			failedFilteredFunc = Utils.getFilteredChangeSetByPaths.bind(null, changeSet, [
				"customTemplate",
				"nested1.nestedArray[0]",
			]);

			expect(failedFilteredFunc).to.throw(Error, MSG.FILTER_PATH_WITHIN_ARRAY);
		});

		it("should work for ChangeSet with segments requiring escapes for NodeProperties", function () {
			var node = PropertyFactory.create("NodeProperty");
			node.insert('."test".', PropertyFactory.create("NodeProperty"));
			node
				.get('."test".')
				.insert("[abcd]", PropertyFactory.create("String", undefined, "test"));

			var CS = node.serialize();
			var filteredCS = Utils.getFilteredChangeSetByPaths(CS, ['".\\"test\\"."."[abcd]"']);
			expect(filteredCS).to.deep.equal(CS);

			node.cleanDirty();
			node.get('."test".').get("[abcd]").setValue("test2");

			// Test a modification
			CS = node.serialize({ dirtyOnly: true });
			filteredCS = Utils.getFilteredChangeSetByPaths(CS, ['".\\"test\\"."."[abcd]"']);
			expect(filteredCS).to.deep.equal(CS);

			// Test a removal
			node.cleanDirty();
			node.get('."test".').remove("[abcd]");
			CS = node.serialize({ dirtyOnly: true });
			filteredCS = Utils.getFilteredChangeSetByPaths(CS, ['".\\"test\\"."']);
			expect(filteredCS).to.deep.equal(CS);
		});

		it("should work for ChangeSet with segments requiring escapes in template", function () {
			var node = PropertyFactory.create(
				"autodesk.tests:property.with.quotable.characters-1.0.0",
			);
			node.cleanDirty();

			node.get(["test[property]", ".property."]).get("test").value = "test";

			var CS = node.serialize({ dirtyOnly: true });
			var filteredCS = Utils.getFilteredChangeSetByPaths(CS, [
				'"test[property]".".property."',
			]);
			expect(filteredCS).to.deep.equal(CS);
		});

		it("should work for reversible ChangeSet", function () {
			var originalChangeSet = {
				insert: {
					"autodesk.tests:AnonymousMapTestPropertyID-1.0.0": {
						F: { String: { stringProperty: "" } },
					},
				},
				remove: ["B", "C"],
				modify: {
					"autodesk.tests:AnonymousMapTestPropertyID-1.0.0": {
						A: { String: { stringProperty: "hello" } },
					},
				},
			};
			var parentChangeSet = {
				insert: {
					"autodesk.tests:AnonymousMapTestPropertyID-1.0.0": {
						A: { String: { stringProperty: "" } },
						B: { String: { stringProperty: "" } },
						C: { String: { stringProperty: "" } },
					},
				},
			};

			var cs = new ChangeSet(originalChangeSet);
			cs._toReversibleChangeSet(parentChangeSet);

			var filteredCS = Utils.getFilteredChangeSetByPaths(cs.getSerializedChangeSet(), [
				"A",
				"B",
				"F",
			]);

			expect(filteredCS).to.eql({
				insert: {
					"autodesk.tests:AnonymousMapTestPropertyID-1.0.0": {
						F: { String: { stringProperty: "" } },
					},
				},
				remove: {
					"autodesk.tests:AnonymousMapTestPropertyID-1.0.0": {
						B: { String: { stringProperty: "" } },
					},
				},
				modify: {
					"autodesk.tests:AnonymousMapTestPropertyID-1.0.0": {
						A: {
							String: {
								stringProperty: {
									value: "hello",
									oldValue: "",
								},
							},
						},
					},
				},
			});
		});
	});

	describe("Utils.getFilteredOutChangeSetByPaths", () => {
		const changeset = {
			insert: {
				"map<NodeProperty>": {
					assets: {
						insert: {
							"autodesk.test:sample-1.0.0": {
								Prop1: {
									String: {
										guid: "Prop1",
									},
								},
								Prop2: {
									String: {
										guid: "Prop2",
									},
								},
								Prop3: {
									String: {
										guid: "Prop3",
									},
								},
							},
						},
					},
				},
			},
		};

		const singleExclusion = {
			insert: {
				"map<NodeProperty>": {
					assets: {
						insert: {
							"autodesk.test:sample-1.0.0": {
								Prop1: {
									String: {
										guid: "Prop1",
									},
								},
								Prop2: {
									String: {
										guid: "Prop2",
									},
								},
							},
						},
					},
				},
			},
		};

		const multiExclusion = {
			insert: {
				"map<NodeProperty>": {
					assets: {
						insert: {
							"autodesk.test:sample-1.0.0": {
								Prop1: {
									String: {
										guid: "Prop1",
									},
								},
							},
						},
					},
				},
			},
		};

		it("should exclude single given path", () => {
			let res = Utils.excludePathsFromChangeSet(changeset, "assets[Prop3]");
			expect(res).to.be.deep.equal(singleExclusion);
		});

		it("should exclude single given path in array", () => {
			let res = Utils.excludePathsFromChangeSet(changeset, ["assets[Prop3]"]);
			expect(res).to.be.deep.equal(singleExclusion);
		});

		it("should exclude every given path in array", () => {
			let res = Utils.excludePathsFromChangeSet(changeset, ["assets[Prop3]", "assets[Prop2]"]);
			expect(res).to.be.deep.equal(multiExclusion);
		});

		it("should return undefined if no changeset is passed", () => {
			let res = Utils.excludePathsFromChangeSet(undefined, ["assets[Prop3]"]);
			expect(res).to.be.undefined;
		});

		it("should not exclude if no paths are passed", () => {
			expect(Utils.excludePathsFromChangeSet(changeset)).to.be.deep.equal(changeset);
			expect(Utils.excludePathsFromChangeSet(changeset, "")).to.be.deep.equal(changeset);
			expect(Utils.excludePathsFromChangeSet(changeset, [])).to.be.deep.equal(changeset);
		});

		it("should not exclude if an invalid path is passed", () => {
			expect(Utils.excludePathsFromChangeSet(changeset, ["a.b.c"])).to.be.deep.equal(
				changeset,
			);
		});

		it("should copy the changeset", () => {
			expect(Utils.excludePathsFromChangeSet(changeset, ["assets[prop3]"])).to.not.be.equal(
				changeset,
			);
		});
	});
});
