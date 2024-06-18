/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview In this file, we will test the functions of a BaseProperty object
 * described in /src/properties/baseProperty.js
 */

var PropertyFactory, ChangeSet, MSG, BaseProperty;

describe("BaseProperty", function () {
	/**
	 * Get all the objects we need in this test here.
	 */
	before(function () {
		PropertyFactory = require("../..").PropertyFactory;
		ChangeSet = require("@fluid-experimental/property-changeset").ChangeSet;
		MSG = require("@fluid-experimental/property-common").constants.MSG;
		BaseProperty = require("../..").BaseProperty;

		var TestPropertyObject = {
			typeid: "autodesk.tests:property.with.special.characters-1.0.0",
			properties: [
				{ id: "simple_property", typeid: "String" },
				{ id: "test.property", typeid: "String" },
				{ id: 'test"property"', typeid: "String" },
				{
					id: "test[property]",
					properties: [
						{
							id: ".property.",
							properties: [{ id: "test", typeid: "String" }],
						},
					],
				},
			],
		};

		PropertyFactory._reregister(TestPropertyObject);
	});

	describe("Serializing a BaseProperty with special characters", function () {
		it("should be possible to serialize a property with special characters", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			myProp._properties["test.property"].value = "a";
			myProp._properties['test"property"'].value = "b";
			myProp._properties["test[property]"][".property."]["test"].value = "c";

			var serialized = myProp._serialize(false);

			var myProp2 = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			myProp2.deserialize(serialized);
			expect(myProp2._properties["test.property"].value).to.equal("a");
			expect(myProp2._properties['test"property"'].value).to.equal("b");
			expect(myProp2._properties["test[property]"][".property."]["test"].value).to.equal("c");
		});
	});

	describe("Get should work", function () {
		// Test whether .get accepts the correct parameters
		it("should accept an id (string) or an array of ids", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			var correctArrayFn = function () {
				myProp.get(["test"]);
			};
			var correctStringFn = function () {
				myProp.get("test");
			};
			expect(correctArrayFn).to.not.throw();
			expect(correctStringFn).to.not.throw();
		});
		// .get(['test1','test2']) === .get('test1').get('test2')
		it("when an array is passed, it should do a .get for each id in the array", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			expect(myProp.get(["test[property]", ".property.", "test"])).to.equal(
				myProp.get("test[property]").get(".property.").get("test"),
			);
		});

		it("when an array is passed with a bad path, it should return undefined", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			expect(myProp.get(["wrong path", ".property", "test"])).to.be.undefined;
		});

		it("should work with raise level path tokens", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			expect(
				myProp.get([
					"test[property]",
					".property.",
					BaseProperty.PATH_TOKENS.UP,
					".property.",
					"test",
				]),
			).to.deep.equal(myProp.get("test[property]").get(".property.").get("test"));
			expect(
				myProp.get([
					"test[property]",
					".property.",
					BaseProperty.PATH_TOKENS.UP,
					BaseProperty.PATH_TOKENS.UP,
					"simple_property",
				]),
			).to.deep.equal(myProp.get("simple_property"));
		});

		it("should work with path root tokens", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			expect(myProp.get([BaseProperty.PATH_TOKENS.ROOT])).to.equal(myProp);
			expect(myProp.get([BaseProperty.PATH_TOKENS.ROOT, "simple_property"])).to.equal(
				myProp.get("simple_property"),
			);
			expect(myProp.get("test[property]").get([BaseProperty.PATH_TOKENS.ROOT])).to.equal(
				myProp,
			);
		});
	});

	describe("GetValue should work", function () {
		it("should return the value of a primitive property", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			myProp._properties["test.property"].value = "a";
			var myValue = myProp.getValue(["test.property"]);
			expect(myValue).to.equal("a");
		});

		it("should work with an array of paths", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			myProp.get(["test[property]", ".property.", "test"]).setValue("b");
			expect(myProp.getValue(["test[property]", ".property.", "test"])).to.equal("b");
		});

		it("should throw if using .getValue on a non-primitive property", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			var incorrectFn = function () {
				myProp.getValue(["test[property]"]);
			};
			expect(incorrectFn).to.throw();
		});
	});

	describe("GetValues should work", function () {
		it("should return the values of a property", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			myProp.setValues({
				"simple_property": "string1",
				'test"property"': "string3",
				"test[property]": {
					".property.": {
						test: "string4",
					},
				},
			});

			expect(myProp.getValues()).to.deep.equal({
				"simple_property": "string1",
				"test.property": "",
				'test"property"': "string3",
				"test[property]": {
					".property.": {
						test: "string4",
					},
				},
			});
		});

		it("setValues should accept the output of getValues as a valid input", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			myProp.setValues({
				"simple_property": "string1",
				'test"property"': "string3",
				"test[property]": {
					".property.": {
						test: "string4",
					},
				},
			});

			var correctFn = function () {
				myProp.setValues(myProp.getValues());
			};
			expect(correctFn).to.not.throw();
		});
	});

	describe("setValues should work", function () {
		it("should accept an object and set each values in that object", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			myProp.setValues({
				"simple_property": "string1",
				"test[property]": {
					".property.": {
						test: "string2",
					},
				},
			});
			expect(myProp.get("simple_property").getValue()).to.equal("string1");
			expect(myProp.get(["test[property]", ".property.", "test"]).getValue()).to.equal(
				"string2",
			);
		});
		it("should throw if trying to insert in a non-exiting path", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			var invalidFunction = function () {
				myProp.setValues({
					"simple_property": "string1",
					"test[property]": {
						".property.": {
							test123: "string2",
						},
					},
				});
			};
			// TODO: move this to constants.js
			expect(invalidFunction).to.throw(MSG.SET_VALUES_PATH_INVALID + "test123");
		});

		it("should throw if trying to insert into a path that resolves to a property", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			var invalidFunction = function () {
				myProp.setValues({
					"simple_property": "string1",
					"test[property]": {
						".property.": "string2",
					},
				});
			};
			expect(invalidFunction).to.throw(MSG.SET_VALUES_PATH_PROPERTY + ".property.");
		});
	});

	describe("Path resolution should work", function () {
		// Test whether the right paths are returned
		it("should work with getAbsolutePath", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);

			expect(myProp.get("simple_property").getAbsolutePath()).to.equal("/simple_property");
			expect(myProp.get("test.property").getAbsolutePath()).to.equal('/"test.property"');
			expect(myProp.get('test"property"').getAbsolutePath()).to.equal('/"test\\"property\\""');
			expect(myProp.get("test[property]").getAbsolutePath()).to.equal('/"test[property]"');
			expect(myProp.get("test[property]").get(".property.").getAbsolutePath()).to.equal(
				'/"test[property]".".property."',
			);
			expect(
				myProp.get("test[property]").get(".property.").get("test").getAbsolutePath(),
			).to.equal('/"test[property]".".property.".test');
		});

		it("should work with getRelativePath", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			var nested = myProp.get("test[property]");
			expect(
				myProp.get(["test[property]", ".property.", "test"]).getRelativePath(nested),
			).to.equal('".property.".test');
			expect(
				myProp
					.get(["test[property]", ".property.", "test"])
					.getRelativePath(myProp.get("simple_property")),
			).to.equal('../"test[property]".".property.".test');
			expect(
				nested.getRelativePath(myProp.get(["test[property]", ".property.", "test"])),
			).to.equal("../../");
		});

		// Test that path resolution works
		it("should work with resolvePath", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);

			expect(myProp.resolvePath("simple_property")).to.equal(myProp.get("simple_property"));
			expect(myProp.resolvePath('"test.property"')).to.equal(myProp.get("test.property"));
			expect(myProp.resolvePath('"test\\"property\\""')).to.equal(
				myProp.get('test"property"'),
			);
			expect(myProp.resolvePath('"test[property]"')).to.equal(myProp.get("test[property]"));
			expect(myProp.resolvePath('"test[property]".".property."')).to.equal(
				myProp.get("test[property]").get(".property."),
			);
			expect(myProp.resolvePath('"test[property]".".property.".test')).to.equal(
				myProp.get("test[property]").get(".property.").get("test"),
			);

			expect(myProp.resolvePath("/")).to.equal(myProp);
			expect(myProp.resolvePath("/simple_property")).to.equal(myProp.get("simple_property"));
			expect(myProp.get("simple_property").resolvePath("/")).to.equal(myProp);
			expect(myProp.get("simple_property").resolvePath("/simple_property")).to.equal(
				myProp.get("simple_property"),
			);
		});

		it("should return undefined for invalid paths", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);

			expect(myProp.resolvePath("invalid_path")).to.be.undefined;
			expect(myProp.resolvePath("invalid_path.invalid_child")).to.be.undefined;
		});
	});

	describe("cleanDirty", function () {
		it("should work for paths with special characters", function () {
			var property = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			property.resolvePath('"test[property]".".property.".test').value = "test";
			property.cleanDirty();
			expect(property._serialize(true)).to.be.empty;
			expect(property.getPendingChanges()).to.deep.equal(new ChangeSet({}));
		});
	});

	it("should clone the property set", function (done) {
		var nodeProperty = PropertyFactory.create("NodeProperty");

		nodeProperty.deserialize({
			insert: {
				String: {
					result1: "foo",
					result2: "bar",
				},
				NodeProperty: {
					result3: {
						insert: {
							Uint32: {
								result4: 4,
							},
						},
					},
				},
			},
		});

		var clone = nodeProperty.clone();

		expect(nodeProperty._serialize(false)).to.eql(clone._serialize(false));

		done();
	});

	it("should support reapplying dirty flags on non-identical changeSets", function (done) {
		let nodeProperty = PropertyFactory.create("NodeProperty");

		nodeProperty.insert("result1", PropertyFactory.create("String"));
		nodeProperty.insert("result2", PropertyFactory.create("String"));
		nodeProperty.insert("result3", PropertyFactory.create("Int32"));
		nodeProperty.insert("result4", PropertyFactory.create("Int32"));

		const changeset1 = {
			String: {
				result1: "foo",
				result2: "bar",
			},
		};

		const changeset2 = {
			Int32: {
				result3: 10,
				result4: 11,
			},
		};

		nodeProperty._reapplyDirtyFlags(changeset1, changeset2);

		done();
	});

	it("should be able to handle duplicate namespace", function () {
		var ANumber = {
			typeid: "autodesk.tests:ANumber-1.0.0",
			properties: [
				{
					id: "aValue",
					typeid: "Int32",
				},
			],
		};
		PropertyFactory.register(ANumber);

		var SomeNumbers = {
			typeid: "autodesk.tests:SomeNumbers-1.0.0",
			properties: [
				{ id: "aValue", typeid: "autodesk.tests:ANumber-1.0.0" },
				{ id: "anotherValue", typeid: "autodesk.tests:ANumber-1.0.0" },
				{ id: "thirdValue", typeid: "autodesk.tests:ANumber-1.0.0" },
			],
		};
		PropertyFactory.register(SomeNumbers);

		var originalSomeNumbers = PropertyFactory.create(SomeNumbers.typeid);

		let root = PropertyFactory.create("NodeProperty");
		root.insert("aValue", originalSomeNumbers);

		var someNumbers = root.resolvePath("aValue");
		expect(someNumbers).to.equal(originalSomeNumbers);
		var aNumber = root.resolvePath("aValue.aValue");
		expect(aNumber).to.exist;
		var aValue = root.resolvePath("aValue.aValue.aValue");
		expect(aValue).to.exist;
	});

	describe("getContext", function () {
		it("should work with context of single", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			expect(myProp.getContext()).to.equal("single");
		});
		it("should work with other contexts", function () {
			var arrayProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
				"array",
			);
			expect(arrayProp.getContext()).to.equal("array");
			var mapProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
				"map",
			);
			expect(mapProp.getContext()).to.equal("map");
		});
	});

	describe("getFullTypeid", function () {
		it("should return the typeid of the property", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			expect(myProp.getFullTypeid()).to.equal(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
		});
	});

	describe("getTypeid", function () {
		it("should return the typeid of the property", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			expect(myProp.getTypeid()).to.equal(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
		});
	});

	describe("getId", function () {
		it("should return the id of the property", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			var nested = myProp.get("test.property");
			expect(nested.getId()).to.equal("test.property");
		});
	});

	describe("getParent", function () {
		it("should return the parent property", function () {
			var myProp = PropertyFactory.create(
				"autodesk.tests:property.with.special.characters-1.0.0",
			);
			var nested = myProp.get("test.property");
			expect(nested.getParent()).to.deep.equal(myProp);
		});
	});

	// Other aspects of traverseDown function are already tested. Missing BREAK_TRAVERSAL and paths only.
	describe("traverseDown, hasPendingChanges and getPendingChanges", function () {
		var BREAK_TRAVERSAL;

		before(function () {
			BREAK_TRAVERSAL = require("../..").BaseProperty.BREAK_TRAVERSAL;
			var TestTraversalObject = {
				typeid: "autodesk.tests:property.traversal-1.0.0",
				properties: [
					{ id: "p1", typeid: "String" },
					{
						id: "p2",
						properties: [
							{
								id: "p2p1",
								properties: [
									{ id: "p2p1p1", typeid: "String" },
									{ id: "p2p1p2", typeid: "String" },
									{ id: "p2p1p3", typeid: "String" },
								],
							},
							{
								id: "p2p2",
								properties: [
									{ id: "p2p2p1", typeid: "String" },
									{ id: "p2p2p2", typeid: "String" },
									{ id: "p2p2p3", typeid: "Int32" },
								],
							},
						],
					},
					{ id: "p3", typeid: "String" },
					{
						id: "p4",
						properties: [
							{
								id: "p4p1",
								properties: [{ id: "p4p1p1", typeid: "String" }],
							},
							{
								id: "p4p2",
								properties: [{ id: "p4p2p1", typeid: "String" }],
							},
						],
					},
				],
			};
			PropertyFactory.register(TestTraversalObject);
		});

		it("should stop when callback returns BREAK_TRAVERSAL", function () {
			var property = PropertyFactory.create("autodesk.tests:property.traversal-1.0.0");

			var nbrCalls = 0;
			var breakTrav = function (prop) {
				if (++nbrCalls === 5) {
					return BREAK_TRAVERSAL;
				}
				return undefined;
			};
			property.traverseDown(breakTrav);
			expect(nbrCalls).to.equal(5);
		});

		it("should provide path of each prop", function () {
			var arrPaths = [];
			var gatherPaths = function (prop, path) {
				arrPaths.push(path);
			};
			var property = PropertyFactory.create("autodesk.tests:property.traversal-1.0.0");
			property.resolvePath("p4").traverseDown(gatherPaths);
			expect(arrPaths).to.deep.equal(["p4p1", "p4p1.p4p1p1", "p4p2", "p4p2.p4p2p1"]);
		});

		it("should return pending changes", function () {
			var property = PropertyFactory.create("autodesk.tests:property.traversal-1.0.0");
			expect(property.resolvePath("p2").getPendingChanges()).to.deep.equal(new ChangeSet({}));
			expect(property.resolvePath("p2").hasPendingChanges()).to.be.false;
			property.resolvePath("p2.p2p1.p2p1p2").value = "Hi";
			property.resolvePath("p2.p2p2.p2p2p1").value = "Hello";
			property.resolvePath("p2.p2p2.p2p2p3").value = 42;
			expect(property.resolvePath("p2").getPendingChanges()).to.deep.equal(
				new ChangeSet({
					Int32: { "p2p2.p2p2p3": 42 },
					String: { "p2p1.p2p1p2": "Hi", "p2p2.p2p2p1": "Hello" },
				}),
			);
			expect(property.resolvePath("p2").hasPendingChanges()).to.be.true;
		});

		it("should output a pretty string with prettyPrint()", function () {
			var property = PropertyFactory.create("autodesk.tests:property.traversal-1.0.0");
			var expectedPrettyStr =
				"p2 (ContainerProperty):\n" +
				"  p2p1 (ContainerProperty):\n" +
				'    p2p1p1 (String): ""\n' +
				'    p2p1p2 (String): ""\n' +
				'    p2p1p3 (String): ""\n' +
				"  p2p2 (ContainerProperty):\n" +
				'    p2p2p1 (String): ""\n' +
				'    p2p2p2 (String): ""\n' +
				"    p2p2p3 (Int32): 0\n";
			var prettyStr = "";
			property.resolvePath("p2").prettyPrint(function (str) {
				prettyStr += str + "\n";
			});
			expect(prettyStr).to.equal(expectedPrettyStr);
		});
	});
	describe("Ancestry relations should be resolved correctly", function () {
		/**
		 * creates a workspace
		 * @return {property-properties.Workspace} workspace
		 */
		function createRootProperty() {
			return Promise.resolve(PropertyFactory.create("NodeProperty"));
		}

		it("property should be ancestor of subproperty", function () {
			return createRootProperty().then(function (workspace) {
				var property = PropertyFactory.create("autodesk.tests:property.traversal-1.0.0");
				var subproperty = property.resolvePath("p2.p2p1.p2p1p2");
				workspace.insert("test", property);
				expect(property.isAncestorOf(subproperty)).to.equal(true);
			});
		});

		it("property should not be ancestor itself", function () {
			return createRootProperty().then(function (workspace) {
				var property = PropertyFactory.create("autodesk.tests:property.traversal-1.0.0");
				expect(property.isAncestorOf(property)).to.equal(false);
			});
		});

		it("property not in workspace should correctly resolve ancestry", function () {
			var property = PropertyFactory.create("autodesk.tests:property.traversal-1.0.0");
			var subproperty = property.resolvePath("p2.p2p1.p2p1p2");
			expect(property.isAncestorOf(subproperty)).to.equal(true);
			expect(subproperty.isDescendantOf(property)).to.equal(true);
		});

		it("property should be ancestor of subproperty", function () {
			return createRootProperty().then(function (workspace) {
				var property = PropertyFactory.create("autodesk.tests:property.traversal-1.0.0");
				var subproperty = property.resolvePath("p2.p2p1.p2p1p2");
				workspace.insert("test", property);
				expect(property.isAncestorOf(subproperty)).to.equal(true);
			});
		});

		it("subproperty should be descendant of property", function () {
			return createRootProperty().then(function (workspace) {
				var property = PropertyFactory.create("autodesk.tests:property.traversal-1.0.0");
				var subproperty = property.resolvePath("p2.p2p1.p2p1p2");
				workspace.insert("test", property);
				expect(subproperty.isDescendantOf(property)).to.equal(true);
			});
		});

		it("property in array property should be descendant of array", function () {
			return createRootProperty().then(function (workspace) {
				var property = PropertyFactory.create(
					"autodesk.tests:property.traversal-1.0.0",
					"array",
				);
				var element = PropertyFactory.create("autodesk.tests:property.traversal-1.0.0");
				property.push(element);
				var subproperty = element.resolvePath("p2.p2p1.p2p1p2");
				workspace.insert("test", property);
				expect(subproperty.isDescendantOf(property)).to.equal(true);
			});
		});

		it("array property should be ancestor of property in array", function () {
			return createRootProperty().then(function (workspace) {
				var property = PropertyFactory.create(
					"autodesk.tests:property.traversal-1.0.0",
					"array",
				);
				var element = PropertyFactory.create("autodesk.tests:property.traversal-1.0.0");
				property.push(element);
				var subproperty = element.resolvePath("p2.p2p1.p2p1p2");
				workspace.insert("test", property);
				expect(property.isAncestorOf(subproperty)).to.equal(true);
			});
		});

		it("two different properties should not be related", function () {
			return createRootProperty().then(function (workspace) {
				var prop1 = PropertyFactory.create("autodesk.tests:property.traversal-1.0.0");
				var prop2 = PropertyFactory.create("autodesk.tests:property.traversal-1.0.0");
				workspace.insert("test1", prop1);
				workspace.insert("test2", prop2);
				expect(prop2.isAncestorOf(prop1)).to.equal(false);
				expect(prop2.isDescendantOf(prop1)).to.equal(false);
				expect(prop1.isAncestorOf(prop2)).to.equal(false);
				expect(prop1.isDescendantOf(prop2)).to.equal(false);
			});
		});
	});
});
