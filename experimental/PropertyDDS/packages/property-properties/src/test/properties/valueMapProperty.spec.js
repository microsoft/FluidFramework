/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* globals describe */

/**
 * @fileoverview
 * In this file, we will test the map property object described in /src/properties/mapProperty.js
 */
const { ChangeSet } = require("@fluid-experimental/property-changeset");

const { PropertyFactory } = require("../..");
const { BaseProperty } = require("../..");

describe("ValueMapProperty", function () {
	var myNode, Uint32Map;

	before(function () {
		// Register a template with a set property for the tests
		var TestPropertyTemplate = {
			typeid: "autodesk.tests:ValueMapTestPropertyID-1.0.0",
			inherits: ["NamedProperty"],
			properties: [{ id: "Uint32Map", typeid: "Uint32", context: "map" }],
		};

		// Register a template with a set property for the tests
		var AllTypesTestPropertyTemplate = {
			typeid: "autodesk.tests:AllTypesValueMapTestPropertyID-1.0.0",
			inherits: ["NamedProperty"],
			properties: [
				{ id: "Uint32Map", typeid: "Uint32", context: "map" },
				{ id: "Uint16Map", typeid: "Uint16", context: "map" },
				{ id: "Uint8Map", typeid: "Uint8", context: "map" },
				{ id: "Int32Map", typeid: "Int32", context: "map" },
				{ id: "Int16Map", typeid: "Int16", context: "map" },
				{ id: "Int8Map", typeid: "Int8", context: "map" },
				{ id: "Float64Map", typeid: "Float64", context: "map" },
				{ id: "Float32Map", typeid: "Float32", context: "map" },
				{ id: "StringMap", typeid: "String", context: "map" },
				{ id: "BoolMap", typeid: "Bool", context: "map" },
			],
		};
		PropertyFactory._reregister(TestPropertyTemplate);
		PropertyFactory._reregister(AllTypesTestPropertyTemplate);

		myNode = PropertyFactory.create("autodesk.tests:ValueMapTestPropertyID-1.0.0");
		Uint32Map = myNode._properties.Uint32Map;
	});

	// Helper functions for the test cases
	var keyCounter = 0;
	var resetKeyCounter = function () {
		keyCounter = 0;
	};

	// Inserts a node with a given key (a new one is generated when undefined)
	var insertEntryInRootWithKey = function (key, root) {
		if (key === undefined) {
			key = "node" + keyCounter++;
		}
		root._properties.Uint32Map.insert(key, keyCounter);
	};

	// Inserts a new node in the root
	var insertNodeInRoot = function (root) {
		insertEntryInRootWithKey(undefined, root);
	};

	// Returns a functor that will insert a node with a constant key
	var insertEntryInRootWithUnqiueKey = function () {
		var key = "node" + keyCounter++;
		return insertEntryInRootWithKey.bind(undefined, key);
	};

	// Removes the first node from the root
	var removeFirstNodeInRoot = function (root) {
		var firstKey = root._properties.Uint32Map.getIds()[0];
		root._properties.Uint32Map.remove(firstKey);
	};

	// Modifies the first node
	var modifyEntry = function (root) {
		var firstKey = root._properties.Uint32Map.getIds()[0];
		root._properties.Uint32Map.set(firstKey, root._properties.Uint32Map.get(firstKey) + 1);
	};

	describe("Inherited API Methods", function () {
		var newMap;
		before(function () {
			newMap = PropertyFactory.create("Int32", "map");
		});
		it(".clear should work to remove all entries in the map", function () {
			newMap.insert("one", 1);
			newMap.insert("two", 2);
			expect(newMap.getValues()).to.deep.equal({ one: 1, two: 2 });
			newMap.clear();
			expect(newMap.getValues()).to.deep.equal({});
		});

		it(".getAsArray should return an array of map values", function () {
			newMap.insert("one", 1);
			newMap.insert("two", 2);
			expect(newMap.getAsArray()).to.deep.equal([1, 2]);
		});

		it("getEntriesReadOnly should work", function () {
			newMap.insert("one", 1);
			newMap.insert("two", 2);
			expect(newMap.getEntriesReadOnly()).to.deep.equal({ one: 1, two: 2 });
		});

		it(".getFullTypeid should return a string of the typeid with or without collection", function () {
			expect(newMap.getFullTypeid()).to.equal("map<Int32>");
			expect(newMap.getFullTypeid(true)).to.equal("Int32");
		});

		it(".getIds should return an array of map keys", function () {
			newMap.insert("one", 1);
			newMap.insert("two", 2);
			expect(newMap.getIds()).to.deep.equal(["one", "two"]);
		});

		it(".getValues should return an object", function () {
			newMap.insert("one", 1);
			newMap.insert("two", 2);
			expect(newMap.getValues()).to.deep.equal({ one: 1, two: 2 });
		});

		it(".has should return a boolean", function () {
			newMap.insert("one", 1);
			newMap.insert("two", 2);
			expect(newMap.has("two")).to.equal(true);
			expect(newMap.has("three")).to.equal(false);
		});

		it(".setValues should work to set multiple values", function () {
			newMap.setValues({ first: 11, second: 22, third: 33 });
			expect(newMap.get("first")).to.equal(11);
			expect(newMap.get("third")).to.equal(33);
		});

		afterEach(function () {
			newMap.clear();
		});
	});

	describe("Testing creation, assignment and serialization", function () {
		it("should be empty at the beginning", function () {
			expect(Uint32Map.getAsArray()).to.be.empty;
			expect(Uint32Map.getEntriesReadOnly()).to.be.empty;
			expect(ChangeSet.isEmptyChangeSet(Uint32Map.serialize({ dirtyOnly: false }))).to.be.ok;
			expect(ChangeSet.isEmptyChangeSet(Uint32Map.serialize({ dirtyOnly: true }))).to.be.ok;
		});

		it("should be possible to add entries", function () {
			Uint32Map.insert("value1", 1);
			expect(Uint32Map.get("value1")).to.equal(1);
			Uint32Map.insert("value2", 2);
			expect(Uint32Map.get("value2")).to.equal(2);
			Uint32Map.insert("value3", 3);
			expect(Uint32Map.get("value3")).to.equal(3);
			expect(Uint32Map.getEntriesReadOnly()).to.deep.equal({
				value1: 1,
				value2: 2,
				value3: 3,
			});
			expect(Uint32Map.getAsArray()).to.include(1, 2, 3);
			expect(Uint32Map.has("value1")).to.be.ok;
			expect(Uint32Map.has("value2")).to.be.ok;
			expect(Uint32Map.has("value3")).to.be.ok;
			expect(Uint32Map.serialize()).to.deep.equal({
				insert: { value1: 1, value2: 2, value3: 3 },
			});
		});

		it("should be possible to remove entries", function () {
			Uint32Map.remove("value1");
			expect(Uint32Map.has("value1")).to.be.not.ok;
			Uint32Map.remove("value2");
			expect(Uint32Map.has("value1")).to.be.not.ok;
			Uint32Map.remove("value3");
			expect(Uint32Map.has("value1")).to.be.not.ok;
			expect(ChangeSet.isEmptyChangeSet(Uint32Map.serialize())).to.be.ok;
		});

		it("a remove followed by an insert should become a modify", function () {
			Uint32Map.insert("value1", 1);
			Uint32Map.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);
			Uint32Map.remove("value1");
			Uint32Map.insert("value1", 2);

			expect(Uint32Map.serialize({ dirtyOnly: true })).to.deep.equal({
				modify: { value1: 2 },
			});

			// This should also work for a set operation
			Uint32Map.set("value1", 3);
			expect(Uint32Map.serialize({ dirtyOnly: true })).to.deep.equal({
				modify: { value1: 3 },
			});

			// But setting the same value should give an empty ChangeSet
			Uint32Map.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);
			Uint32Map.set("value1", 3);
			expect(ChangeSet.isEmptyChangeSet(Uint32Map.serialize({ dirtyOnly: true }))).to.be.ok;

			// This should be tracked separately for dirtyness and pending changes
			Uint32Map.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);
			Uint32Map.remove("value1");
			Uint32Map.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY);
			Uint32Map.insert("value1", 2);

			expect(
				Uint32Map.serialize({
					dirtyOnly: true,
					includeRootTypeid: false,
					dirtinessType: BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
				}),
			).to.deep.equal({ modify: { value1: 2 } });

			expect(
				Uint32Map.serialize({
					dirtyOnly: true,
					includeRootTypeid: false,
					dirtinessType: BaseProperty.MODIFIED_STATE_FLAGS.DIRTY,
				}),
			).to.deep.equal({ insert: { value1: 2 } });
		});

		it("deserialize should work", function () {
			var myInitialStateNode = PropertyFactory.create(
				"autodesk.tests:ValueMapTestPropertyID-1.0.0",
			);
			myInitialStateNode._properties.Uint32Map.insert("value1", 1);
			myInitialStateNode._properties.Uint32Map.insert("value2", 2);
			var initialChangeSet = myInitialStateNode.serialize();

			// Deserialize a copy into a second node and check that the chageset is correct
			var myDeserializeNode1 = PropertyFactory.create(
				"autodesk.tests:ValueMapTestPropertyID-1.0.0",
			);
			var changes = myDeserializeNode1.deserialize(initialChangeSet);
			expect(changes).to.deep.equal(initialChangeSet);
			expect(myDeserializeNode1.serialize()).to.deep.equal(myInitialStateNode.serialize());
			myDeserializeNode1.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);

			// Create a third copy
			var myDeserializeNode2 = PropertyFactory.create(
				"autodesk.tests:ValueMapTestPropertyID-1.0.0",
			);
			myDeserializeNode2.deserialize(initialChangeSet);
			myDeserializeNode2.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);

			myInitialStateNode.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);
			myInitialStateNode._properties.Uint32Map.set("value1", 2);
			myInitialStateNode._properties.Uint32Map.remove("value2");
			myInitialStateNode._properties.Uint32Map.insert("value3", 3);

			var changesChangeSet = myInitialStateNode.serialize({ dirtyOnly: true });
			var fullChangeSet = myInitialStateNode.serialize({ dirtyOnly: false });

			var reportedChanges = myDeserializeNode1.deserialize(fullChangeSet);
			expect(myDeserializeNode1.serialize({ dirtyOnly: false })).to.deep.equal(
				myInitialStateNode.serialize({ dirtyOnly: false }),
			);
			expect(reportedChanges).to.deep.equal(changesChangeSet);
			expect(myDeserializeNode1.serialize({ dirtyOnly: true })).to.deep.equal(
				changesChangeSet,
			);

			var deserializeChanges = myDeserializeNode2.deserialize(fullChangeSet);
			expect(deserializeChanges).to.deep.equal(changesChangeSet);
		});

		it("inserting the same key twice should throw an exception", function () {
			var rootNode = PropertyFactory.create("autodesk.tests:ValueMapTestPropertyID-1.0.0");
			rootNode._properties.Uint32Map.insert("node1", 1);
			expect(function () {
				rootNode._properties.Uint32Map.insert("node1", 2);
			}).to.throw();
		});

		it("set should overwrite existing entry", function () {
			var rootNode = PropertyFactory.create("autodesk.tests:ValueMapTestPropertyID-1.0.0");

			rootNode._properties.Uint32Map.set("node1", 0);
			rootNode._properties.Uint32Map.set("node1", 1);
			// the set should overwrite the insert
			expect(
				rootNode.serialize({ dirtyOnly: true })["map<Uint32>"].Uint32Map,
			).to.have.all.keys("insert");

			// Overwriting with the same property shouldn't dirty the node
			rootNode.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);
			rootNode._properties.Uint32Map.set("node1", 1);
			expect(ChangeSet.isEmptyChangeSet(rootNode.serialize({ dirtyOnly: true }))).to.be.ok;
			expect(rootNode.isDirty()).to.be.false;

			// Overwriting with a different value should result in a modify
			rootNode._properties.Uint32Map.set("node1", 2);
			expect(
				rootNode.serialize({ dirtyOnly: true })["map<Uint32>"].Uint32Map,
			).to.have.all.keys("modify");
		});

		it("casting should work as expected", function () {
			var property = PropertyFactory.create(
				"autodesk.tests:AllTypesValueMapTestPropertyID-1.0.0",
			);
			property._properties.Uint32Map.set("tooLarge", 1e20);
			property._properties.Uint32Map.set("negative", -1);

			property._properties.Uint16Map.set("tooLarge", 1e20);
			property._properties.Uint16Map.set("negative", -1);

			property._properties.Uint8Map.set("tooLarge", 1e20);
			property._properties.Uint8Map.set("negative", -1);

			property._properties.Int16Map.set("tooSmall", -32769);
			property._properties.Int16Map.set("tooLarge", 32768);

			property._properties.Int8Map.set("tooSmall", -129);
			property._properties.Int8Map.set("tooLarge", 128);

			property._properties.Float64Map.set("value", 1e300);
			property._properties.Float32Map.set("tooLarge", 1e300);

			property._properties.StringMap.set("value", "test");

			property._properties.BoolMap.set("true", 1);
			property._properties.BoolMap.set("false", 0);

			expect(property._properties.Uint32Map.get("tooLarge")).to.be.below(Math.pow(2, 32));
			expect(property._properties.Uint32Map.get("tooLarge")).to.be.above(-1);
			expect(property._properties.Uint32Map.get("negative")).to.be.below(Math.pow(2, 32));
			expect(property._properties.Uint32Map.get("negative")).to.be.above(-1);

			expect(property._properties.Uint16Map.get("tooLarge")).to.be.below(Math.pow(2, 16));
			expect(property._properties.Uint16Map.get("tooLarge")).to.be.above(-1);
			expect(property._properties.Uint16Map.get("negative")).to.be.below(Math.pow(2, 16));
			expect(property._properties.Uint16Map.get("negative")).to.be.above(-1);

			expect(property._properties.Uint8Map.get("tooLarge")).to.be.below(Math.pow(2, 8));
			expect(property._properties.Uint8Map.get("tooLarge")).to.be.above(-1);
			expect(property._properties.Uint8Map.get("negative")).to.be.below(Math.pow(2, 8));
			expect(property._properties.Uint8Map.get("negative")).to.be.above(-1);

			expect(property._properties.Int16Map.get("tooLarge")).to.be.below(32768);
			expect(property._properties.Int16Map.get("tooLarge")).to.be.above(-32769);
			expect(property._properties.Int16Map.get("tooSmall")).to.be.below(32768);
			expect(property._properties.Int16Map.get("tooSmall")).to.be.above(-32769);

			expect(property._properties.Int8Map.get("tooLarge")).to.be.below(128);
			expect(property._properties.Int8Map.get("tooLarge")).to.be.above(-129);
			expect(property._properties.Int8Map.get("tooSmall")).to.be.below(128);
			expect(property._properties.Int8Map.get("tooSmall")).to.be.above(-129);

			expect(property._properties.Float32Map.get("tooLarge")).to.equal(Infinity);
			expect(property._properties.Float64Map.get("value")).to.equal(1e300);

			expect(property._properties.StringMap.get("value")).to.equal("test");

			expect(property._properties.BoolMap.get("true")).to.equal(true);
			expect(property._properties.BoolMap.get("false")).to.equal(false);
		});

		it("prettyPrint should work", function () {
			var myProp = PropertyFactory.create("autodesk.tests:ValueMapTestPropertyID-1.0.0")
				._properties.Uint32Map;
			myProp.insert("value1", 1);
			myProp.insert("value2", 2);
			var expectedPrettyStr =
				"Uint32Map (Map of Uint32):\n" + "  value1: 1\n" + "  value2: 2\n";
			var prettyStr = "";
			myProp.prettyPrint(function (str) {
				prettyStr += str + "\n";
			});
			expect(prettyStr).to.equal(expectedPrettyStr);
		});
	});

	describe("squashing", function () {
		//
		// Helper function which takes a sequence of callbacks that are suceessively executed
		// and the changes applied by the callbacks are separately tracked and squashed in a
		// a ChangeSet. This ChangeSet is then compared to the state in the property object
		//
		// Optionally, a a callback which controls the initial state before the squashing can
		// be given as first parameter
		//
		var testChangeSetSquashing = function (in_options) {
			resetKeyCounter();
			var testProperty = PropertyFactory.create("autodesk.tests:ValueMapTestPropertyID-1.0.0");

			var callbacks = in_options.callbacks;
			if (in_options.pre) {
				in_options.pre(testProperty);
			}

			var initialChangeset = new ChangeSet(testProperty.serialize());
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

		it("of inserts and modifies should work", function () {
			testChangeSetSquashing({
				callbacks: [
					insertNodeInRoot,
					insertNodeInRoot,
					insertNodeInRoot,
					modifyEntry,
					modifyEntry,
				],
			});
		});
		it("an insert, modify and a remove should give an empty changeset", function () {
			testChangeSetSquashing({
				callbacks: [insertNodeInRoot, modifyEntry, modifyEntry, removeFirstNodeInRoot],
				post: function (changeset) {
					expect(changeset).to.be.empty;
				},
			});
		});
		it("should work for modifies after an already existing insert", function () {
			testChangeSetSquashing({
				pre: insertNodeInRoot,
				callbacks: [modifyEntry, modifyEntry],
			});
		});
		it("of modify and remove after an already existing insert should work", function () {
			testChangeSetSquashing({
				pre: insertNodeInRoot,
				callbacks: [modifyEntry, removeFirstNodeInRoot],
				post: function (changeset) {
					expect(changeset["map<Uint32>"].Uint32Map).to.have.all.keys("remove");
				},
			});
		});
		it("of remove and insert should result in modify", function () {
			// Create two nodes with the same GUID
			testChangeSetSquashing({
				pre: function (root) {
					root._properties.Uint32Map.insert("node1", 1);
				},
				callbacks: [
					removeFirstNodeInRoot,
					function (root) {
						root._properties.Uint32Map.insert("node1", 2);
					},
				],
				post: function (changeset) {
					expect(changeset["map<Uint32>"].Uint32Map).to.have.all.keys("modify");
				},
			});
		});
	});

	describe("Rebasing", function () {
		var testRebasing = function (in_options) {
			// Prepare the initial state
			var baseProperty1 = PropertyFactory.create(
				"autodesk.tests:ValueMapTestPropertyID-1.0.0",
			);
			if (in_options.prepare) {
				in_options.prepare(baseProperty1);
			}
			// Create two copies of this state
			var baseProperty2 = PropertyFactory.create(
				"autodesk.tests:ValueMapTestPropertyID-1.0.0",
			);
			baseProperty2.deserialize(baseProperty1.serialize());
			var baseProperty3 = PropertyFactory.create(
				"autodesk.tests:ValueMapTestPropertyID-1.0.0",
			);
			baseProperty3.deserialize(baseProperty1.serialize());

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

			var initialChangeSet = baseProperty1.serialize();

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
			combinedChangeSet.setIsNormalized(true);
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
				op2: insertEntryInRootWithUnqiueKey(),
				compareToSequential: true,
			});
		});

		it("with independent inserts should be possible", function () {
			testRebasing({
				op1: insertEntryInRootWithUnqiueKey(),
				op2: insertEntryInRootWithUnqiueKey(),
				compareToSequential: true,
			});
		});

		it("with independent removes should be possible", function () {
			testRebasing({
				prepare: function (root) {
					root._properties.Uint32Map.insert("entry1", 1);
					root._properties.Uint32Map.insert("entry2", 2);
				},
				op1: function (root) {
					root._properties.Uint32Map.remove("entry1");
				},
				op2: function (root) {
					root._properties.Uint32Map.remove("entry2");
				},
				compareToSequential: true,
			});
		});

		it("with a modify and a remove should possible", function () {
			testRebasing({
				prepare: function (root) {
					root._properties.Uint32Map.insert("entry1", 1);
				},
				op1: modifyEntry,
				op2: removeFirstNodeInRoot,
				compareToSequential: true,
			});
		});

		it("with a remove and a modify should possible", function () {
			testRebasing({
				prepare: function (root) {
					root._properties.Uint32Map.insert("entry1", 1);
				},
				op1: removeFirstNodeInRoot,
				op2: modifyEntry,
				compareToSequential: false,
				checkResult: function (conflicts, changeSet) {
					expect(conflicts).to.have.length(1);
					expect(conflicts[0].type).to.be.equal(
						ChangeSet.ConflictType.ENTRY_MODIFIED_AFTER_REMOVE,
					);
					expect(conflicts[0].path).to.be.equal("Uint32Map[entry1]");
					expect(ChangeSet.isEmptyChangeSet(changeSet)).to.be.ok;
				},
			});
		});

		it("with two compatible removes should be possible", function () {
			testRebasing({
				prepare: function (root) {
					root._properties.Uint32Map.insert("entry1", 1);
				},
				op1: function (root) {
					root._properties.Uint32Map.remove("entry1");
				},
				op2: function (root) {
					root._properties.Uint32Map.remove("entry1");
				},
				compareToSequential: false,
				checkResult: function (conflicts, changeSet) {
					expect(ChangeSet.isEmptyChangeSet(changeSet)).to.be.ok;
				},
			});
		});

		it("with two conflicting modifies should be possible and report a conflict", function () {
			testRebasing({
				prepare: function (root) {
					root._properties.Uint32Map.insert("entry1", 1);
				},
				op1: function (root) {
					root._properties.Uint32Map.set("entry1", 2);
				},
				op2: function (root) {
					root._properties.Uint32Map.set("entry1", 3);
				},
				compareToSequential: true,
				checkResult: function (conflicts, changeSet) {
					expect(conflicts).to.have.length(1);
					expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
					expect(conflicts[0].path).to.be.equal("Uint32Map[entry1]");
				},
			});
		});

		it("with modify followed by remove+insert should be a conflicting set", function () {
			testRebasing({
				prepare: function (root) {
					root._properties.Uint32Map.insert("entry1", 1);
				},
				op1: modifyEntry,
				op2: function (root) {
					root._properties.Uint32Map.remove("entry1");
					root._properties.Uint32Map.insert("entry1", 2);
				},
				compareToSequential: true,
				checkResult: function (conflicts, changeSet) {
					expect(conflicts).to.have.length(1);
					expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
					expect(conflicts[0].path).to.be.equal("Uint32Map[entry1]");
				},
			});
		});

		it("with remove+insert followed by modify should be a conflicting set", function () {
			testRebasing({
				prepare: function (root) {
					root._properties.Uint32Map.insert("entry1", 1);
				},
				op1: function (root) {
					root._properties.Uint32Map.remove("entry1");
					root._properties.Uint32Map.insert("entry1", 2);
				},
				op2: function (root) {
					root._properties.Uint32Map.set("entry1", 3);
				},
				compareToSequential: true,
				checkResult: function (conflicts, changeSet) {
					expect(conflicts).to.have.length(1);
					expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
					expect(conflicts[0].path).to.be.equal("Uint32Map[entry1]");
				},
			});
		});

		it("with conflicting inserts should report conflict", function () {
			testRebasing({
				prepare: function (root) {},
				op1: function (root) {
					root._properties.Uint32Map.insert("entry1", 1);
				},
				op2: function (root) {
					root._properties.Uint32Map.insert("entry1", 2);
				},
				compareToSequential: false,
				checkResult: function (conflicts, changeSet) {
					expect(changeSet["map<Uint32>"].Uint32Map).to.have.all.keys("modify");
					expect(conflicts).to.have.length(1);
					expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
					expect(conflicts[0].path).to.be.equal("Uint32Map[entry1]");
				},
			});
		});
	});
});
