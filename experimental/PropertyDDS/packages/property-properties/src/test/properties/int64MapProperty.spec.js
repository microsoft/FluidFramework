/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* globals describe */

/**
 * @fileoverview In this file, we will test the int64 map property
 * object described in /src/properties/valueMapProperty.js
 */

describe("Int64MapProperty", function () {
	var PropertyFactory, BaseProperty, ChangeSet, myNode, Int64Map, Int64;

	before(function () {
		// Get all the objects we need in this test here.
		PropertyFactory = require("../..").PropertyFactory;
		BaseProperty = require("../..").BaseProperty;
		ChangeSet = require("@fluid-experimental/property-changeset").ChangeSet;
		Int64 = require("@fluid-experimental/property-common").Int64;

		// Register a template with a set property for the tests
		var TestPropertyTemplate = {
			typeid: "autodesk.tests:Int64MapTestPropertyID-1.0.0",
			inherits: ["NamedProperty"],
			properties: [{ id: "Int64Map", typeid: "Int64", context: "map" }],
		};

		PropertyFactory._reregister(TestPropertyTemplate);

		myNode = PropertyFactory.create("autodesk.tests:Int64MapTestPropertyID-1.0.0");
		Int64Map = myNode._properties.Int64Map;
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
		root._properties.Int64Map.insert(key, new Int64(1, keyCounter));
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
		var firstKey = root._properties.Int64Map.getIds()[0];
		root._properties.Int64Map.remove(firstKey);
	};

	// Modifies the first node
	var modifyEntry = function (root) {
		var firstKey = root._properties.Int64Map.getIds()[0];
		root._properties.Int64Map.set(
			firstKey,
			new Int64(1, root._properties.Int64Map.get(firstKey) + 1),
		);
	};

	describe("Testing creation, assignment and serialization", function () {
		it("should be empty at the beginning", function () {
			expect(Int64Map.getAsArray()).to.be.empty;
			expect(Int64Map.getEntriesReadOnly()).to.be.empty;
			expect(ChangeSet.isEmptyChangeSet(Int64Map.serialize({ dirtyOnly: false }))).to.be.ok;
			expect(ChangeSet.isEmptyChangeSet(Int64Map.serialize({ dirtyOnly: true }))).to.be.ok;
		});

		it("should be possible to add entries", function () {
			Int64Map.insert("value1", new Int64(1, 1));
			expect(Int64Map.get("value1")).to.deep.equal(new Int64(1, 1));
			Int64Map.insert("value2", new Int64(1, 2));
			expect(Int64Map.get("value2")).to.deep.equal(new Int64(1, 2));
			Int64Map.insert("value3", new Int64(1, 3));
			expect(Int64Map.get("value3")).to.deep.equal(new Int64(1, 3));
			Int64Map.insert("value4", "123");
			expect(Int64Map.get("value4")).to.deep.equal(new Int64(123, 0));
			Int64Map.insert("value5", 123);
			expect(Int64Map.get("value5")).to.deep.equal(new Int64(123, 0));
			expect(Int64Map.getEntriesReadOnly()).to.deep.equal({
				value1: new Int64(1, 1),
				value2: new Int64(1, 2),
				value3: new Int64(1, 3),
				value4: new Int64(123, 0),
				value5: new Int64(123, 0),
			});

			expect(Int64Map.has("value1")).to.be.ok;
			expect(Int64Map.has("value2")).to.be.ok;
			expect(Int64Map.has("value3")).to.be.ok;
			expect(Int64Map.has("value4")).to.be.ok;
			expect(Int64Map.has("value5")).to.be.ok;

			expect(Int64Map.serialize({ dirtyOnly: false })).to.deep.equal({
				insert: {
					value1: [1, 1],
					value2: [1, 2],
					value3: [1, 3],
					value4: [123, 0],
					value5: [123, 0],
				},
			});
		});

		it("should be possible to remove entries", function () {
			Int64Map.remove("value1");
			expect(Int64Map.has("value1")).to.be.not.ok;
			Int64Map.remove("value2");
			expect(Int64Map.has("value2")).to.be.not.ok;
			Int64Map.remove("value3");
			expect(Int64Map.has("value3")).to.be.not.ok;
			Int64Map.remove("value4");
			expect(Int64Map.has("value4")).to.be.not.ok;
			Int64Map.remove("value5");
			expect(Int64Map.has("value5")).to.be.not.ok;
			expect(ChangeSet.isEmptyChangeSet(Int64Map.serialize({ dirtyOnly: false }))).to.be.ok;
		});

		it("a remove followed by an insert should become a modify", function () {
			Int64Map.insert("value1", new Int64(1, 1));
			Int64Map.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);
			Int64Map.remove("value1");
			Int64Map.insert("value1", new Int64(1, 2));

			expect(Int64Map.serialize({ dirtyOnly: true })).to.deep.equal({
				modify: { value1: [1, 2] },
			});

			// This should also work for a set operation
			Int64Map.set("value1", new Int64(1, 3));
			expect(Int64Map.serialize({ dirtyOnly: true })).to.deep.equal({
				modify: { value1: [1, 3] },
			});

			// But setting the same value should give an empty ChangeSet
			Int64Map.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);
			Int64Map.set("value1", new Int64(1, 3));
			expect(ChangeSet.isEmptyChangeSet(Int64Map.serialize({ dirtyOnly: true }))).to.be.ok;

			// This should be tracked separately for dirtyness and pending changes
			Int64Map.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);
			Int64Map.remove("value1");
			Int64Map.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY);
			Int64Map.insert("value1", new Int64(1, 2));

			expect(
				Int64Map.serialize({
					dirtyOnly: true,
					includeRootTypeid: false,
					dirtinessType: BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
				}),
			).to.deep.equal({
				modify: { value1: [1, 2] },
			});

			expect(
				Int64Map.serialize({
					dirtyOnly: true,
					includeRootTypeid: false,
					dirtinessType: BaseProperty.MODIFIED_STATE_FLAGS.DIRTY,
				}),
			).to.deep.equal({
				insert: { value1: [1, 2] },
			});
		});

		it("deserialize should work", function () {
			var myInitialStateNode = PropertyFactory.create(
				"autodesk.tests:Int64MapTestPropertyID-1.0.0",
			);
			myInitialStateNode._properties.Int64Map.insert("value1", new Int64(1, 1));
			myInitialStateNode._properties.Int64Map.insert("value2", new Int64(1, 2));
			var initialChangeSet = myInitialStateNode.serialize({ dirtyOnly: false });

			// Deserialize a copy into a second node and check that the chageset is correct
			var myDeserializeNode1 = PropertyFactory.create(
				"autodesk.tests:Int64MapTestPropertyID-1.0.0",
			);
			var changes = myDeserializeNode1.deserialize(initialChangeSet);
			expect(changes).to.deep.equal(initialChangeSet);
			expect(myDeserializeNode1.serialize({ dirtyOnly: false })).to.deep.equal(
				myInitialStateNode.serialize({ dirtyOnly: false }),
			);
			myDeserializeNode1.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);

			// Create a third copy
			var myDeserializeNode2 = PropertyFactory.create(
				"autodesk.tests:Int64MapTestPropertyID-1.0.0",
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
			myInitialStateNode._properties.Int64Map.set("value1", new Int64(1, 2));
			myInitialStateNode._properties.Int64Map.remove("value2");
			myInitialStateNode._properties.Int64Map.insert("value3", new Int64(1, 3));

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
			var rootNode = PropertyFactory.create("autodesk.tests:Int64MapTestPropertyID-1.0.0");
			rootNode._properties.Int64Map.insert("node1", new Int64(1, 1));
			expect(function () {
				rootNode._properties.Int64Map.insert("node1", new Int64(1, 2));
			}).to.throw();
		});

		it("set should overwrite existing entry", function () {
			var rootNode = PropertyFactory.create("autodesk.tests:Int64MapTestPropertyID-1.0.0");

			rootNode._properties.Int64Map.set("node1", new Int64(1, 0));
			rootNode._properties.Int64Map.set("node1", new Int64(1, 1));
			// the set should overwrite the insert
			expect(rootNode.serialize({ dirtyOnly: true })["map<Int64>"].Int64Map).to.have.all.keys(
				"insert",
			);

			// Overwriting with the same property shouldn't dirty the node
			rootNode.cleanDirty(
				BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
			);
			rootNode._properties.Int64Map.set("node1", new Int64(1, 1));
			expect(ChangeSet.isEmptyChangeSet(rootNode.serialize({ dirtyOnly: true }))).to.be.ok;
			expect(rootNode.isDirty()).to.be.false;

			// Overwriting with a different value should result in a modify
			rootNode._properties.Int64Map.set("node1", new Int64(1, 2));
			expect(rootNode.serialize({ dirtyOnly: true })["map<Int64>"].Int64Map).to.have.all.keys(
				"modify",
			);
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
			var testProperty = PropertyFactory.create("autodesk.tests:Int64MapTestPropertyID-1.0.0");

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
					expect(changeset["map<Int64>"].Int64Map).to.have.all.keys("remove");
				},
			});
		});
		it("of remove and insert should result in modify", function () {
			// Create two nodes with the same GUID
			testChangeSetSquashing({
				pre: function (root) {
					root._properties.Int64Map.insert("node1", new Int64(1, 1));
				},
				callbacks: [
					removeFirstNodeInRoot,
					function (root) {
						root._properties.Int64Map.insert("node1", new Int64(1, 2));
					},
				],
				post: function (changeset) {
					expect(changeset["map<Int64>"].Int64Map).to.have.all.keys("modify");
				},
			});
		});
	});

	describe("Rebasing", function () {
		var testRebasing = function (in_options) {
			// Prepare the initial state
			var baseProperty1 = PropertyFactory.create(
				"autodesk.tests:Int64MapTestPropertyID-1.0.0",
			);
			if (in_options.prepare) {
				in_options.prepare(baseProperty1);
			}
			// Create two copies of this state
			var baseProperty2 = PropertyFactory.create(
				"autodesk.tests:Int64MapTestPropertyID-1.0.0",
			);
			baseProperty2.deserialize(baseProperty1.serialize({ dirtyOnly: false }));
			var baseProperty3 = PropertyFactory.create(
				"autodesk.tests:Int64MapTestPropertyID-1.0.0",
			);
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
					root._properties.Int64Map.insert("entry1", new Int64(1, 1));
					root._properties.Int64Map.insert("entry2", new Int64(1, 2));
				},
				op1: function (root) {
					root._properties.Int64Map.remove("entry1");
				},
				op2: function (root) {
					root._properties.Int64Map.remove("entry2");
				},
				compareToSequential: true,
			});
		});

		it("with a modify and a remove should possible", function () {
			testRebasing({
				prepare: function (root) {
					root._properties.Int64Map.insert("entry1", new Int64(1, 1));
				},
				op1: modifyEntry,
				op2: removeFirstNodeInRoot,
				compareToSequential: true,
			});
		});

		it("with a remove and a modify should possible", function () {
			testRebasing({
				prepare: function (root) {
					root._properties.Int64Map.insert("entry1", new Int64(1, 1));
				},
				op1: removeFirstNodeInRoot,
				op2: modifyEntry,
				compareToSequential: false,
				checkResult: function (conflicts, changeSet) {
					expect(conflicts).to.have.length(1);
					expect(conflicts[0].type).to.be.equal(
						ChangeSet.ConflictType.ENTRY_MODIFIED_AFTER_REMOVE,
					);
					expect(conflicts[0].path).to.be.equal("Int64Map[entry1]");
					expect(ChangeSet.isEmptyChangeSet(changeSet)).to.be.ok;
				},
			});
		});

		it("with two compatible removes should be possible", function () {
			testRebasing({
				prepare: function (root) {
					root._properties.Int64Map.insert("entry1", new Int64(1, 1));
				},
				op1: function (root) {
					root._properties.Int64Map.remove("entry1");
				},
				op2: function (root) {
					root._properties.Int64Map.remove("entry1");
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
					root._properties.Int64Map.insert("entry1", new Int64(1, 1));
				},
				op1: function (root) {
					root._properties.Int64Map.set("entry1", new Int64(1, 2));
				},
				op2: function (root) {
					root._properties.Int64Map.set("entry1", new Int64(1, 3));
				},
				compareToSequential: true,
				checkResult: function (conflicts, changeSet) {
					expect(conflicts).to.have.length(1);
					expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
					expect(conflicts[0].path).to.be.equal("Int64Map[entry1]");
				},
			});
		});

		it("with modify followed by remove+insert should be a conflicting set", function () {
			testRebasing({
				prepare: function (root) {
					root._properties.Int64Map.insert("entry1", new Int64(1, 1));
				},
				op1: modifyEntry,
				op2: function (root) {
					root._properties.Int64Map.remove("entry1");
					root._properties.Int64Map.insert("entry1", new Int64(1, 2));
				},
				compareToSequential: true,
				checkResult: function (conflicts, changeSet) {
					expect(conflicts).to.have.length(1);
					expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
					expect(conflicts[0].path).to.be.equal("Int64Map[entry1]");
				},
			});
		});

		it("with remove+insert followed by modify should be a conflicting set", function () {
			testRebasing({
				prepare: function (root) {
					root._properties.Int64Map.insert("entry1", new Int64(1, 1));
				},
				op1: function (root) {
					root._properties.Int64Map.remove("entry1");
					root._properties.Int64Map.insert("entry1", new Int64(1, 2));
				},
				op2: function (root) {
					root._properties.Int64Map.set("entry1", new Int64(1, 3));
				},
				compareToSequential: true,
				checkResult: function (conflicts, changeSet) {
					expect(conflicts).to.have.length(1);
					expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
					expect(conflicts[0].path).to.be.equal("Int64Map[entry1]");
				},
			});
		});

		it("with conflicting inserts should report conflict", function () {
			testRebasing({
				prepare: function (root) {},
				op1: function (root) {
					root._properties.Int64Map.insert("entry1", new Int64(1, 1));
				},
				op2: function (root) {
					root._properties.Int64Map.insert("entry1", new Int64(1, 2));
				},
				compareToSequential: false,
				checkResult: function (conflicts, changeSet) {
					expect(changeSet["map<Int64>"].Int64Map).to.have.all.keys("modify");
					expect(conflicts).to.have.length(1);
					expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
					expect(conflicts[0].path).to.be.equal("Int64Map[entry1]");
				},
			});
		});
	});
});
