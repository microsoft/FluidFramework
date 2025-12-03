/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* globals assert, sinon */

/**
 * @fileoverview In this file, we will test the NodeProperty object described in properties/nodeProperty.js
 */
const { ChangeSet } = require("@fluid-experimental/property-changeset");
const { generateGUID } = require("@fluid-experimental/property-common").GuidUtils;
const { MSG } = require("@fluid-experimental/property-common").constants;
const _ = require("lodash");

const { PropertyFactory } = require("../..");
const { BaseProperty } = require("../..");
const { MapProperty } = require("../../properties/mapProperty");
const { NodeProperty } = require("../../properties/nodeProperty");

describe("NodeProperty", function () {
	var changeSetWithTwoMapEntries, changeSetWithTwoMapEntries_full, removalChangeSet;
	var myNode, mapNode1, mapNode2;

	before(function () {
		// Register a template with a set property for the tests
		var MixedNodePropertyTemplate = {
			typeid: "autodesk.tests:MixedNodeTestProperty-1.0.0",
			inherits: ["NodeProperty"],
			properties: [
				{ id: "stringProperty", typeid: "String" },
				{ id: "stringProperty2", typeid: "String" },
			],
		};
		var AnonymousTestPropertyTemplate = {
			typeid: "autodesk.tests:AnonymousProperty-1.0.0",
			properties: [{ id: "stringProperty", typeid: "String" }],
		};
		var MixedNamedNodePropertyTemplate = {
			typeid: "autodesk.tests:MixedNamedNodeProperty-1.0.0",
			inherits: ["NodeProperty", "NamedProperty"],
			properties: [{ id: "stringProperty", typeid: "String" }],
		};
		var TestEnumTemplate = {
			typeid: "autodesk.core:UnitsEnum-1.0.0",
			inherits: "Enum",
			annotation: { description: "The metric units" },
			properties: [
				{ id: "m", value: 1, annotation: { description: "meter" } },
				{ id: "cm", value: 2, annotation: { description: "centimeter" } },
				{ id: "mm", value: 3, annotation: { description: "millimeter" } },
			],
		};
		PropertyFactory._reregister(TestEnumTemplate);

		PropertyFactory._reregister(MixedNodePropertyTemplate);
		PropertyFactory._reregister(MixedNamedNodePropertyTemplate);
		PropertyFactory._reregister(AnonymousTestPropertyTemplate);

		myNode = PropertyFactory.create("NodeProperty");
		mapNode1 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
		mapNode2 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");

		// Register the templates from the discussion document
		var Vec3Template = {
			typeid: "autodesk.test:vector3-1.0.0",
			properties: [
				{ id: "x", typeid: "Float32" },
				{ id: "y", typeid: "Float32" },
				{ id: "z", typeid: "Float32" },
			],
		};

		var Point2DTemplate = {
			typeid: "autodesk.test:point2d-1.0.0",
			properties: [
				{
					id: "position",
					properties: [
						{ id: "x", typeid: "Float32" },
						{ id: "y", typeid: "Float32" },
					],
				},
				{ id: "normal", typeid: "autodesk.test:vector3-1.0.0" },
				{ id: "neighbours", typeid: "autodesk.test:vector3-1.0.0", context: "map" },
				{ id: "temperature", typeid: "Float32" },
			],
		};

		var SceneObjectTemplate = {
			inherits: "NodeProperty",
			typeid: "autodesk.test:SceneObject-1.0.0",
			properties: [
				{ id: "name", typeid: "String" },
				{ id: "revitId", typeid: "String" },
			],
		};

		var nestedNodeProperty = {
			typeid: "autodesk.tests:nested.node.property-1.0.0",
			properties: [
				{
					id: "nested",
					properties: [{ id: "property", typeid: "NodeProperty" }],
				},
			],
		};

		var testArrayProperty = {
			typeid: "autodesk.tests:test.array.property-1.0.0",
			properties: [{ id: "array", typeid: "Float32", context: "array" }],
		};

		PropertyFactory._reregister(Vec3Template);
		PropertyFactory._reregister(Point2DTemplate);
		PropertyFactory._reregister(SceneObjectTemplate);
		PropertyFactory._reregister(nestedNodeProperty);
		PropertyFactory._reregister(testArrayProperty);
	});

	// Helper functions for the test cases
	var keyCounter = 0;
	var resetKeyCounter = function () {
		keyCounter = 0;
	};

	// Inserts a node with the given guid (a new one is generated when undefined)
	var insertNodeInRootWithKeyAndGuid = function (key, guid, root) {
		var node = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
		if (key === undefined) {
			key = "node" + keyCounter++;
		}

		root.insert(key, node);
	};

	// Inserts a new node in the root
	var insertNodeInRoot = function (root) {
		insertNodeInRootWithKeyAndGuid(undefined, undefined, root);
	};

	// Returns a functor that will insert a node with a constant GUID
	var insertUniqueNodeInRoot = function () {
		var key = "node" + keyCounter++;
		return insertNodeInRootWithKeyAndGuid.bind(undefined, key, generateGUID());
	};

	// Inserts a new node as leaf
	var insertNodeAsLeaf = function (root) {
		var leaf = root;
		while (leaf.getDynamicIds().length > 0) {
			leaf = _.values(leaf._getDynamicChildrenReadOnly())[0];
		}
		var node = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
		var key = "node" + keyCounter++;
		leaf.insert(key, node);
	};

	// Removes the first node from the root
	var removeFirstNodeInRoot = function (root) {
		var firstKey = root.getDynamicIds()[0];
		root.remove(firstKey);
	};

	// Modifies the leaf node
	var modifyLeaf = function (root) {
		var leaf = root;
		while (leaf.getDynamicIds().length > 0) {
			leaf = _.values(leaf._getDynamicChildrenReadOnly())[0];
		}
		leaf._properties.stringProperty.value = leaf._properties.stringProperty.value + "+";
	};

	describe("Testing creation, assignment and serialization", function () {
		it("should be empty at the beginning", function () {
			expect(myNode.getIds()).to.be.empty;
			expect(myNode.serialize({ dirtyOnly: true })).to.be.empty;
		});

		it("should be possible to insert into the map", function () {
			// Test insertion of the first node
			myNode.insert("node1", mapNode1);
			expect(myNode.has("node1")).to.be.ok;
			expect(myNode.has("node2")).to.be.not.ok;
			expect(myNode.get("node2")).to.equal(undefined);
			expect(mapNode1.getParent()).to.equal(myNode);

			var CS = myNode.serialize({ dirtyOnly: true });
			expect(
				CS.insert &&
					CS.insert["autodesk.tests:MixedNodeTestProperty-1.0.0"] &&
					_.keys(CS.insert["autodesk.tests:MixedNodeTestProperty-1.0.0"]).length === 1 &&
					_.keys(CS.insert["autodesk.tests:MixedNodeTestProperty-1.0.0"])[0] === "node1",
			).to.be.ok;

			// Test insertion of the second node
			myNode.insert("node2", mapNode2);
			expect(myNode.has("node2")).to.be.ok;
			expect(myNode.get("node2")).to.equal(mapNode2);
			changeSetWithTwoMapEntries = myNode.serialize({ dirtyOnly: true });
			expect(
				changeSetWithTwoMapEntries.insert &&
					changeSetWithTwoMapEntries.insert["autodesk.tests:MixedNodeTestProperty-1.0.0"] &&
					_.keys(
						changeSetWithTwoMapEntries.insert["autodesk.tests:MixedNodeTestProperty-1.0.0"],
					).length === 2 &&
					_.includes(
						_.keys(
							changeSetWithTwoMapEntries.insert["autodesk.tests:MixedNodeTestProperty-1.0.0"],
						),
						"node1",
					) &&
					_.includes(
						_.keys(
							changeSetWithTwoMapEntries.insert["autodesk.tests:MixedNodeTestProperty-1.0.0"],
						),
						"node2",
					),
			).to.be.ok;

			changeSetWithTwoMapEntries_full = myNode.serialize({ dirtyOnly: false });
			expect(changeSetWithTwoMapEntries).to.deep.equal(changeSetWithTwoMapEntries_full);
		});

		it("should fail when trying to insert with empty id", function () {
			var myNode1 = PropertyFactory.create("NodeProperty");
			var mapNode3 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
			expect(() => myNode1.insert("", mapNode3)).to.throw(MSG.ID_SHOULD_NOT_BE_EMPTY_STRING);
		});

		it("should fail when trying to insert in itself", function () {
			var myNode1 = PropertyFactory.create("NodeProperty");
			expect(() => myNode1.insert("a", myNode1)).to.throw(MSG.INSERTED_IN_OWN_CHILDREN);
		});

		it("should fail when trying to insert in child", function () {
			var myNodeParent = PropertyFactory.create("NodeProperty");
			var myNodeChild = PropertyFactory.create("NodeProperty");
			myNodeParent.insert("a", myNodeChild);
			expect(() => myNodeChild.insert("a", myNodeParent)).to.throw(
				MSG.INSERTED_IN_OWN_CHILDREN,
			);
		});

		it("should fail when trying to insert in grand-child", function () {
			var myNodeParent = PropertyFactory.create("NodeProperty");
			var myNodeChild = PropertyFactory.create("NodeProperty");
			var myNodeGrandChild = PropertyFactory.create("NodeProperty");
			myNodeParent.insert("a", myNodeChild);
			myNodeChild.insert("a", myNodeGrandChild);
			expect(() => myNodeGrandChild.insert("a", myNodeParent)).to.throw(
				MSG.INSERTED_IN_OWN_CHILDREN,
			);
		});

		it(".remove should return the property removed", function () {
			var myNode1 = PropertyFactory.create("NodeProperty");
			var mapNode3 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
			var mapNode4 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
			myNode1.insert("node1", mapNode3);
			myNode1.insert("node2", mapNode4);
			expect(myNode1.remove("node1")).to.deep.equal(mapNode3);
			expect(myNode1.remove(mapNode4)).to.deep.equal(mapNode4);
			expect(myNode1.getIds()).to.be.empty;
		});

		it(".clear should remove all nodes", function () {
			var myNode1 = PropertyFactory.create("NodeProperty");
			var mapNode3 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
			var mapNode4 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
			myNode1.insert("node1", mapNode3);
			myNode1.insert("node2", mapNode4);
			expect(myNode1.clear()).to.be.undefined;
			expect(myNode1.getIds()).to.be.empty;
		});

		it(".getValues should work", function () {
			var myNode1 = PropertyFactory.create("NodeProperty");
			var mapNode3 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
			var mapNode4 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
			myNode1.insert("node1", mapNode3);
			myNode1.insert("node2", mapNode4);
			expect(myNode1.getValues()).to.deep.equal({
				node1: { stringProperty: "", stringProperty2: "" },
				node2: { stringProperty: "", stringProperty2: "" },
			});
		});

		it("getValues should work with nested arrays", function () {
			var myNode1 = PropertyFactory.create("NodeProperty");
			var myArray = PropertyFactory.create("autodesk.tests:test.array.property-1.0.0");
			myNode1.insert("array1", myArray);
			myNode1.get("array1").get("array").insertRange(0, [1, 2, 3]);
			expect(myNode1.getIds()).to.deep.equal(["array1"]);
			expect(myNode1.getValues()).to.deep.equal({
				array1: { array: [1, 2, 3] },
			});
		});

		it.skip("@bugfix getValues should work with circular references", function () {
			var myNode1 = PropertyFactory.create("NodeProperty");
			var myRef1 = PropertyFactory.create("Reference", "single", "/ref2");
			var myRef2 = PropertyFactory.create("Reference", "single", "/ref1");
			myNode1.insert("ref1", myRef1);
			myNode1.insert("ref2", myRef2);
			myNode1.getValues();
			expect(myNode1.getIds()).to.deep.equal(["ref1", "ref2"]);
			expect(myNode1.getValues()).to.deep.equal({
				ref1: "/ref2",
				ref2: "/ref1",
			});
		});

		it("getValues should work with bad references", function () {
			var myNode1 = PropertyFactory.create("NodeProperty");
			var myRef = PropertyFactory.create("Reference", "single");
			myNode1.insert("badref", myRef);
			myNode1.getValues();
			expect(myNode1.getIds()).to.deep.equal(["badref"]);
			expect(myNode1.getValues()).to.deep.equal({
				badref: undefined,
			});
		});

		it("Should track dirtiness", function () {
			myNode.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY);
			expect(
				myNode.serialize({
					dirtyOnly: true,
					includeRootTypeid: false,
					dirtinessType: BaseProperty.MODIFIED_STATE_FLAGS.DIRTY,
				}),
			).to.be.empty;
			expect(
				myNode.serialize({
					dirtyOnly: true,
					includeRootTypeid: false,
					dirtinessType: BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
				}),
			).deep.equal(changeSetWithTwoMapEntries_full);
			expect(myNode.serialize({ dirtyOnly: false })).deep.equal(
				changeSetWithTwoMapEntries_full,
			);
		});

		it("Should handle removals correctly", function () {
			myNode.remove("node1");
			expect(mapNode1.getParent()).to.be.undefined;
			myNode.remove("node2");
			expect(
				myNode.serialize({
					dirtyOnly: true,
					includeRootTypeid: false,
					dirtinessType: BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
				}),
			).to.be.empty;
			expect(myNode.serialize({ dirtyOnly: false })).to.be.empty;
			removalChangeSet = myNode.serialize({
				dirtyOnly: true,
				includeRootTypeid: false,
				dirtinessType: BaseProperty.MODIFIED_STATE_FLAGS.DIRTY,
			});
			expect(removalChangeSet).to.have.all.keys(["remove"]);
			expect(removalChangeSet.remove).to.have.length(2);
			expect(removalChangeSet.remove).to.contain("node1");
			expect(removalChangeSet.remove).to.contain("node2");
		});

		it("Should support deserialization", function () {
			var deserializedNode = PropertyFactory.create("NodeProperty");
			var deserializedChanges1 = deserializedNode.deserialize(changeSetWithTwoMapEntries);
			var CS4 = deserializedNode.serialize({ dirtyOnly: false });
			expect(CS4).to.deep.equal(changeSetWithTwoMapEntries);
			expect(deserializedChanges1).to.deep.equal(changeSetWithTwoMapEntries);

			var deserializedChanges2 = deserializedNode.deserialize(changeSetWithTwoMapEntries);
			expect(deserializedChanges2).to.be.empty;

			var deserializedChanges3 = deserializedNode.deserialize({});
			expect(deserializedChanges3).to.deep.equal(removalChangeSet);
		});

		it("should support deserialization for nested properties", function () {
			var P1 = PropertyFactory.create("autodesk.tests:nested.node.property-1.0.0");
			var P2 = PropertyFactory.create("autodesk.tests:nested.node.property-1.0.0");

			P1._properties.nested.property.propertyNode.insert(
				"testProperty",
				PropertyFactory.create("String"),
			);
			P1._properties.nested.property.testProperty.value = "testString";

			P2.deserialize(P1.serialize({ dirtyOnly: false }));
			expect(P1.serialize({ dirtyOnly: false })).to.deep.equal(
				P2.serialize({ dirtyOnly: false }),
			);
			expect(P2._properties.nested.property.testProperty.value).to.equal("testString");
		});

		it("Should track modifies", function () {
			var modifyNode1 = PropertyFactory.create("NodeProperty");
			var modifyNode2 = PropertyFactory.create("NodeProperty");

			modifyNode1.deserialize(changeSetWithTwoMapEntries);
			modifyNode2.deserialize(changeSetWithTwoMapEntries);

			modifyNode1.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);
			var child1 = modifyNode1.get("node1");
			child1._properties.stringProperty.value = "modify test";
			var modifyChangeSet = modifyNode1.serialize({ dirtyOnly: true });
			modifyNode2.applyChangeSet(modifyChangeSet);
			expect(modifyNode2.serialize({ dirtyOnly: false })).to.deep.equal(
				modifyNode1.serialize({ dirtyOnly: false }),
			);
		});

		it("Should support hierarchical properties", function () {
			var node1 = PropertyFactory.create("NodeProperty");
			var node2 = PropertyFactory.create("NodeProperty");
			var node3 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");

			// Createa a hierarchy of three nodes
			node1.insert("node", node2);
			node2.insert("node", node3);
			node3._properties.stringProperty.value = "test";

			// Check that deserializing and serializing works with a hierarchy
			var hierarchicalChangeSet = node1.serialize({ dirtyOnly: true });
			var deserializedNode = PropertyFactory.create("NodeProperty");
			deserializedNode.deserialize(hierarchicalChangeSet);
			var child1 = deserializedNode.get(deserializedNode.getIds()[0]);
			expect(child1).to.not.equal(undefined);
			var child2 = child1.get(child1.getIds()[0]);
			expect(child2).to.not.equal(undefined);
			expect(child2._properties.stringProperty.value).to.equal("test");

			// Test that hierarchical modifies work
			node1.cleanDirty();
			node3._properties.stringProperty.value = "test2";
			var hierarchicalModifyChangeSet = node1.serialize({ dirtyOnly: true });

			deserializedNode.applyChangeSet(hierarchicalModifyChangeSet);
			child1 = deserializedNode.get(deserializedNode.getIds()[0]);
			expect(child1).to.not.equal(undefined);
			child2 = child1.get(child1.getIds()[0]);
			expect(child2).to.not.equal(undefined);
			expect(child2._properties.stringProperty.value).to.equal("test2");
		});

		it("should be possible to use anonymous properties", function () {
			var rootNode = PropertyFactory.create("NodeProperty");
			var rootNode2 = PropertyFactory.create("NodeProperty");
			var node1 = PropertyFactory.create("autodesk.tests:AnonymousProperty-1.0.0");
			var node2 = PropertyFactory.create("autodesk.tests:AnonymousProperty-1.0.0");

			rootNode.insert("node1", node1);
			rootNode.insert("node2", node2);
			var testChangeSet = rootNode.serialize({ dirtyOnly: false });

			expect(rootNode.get("node1")).to.be.equal(node1);
			expect(rootNode.get("node2")).to.be.equal(node2);
			rootNode.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);

			node1._properties.stringProperty.value = "1";
			node2._properties.stringProperty.value = "2";

			rootNode2.deserialize(testChangeSet);
			rootNode2.applyChangeSet(rootNode.serialize({ dirtyOnly: true }));
			expect(rootNode2.serialize({ dirtyOnly: false })).to.be.deep.equal(
				rootNode.serialize({ dirtyOnly: false }),
			);
		});

		it("inserting the same key twice should throw an exception", function () {
			var rootNode = PropertyFactory.create("NodeProperty");
			var node1 = PropertyFactory.create("NodeProperty");
			var node2 = PropertyFactory.create("NodeProperty");
			rootNode.insert("node1", node1);
			expect(function () {
				rootNode.insert("node1", node2);
			}).to.throw();
		});

		it("Should work to create a MixedNodeTemplate", function () {
			var mixedNode = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
			mixedNode.insert("dynamicFloat", PropertyFactory.create("Float32"));
			mixedNode.insert("dynamicString", PropertyFactory.create("String"));

			mixedNode._properties.stringProperty.value = "string1";
			mixedNode._properties.stringProperty2.value = "string2";
			mixedNode._properties.dynamicString.value = "dynamic2";
			mixedNode._properties.dynamicFloat.value = 11;

			expect(mixedNode.serialize({ dirtyOnly: false })).to.deep.equal({
				String: {
					stringProperty: "string1",
					stringProperty2: "string2",
				},
				insert: {
					String: {
						dynamicString: "dynamic2",
					},
					Float32: {
						dynamicFloat: 11,
					},
				},
			});

			mixedNode.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);

			mixedNode._properties.stringProperty.value = "modified1";
			mixedNode._properties.dynamicString.value = "modified2";
			mixedNode.insert("dynamicString2", PropertyFactory.create("String"));
			mixedNode._properties.dynamicString2.value = "dynamic3";

			expect(mixedNode.serialize({ dirtyOnly: true })).to.deep.equal({
				String: {
					stringProperty: "modified1",
				},
				modify: {
					String: {
						dynamicString: "modified2",
					},
				},
				insert: {
					String: {
						dynamicString2: "dynamic3",
					},
				},
			});

			// Pretty printing
			var expectedPrettyStr =
				"undefined (autodesk.tests:MixedNodeTestProperty-1.0.0):\n" +
				'  stringProperty (String): "modified1"\n' +
				'  stringProperty2 (String): "string2"\n' +
				"  dynamicFloat (Float32): 11\n" +
				'  dynamicString (String): "modified2"\n' +
				'  dynamicString2 (String): "dynamic3"\n';
			var prettyStr = "";
			mixedNode.prettyPrint(function (str) {
				prettyStr += str + "\n";
			});
			expect(prettyStr).to.equal(expectedPrettyStr);
		});

		it("inserting the same node twice should be a bug", function () {
			var rootNode = PropertyFactory.create("NodeProperty");
			var node = PropertyFactory.create("NodeProperty");

			// Try to insert the same node object under two keys
			rootNode.insert("node", node);
			expect(function () {
				rootNode.insert("node2", node);
			}).to.throw();

			// After removing it, adding it under a new key should be possible
			rootNode.remove("node");
			rootNode.insert("node2", node);
		});

		it("should not allow adding two nodes with same id", function () {
			var NodeTemplate = {
				typeid: "autodesk.tests:NodeTemplate-1.0.0",
				inherits: "NodeProperty",
				properties: [{ id: "a", typeid: "Float32" }],
			};

			PropertyFactory._reregister(NodeTemplate);

			var node = PropertyFactory.create("autodesk.tests:NodeTemplate-1.0.0");
			var child = PropertyFactory.create("String");

			expect(function () {
				node.insert("a", child);
			}).to.throw(MSG.PROPERTY_ALREADY_EXISTS + "a");
		});

		it("Should correctly report whether it is a root", function () {
			var root = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
			var child = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
			var stringProperty = child.resolvePath("stringProperty");

			root.insert("childKey", child);
			assert(root.isRoot());
			assert(!child.isRoot());

			expect(stringProperty.getAbsolutePath()).to.equal("/childKey.stringProperty");
			expect(stringProperty.getRelativePath(child)).to.equal("stringProperty");
			expect(root.resolvePath(stringProperty.getAbsolutePath())).to.equal(stringProperty);
			expect(child.resolvePath(stringProperty.getRelativePath(child))).to.equal(
				stringProperty,
			);
		});

		it("should correctly report changes when deserializing keys which contain 0", function () {
			var property = PropertyFactory.create("NodeProperty");
			property.insert("test", PropertyFactory.create("Int32"));
			property._properties.test.value = 5; // Make sure, it is marked as modified
			property._properties.test.value = 0;

			var property2 = PropertyFactory.create("NodeProperty");
			property2.insert("test", PropertyFactory.create("Int32"));
			property2._properties.test.value = 5;

			var actualChanges = property2.deserialize(property.serialize({ dirtyOnly: false }));
			expect(actualChanges).to.deep.equal({ modify: { Int32: { test: 0 } } });
		});
	});

	describe("squashing", function () {
		//
		// Helper function which takes a sequence of callbacks that are successively executed
		// and the changes applied by the callbacks are separately tracked and squashed in a
		// a ChangeSet. This ChangeSet is then compared to the state in the property object
		//
		// Optionally, a a callback which controls the initial state before the squashing can
		// be given as first parameter
		//
		var testChangeSetSquashing = function (in_options) {
			resetKeyCounter();
			var testProperty = PropertyFactory.create("NodeProperty");

			var callbacks = in_options.callbacks;
			if (in_options.pre) {
				in_options.pre(testProperty);
			}

			var initialChangeset = new ChangeSet(testProperty.serialize({ dirtyOnly: false }));
			initialChangeset.setIsNormalized(true);

			var squashedChangeset = new ChangeSet();
			testProperty.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);
			for (var i = 0; i < callbacks.length; i++) {
				callbacks[i](testProperty);
				var changes = testProperty.serialize({ dirtyOnly: true });
				testProperty.cleanDirty(
					BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
						BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
				);

				squashedChangeset.applyChangeSet(changes);
			}

			if (in_options.post) {
				in_options.post(squashedChangeset.getSerializedChangeSet());
			}

			initialChangeset.applyChangeSet(squashedChangeset.getSerializedChangeSet());
			expect(initialChangeset.getSerializedChangeSet()).to.deep.equal(
				testProperty.serialize({ dirtyOnly: false }),
			);
		};

		it("should work for multiple independent inserts", function () {
			testChangeSetSquashing({
				callbacks: [insertNodeInRoot, insertNodeInRoot, insertNodeInRoot],
			});
		});
		it("should work for multiple hierarchical inserts", function () {
			testChangeSetSquashing({
				callbacks: [insertNodeAsLeaf, insertNodeAsLeaf, insertNodeAsLeaf],
			});
		});
		it("should work for inserts followed by removes", function () {
			testChangeSetSquashing({
				callbacks: [
					insertNodeInRoot,
					insertNodeInRoot,
					removeFirstNodeInRoot,
					removeFirstNodeInRoot,
				],
				post: function (changeset) {
					expect(changeset).to.be.empty;
				},
			});
		});
		it("should work for a tree removal", function () {
			testChangeSetSquashing({
				callbacks: [
					insertNodeAsLeaf,
					insertNodeAsLeaf,
					insertNodeAsLeaf,
					removeFirstNodeInRoot,
				],
				post: function (changeset) {
					expect(changeset).to.be.empty;
				},
			});
		});

		it("should work for modifies in a tree", function () {
			testChangeSetSquashing({
				callbacks: [
					insertNodeAsLeaf,
					insertNodeAsLeaf,
					insertNodeAsLeaf,
					modifyLeaf,
					modifyLeaf,
				],
			});
		});
		it("should work for modifies of a primitive type", function () {
			testChangeSetSquashing({
				callbacks: [
					function (root) {
						var newStringNode = PropertyFactory.create("String");
						newStringNode.value = "initial value";
						root.insert("stringProp", newStringNode);
					},
					function (root) {
						root.get("stringProp").value = "new value";
					},
				],
			});
		});

		it("an insert, modify and a remove should give an empty changeset", function () {
			testChangeSetSquashing({
				callbacks: [
					insertNodeAsLeaf,
					insertNodeAsLeaf,
					modifyLeaf,
					modifyLeaf,
					removeFirstNodeInRoot,
				],
				post: function (changeset) {
					expect(changeset).to.be.empty;
				},
			});
		});
		it("work for modifies after an already existing insert", function () {
			testChangeSetSquashing({
				pre: insertNodeInRoot,
				callbacks: [modifyLeaf, modifyLeaf],
			});
		});
		it("of modify and remove after an already existing insert should work", function () {
			testChangeSetSquashing({
				pre: insertNodeInRoot,
				callbacks: [modifyLeaf, removeFirstNodeInRoot],
				post: function (changeset) {
					expect(changeset).to.have.all.keys("remove");
				},
			});
		});
		it("of a replace operation should be possible", function () {
			// Create two nodes
			var node1 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
			var node2 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
			node2._properties.stringProperty.value = "testString2";

			testChangeSetSquashing({
				pre: function (root) {
					root.insert("node1", node1);
				},
				callbacks: [
					removeFirstNodeInRoot,
					function (root) {
						root.insert("node1", node2);
					},
				],
				post: function (changeset) {
					expect(changeset).to.have.all.keys("remove", "insert");
				},
			});
		});
	});
	describe("Rebasing", function () {
		var testRebasing = function (in_options) {
			// Prepare the initial state
			var baseProperty1 = PropertyFactory.create("NodeProperty");
			if (in_options.prepare) {
				in_options.prepare(baseProperty1);
			}
			// Create two copies of this state
			var baseProperty2 = PropertyFactory.create("NodeProperty");
			baseProperty2.deserialize(baseProperty1.serialize({ dirtyOnly: false }));
			var baseProperty3 = PropertyFactory.create("NodeProperty");
			baseProperty3.deserialize(baseProperty1.serialize({ dirtyOnly: false }));

			// Make sure the states are clear
			baseProperty1.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);
			baseProperty2.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);
			baseProperty3.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);

			var initialChangeSet = baseProperty1.serialize({ dirtyOnly: false });

			// Apply the operations to the two properties in parallel
			if (in_options.op1) {
				in_options.op1(baseProperty1);
			}
			if (in_options.op2) {
				in_options.op2(baseProperty2);
			}

			// Get the ChangeSets
			var changeSet1 = new ChangeSet(baseProperty1.serialize({ dirtyOnly: true }));
			var changeSet2 = baseProperty2.serialize({ dirtyOnly: true });

			// Perform the actual rebase
			var conflicts = [];
			changeSet1._rebaseChangeSet(changeSet2, conflicts);

			var combinedChangeSet = new ChangeSet(initialChangeSet).clone();
			combinedChangeSet.applyChangeSet(changeSet1);
			combinedChangeSet.applyChangeSet(changeSet2);

			if (in_options.compareToSequential) {
				if (in_options.op1) {
					in_options.op1(baseProperty3);
				}
				if (in_options.op2) {
					in_options.op2(baseProperty3);
				}
				var finalChangeSet = baseProperty3.serialize({ dirtyOnly: false });
				expect(finalChangeSet).to.be.deep.equal(combinedChangeSet.getSerializedChangeSet());
			}

			if (in_options.checkResult) {
				in_options.checkResult(conflicts, changeSet2, combinedChangeSet);
			}
		};

		it("with a NOP should be possible", function () {
			testRebasing({
				op2: insertUniqueNodeInRoot(),
				compareToSequential: true,
			});
		});

		it("with independent inserts should be possible", function () {
			testRebasing({
				op1: insertUniqueNodeInRoot(),
				op2: insertUniqueNodeInRoot(),
				compareToSequential: true,
			});
		});

		it("with independent removes should be possible", function () {
			var node1 = PropertyFactory.create("NodeProperty");
			var node2 = PropertyFactory.create("NodeProperty");

			testRebasing({
				prepare: function (root) {
					root.insert("node1", node1);
					root.insert("node2", node2);
				},
				op1: function (root) {
					root.remove("node1");
				},
				op2: function (root) {
					root.remove("node2");
				},
				compareToSequential: true,
			});
		});

		it("with a modify and a remove should possible", function () {
			var node1 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");

			testRebasing({
				prepare: function (root) {
					root.insert("node1", node1);
				},
				op1: modifyLeaf,
				op2: removeFirstNodeInRoot,
				compareToSequential: true,
			});
		});

		it("with a remove and a modify should possible", function () {
			var node1 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");

			testRebasing({
				prepare: function (root) {
					root.insert("node1", node1);
				},
				op1: removeFirstNodeInRoot,
				op2: modifyLeaf,
				compareToSequential: false,
				checkResult: function (conflicts, changeSet) {
					expect(conflicts).to.have.length(1);
					expect(conflicts[0].type).to.be.equal(
						ChangeSet.ConflictType.ENTRY_MODIFIED_AFTER_REMOVE,
					);
					expect(conflicts[0].path).to.be.equal("node1");
					expect(ChangeSet.isEmptyChangeSet(changeSet)).to.be.ok;
				},
			});
		});

		it("with two compatible removes should be possible", function () {
			var node1 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");

			testRebasing({
				prepare: function (root) {
					root.insert("node1", node1);
				},
				op1: function (root) {
					root.remove("node1");
				},
				op2: function (root) {
					root.remove("node1");
				},
				compareToSequential: false,
				checkResult: function (conflicts, changeSet) {
					expect(ChangeSet.isEmptyChangeSet(changeSet)).to.be.ok;
				},
			});
		});

		it("with two indendent recursive modifies should be possible", function () {
			var node1 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");

			testRebasing({
				prepare: function (root) {
					root.insert("node1", node1);
				},
				op1: function (root) {
					_.values(root._getDynamicChildrenReadOnly())[0]._properties.stringProperty.value =
						"a";
				},
				op2: function (root) {
					_.values(root._getDynamicChildrenReadOnly())[0]._properties.stringProperty2.value =
						"a";
				},
				compareToSequential: true,
				checkResult: function (conflicts, changeSet) {
					expect(conflicts).to.be.empty;
				},
			});
		});

		it("with two conflicting recursive modifies should be possible and report a conflict", function () {
			var node1 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");

			testRebasing({
				prepare: function (root) {
					root.insert("node1", node1);
				},
				op1: function (root) {
					_.values(root._getDynamicChildrenReadOnly())[0]._properties.stringProperty.value =
						"b";
				},
				op2: function (root) {
					_.values(root._getDynamicChildrenReadOnly())[0]._properties.stringProperty.value =
						"a";
				},
				compareToSequential: true,
				checkResult: function (conflicts, changeSet) {
					expect(conflicts).to.have.length(1);
					expect(
						changeSet.modify["autodesk.tests:MixedNodeTestProperty-1.0.0"].node1.String
							.stringProperty,
					).to.equal("a");
					expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
					expect(conflicts[0].path).to.be.equal("node1.stringProperty");
				},
			});
		});

		it("with modify followed by remove+insert should work", function () {
			var node1 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");

			testRebasing({
				prepare: function (root) {
					root.insert("node1", node1);
				},
				op1: modifyLeaf,
				op2: function (root) {
					var node2 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
					root.remove("node1");
					root.insert("node1", node2);
				},
				compareToSequential: true,
				checkResult: function (conflicts, changeSet) {
					expect(conflicts).to.have.length(1);
					expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.REMOVE_AFTER_MODIFY);
					expect(conflicts[0].path).to.be.equal("node1");
					expect(changeSet).to.have.all.keys("remove", "insert");
				},
			});
		});

		it("with remove+insert followed by modify should report conflict", function () {
			var node1 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");

			testRebasing({
				prepare: function (root) {
					root.insert("node1", node1);
				},
				op1: function (root) {
					var node2 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
					root.remove("node1");
					root.insert("node1", node2);
				},
				op2: modifyLeaf,
				compareToSequential: false,
				checkResult: function (conflicts, changeSet) {
					expect(conflicts).to.have.length(1);
					expect(conflicts[0].type).to.be.equal(
						ChangeSet.ConflictType.ENTRY_MODIFICATION_AFTER_REMOVE_INSERT,
					);
					expect(conflicts[0].path).to.be.equal("node1");
				},
			});
		});

		it("with remove+insert followed by remove+insert should report conflict", function () {
			var node = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");

			testRebasing({
				prepare: function (root) {
					root.insert("node", node);
				},
				op1: function (root) {
					root.remove("node");
					root.insert(
						"node",
						PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0"),
					);
				},
				op2: function (root) {
					root.remove("node");
					root.insert(
						"node",
						PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0"),
					);
				},
				compareToSequential: false,
				checkResult: function (conflicts, changeSet) {
					expect(conflicts).to.have.length(1);
					expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
					expect(conflicts[0].path).to.be.equal("node");
				},
			});
		});

		it("with conflicting inserts should report conflict", function () {
			var node1 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
			var node2 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");

			testRebasing({
				prepare: function (root) {},
				op1: function (root) {
					root.insert("node1", node1);
				},
				op2: function (root) {
					root.insert("node1", node2);
				},
				compareToSequential: false,
				checkResult: function (conflicts, changeSet) {
					expect(ChangeSet.isEmptyChangeSet(changeSet)).to.be.ok;
					expect(conflicts).to.have.length(1);
					expect(conflicts[0].type).to.be.equal(
						ChangeSet.ConflictType.INSERTED_ENTRY_WITH_SAME_KEY,
					);
					expect(conflicts[0].path).to.be.equal("node1");
				},
			});
		});

		it("with conflicting inserts of primitive types", function () {
			testRebasing({
				prepare: function (root) {},
				op1: function (root) {
					var string1 = PropertyFactory.create("String");
					string1.value = "test1";
					root.insert("entry", string1);
				},
				op2: function (root) {
					var string2 = PropertyFactory.create("String");
					string2.value = "test2";
					root.insert("entry", string2);
				},
				compareToSequential: false,
				checkResult: function (conflicts, changeSet) {
					expect(changeSet).to.deep.equal({
						modify: {
							String: {
								entry: {
									oldValue: "test1",
									value: "test2",
								},
							},
						},
					});
					expect(conflicts).to.have.length(1);
					expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
					expect(conflicts[0].path).to.be.equal("entry");
					expect(conflicts[0].conflictingChange).to.be.equal("test2");
				},
			});
		});

		// TODO: 'with conflicting inserts of primitive types' is identical to the below test.  Why?
		it("with conflicting recursive modifies of primitive types should be possible and report a conflict", function () {
			testRebasing({
				prepare: function (root) {},
				op1: function (root) {
					var string1 = PropertyFactory.create("String");
					string1.value = "test1";
					root.insert("entry", string1);
				},
				op2: function (root) {
					var string2 = PropertyFactory.create("String");
					string2.value = "test2";
					root.insert("entry", string2);
				},
				compareToSequential: false,
				checkResult: function (conflicts, changeSet) {
					expect(changeSet).to.deep.equal({
						modify: {
							String: {
								entry: {
									oldValue: "test1",
									value: "test2",
								},
							},
						},
					});
					expect(conflicts).to.have.length(1);
					expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
					expect(conflicts[0].path).to.be.equal("entry");
					expect(conflicts[0].conflictingChange).to.be.equal("test2");
				},
			});
		});

		it("with conflicting recursive modifies of enums should be possible and report a conflict", function () {
			testRebasing({
				prepare: function (root) {},
				op1: function (root) {
					var enum1 = PropertyFactory.create("autodesk.core:UnitsEnum-1.0.0");
					enum1.value = 1;
					root.insert("entry", enum1);
				},
				op2: function (root) {
					var enum2 = PropertyFactory.create("autodesk.core:UnitsEnum-1.0.0");
					enum2.value = 2;
					root.insert("entry", enum2);
				},
				compareToSequential: false,
				checkResult: function (conflicts, changeSet) {
					expect(changeSet).to.deep.equal({
						modify: {
							"enum<autodesk.core:UnitsEnum-1.0.0>": {
								entry: {
									oldValue: 1,
									value: 2,
								},
							},
						},
					});
					expect(conflicts).to.have.length(1);
					expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
					expect(conflicts[0].path).to.be.equal("entry");
					expect(conflicts[0].conflictingChange).to.be.equal(2);
				},
			});
		});

		it("with conflicting inserts in a deep leaf should report a correct conflict", function () {
			testRebasing({
				prepare: function (root) {
					var node = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
					root.insert("node", node);
				},
				op1: function (root) {
					var node1 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
					root.resolvePath("node").insert("node2", node1);
				},
				op2: function (root) {
					var node2 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");
					root.resolvePath("node").insert("node2", node2);
				},
				compareToSequential: false,
				checkResult: function (conflicts, changeSet) {
					expect(ChangeSet.isEmptyChangeSet(changeSet)).to.be.ok;
					expect(conflicts).to.have.length(1);
					expect(conflicts[0].type).to.be.equal(
						ChangeSet.ConflictType.INSERTED_ENTRY_WITH_SAME_KEY,
					);
					expect(conflicts[0].path).to.be.equal("node.node2");
				},
			});
		});
	});

	describe("Compatibility with ChangeSets from spec", function () {
		// These are the ChangeSets from the discussion minutes document
		// after some cleanup, mainly missing parameters were added in inserts and
		// syntax corrections. Additionally, the Vector3 was renamed to autodesk.test:vector3-1.0.0 to avoid
		// conflicts with the inbuilt type

		var insertChangeSet1 = {
			insert: {
				"autodesk.test:point2d-1.0.0": {
					myPoint: {
						"Float32": {
							"position.x": 122,
							"position.y": 122,
							"temperature": 10,
						},
						"autodesk.test:vector3-1.0.0": {
							normal: {
								Float32: {
									x: 1,
									y: 1,
									z: 1,
								},
							},
						},
						"map<autodesk.test:vector3-1.0.0>": {
							neighbours: {
								insert: {
									"autodesk.test:vector3-1.0.0": {
										Point1: {
											Float32: {
												x: 1,
												y: 1,
												z: 1,
											},
										},
									},
								},
							},
						},
					},
					d23kjda: {
						"Float32": {
							"position.x": 122,
							"position.y": 122,
							"temperature": 11,
						},
						"autodesk.test:vector3-1.0.0": {
							normal: {
								Float32: {
									x: 1,
									y: 1,
									z: 1,
								},
							},
						},
						"map<autodesk.test:vector3-1.0.0>": {
							neighbours: {},
						},
					},
				},
				"Float32": {
					compression: 0,
				},
				"map<>": {
					birds: {
						insert: {
							"autodesk.test:vector3-1.0.0": {
								Point1: {
									Float32: {
										x: 1,
										y: 1,
										z: 1,
									},
								},
							},
						},
					},
					horses: {},
					forest: {},
				},
			},
		};

		var modifyChangeSet1 = {
			modify: {
				"autodesk.test:point2d-1.0.0": {
					myPoint: {
						"Float32": {
							"position.x": 11,
							"temperature": 31,
						},
						"autodesk.test:vector3-1.0.0": {
							normal: {
								Float32: {
									x: 0.5,
								},
							},
						},
					},
				},
			},
		};

		var modifyChangeSet2 = {
			modify: {
				"autodesk.test:point2d-1.0.0": {
					myPoint: {
						"map<autodesk.test:vector3-1.0.0>": {
							neighbours: {
								insert: {
									"autodesk.test:vector3-1.0.0": {
										Point2: {
											Float32: {
												x: 1,
												y: 1,
												z: 1,
											},
										},
									},
								},
							},
						},
					},
				},
			},
		};

		var modifyChangeSet3 = {
			modify: {
				"autodesk.test:point2d-1.0.0": {
					myPoint: {
						"map<autodesk.test:vector3-1.0.0>": {
							neighbours: {
								modify: {
									"autodesk.test:vector3-1.0.0": {
										Point2: {
											Float32: {
												x: 2,
											},
										},
									},
								},
							},
						},
					},
				},
			},
		};

		var removePreparationChangeSet1 = {
			insert: {
				"autodesk.test:SceneObject-1.0.0": {
					dasdm23: {
						String: {
							revitId: "#23213",
							name: "Door",
						},
					},
				},
			},
		};

		var removePreparationChangeSet2 = {
			modify: {
				"autodesk.test:SceneObject-1.0.0": {
					dasdm23: {
						insert: {
							"autodesk.test:SceneObject-1.0.0": {
								as2398d: {
									String: {
										revitId: "#2231",
										name: "Room",
									},
								},
							},
						},
					},
				},
			},
		};

		var removeChangeSet1 = {
			remove: ["dasdm23"],
		};

		var removeChangeSet2 = {
			modify: {
				"autodesk.test:SceneObject-1.0.0": {
					dasdm23: {
						remove: ["as2398d"],
					},
				},
			},
		};

		it("should be possible to insert properties with the example from the spec", function () {
			var rootProperty = PropertyFactory.create("NodeProperty");
			rootProperty.applyChangeSet(insertChangeSet1);

			// Make sure all properties are as expected
			expect(rootProperty.getDynamicIds().length).to.equal(6);
			expect(rootProperty._getDynamicChildrenReadOnly()).to.have.all.keys(
				"birds",
				"horses",
				"forest",
				"compression",
				"myPoint",
				"d23kjda",
			);
			expect(rootProperty._properties.compression.value).to.equal(0);
			assert(rootProperty._properties.birds instanceof MapProperty);
			assert(rootProperty._properties.forest instanceof MapProperty);
			assert(rootProperty._properties.horses instanceof MapProperty);

			expect(rootProperty.resolvePath("myPoint.position.x").value).to.equal(122);
			expect(rootProperty.resolvePath("myPoint.position.y").value).to.equal(122);
			expect(rootProperty.resolvePath("myPoint.temperature").value).to.equal(10);

			expect(rootProperty.resolvePath("myPoint.normal.x").value).to.equal(1);
			expect(rootProperty.resolvePath("myPoint.normal.y").value).to.equal(1);
			expect(rootProperty.resolvePath("myPoint.normal.z").value).to.equal(1);

			var neighbours = rootProperty.resolvePath("myPoint.neighbours");
			assert(neighbours.has("Point1"));
			expect(neighbours.get("Point1")._properties.x.value).to.equal(1);
			expect(neighbours.get("Point1")._properties.y.value).to.equal(1);
			expect(neighbours.get("Point1")._properties.z.value).to.equal(1);

			expect(rootProperty.resolvePath("d23kjda.position.x").value).to.equal(122);
			expect(rootProperty.resolvePath("d23kjda.position.y").value).to.equal(122);
			expect(rootProperty.resolvePath("d23kjda.temperature").value).to.equal(11);

			expect(rootProperty.resolvePath("d23kjda.normal.x").value).to.equal(1);
			expect(rootProperty.resolvePath("d23kjda.normal.y").value).to.equal(1);
			expect(rootProperty.resolvePath("d23kjda.normal.z").value).to.equal(1);

			// Make sure serialization gives the same result as the initial ChangeSet
			expect(rootProperty.serialize({ dirtyOnly: false })).to.deep.equal(insertChangeSet1);
			expect(rootProperty.serialize({ dirtyOnly: true })).to.deep.equal(insertChangeSet1);
		});

		it("should be possible to use the first modify ChangeSet from the spec", function () {
			// Prepare the initial state
			var rootProperty = PropertyFactory.create("NodeProperty");
			rootProperty.applyChangeSet(insertChangeSet1);

			// Clean dirtiness
			rootProperty.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);

			// Apply the modify changeSet
			rootProperty.applyChangeSet(modifyChangeSet1);
			expect(rootProperty.resolvePath("myPoint.position.x").value).to.equal(11);
			expect(rootProperty.resolvePath("myPoint.normal.x").value).to.equal(0.5);
			expect(rootProperty.resolvePath("myPoint.temperature").value).to.equal(31);

			// Make sure the serialization gives the expected result
			expect(rootProperty.serialize({ dirtyOnly: true })).to.deep.equal(modifyChangeSet1);
		});

		it("should be possible to use the second modify ChangeSet from the spec", function () {
			// Prepare the initial state
			var rootProperty = PropertyFactory.create("NodeProperty");
			rootProperty.applyChangeSet(insertChangeSet1);

			// Clean dirtiness
			rootProperty.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);

			// Apply the modify changeSet
			rootProperty.applyChangeSet(modifyChangeSet2);
			var point2 = rootProperty.resolvePath("myPoint.neighbours").get("Point2");
			expect(point2._properties.x.value).to.equal(1);
			expect(point2._properties.y.value).to.equal(1);
			expect(point2._properties.z.value).to.equal(1);

			// Make sure the serialization gives the expected result
			expect(rootProperty.serialize({ dirtyOnly: true })).to.deep.equal(modifyChangeSet2);
		});

		it("should be possible to use the third modify ChangeSet from the spec", function () {
			// Prepare the initial state
			var rootProperty = PropertyFactory.create("NodeProperty");
			rootProperty.applyChangeSet(insertChangeSet1);
			rootProperty.applyChangeSet(modifyChangeSet2);

			// Clean dirtiness
			rootProperty.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);

			// Apply the modify changeSet
			rootProperty.applyChangeSet(modifyChangeSet3);
			var point2 = rootProperty.resolvePath("myPoint.neighbours").get("Point2");
			expect(point2._properties.x.value).to.equal(2);

			// Make sure the serialization gives the expected result
			expect(rootProperty.serialize({ dirtyOnly: true })).to.deep.equal(modifyChangeSet3);
		});

		it("should be possible to use the first remove ChangeSet from the spec", function () {
			// Prepare the initial state
			var rootProperty = PropertyFactory.create("NodeProperty");
			rootProperty.applyChangeSet(removePreparationChangeSet1);
			rootProperty.applyChangeSet(removePreparationChangeSet2);

			// Clean dirtiness
			rootProperty.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);

			// Apply the modify changeSet
			expect(rootProperty.getDynamicIds().length).to.be.equal(1);
			rootProperty.applyChangeSet(removeChangeSet1);
			expect(rootProperty.getDynamicIds().length).to.be.equal(0);

			// Make sure the serialization gives the expected result
			expect(rootProperty.serialize({ dirtyOnly: true })).to.deep.equal(removeChangeSet1);
		});

		it("should be possible to use the first remove ChangeSet from the spec", function () {
			// Prepare the initial state
			var rootProperty = PropertyFactory.create("NodeProperty");
			rootProperty.applyChangeSet(removePreparationChangeSet1);
			rootProperty.applyChangeSet(removePreparationChangeSet2);

			// Clean dirtiness
			rootProperty.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);

			// Apply the remove changeSet
			expect(rootProperty.resolvePath("dasdm23").getDynamicIds().length).to.be.equal(1);
			rootProperty.applyChangeSet(removeChangeSet2);
			expect(rootProperty.getDynamicIds().length).to.be.equal(1);
			expect(rootProperty.resolvePath("dasdm23").getDynamicIds().length).to.be.equal(0);

			// Make sure the serialization gives the expected result
			expect(rootProperty.serialize({ dirtyOnly: true })).to.deep.equal(removeChangeSet2);
		});
	});

	describe("Make sure struct changes and path updates are signaled correctly", function () {
		it("Should be possible to access dynamic nodes via propertis and paths", function () {
			var root = PropertyFactory.create("NodeProperty");
			var newRoot = PropertyFactory.create("NodeProperty");

			// Create a hierarchy of nodes
			root.insert("child1", PropertyFactory.create("NodeProperty"));
			root.insert("child2", PropertyFactory.create("NodeProperty"));

			expect(root._properties.child1.position).to.be.undefined;
			expect(root.resolvePath("child1.position")).to.be.undefined;

			// Crate a dynamic object via a NodeProperty
			var positionProperty = PropertyFactory.create("NodeProperty");
			root._properties.child1.propertyNode.insert("position", positionProperty);
			root._properties.child1.position.propertyNode.insert(
				"x",
				PropertyFactory.create("Float32"),
			);
			root._properties.child1.position.propertyNode.insert(
				"y",
				PropertyFactory.create("Float32"),
			);
			root._properties.child1.position.propertyNode.insert(
				"z",
				PropertyFactory.create("Float32"),
			);

			// Make sure paths resolve correctly
			expect(root._properties.child1.position).not.to.be.undefined;
			expect(root._properties.child1.position.propertyNode).to.be.an.instanceof(NodeProperty);
			expect(root.resolvePath("child1.position")).to.be.instanceof(NodeProperty);

			// assign values via the properties object (for NodeProperty)
			root._properties.child1.position.x.value = 1;
			root._properties.child1.position.y.value = 2;
			root._properties.child1.position.z.value = 3;

			// assign values via resolve path
			root.resolvePath("child1.position.x").value = 3;
			root.resolvePath("child1.position.y").value = 2;
			root.resolvePath("child1.position.z").value = 1;

			// Check values
			expect(root._properties.child1.position.x.value).to.equal(3);
			expect(root._properties.child1.position.y.value).to.equal(2);
			expect(root._properties.child1.position.z.value).to.equal(1);

			// Crate a dynamic object via a template
			var vec3Property = PropertyFactory.create("autodesk.test:vector3-1.0.0");
			root._properties.child1.propertyNode.insert("vector", vec3Property);

			// Make sure paths resolve correctly
			expect(root._properties.child1.vector).not.to.be.undefined;
			expect(root._properties.child1.vector.propertyNode).to.be.an.instanceof(BaseProperty);
			expect(root.resolvePath("child1.vector")).to.be.instanceof(BaseProperty);

			root._properties.child1.vector.x.value = 1;
			root._properties.child1.vector.y.value = 2;
			root._properties.child1.vector.z.value = 3;

			// assign values via resolve path
			root.resolvePath("child1.vector.x").value = 3;
			root.resolvePath("child1.vector.y").value = 2;
			root.resolvePath("child1.vector.z").value = 1;

			// Check values
			expect(root._properties.child1.vector.x.value).to.equal(3);
			expect(root._properties.child1.vector.y.value).to.equal(2);
			expect(root._properties.child1.vector.z.value).to.equal(1);

			// Check roots
			expect(positionProperty.getRoot()).to.equal(root);
			expect(positionProperty._properties.x.getRoot()).to.equal(root);
			expect(vec3Property.getRoot()).to.equal(root);
			expect(vec3Property._properties.x.getRoot()).to.equal(root);

			// Check paths
			expect(positionProperty.getAbsolutePath()).to.equal("/child1.position");
			expect(positionProperty._properties.x.getAbsolutePath()).to.equal("/child1.position.x");
			expect(vec3Property.getAbsolutePath()).to.equal("/child1.vector");
			expect(vec3Property._properties.x.getAbsolutePath()).to.equal("/child1.vector.x");

			// Check deletion
			root._properties.child1.propertyNode.remove("position");
			root._properties.child1.propertyNode.remove("vector");

			expect(root._properties.child1.position).to.be.undefined;
			expect(root.resolvePath("child1.position")).to.be.undefined;

			expect(root._properties.child1.vector).to.be.undefined;
			expect(root.resolvePath("child1.vector")).to.be.undefined;

			// Check roots
			expect(positionProperty.getRoot()).to.equal(positionProperty);
			expect(positionProperty._properties.x.getRoot()).to.equal(positionProperty);
			expect(vec3Property.getRoot()).to.equal(vec3Property);
			expect(vec3Property._properties.x.getRoot()).to.equal(vec3Property);

			// Check paths
			expect(positionProperty.getAbsolutePath()).to.equal("/");
			expect(positionProperty._properties.x.getAbsolutePath()).to.equal("/x");
			expect(vec3Property.getAbsolutePath()).to.equal("/");
			expect(vec3Property._properties.x.getAbsolutePath()).to.equal("/x");

			// Check addition to a new property root under a different key
			newRoot.insert("newPosition", positionProperty);
			newRoot.insert("newvector", vec3Property);

			// Check roots
			expect(positionProperty.getRoot()).to.equal(newRoot);
			expect(positionProperty._properties.x.getRoot()).to.equal(newRoot);
			expect(vec3Property.getRoot()).to.equal(newRoot);
			expect(vec3Property._properties.x.getRoot()).to.equal(newRoot);

			// Check paths
			expect(positionProperty.getAbsolutePath()).to.equal("/newPosition");
			expect(positionProperty._properties.x.getAbsolutePath()).to.equal("/newPosition.x");
			expect(vec3Property.getAbsolutePath()).to.equal("/newvector");
			expect(vec3Property._properties.x.getAbsolutePath()).to.equal("/newvector.x");

			// Check keys with characters that require quotations
			newRoot.remove("newPosition");
			newRoot.remove("newvector");
			newRoot.insert('new"Position', positionProperty);
			newRoot.insert("new.Vector", vec3Property);

			// Check paths
			expect(positionProperty.getAbsolutePath()).to.equal('/"new\\"Position"');
			expect(positionProperty._properties.x.getAbsolutePath()).to.equal('/"new\\"Position".x');
			expect(newRoot.resolvePath('"new\\"Position".x')).to.equal(
				positionProperty._properties.x,
			);
			expect(vec3Property.getAbsolutePath()).to.equal('/"new.Vector"');
			expect(vec3Property._properties.x.getAbsolutePath()).to.equal('/"new.Vector".x');
			expect(newRoot.resolvePath('"new.Vector".x')).to.equal(vec3Property._properties.x);

			newRoot.remove('new"Position');

			// Path resolution for named properties should return the correct path
			var namedProperty = PropertyFactory.create("NamedProperty");
			var nodeProperty = PropertyFactory.create("NodeProperty");
			nodeProperty.insert(namedProperty);
			expect(namedProperty.getAbsolutePath()).to.equal("/" + namedProperty.getGuid());
			expect(nodeProperty.resolvePath(namedProperty.getGuid())).to.equal(namedProperty);

			// Try multiple levels
			var leaf = PropertyFactory.create("NodeProperty");
			expect(leaf.resolvePath("/")).to.equal(leaf);
			var map1 = PropertyFactory.create("NodeProperty");
			map1.insert("entry", leaf);
			expect(leaf.resolvePath("/")).to.equal(map1);

			var map2 = PropertyFactory.create("NodeProperty");
			map2.insert("entry", map1);
			expect(leaf.resolvePath("/")).to.equal(map2);

			var map3 = PropertyFactory.create("NodeProperty");
			map3.insert("entry", map2);
			expect(leaf.resolvePath("/")).to.equal(map3);
		});
	});

	it("should correctly clean templates inheriting from NamedNodeProperty", function () {
		var property = PropertyFactory.create("autodesk.tests:MixedNamedNodeProperty-1.0.0");
		var childProperty = property.get("stringProperty");
		childProperty.value = "changed";
		expect(childProperty.isDirty()).to.be.true;
		property.cleanDirty();
		expect(property.isDirty()).to.be.false;
		expect(childProperty.isDirty()).to.be.false;
	});

	describe("Make sure to have appropriate types for ids given to nodeProperty when inserting", function () {
		it("should be possible for the id passed to be a string", function (done) {
			var node1 = PropertyFactory.create("NodeProperty");
			var node2 = PropertyFactory.create("autodesk.tests:MixedNamedNodeProperty-1.0.0");
			var node3 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");

			node1.insert("node", node3);
			node3.insert("node1", node2);
			node2._properties.stringProperty.value = "test";
			expect(node1.resolvePath("node.node1.stringProperty").value).to.equal("test");
			expect(node3.resolvePath("node1.stringProperty").value).to.equal("test");
			done();
		});

		it("should be possible for the id passed to be a number", function (done) {
			var node1 = PropertyFactory.create("NodeProperty");
			var node2 = PropertyFactory.create("autodesk.tests:MixedNamedNodeProperty-1.0.0");
			var node3 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");

			node1.insert("node", node3);
			node3.insert(1122, node2);
			node2._properties.stringProperty.value = "test";
			expect(node1.resolvePath("node.1122.stringProperty").value).to.equal("test");
			expect(node3.resolvePath("1122.stringProperty").value).to.equal("test");
			done();
		});

		it("should throw an error when the id passed is an object", function (done) {
			var node1 = PropertyFactory.create("NodeProperty");
			var node2 = PropertyFactory.create("autodesk.tests:MixedNamedNodeProperty-1.0.0");
			var node3 = PropertyFactory.create("autodesk.tests:MixedNodeTestProperty-1.0.0");

			node1.insert("node", node3);
			try {
				node3.insert({ foo: "bar" }, node2);
				node2._properties.stringProperty.value = "test";
			} catch (e) {
				done();
			}
		});
	});

	describe("_coveredByPaths", function () {
		this.timeout(500);
		let PathHelper, getPathCoverageSpy, paths, prop, propPath;

		before(function () {
			PathHelper = require("@fluid-experimental/property-changeset").PathHelper;
		});

		beforeEach(function () {
			getPathCoverageSpy = sinon.spy(PathHelper, "getPathCoverage");
		});

		afterEach(function () {
			PathHelper.getPathCoverage.restore();
		});

		after(function () {});

		it("should succeed if property is included in a path 1", function () {
			paths = ["a.b"];
			prop = PropertyFactory.create("String");
			propPath = "a.b";
			expect(prop._coveredByPaths(propPath, paths)).to.be.true;
			expect(getPathCoverageSpy.callCount).to.equal(1);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
		});

		it("should succeed if property is included in a path 2", function () {
			paths = ["a.b"];
			prop = PropertyFactory.create("Int32");
			propPath = "a.b.c";
			expect(prop._coveredByPaths(propPath, paths)).to.be.true;
			expect(getPathCoverageSpy.callCount).to.equal(1);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
		});

		it("should succeed if property is a primitive collection included in a path", function () {
			paths = ["a.b"];
			prop = PropertyFactory.create("Int32", "array");
			propPath = "a.b.c.d";
			expect(prop._coveredByPaths(propPath, paths)).to.be.true;
			expect(getPathCoverageSpy.callCount).to.equal(1);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
		});

		it("should fail if property is not included in any path 1", function () {
			paths = ["a.b"];
			prop = PropertyFactory.create("Bool");
			propPath = "b";
			expect(prop._coveredByPaths(propPath, paths)).to.be.false;
			expect(getPathCoverageSpy.callCount).to.equal(1);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
		});

		it("should fail if property is not included in any path 2", function () {
			paths = ["a.b"];
			prop = PropertyFactory.create("Float32");
			propPath = "b.f.g";
			expect(prop._coveredByPaths(propPath, paths)).to.be.false;
			expect(getPathCoverageSpy.callCount).to.equal(1);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
		});

		it("should fail if property is not included in any path but have common root 1", function () {
			paths = ["a.b"];
			prop = PropertyFactory.create("String", "map");
			propPath = "a.h";
			expect(prop._coveredByPaths(propPath, paths)).to.be.false;
			expect(getPathCoverageSpy.callCount).to.equal(1);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
		});

		it("should fail if property is not included in any path but have common root 2", function () {
			paths = ["a.b"];
			prop = PropertyFactory.create("NodeProperty");
			propPath = "a.i.j";
			expect(prop._coveredByPaths(propPath, paths)).to.be.false;
			expect(getPathCoverageSpy.callCount).to.equal(1);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
		});

		it("should succeed if path goes through a primitive property 1", function () {
			paths = ["a.b.c", "a.b.d", "z"];
			prop = PropertyFactory.create("String");
			propPath = "a.b";
			expect(prop._coveredByPaths(propPath, paths)).to.be.true;
			expect(getPathCoverageSpy.callCount).to.equal(1);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
		});

		it("should succeed if path goes through a primitive property 2", function () {
			paths = ["a.b.c", "a.b.d", "z"];
			prop = PropertyFactory.create("Int32");
			propPath = "a.b";
			expect(prop._coveredByPaths(propPath, paths)).to.be.true;
			expect(getPathCoverageSpy.callCount).to.equal(1);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
		});

		it("should succeed if path goes through a primitive collection property 1", function () {
			paths = ["a.b.c", "z", "a.b.d"];
			prop = PropertyFactory.create("Int32", "map");
			propPath = "a.b";
			expect(prop._coveredByPaths(propPath, paths)).to.be.true;
			expect(getPathCoverageSpy.callCount).to.equal(1);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
		});

		it("should succeed if path goes through a primitive collection property 2", function () {
			paths = ["z", "a.b.c", "a.b.d"];
			prop = PropertyFactory.create("String", "array");
			propPath = "a.b";
			expect(prop._coveredByPaths(propPath, paths)).to.be.true;
			expect(getPathCoverageSpy.callCount).to.equal(1);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
		});

		it("should succeed if path goes through a non-primitive collection property 1", function () {
			paths = ["a.b.c", "z", "a.b.d"];
			prop = PropertyFactory.create("NodeProperty", "map");
			propPath = "a.b";
			expect(prop._coveredByPaths(propPath, paths)).to.be.true;
			expect(getPathCoverageSpy.callCount).to.equal(1);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
		});

		it("should succeed if path goes through a non-primitive collection property 2", function () {
			paths = ["z", "a.b.c", "a.b.d"];
			prop = PropertyFactory.create("NamedProperty", "set");
			propPath = "a.b";
			expect(prop._coveredByPaths(propPath, paths)).to.be.true;
			expect(getPathCoverageSpy.callCount).to.equal(1);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
		});

		it("should succeed if property is included in multiple paths 1", function () {
			paths = ["a.b.c", "a.b.d", "z"];
			prop = PropertyFactory.create("NodeProperty");
			prop.insert("c", PropertyFactory.create("String"));
			prop.insert("d", PropertyFactory.create("String"));
			propPath = "a.b";
			expect(prop._coveredByPaths(propPath, paths)).to.be.true;
			expect(getPathCoverageSpy.callCount).to.equal(3);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
			expect(getPathCoverageSpy.calledWith("a.b.c", ["a.b.c", "a.b.d"])).to.be.true;
			expect(getPathCoverageSpy.calledWith("a.b.d", ["a.b.c", "a.b.d"])).to.be.true;
		});

		it("should succeed if property is included in multiple paths 2", function () {
			paths = ["a.b.c", "z", "a.b.d"];
			prop = PropertyFactory.create("NodeProperty");
			let c = PropertyFactory.create("NodeProperty");
			prop.insert("c", c);
			c.insert("f", PropertyFactory.create("String"));
			c.insert("g", PropertyFactory.create("String"));
			let d = PropertyFactory.create("String", "map");
			prop.insert("d", d);
			d.insert("h", "h");
			d.insert("i", "i");
			propPath = "a.b";
			expect(prop._coveredByPaths(propPath, paths)).to.be.true;
			expect(getPathCoverageSpy.callCount).to.equal(3);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
			expect(getPathCoverageSpy.calledWith("a.b.c", ["a.b.c", "a.b.d"])).to.be.true;
			expect(getPathCoverageSpy.calledWith("a.b.d", ["a.b.c", "a.b.d"])).to.be.true;
		});

		it("should succeed if property is included in multiple paths 3", function () {
			paths = ["a.b.c.f", "a.b.c", "a.b.d.h", "a.b.d.i", "a.z"];
			prop = PropertyFactory.create("NodeProperty");
			let c = PropertyFactory.create("NodeProperty");
			prop.insert("c", c);
			c.insert("f", PropertyFactory.create("String"));
			c.insert("g", PropertyFactory.create("String"));
			let d = PropertyFactory.create("NodeProperty");
			prop.insert("d", d);
			d.insert("h", PropertyFactory.create("String"));
			d.insert("i", PropertyFactory.create("String"));
			propPath = "a.b";
			expect(prop._coveredByPaths(propPath, paths)).to.be.true;
			expect(getPathCoverageSpy.callCount).to.equal(5);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
			expect(
				getPathCoverageSpy.calledWith("a.b.c", ["a.b.c.f", "a.b.c", "a.b.d.h", "a.b.d.i"]),
			).to.be.true;
			expect(
				getPathCoverageSpy.calledWith("a.b.d", ["a.b.c.f", "a.b.c", "a.b.d.h", "a.b.d.i"]),
			).to.be.true;
			expect(getPathCoverageSpy.calledWith("a.b.d.h", ["a.b.d.h", "a.b.d.i"])).to.be.true;
			expect(getPathCoverageSpy.calledWith("a.b.d.i", ["a.b.d.h", "a.b.d.i"])).to.be.true;
		});

		it("should succeed if property is included in multiple paths 4", function () {
			paths = ["a.b.c.f", "a.b.c", "a.b.d.h", "a.b.d.i", "a.z"];
			prop = PropertyFactory.create("NodeProperty");
			let b = PropertyFactory.create("NodeProperty");
			prop.insert("b", b);
			let c = PropertyFactory.create("NodeProperty");
			b.insert("c", c);
			c.insert("f", PropertyFactory.create("String"));
			c.insert("g", PropertyFactory.create("String"));
			let d = PropertyFactory.create("NodeProperty");
			b.insert("d", d);
			d.insert("h", PropertyFactory.create("String"));
			d.insert("i", PropertyFactory.create("String"));
			propPath = "a";
			expect(prop._coveredByPaths(propPath, paths)).to.be.true;
			expect(getPathCoverageSpy.callCount).to.equal(6);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
			expect(getPathCoverageSpy.calledWith("a.b", paths)).to.be.true;
			expect(
				getPathCoverageSpy.calledWith("a.b.c", ["a.b.c.f", "a.b.c", "a.b.d.h", "a.b.d.i"]),
			).to.be.true;
			expect(
				getPathCoverageSpy.calledWith("a.b.d", ["a.b.c.f", "a.b.c", "a.b.d.h", "a.b.d.i"]),
			).to.be.true;
			expect(getPathCoverageSpy.calledWith("a.b.d.h", ["a.b.d.h", "a.b.d.i"])).to.be.true;
			expect(getPathCoverageSpy.calledWith("a.b.d.i", ["a.b.d.h", "a.b.d.i"])).to.be.true;
		});

		it("should succeed if property is included in multiple paths through map 1", function () {
			paths = ["a.b.c", "a.b.d.z", "z"];
			prop = PropertyFactory.create("String", "map");
			prop.insert("c", "c");
			prop.insert("d", "d");
			propPath = "a.b";
			expect(prop._coveredByPaths(propPath, paths)).to.be.true;
			expect(getPathCoverageSpy.callCount).to.equal(3);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
			expect(getPathCoverageSpy.calledWith("a.b.c", ["a.b.c", "a.b.d.z"])).to.be.true;
			expect(getPathCoverageSpy.calledWith("a.b.d", ["a.b.c", "a.b.d.z"])).to.be.true;
		});

		it("should succeed if property is included in multiple paths through map 2", function () {
			paths = ["a.b.c.f", "a.b.c", "a.b.d.h", "a.b.d.i", "a.z"];
			prop = PropertyFactory.create("NodeProperty");
			let c = PropertyFactory.create("NodeProperty");
			let d = PropertyFactory.create("String", "map");
			prop.insert("c", c);
			c.insert("f", PropertyFactory.create("String"));
			c.insert("g", PropertyFactory.create("String"));
			prop.insert("d", d);
			d.insert("h", "h");
			d.insert("i", "i");
			propPath = "a.b";
			expect(prop._coveredByPaths(propPath, paths)).to.be.true;
			expect(getPathCoverageSpy.callCount).to.equal(5);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
			expect(
				getPathCoverageSpy.calledWith("a.b.c", ["a.b.c.f", "a.b.c", "a.b.d.h", "a.b.d.i"]),
			).to.be.true;
			expect(
				getPathCoverageSpy.calledWith("a.b.d", ["a.b.c.f", "a.b.c", "a.b.d.h", "a.b.d.i"]),
			).to.be.true;
			expect(getPathCoverageSpy.calledWith("a.b.d.h", ["a.b.d.h", "a.b.d.i"])).to.be.true;
			expect(getPathCoverageSpy.calledWith("a.b.d.i", ["a.b.d.h", "a.b.d.i"])).to.be.true;
		});

		it("should fail if property is not completely included in multiple paths 1", function () {
			paths = ["a.b.c", "a.b.d", "z"];
			prop = PropertyFactory.create("NodeProperty");
			prop.insert("c", PropertyFactory.create("String"));
			prop.insert("e", PropertyFactory.create("String"));
			propPath = "a.b";
			expect(prop._coveredByPaths(propPath, paths)).to.be.false;
			expect(getPathCoverageSpy.callCount).to.be.above(1);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
		});

		it("should fail if property is not completely included in multiple paths 2", function () {
			paths = ["z", "a.b.d", "a.b.c"];
			prop = PropertyFactory.create("NodeProperty");
			prop.insert("e", PropertyFactory.create("String"));
			prop.insert("c", PropertyFactory.create("String"));
			propPath = "a.b";
			expect(prop._coveredByPaths(propPath, paths)).to.be.false;
			expect(getPathCoverageSpy.callCount).to.be.above(1);
			expect(getPathCoverageSpy.calledWith(propPath, paths)).to.be.true;
		});
	});
});
