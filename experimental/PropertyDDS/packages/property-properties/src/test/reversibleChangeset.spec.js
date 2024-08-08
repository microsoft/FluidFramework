/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* globals expect */
/**
 * @fileoverview In this file, we will test the functions of the property factory.
 */
const { ChangeSet } = require("@fluid-experimental/property-changeset");
const { Int64, Uint64 } = require("@fluid-experimental/property-common");
const _ = require("lodash");

const { PropertyFactory } = require("..");
const deepCopy = _.cloneDeep;

describe("Reversible ChangeSets", function () {
	var testRevAndInvCS = function (
		initialProperty,
		modificationFunction,
		expectedRevCS,
		expectedAfterCS,
		expectedInverseCS,
	) {
		var initialChangeSet = new ChangeSet(initialProperty._serialize(false));
		initialChangeSet.setIsNormalized(true);
		var initialChangeSetBackup = deepCopy(initialChangeSet.getSerializedChangeSet());
		initialProperty.cleanDirty();

		var initialPropertyClone = initialProperty.clone();
		var initialPropertyBackup = initialProperty.clone();

		modificationFunction(initialProperty);

		var cs2 = new ChangeSet(initialProperty._serialize(true));

		var cs2Rev = cs2.clone();

		cs2Rev._stripReversibleChangeSet();
		expect(cs2.getSerializedChangeSet()).to.deep.equal(cs2Rev.getSerializedChangeSet());

		cs2Rev._toReversibleChangeSet(initialChangeSet.getSerializedChangeSet());

		var cs2Strip = cs2Rev.clone();
		cs2Strip._stripReversibleChangeSet();
		expect(cs2.getSerializedChangeSet()).to.deep.equal(cs2Strip.getSerializedChangeSet());

		cs2._toReversibleChangeSet(initialChangeSet.getSerializedChangeSet());
		var csR = cs2.clone();
		csR._toReversibleChangeSet(initialChangeSet.getSerializedChangeSet());

		if (expectedRevCS) {
			expect(csR.getSerializedChangeSet()).to.deep.equal(expectedRevCS);
		}

		// now apply cs2 on the initial changeset
		initialChangeSet.applyChangeSet(cs2);
		if (expectedAfterCS) {
			expect(initialChangeSet.getSerializedChangeSet()).to.deep.equal(expectedAfterCS);
		}
		// now apply cs2 on the initial property
		initialPropertyClone.applyChangeSet(cs2.getSerializedChangeSet());
		if (expectedAfterCS) {
			expect(initialPropertyClone._serialize(false)).to.deep.equal(
				initialProperty._serialize(false),
			);
		}
		// now inverse the changeset
		var inverseCS = cs2.clone();
		inverseCS.toInverseChangeSet();
		if (expectedInverseCS) {
			expect(inverseCS.getSerializedChangeSet()).to.deep.equal(expectedInverseCS);
		}
		// applying the inverse change should get us back to the initial state
		// apply on changeset
		initialChangeSet.applyChangeSet(inverseCS);
		expect(initialChangeSet.getSerializedChangeSet()).to.deep.equal(initialChangeSetBackup);
		// apply on properties
		initialPropertyClone.applyChangeSet(inverseCS.getSerializedChangeSet());
		expect(initialPropertyClone._serialize(false)).to.deep.equal(
			initialPropertyBackup._serialize(false),
		);
	};

	before(function () {
		var TaskSubjectParentTemplate = {
			typeid: "autodesk.tests:ChangeSetApplyAfterTask.parentTemplate-1.0.0",
			properties: [
				{
					id: "directMember",
					typeid: "autodesk.tests:ChangeSetApplyAfterTask.memberTemplate-1.0.0",
				},
				{
					id: "nested",
					properties: [
						{
							id: "member",
							typeid: "autodesk.tests:ChangeSetApplyAfterTask.nestedTemplate-1.0.0",
						},
					],
				},
			],
		};
		var TaskSubjectMemberTemplate = {
			typeid: "autodesk.tests:ChangeSetApplyAfterTask.memberTemplate-1.0.0",
			properties: [
				{ id: "progress", typeid: "Uint32" },
				{ id: "timeRemaining", typeid: "Uint32" },
			],
		};

		var TaskSubjectTestTemplate = {
			typeid: "autodesk.tests:ChangeSetApplyAfterTask.nodeTemplate-1.0.0",
			properties: [
				{ id: "result", typeid: "NodeProperty" },
				{ id: "integer", typeid: "Uint32" },
			],
		};

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

		var TestArrayFloat32 = {
			typeid: "autodesk.test:test.arrayfloat32-1.0.0",
			properties: [{ id: "data", typeid: "Float32", context: "array" }],
		};

		var SimpleStringTestPropertyTemplate = {
			typeid: "autodesk.tests:DataStringTestProperty-1.0.0",
			properties: [{ id: "data", typeid: "String" }],
		};

		var SimpleRefTestPropertyTemplate = {
			typeid: "autodesk.tests:DataRefTestProperty-1.0.0",
			properties: [{ id: "data", typeid: "Reference" }],
		};

		var SimpleMapTestPropertyTemplate = {
			typeid: "autodesk.tests:MapTestPropertyID-1.0.0",
			properties: [{ id: "data", typeid: "Float32", context: "map" }],
		};

		var TestPropertyTemplate = {
			typeid: "autodesk.tests:MapTestNamedPropertyID-1.0.0",
			inherits: ["NamedProperty"],
			properties: [
				{ id: "stringProperty", typeid: "String" },
				{ id: "stringProperty2", typeid: "String" },
				{ id: "map", context: "map", typeid: "NamedProperty" },
			],
		};
		var AnonymousTestPropertyTemplate = {
			typeid: "autodesk.tests:AnonymousMapTestPropertyID-1.0.0",
			properties: [{ id: "stringProperty", typeid: "String" }],
		};

		var CuststomArrayTemplate = {
			typeid: "autodesk.tests:CustomArrayChangesetTestID-1.0.0",
			properties: [
				{
					id: "data",
					typeid: "autodesk.tests:AnonymousMapTestPropertyID-1.0.0",
					context: "array",
				},
			],
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

		var TestBaseContainingEnumTemplate = {
			typeid: "autodesk.core:CustomWithEnumID-1.0.0",
			properties: [
				{
					id: "data",
					typeid: "autodesk.core:UnitsEnum-1.0.0",
				},
			],
		};

		var TestInheritsNodePropertyObject = {
			inherits: ["NodeProperty"],
			typeid: "autodesk.tests:SimpleInheritsNodeProperty-1.0.0",
		};

		PropertyFactory._reregister(TestInheritsNodePropertyObject);
		PropertyFactory._reregister(TestEnumTemplate);
		PropertyFactory._reregister(TestBaseContainingEnumTemplate);

		PropertyFactory._reregister(CuststomArrayTemplate);
		PropertyFactory._reregister(TestPropertyTemplate);
		PropertyFactory._reregister(AnonymousTestPropertyTemplate);

		PropertyFactory._reregister(SimpleMapTestPropertyTemplate);
		PropertyFactory._reregister(SimpleStringTestPropertyTemplate);
		PropertyFactory._reregister(SimpleRefTestPropertyTemplate);
		PropertyFactory._reregister(Vec3Template);
		PropertyFactory._reregister(Point2DTemplate);
		PropertyFactory._reregister(TaskSubjectParentTemplate);
		PropertyFactory._reregister(TaskSubjectMemberTemplate);
		PropertyFactory._reregister(TaskSubjectTestTemplate);
		PropertyFactory._reregister(TestArrayFloat32);
	});

	describe("Make inversible, apply and reverse for primitive properties.", function () {
		it("should work for modifying Int8", function () {
			var prop = PropertyFactory.create("Int8");
			testRevAndInvCS(
				prop,
				function () {
					prop.setValue(10);
				},
				{ oldValue: 0, value: 10 },
				10,
				{ oldValue: 10, value: 0 },
			);
		});
		it("should work for modifying Uint8", function () {
			var prop = PropertyFactory.create("Uint8");
			testRevAndInvCS(
				prop,
				function () {
					prop.setValue(10);
				},
				{ oldValue: 0, value: 10 },
				10,
				{ oldValue: 10, value: 0 },
			);
		});
		it("should work for modifying Int16", function () {
			var prop = PropertyFactory.create("Int16");
			testRevAndInvCS(
				prop,
				function () {
					prop.setValue(10);
				},
				{ oldValue: 0, value: 10 },
				10,
				{ oldValue: 10, value: 0 },
			);
		});
		it("should work for modifying Uint16", function () {
			var prop = PropertyFactory.create("Uint16");
			testRevAndInvCS(
				prop,
				function () {
					prop.setValue(10);
				},
				{ oldValue: 0, value: 10 },
				10,
				{ oldValue: 10, value: 0 },
			);
		});
		it("should work for modifying Int32", function () {
			var prop = PropertyFactory.create("Int32");
			testRevAndInvCS(
				prop,
				function () {
					prop.setValue(10);
				},
				{ oldValue: 0, value: 10 },
				10,
				{ oldValue: 10, value: 0 },
			);
		});
		it("should work for modifying Uint32", function () {
			var prop = PropertyFactory.create("Uint32");
			testRevAndInvCS(
				prop,
				function () {
					prop.setValue(10);
				},
				{ oldValue: 0, value: 10 },
				10,
				{ oldValue: 10, value: 0 },
			);
		});
		it("should work for modifying Int64", function () {
			var prop = PropertyFactory.create("Int64");
			testRevAndInvCS(
				prop,
				function () {
					prop.setValue(new Int64(10, 10));
				},
				{ oldValue: [0, 0], value: [10, 10] },
				[10, 10],
				{ oldValue: [10, 10], value: [0, 0] },
			);
		});
		it("should work for modifying Uint64", function () {
			var prop = PropertyFactory.create("Uint64");
			testRevAndInvCS(
				prop,
				function () {
					prop.setValue(new Uint64(10, 10));
				},
				{ oldValue: [0, 0], value: [10, 10] },
				[10, 10],
				{ oldValue: [10, 10], value: [0, 0] },
			);
		});
		it("should work for modifying Float32", function () {
			var prop = PropertyFactory.create("Float32");
			testRevAndInvCS(
				prop,
				function () {
					prop.setValue(0.5);
				},
				{ oldValue: 0, value: 0.5 },
				0.5,
				{ oldValue: 0.5, value: 0 },
			);
		});
		it("should work for modifying Float64", function () {
			var prop = PropertyFactory.create("Float64");
			testRevAndInvCS(
				prop,
				function () {
					prop.setValue(0.5);
				},
				{ oldValue: 0, value: 0.5 },
				0.5,
				{ oldValue: 0.5, value: 0 },
			);
		});
		it("should work for modifying Bool", function () {
			var prop = PropertyFactory.create("Bool");
			testRevAndInvCS(
				prop,
				function () {
					prop.setValue(true);
				},
				{ oldValue: false, value: true },
				true,
				{ oldValue: true, value: false },
			);
		});
		// These tests have been disabled, since the interface of
		// the ChangeSet class is ambiguous when inserting a string
		it.skip("@bugfix should work for modifying String", function () {
			var prop = PropertyFactory.create("String");
			testRevAndInvCS(
				prop,
				function () {
					prop.setValue("test");
				},
				{ oldValue: "", value: "test" },
				"test",
				{ oldValue: "test", value: "" },
			);
		});
		// These tests have been disabled, since the interface of
		// the ChangeSet class is ambiguous when inserting a string
		it.skip("@bugfix should work for modifying Reference", function () {
			var prop = PropertyFactory.create("Reference");
			testRevAndInvCS(
				prop,
				function () {
					prop.setValue("/");
				},
				{ oldValue: "", value: "/" },
				"/",
				{ oldValue: "/", value: "" },
			);
		});
	});

	describe("Make inversible, apply and reverse for primitive properties in a NodeProperty.", function () {
		it("should work for modifying Int8", function () {
			var node = PropertyFactory.create("NodeProperty");
			var prop = PropertyFactory.create("Int8");
			node.insert("prop", prop);
			testRevAndInvCS(
				node,
				function () {
					prop.setValue(10);
				},
				{ modify: { Int8: { prop: { oldValue: 0, value: 10 } } } },
				{ insert: { Int8: { prop: 10 } } },
				{ modify: { Int8: { prop: { oldValue: 10, value: 0 } } } },
			);
		});
		it("should work for modifying Uint8", function () {
			var node = PropertyFactory.create("NodeProperty");
			var prop = PropertyFactory.create("Uint8");
			node.insert("prop", prop);
			testRevAndInvCS(
				node,
				function () {
					prop.setValue(10);
				},
				{ modify: { Uint8: { prop: { oldValue: 0, value: 10 } } } },
				{ insert: { Uint8: { prop: 10 } } },
				{ modify: { Uint8: { prop: { oldValue: 10, value: 0 } } } },
			);
		});
		it("should work for modifying Int16", function () {
			var node = PropertyFactory.create("NodeProperty");
			var prop = PropertyFactory.create("Int16");
			node.insert("prop", prop);
			testRevAndInvCS(
				node,
				function () {
					prop.setValue(10);
				},
				{ modify: { Int16: { prop: { oldValue: 0, value: 10 } } } },
				{ insert: { Int16: { prop: 10 } } },
				{ modify: { Int16: { prop: { oldValue: 10, value: 0 } } } },
			);
		});
		it("should work for modifying Uint16", function () {
			var node = PropertyFactory.create("NodeProperty");
			var prop = PropertyFactory.create("Uint16");
			node.insert("prop", prop);
			testRevAndInvCS(
				node,
				function () {
					prop.setValue(10);
				},
				{ modify: { Uint16: { prop: { oldValue: 0, value: 10 } } } },
				{ insert: { Uint16: { prop: 10 } } },
				{ modify: { Uint16: { prop: { oldValue: 10, value: 0 } } } },
			);
		});
		it("should work for modifying Int32", function () {
			var node = PropertyFactory.create("NodeProperty");
			var prop = PropertyFactory.create("Int32");
			node.insert("prop", prop);
			testRevAndInvCS(
				node,
				function () {
					prop.setValue(10);
				},
				{ modify: { Int32: { prop: { oldValue: 0, value: 10 } } } },
				{ insert: { Int32: { prop: 10 } } },
				{ modify: { Int32: { prop: { oldValue: 10, value: 0 } } } },
			);
		});
		it("should work for modifying Uint32", function () {
			var node = PropertyFactory.create("NodeProperty");
			var prop = PropertyFactory.create("Uint32");
			node.insert("prop", prop);
			testRevAndInvCS(
				node,
				function () {
					prop.setValue(10);
				},
				{ modify: { Uint32: { prop: { oldValue: 0, value: 10 } } } },
				{ insert: { Uint32: { prop: 10 } } },
				{ modify: { Uint32: { prop: { oldValue: 10, value: 0 } } } },
			);
		});
		it("should work for modifying Int64", function () {
			var node = PropertyFactory.create("NodeProperty");
			var prop = PropertyFactory.create("Int64");
			node.insert("prop", prop);
			testRevAndInvCS(
				node,
				function () {
					prop.setValue(new Int64(10, 10));
				},
				{ modify: { Int64: { prop: { oldValue: [0, 0], value: [10, 10] } } } },
				{ insert: { Int64: { prop: [10, 10] } } },
				{ modify: { Int64: { prop: { oldValue: [10, 10], value: [0, 0] } } } },
			);
		});
		it("should work for modifying Uint64", function () {
			var node = PropertyFactory.create("NodeProperty");
			var prop = PropertyFactory.create("Uint64");
			node.insert("prop", prop);
			testRevAndInvCS(
				node,
				function () {
					prop.setValue(new Uint64(10, 10));
				},
				{ modify: { Uint64: { prop: { oldValue: [0, 0], value: [10, 10] } } } },
				{ insert: { Uint64: { prop: [10, 10] } } },
				{ modify: { Uint64: { prop: { oldValue: [10, 10], value: [0, 0] } } } },
			);
		});
		it("should work for modifying Float32", function () {
			var node = PropertyFactory.create("NodeProperty");
			var prop = PropertyFactory.create("Float32");
			node.insert("prop", prop);
			testRevAndInvCS(
				node,
				function () {
					prop.setValue(0.5);
				},
				{ modify: { Float32: { prop: { oldValue: 0, value: 0.5 } } } },
				{ insert: { Float32: { prop: 0.5 } } },
				{ modify: { Float32: { prop: { oldValue: 0.5, value: 0 } } } },
			);
		});
		it("should work for modifying Float64", function () {
			var node = PropertyFactory.create("NodeProperty");
			var prop = PropertyFactory.create("Float64");
			node.insert("prop", prop);
			testRevAndInvCS(
				node,
				function () {
					prop.setValue(0.5);
				},
				{ modify: { Float64: { prop: { oldValue: 0, value: 0.5 } } } },
				{ insert: { Float64: { prop: 0.5 } } },
				{ modify: { Float64: { prop: { oldValue: 0.5, value: 0 } } } },
			);
		});
		it("should work for modifying Bool", function () {
			var node = PropertyFactory.create("NodeProperty");
			var prop = PropertyFactory.create("Bool");
			node.insert("prop", prop);
			testRevAndInvCS(
				node,
				function () {
					prop.setValue(true);
				},
				{ modify: { Bool: { prop: { oldValue: false, value: true } } } },
				{ insert: { Bool: { prop: true } } },
				{ modify: { Bool: { prop: { oldValue: true, value: false } } } },
			);
		});
		it("should work for modifying String", function () {
			var node = PropertyFactory.create("NodeProperty");
			var prop = PropertyFactory.create("String");
			node.insert("prop", prop);
			testRevAndInvCS(
				node,
				function () {
					prop.setValue("test");
				},
				{ modify: { String: { prop: { oldValue: "", value: "test" } } } },
				{ insert: { String: { prop: "test" } } },
				{ modify: { String: { prop: { oldValue: "test", value: "" } } } },
			);
		});
		it("should work for modifying Reference", function () {
			var node = PropertyFactory.create("NodeProperty");
			var prop = PropertyFactory.create("Reference");
			node.insert("prop", prop);
			testRevAndInvCS(
				node,
				function () {
					prop.setValue("/");
				},
				{ modify: { Reference: { prop: { oldValue: "", value: "/" } } } },
				{ insert: { Reference: { prop: "/" } } },
				{ modify: { Reference: { prop: { oldValue: "/", value: "" } } } },
			);
		});
	});

	describe("apply reversible ChangeSets on all properties", function () {
		it("should work for primitive properties", function () {
			var prop = PropertyFactory.create("autodesk.test:vector3-1.0.0");
			var propCopy = PropertyFactory.create("autodesk.test:vector3-1.0.0");
			prop._properties.x.value = 2;
			var changeSet = new ChangeSet(prop._serialize(true));
			changeSet._toReversibleChangeSet(propCopy._serialize(false));
			propCopy.applyChangeSet(changeSet.getSerializedChangeSet());
			expect(prop._serialize()).to.deep.equal(propCopy._serialize());
			expect(prop._serialize(true)).to.deep.equal(propCopy._serialize(true));
		});

		it("should work for string properties", function () {
			var prop = PropertyFactory.create("autodesk.tests:DataStringTestProperty-1.0.0");
			var propCopy = PropertyFactory.create("autodesk.tests:DataStringTestProperty-1.0.0");
			prop._properties.data.value = "A";
			var changeSet = new ChangeSet(prop._serialize(true));
			changeSet._toReversibleChangeSet(propCopy._serialize(false));
			propCopy.applyChangeSet(changeSet.getSerializedChangeSet());
			expect(prop._serialize()).to.deep.equal(propCopy._serialize());
			expect(prop._serialize(true)).to.deep.equal(propCopy._serialize(true));
		});

		it("should work for reference properties", function () {
			var root = PropertyFactory.create("NodeProperty");
			var prop = PropertyFactory.create("autodesk.tests:DataRefTestProperty-1.0.0");
			var propCopy = PropertyFactory.create("autodesk.tests:DataRefTestProperty-1.0.0");
			var target = PropertyFactory.create("String");
			root.insert("target", target);
			root.insert("reference", prop);
			root.insert("referenceCopy", propCopy);
			prop._properties.data.set(target);
			var changeSet = new ChangeSet(prop._serialize(true));
			changeSet._toReversibleChangeSet(propCopy._serialize(false));
			propCopy.applyChangeSet(changeSet.getSerializedChangeSet());
			expect(prop._serialize()).to.deep.equal(propCopy._serialize());
			expect(prop._serialize(true)).to.deep.equal(propCopy._serialize(true));
		});

		it("should work for enum properties", function () {
			var prop = PropertyFactory.create("autodesk.core:CustomWithEnumID-1.0.0");
			var propCopy = PropertyFactory.create("autodesk.core:CustomWithEnumID-1.0.0");
			prop._properties.data.value = "cm";
			var changeSet = new ChangeSet(prop._serialize(true));
			changeSet._toReversibleChangeSet(propCopy._serialize(false));
			propCopy.applyChangeSet(changeSet.getSerializedChangeSet());
			expect(prop._serialize()).to.deep.equal(propCopy._serialize());
			expect(prop._serialize(true)).to.deep.equal(propCopy._serialize(true));
		});

		it("should work for indexed collections of complex types", function () {
			var prop = PropertyFactory.create("autodesk.tests:MapTestNamedPropertyID-1.0.0");
			var propCopy = PropertyFactory.create("autodesk.tests:MapTestNamedPropertyID-1.0.0");

			var A = PropertyFactory.create("autodesk.tests:AnonymousMapTestPropertyID-1.0.0");
			var B = PropertyFactory.create("autodesk.tests:AnonymousMapTestPropertyID-1.0.0");
			var C = PropertyFactory.create("autodesk.tests:AnonymousMapTestPropertyID-1.0.0");
			prop._properties.map.insert("A", A);
			prop._properties.map.insert("B", B);
			prop._properties.map.insert("C", C);
			propCopy.deserialize(prop._serialize());

			prop.cleanDirty();
			propCopy.cleanDirty();

			prop._properties.map.remove("B");
			prop._properties.map.get("A")._properties.stringProperty.value = "hello";

			var changeSet = new ChangeSet(prop._serialize(true));
			changeSet._toReversibleChangeSet(propCopy._serialize(false));
			propCopy.applyChangeSet(changeSet.getSerializedChangeSet());
			expect(prop._serialize()).to.deep.equal(propCopy._serialize());
			expect(prop._serialize(true)).to.deep.equal(propCopy._serialize(true));
		});

		it("should work for indexed collections of primitive types", function () {
			var prop = PropertyFactory.create("autodesk.tests:MapTestPropertyID-1.0.0");
			var propCopy = PropertyFactory.create("autodesk.tests:MapTestPropertyID-1.0.0");

			prop._properties.data.insert("A", 1);
			prop._properties.data.insert("B", 2);
			prop._properties.data.insert("C", 3);
			propCopy.deserialize(prop._serialize());

			prop.cleanDirty();
			propCopy.cleanDirty();

			prop._properties.data.remove("B");
			prop._properties.data.set("C", 99);

			var changeSet = new ChangeSet(prop._serialize(true));
			changeSet._toReversibleChangeSet(propCopy._serialize(false));
			propCopy.applyChangeSet(changeSet.getSerializedChangeSet());
			expect(prop._serialize()).to.deep.equal(propCopy._serialize());
			expect(prop._serialize(true)).to.deep.equal(propCopy._serialize(true));
		});

		it("should work for custom array properties", function () {
			var prop = PropertyFactory.create("autodesk.tests:CustomArrayChangesetTestID-1.0.0");
			var propCopy = PropertyFactory.create("autodesk.tests:CustomArrayChangesetTestID-1.0.0");

			var A = PropertyFactory.create("autodesk.tests:AnonymousMapTestPropertyID-1.0.0");
			var B = PropertyFactory.create("autodesk.tests:AnonymousMapTestPropertyID-1.0.0");
			var C = PropertyFactory.create("autodesk.tests:AnonymousMapTestPropertyID-1.0.0");
			prop._properties.data.insertRange(0, [A, B, C]);
			propCopy.deserialize(prop.serialize());

			prop.cleanDirty();
			propCopy.cleanDirty();

			prop._properties.data.get(2)._properties.stringProperty.value = "hello";
			prop._properties.data.removeRange(1, 1);

			var changeSet = new ChangeSet(prop.serialize({ dirtyOnly: true }));
			var baseState = propCopy.serialize({ dirtyOnly: false });
			changeSet._toReversibleChangeSet(baseState);
			propCopy.applyChangeSet(changeSet.getSerializedChangeSet());
			expect(prop.serialize()).to.deep.equal(propCopy.serialize());
			expect(prop.serialize({ dirtyOnly: true })).to.deep.equal(
				propCopy.serialize({ dirtyOnly: true }),
			);
		});

		it("should work for primitive array properties", function () {
			var prop = PropertyFactory.create("autodesk.test:test.arrayfloat32-1.0.0");
			var propCopy = PropertyFactory.create("autodesk.test:test.arrayfloat32-1.0.0");
			prop._properties.data.insertRange(0, [10, 11, 12, 13, 14, 15, 16]);
			propCopy._properties.data.insertRange(0, [10, 11, 12, 13, 14, 15, 16]);

			prop.cleanDirty();
			propCopy.cleanDirty();

			prop._properties.data.setRange(4, [24, 25]);
			prop._properties.data.removeRange(1, 2);

			var changeSet = new ChangeSet(prop.serialize({ dirtyOnly: true }));
			changeSet._toReversibleChangeSet(propCopy.serialize({ dirtyOnly: false }));
			propCopy.applyChangeSet(changeSet.getSerializedChangeSet());
			expect(prop.serialize()).to.deep.equal(propCopy.serialize());
			expect(prop.serialize({ dirtyOnly: true })).to.deep.equal(
				propCopy.serialize({ dirtyOnly: true }),
			);
		});

		it("should work for node properties", function () {
			var prop = PropertyFactory.create("NodeProperty");
			var propCopy = PropertyFactory.create("NodeProperty");

			var A = PropertyFactory.create("autodesk.tests:AnonymousMapTestPropertyID-1.0.0");
			var B = PropertyFactory.create("autodesk.tests:AnonymousMapTestPropertyID-1.0.0");
			var C = PropertyFactory.create("autodesk.tests:AnonymousMapTestPropertyID-1.0.0");
			var D = PropertyFactory.create("autodesk.tests:AnonymousMapTestPropertyID-1.0.0");

			prop.insert("A", A);
			prop.insert("B", B);
			prop.insert("C", C);
			prop.insert("D", D);

			var initialChangeset = prop.serialize({ dirtyOnly: false });
			propCopy.deserialize(initialChangeset);

			prop.cleanDirty();
			propCopy.cleanDirty();

			prop._properties.A.stringProperty.value = "test";
			prop.remove("B");
			prop.remove("C");

			var changeSet = new ChangeSet(prop.serialize({ dirtyOnly: true }));
			changeSet._toReversibleChangeSet(initialChangeset);
			propCopy.applyChangeSet(changeSet.getSerializedChangeSet());
			expect(prop.serialize()).to.deep.equal(propCopy.serialize());
			expect(prop.serialize({ dirtyOnly: true })).to.deep.equal(
				propCopy.serialize({ dirtyOnly: true }),
			);
		});

		it("should work for inherits node properties", function () {
			var root = PropertyFactory.create("NodeProperty");
			var prop = PropertyFactory.create("autodesk.tests:SimpleInheritsNodeProperty-1.0.0");
			root.insert("prop", prop);

			var rootCopy = PropertyFactory.create("NodeProperty");
			var propCopy = PropertyFactory.create("autodesk.tests:SimpleInheritsNodeProperty-1.0.0");
			rootCopy.insert("prop", propCopy);

			var A = PropertyFactory.create("autodesk.tests:AnonymousMapTestPropertyID-1.0.0");
			var B = PropertyFactory.create("autodesk.tests:AnonymousMapTestPropertyID-1.0.0");
			var C = PropertyFactory.create("autodesk.tests:AnonymousMapTestPropertyID-1.0.0");
			var D = PropertyFactory.create("autodesk.tests:AnonymousMapTestPropertyID-1.0.0");

			prop.insert("A", A);
			prop.insert("B", B);
			prop.insert("C", C);
			prop.insert("D", D);

			var initialChangeset = root.serialize({ dirtyOnly: false });
			rootCopy.deserialize(initialChangeset);

			root.cleanDirty();
			rootCopy.cleanDirty();

			prop._properties.A.stringProperty.value = "test";
			prop.remove("B");
			prop.remove("C");

			var changeSet = new ChangeSet(root.serialize({ dirtyOnly: true }));
			changeSet._toReversibleChangeSet(initialChangeset);
			rootCopy.applyChangeSet(changeSet.getSerializedChangeSet());
			expect(root.serialize()).to.deep.equal(rootCopy.serialize());
			expect(root.serialize({ dirtyOnly: true })).to.deep.equal(
				rootCopy.serialize({ dirtyOnly: true }),
			);
		});
	});

	describe("Apply with reversible ChangeSets", function () {
		var overlapApplyTest = function (
			in_type,
			in_inputArrayOperations1,
			in_inputArrayOperations2,
			in_outputArrayOperations,
		) {
			var convertModificationSetToArray = function (in_modificationSet) {
				return in_modificationSet.map((x) => {
					return x[2] === undefined
						? [x[0], x[1].split("")]
						: [x[0], x[1].split(""), x[2].split("")];
				});
			};

			var performApplyTest = function (
				in_typeid,
				inputArrayOperations1,
				inputArrayOperations2,
				outputArrayOperations,
			) {
				var CS1 = new ChangeSet({
					modify: { [in_typeid]: { arr: { [in_type]: inputArrayOperations1 } } },
				});
				var CS2 = {
					modify: { [in_typeid]: { arr: { [in_type]: inputArrayOperations2 } } },
				};
				var CS2_copy = deepCopy(CS2);
				CS1.applyChangeSet(CS2);

				// CS2 should be unchanged
				expect(CS2).to.deep.equal(CS2_copy);

				// CS2 should no longer contain the removal of A
				expect(CS1.getSerializedChangeSet()).to.deep.equal({
					modify: { [in_typeid]: { arr: { [in_type]: outputArrayOperations } } },
				});
			};

			it("on strings", function () {
				performApplyTest(
					"String",
					deepCopy(in_inputArrayOperations1),
					in_inputArrayOperations2,
					in_outputArrayOperations,
				);
			});

			it("on arrays", function () {
				performApplyTest(
					"array<String>",
					convertModificationSetToArray(in_inputArrayOperations1),
					convertModificationSetToArray(in_inputArrayOperations2),
					convertModificationSetToArray(in_outputArrayOperations),
				);
			});
		};

		describe("for overlapping modifies 1", function () {
			overlapApplyTest(
				"modify",
				[[3, "abc", "123"]],
				[[3, "def", "abc"]],
				[[3, "def", "123"]],
			);
		});

		describe("for overlapping modifies 2", function () {
			overlapApplyTest(
				"modify",
				[[0, "abc", "123"]],
				[[2, "def", "c45"]],
				[[0, "abdef", "12345"]],
			);
		});
	});

	describe("Rebase with reversible ChangeSets", function () {
		var overlapRebaseTest = function (
			in_type,
			in_inputArrayOperations1,
			in_inputArrayOperations2,
			in_outputArrayOperations,
			in_expectedConflicts,
		) {
			var convertModificationSetToArray = function (in_modificationSet) {
				return in_modificationSet.map((x) => {
					return x[2] === undefined
						? [x[0], x[1].split("")]
						: [x[0], x[1].split(""), x[2].split("")];
				});
			};

			var performRebaseTest = function (
				in_typeid,
				inputArrayOperations1,
				inputArrayOperations2,
				outputArrayOperations,
			) {
				var conflicts = [];
				var CS1_initial = {
					modify: { [in_typeid]: { arr: { [in_type]: inputArrayOperations1 } } },
				};
				var CS1 = new ChangeSet(deepCopy(CS1_initial));
				var CS2 = {
					modify: { [in_typeid]: { arr: { [in_type]: inputArrayOperations2 } } },
				};
				CS1._rebaseChangeSet(CS2, conflicts);

				// Duplicated remove is not a conflict
				expect(conflicts.length).to.equal(in_expectedConflicts);

				// CS1 should be unchanged
				expect(CS1.getSerializedChangeSet()).to.deep.equal(CS1_initial);

				// CS2 should no longer contain the removal of A
				expect(CS2).to.deep.equal({
					modify: { [in_typeid]: { arr: { [in_type]: outputArrayOperations } } },
				});
			};

			it("on strings", function () {
				performRebaseTest(
					"String",
					in_inputArrayOperations1,
					in_inputArrayOperations2,
					in_outputArrayOperations,
				);
			});

			it("on arrays", function () {
				performRebaseTest(
					"array<String>",
					convertModificationSetToArray(in_inputArrayOperations1),
					convertModificationSetToArray(in_inputArrayOperations2),
					convertModificationSetToArray(in_outputArrayOperations),
				);
			});
		};

		describe("for overlapping removes", function () {
			overlapRebaseTest(
				"remove",
				[
					[0, "<A"],
					[4, ">"],
				],
				[[1, "ABC"]],
				[[0, "BC"]],
				0,
			);
		});

		describe("for overlapping removes 2", function () {
			overlapRebaseTest("remove", [[2, "C>"]], [[0, "ABC"]], [[0, "AB"]], 0);
		});

		describe("for overlapping removes 3", function () {
			overlapRebaseTest(
				"remove",
				[[2, "CD>"]],
				[
					[0, "ABC"],
					[4, ">"],
				],
				[[0, "AB"]],
				0,
			);
		});

		describe("for overlapping modifies", function () {
			overlapRebaseTest(
				"modify",
				[
					[0, "<A", ".."],
					[4, ">", "."],
				],
				[[1, "123", "---"]],
				[[1, "123", "A--"]],
				1,
			);
		});

		describe("for overlapping modifies 2", function () {
			overlapRebaseTest(
				"modify",
				[[2, "C>", ".."]],
				[[0, "123", "---"]],
				[[0, "123", "--C"]],
				1,
			);
		});

		describe("for overlapping modifies 3", function () {
			overlapRebaseTest(
				"modify",
				[[2, "CD>", ".."]],
				[
					[0, "123", "---"],
					[4, "45", "--"],
				],
				[
					[0, "123", "--C"],
					[4, "45", ">-"],
				],
				2,
			);
		});

		it("for array modify rebases", function () {
			var CS = new ChangeSet({
				"array<Float32>": {
					elements: {
						modify: [[1, [1, 2, 3], [0, 1, 2]]],
					},
				},
			});

			var rebasedCS = CS._rebaseChangeSet(
				{
					"array<Float32>": {
						elements: {
							modify: [[0, [0, 1, 2, 3], [1, 2, 3, 4]]],
						},
					},
				},
				[],
			);
			expect(rebasedCS["array<Float32>"].elements.modify[0].length).to.equal(3);
		});
	});

	describe("applying reversible CS to primitive string types", function () {
		it("should work for strings", function () {
			var CS = new ChangeSet({ String: { test: { value: "10", oldValue: "9" } } });
			CS.applyChangeSet({ String: { test: { value: "8", oldValue: "10" } } });
			expect(CS.getSerializedChangeSet()).to.deep.equal({
				String: { test: { value: "8", oldValue: "9" } },
			});
		});

		it("should work for strings", function () {
			var CS = new ChangeSet({ Float64: { test: { value: 10, oldValue: 9 } } });
			CS.applyChangeSet({ Float64: { test: { value: 8, oldValue: 10 } } });
			expect(CS.getSerializedChangeSet()).to.deep.equal({
				Float64: { test: { value: 8, oldValue: 9 } },
			});
		});

		it("should work for bool", function () {
			// TODO: This should become a NOP
			var CS = new ChangeSet({ Bool: { test: { value: false, oldValue: true } } });
			CS.applyChangeSet({ Bool: { test: { value: true, oldValue: false } } });
			expect(CS.getSerializedChangeSet()).to.deep.equal({
				Bool: { test: { value: true, oldValue: true } },
			});
		});

		it("should work for bool", function () {
			// TODO: This should become a NOP
			var CS = new ChangeSet({});
			CS.applyChangeSet({ Bool: { test: { value: true, oldValue: false } } });
			expect(CS.getSerializedChangeSet()).to.deep.equal({
				Bool: { test: { value: true, oldValue: false } },
			});
		});
	});

	describe("_stripReversibleChangeSet should", function () {
		it("correctly handle removes at the root", function () {
			var CS = new ChangeSet({
				remove: {
					String: {
						testString: "abcde",
					},
				},
			});
			CS._stripReversibleChangeSet();
			expect(CS.getSerializedChangeSet()).to.deep.equal({
				remove: ["testString"],
			});
		});
		it("ignore the root when passing it a flag", function () {
			var SCS = {
				remove: {
					String: {
						testString: "abcde",
					},
				},
			};
			var CS = new ChangeSet(SCS);
			CS._stripReversibleChangeSet(true);
			expect(CS.getSerializedChangeSet()).to.deep.equal(SCS);
		});
	});

	describe("should return a minimal CS when squashing", function () {
		it("matching primitive type remove/insert combinations in a polymorphic indexed collection", function () {
			// These two operations should cancel out
			var CS1 = new ChangeSet({ remove: { String: { A: "A" } } });
			var CS2 = new ChangeSet({ insert: { String: { A: "A" } } });
			CS1.applyChangeSet(CS2);
			expect(CS1.getSerializedChangeSet()).to.deep.equal({});
		});
		it("non matching primitive type remove/insert combinations in a polymorphic indexed collection", function () {
			// These two operations should result in a modify
			var CS1 = new ChangeSet({ remove: { String: { A: "A" } } });
			var CS2 = new ChangeSet({ insert: { String: { A: "B" } } });
			CS1.applyChangeSet(CS2);
			expect(CS1.getSerializedChangeSet()).to.deep.equal({ modify: { String: { A: "B" } } });
		});
		it("matching remove/insert combinations in a primitive type indexed collection", function () {
			// These two operations should cancel out
			var CS1 = new ChangeSet({
				modify: { "map<String>": { test: { remove: { A: "A" } } } },
			});
			var CS2 = new ChangeSet({
				modify: { "map<String>": { test: { insert: { A: "A" } } } },
			});
			CS1.applyChangeSet(CS2);
			expect(CS1.getSerializedChangeSet()).to.deep.equal({});
		});
		it("non matching primitive type remove/insert combinations in a polymorphic indexed collection", function () {
			// These two operations should result in a modify
			var CS1 = new ChangeSet({
				modify: { "map<String>": { test: { remove: { A: "A" } } } },
			});
			var CS2 = new ChangeSet({
				modify: { "map<String>": { test: { insert: { A: "B" } } } },
			});
			CS1.applyChangeSet(CS2);
			expect(CS1.getSerializedChangeSet()).to.deep.equal({
				modify: { "map<String>": { test: { modify: { A: "B" } } } },
			});
		});
		it("matching complex type remove/insert combinations in a polymorphic indexed collection", function () {
			// These two operations should cancel out
			var CS1 = new ChangeSet({ remove: { "RepositoryTest:Nametag-1.0.0": { name: "A" } } });
			var CS2 = new ChangeSet({ insert: { "RepositoryTest:Nametag-1.0.0": { name: "A" } } });
			CS1.applyChangeSet(CS2);
			expect(CS1.getSerializedChangeSet()).to.deep.equal({});
		});
		it("non matching complex type remove/insert combinations in a polymorphic indexed collection", function () {
			// TODO: How should we treat these operations? Should they be rewritten to a modify?
			var CS1 = new ChangeSet({ remove: { "RepositoryTest:Nametag-1.0.0": { name: "A" } } });
			var CS2 = new ChangeSet({ insert: { "RepositoryTest:Nametag-1.0.0": { name: "B" } } });
			CS1.applyChangeSet(CS2);
			expect(CS1.getSerializedChangeSet()).to.deep.equal({
				remove: { "RepositoryTest:Nametag-1.0.0": { name: "A" } },
				insert: { "RepositoryTest:Nametag-1.0.0": { name: "B" } },
			});
		});

		it("matching primitive type remove/insert operations in primitive type arrays", function () {
			// These two operations should cancel out
			var CS1 = new ChangeSet({
				modify: { "array<String>": { test: { remove: [[0, ["A", "B", "C"]]] } } },
			});
			var CS2 = new ChangeSet({
				modify: { "array<String>": { test: { insert: [[0, ["A", "B", "C"]]] } } },
			});
			CS1.applyChangeSet(CS2);
			expect(CS1.getSerializedChangeSet()).to.deep.equal({});
		});
	});

	it("should work for primitive array properties", function () {
		var prop = PropertyFactory.create("autodesk.test:test.arrayfloat32-1.0.0");
		prop._properties.data.insertRange(0, [10, 11, 12, 13, 14, 15, 16]);
		testRevAndInvCS(
			prop,
			function (in_prop) {
				in_prop._properties.data.setRange(1, [21, 22]);
				in_prop._properties.data.removeRange(4, 3);
				in_prop._properties.data.insert(0, 9);
			},
			{
				"array<Float32>": {
					data: {
						modify: [[1, [21, 22], [11, 12]]],
						remove: [[4, [14, 15, 16]]],
						insert: [[0, [9]]],
					},
				},
			},
			{
				"array<Float32>": {
					data: {
						insert: [[0, [9, 10, 21, 22, 13]]],
					},
				},
			},
			{
				"array<Float32>": {
					data: {
						modify: [[2, [11, 12], [21, 22]]],
						insert: [[5, [14, 15, 16]]],
						remove: [[0, [9]]],
					},
				},
			},
		);
	});

	it("should work for insertions into empty primitive array properties", function () {
		var prop = PropertyFactory.create("autodesk.test:test.arrayfloat32-1.0.0");
		testRevAndInvCS(
			prop,
			function (in_prop) {
				in_prop._properties.data.insertRange(0, [1, 2, 3]);
			},
			{
				"array<Float32>": {
					data: {
						insert: [[0, [1, 2, 3]]],
					},
				},
			},
			{
				"array<Float32>": {
					data: {
						insert: [[0, [1, 2, 3]]],
					},
				},
			},
			{
				"array<Float32>": {
					data: {
						remove: [[0, [1, 2, 3]]],
					},
				},
			},
		);
	});

	it("should not crash with an empty input if it is not needed in the actual CS", function () {
		var initialCS = {
			NodeProperty: {
				insert: {
					NodeProperty: {
						test2: {},
					},
				},
			},
		};
		var CS = new ChangeSet(deepCopy(initialCS));
		CS._toReversibleChangeSet({});
		expect(CS.getSerializedChangeSet()).to.deep.equal(initialCS);
	});

	it("should work for inserts, even if the corresponding property is missing in the initial state", function () {
		// This test checks, whether changesets with insert work, even if the corresponding property is not present in the
		// initial changeset. Since the initial changeset is not needed for the insert, we don't need to throw an
		// error in that case. This type of situation can occur in the materialized history, if an insert happens right
		// at a chunk boundary.
		var initialCS = {
			NodeProperty: {
				test: {
					insert: {
						NodeProperty: {
							test2: {},
						},
					},
				},
			},
		};
		var CS = new ChangeSet(deepCopy(initialCS));
		CS._toReversibleChangeSet({});
		expect(CS.getSerializedChangeSet()).to.deep.equal(initialCS);
	});

	it("should work for simple primitive properties", function () {
		var cs = new ChangeSet({
			insert: {
				Float32: {
					myFloat: 23,
				},
			},
		});
		var cs2 = new ChangeSet({
			modify: {
				Float32: {
					myFloat: 42,
				},
			},
		});

		var cs2Rev = cs2.clone();

		cs2Rev._stripReversibleChangeSet();
		expect(cs2.getSerializedChangeSet()).to.deep.equal(cs2Rev.getSerializedChangeSet());

		cs2Rev._toReversibleChangeSet(cs.getSerializedChangeSet());

		var cs2Strip = cs2Rev.clone();
		cs2Strip._stripReversibleChangeSet();
		expect(cs2.getSerializedChangeSet()).to.deep.equal(cs2Strip.getSerializedChangeSet());

		expect(cs2Rev.getSerializedChangeSet()).to.deep.equal({
			modify: { Float32: { myFloat: { value: 42, oldValue: 23 } } },
		});

		// forward and reverse:
		cs.applyChangeSet(cs2Rev);
		// cs now should be 42
		expect(cs.getSerializedChangeSet()).to.deep.equal({
			insert: { Float32: { myFloat: 42 } },
		});

		var invCS = cs2Rev.clone();
		invCS.toInverseChangeSet();
		expect(invCS.getSerializedChangeSet()).to.deep.equal({
			modify: { Float32: { myFloat: { value: 23, oldValue: 42 } } },
		});

		cs.applyChangeSet(invCS);
		// cs now should be 23
		expect(cs.getSerializedChangeSet()).to.deep.equal({
			insert: { Float32: { myFloat: 23 } },
		});
	});

	it("should work for templated properties", function () {
		var prop = PropertyFactory.create("autodesk.test:point2d-1.0.0");
		testRevAndInvCS(
			prop,
			function (in_prop) {
				in_prop._properties.position.x.value = 2;
				in_prop._properties.normal.y.value = 4;
				in_prop._properties.temperature.value = 21;
			},
			{
				"Float32": {
					"position.x": { value: 2, oldValue: 0 },
					"temperature": { value: 21, oldValue: 0 },
				},
				"autodesk.test:vector3-1.0.0": {
					normal: { Float32: { y: { value: 4, oldValue: 0 } } },
				},
			},
			{
				"Float32": {
					"position.x": 2,
					"position.y": 0,
					"temperature": 21,
				},
				"autodesk.test:vector3-1.0.0": {
					normal: { Float32: { x: 0, y: 4, z: 0 } },
				},
				"map<autodesk.test:vector3-1.0.0>": { neighbours: {} },
			},
			{
				"Float32": {
					"position.x": { value: 0, oldValue: 2 },
					"temperature": { value: 0, oldValue: 21 },
				},
				"autodesk.test:vector3-1.0.0": {
					normal: { Float32: { y: { value: 0, oldValue: 4 } } },
				},
			},
		);
	});

	it("should work for string properties initialized by set", function () {
		var prop = PropertyFactory.create("autodesk.tests:DataStringTestProperty-1.0.0");
		prop._properties.data.value = "Hello world";
		testRevAndInvCS(
			prop,
			function (in_prop) {
				in_prop._properties.data.setRange(1, "aih");
				in_prop._properties.data.removeRange(6, 5);
				in_prop._properties.data.insertRange(0, "Hi, ");
			},
			{
				String: {
					data: {
						modify: [[1, "aih", "ell"]],
						remove: [[6, "world"]],
						insert: [[0, "Hi, "]],
					},
				},
			},
			{ String: { data: "Hi, Haiho " } },
			{
				String: {
					data: {
						modify: [[5, "ell", "aih"]],
						remove: [[0, "Hi, "]],
						insert: [[10, "world"]],
					},
				},
			},
		);
	});

	it("should work for string properties initialized by insert", function () {
		var prop = PropertyFactory.create("autodesk.tests:DataStringTestProperty-1.0.0");
		prop._properties.data.insert(0, "Hello world");
		testRevAndInvCS(
			prop,
			function (in_prop) {
				in_prop._properties.data.setRange(1, "aih");
				in_prop._properties.data.removeRange(6, 5);
				in_prop._properties.data.insertRange(0, "Hi, ");
			},
			{
				String: {
					data: {
						modify: [[1, "aih", "ell"]],
						remove: [[6, "world"]],
						insert: [[0, "Hi, "]],
					},
				},
			},
			{ String: { data: "Hi, Haiho " } },
			{
				String: {
					data: {
						modify: [[5, "ell", "aih"]],
						remove: [[0, "Hi, "]],
						insert: [[10, "world"]],
					},
				},
			},
		);
	});

	it("should work for primitive map properties", function () {
		var property = PropertyFactory.create("autodesk.tests:MapTestPropertyID-1.0.0");
		var prop = property._properties.data;
		prop.insert("A", 3);
		prop.insert("B", 4);
		prop.insert("C", 5);
		prop.insert("D", 6);
		testRevAndInvCS(
			property,
			function (myProp) {
				myProp._properties.data.set("A", 7);
				myProp._properties.data.remove("B");
				myProp._properties.data.remove("C");
				myProp._properties.data.set("D", 8);
				myProp._properties.data.insert("F", 9);
			},
			{
				"map<Float32>": {
					data: {
						remove: { B: 4, C: 5 },
						modify: { A: { value: 7, oldValue: 3 }, D: { value: 8, oldValue: 6 } },
						insert: { F: 9 },
					},
				},
			},
			{
				"map<Float32>": {
					data: {
						insert: { A: 7, D: 8, F: 9 },
					},
				},
			},
			{
				"map<Float32>": {
					data: {
						modify: { A: { value: 3, oldValue: 7 }, D: { value: 6, oldValue: 8 } },
						insert: { B: 4, C: 5 },
						remove: { F: 9 },
					},
				},
			},
		);
	});

	it("should work for custom map properties", function () {
		var rootNode = PropertyFactory.create("autodesk.tests:MapTestNamedPropertyID-1.0.0");

		var A = PropertyFactory.create("autodesk.tests:AnonymousMapTestPropertyID-1.0.0");
		var B = PropertyFactory.create("autodesk.tests:AnonymousMapTestPropertyID-1.0.0");
		var C = PropertyFactory.create("autodesk.tests:AnonymousMapTestPropertyID-1.0.0");
		var D = PropertyFactory.create("autodesk.tests:AnonymousMapTestPropertyID-1.0.0");
		rootNode._properties.map.insert("A", A);
		rootNode._properties.map.insert("B", B);
		rootNode._properties.map.insert("C", C);
		rootNode._properties.map.insert("D", D);
		testRevAndInvCS(
			rootNode,
			function (myProp) {
				var F = PropertyFactory.create("autodesk.tests:AnonymousMapTestPropertyID-1.0.0");
				myProp._properties.map.remove("B");
				myProp._properties.map.remove("C");
				myProp._properties.map.insert("F", F);
				myProp._properties.map.get("A")._properties.stringProperty.value = "hello";
			},
			{
				"map<NamedProperty>": {
					map: {
						insert: {
							"autodesk.tests:AnonymousMapTestPropertyID-1.0.0": {
								F: { String: { stringProperty: "" } },
							},
						},
						remove: {
							"autodesk.tests:AnonymousMapTestPropertyID-1.0.0": {
								B: { String: { stringProperty: "" } },
								C: { String: { stringProperty: "" } },
							},
						},
						modify: {
							"autodesk.tests:AnonymousMapTestPropertyID-1.0.0": {
								A: { String: { stringProperty: { value: "hello", oldValue: "" } } },
							},
						},
					},
				},
			},
			undefined,
			{
				"map<NamedProperty>": {
					map: {
						insert: {
							"autodesk.tests:AnonymousMapTestPropertyID-1.0.0": {
								B: { String: { stringProperty: "" } },
								C: { String: { stringProperty: "" } },
							},
						},
						modify: {
							"autodesk.tests:AnonymousMapTestPropertyID-1.0.0": {
								A: { String: { stringProperty: { value: "", oldValue: "hello" } } },
							},
						},
						remove: {
							"autodesk.tests:AnonymousMapTestPropertyID-1.0.0": {
								F: { String: { stringProperty: "" } },
							},
						},
					},
				},
			},
		);
	});

	it("should test reversible changeset for a NodeProperty", function () {
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

		var changeSet = new ChangeSet(originalChangeSet);
		changeSet._toReversibleChangeSet(parentChangeSet);

		expect(changeSet.getSerializedChangeSet()).to.eql({
			insert: {
				"autodesk.tests:AnonymousMapTestPropertyID-1.0.0": {
					F: { String: { stringProperty: "" } },
				},
			},
			remove: {
				"autodesk.tests:AnonymousMapTestPropertyID-1.0.0": {
					B: { String: { stringProperty: "" } },
					C: { String: { stringProperty: "" } },
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

		changeSet.toInverseChangeSet();

		expect(changeSet.getSerializedChangeSet()).to.eql({
			insert: {
				"autodesk.tests:AnonymousMapTestPropertyID-1.0.0": {
					B: { String: { stringProperty: "" } },
					C: { String: { stringProperty: "" } },
				},
			},
			remove: {
				"autodesk.tests:AnonymousMapTestPropertyID-1.0.0": {
					F: { String: { stringProperty: "" } },
				},
			},
			modify: {
				"autodesk.tests:AnonymousMapTestPropertyID-1.0.0": {
					A: {
						String: {
							stringProperty: {
								value: "",
								oldValue: "hello",
							},
						},
					},
				},
			},
		});

		var originalChangeSet2 = {
			insert: {
				"mysample:point2d-1.0.0": {
					"7485af0e-c992-af6a-ef36-6a024eb4b4e5---2": {
						String: {
							guid: "fb5f062f-9f56-55c3-f868-06caa5d8ce26",
						},
						Float64: {
							x: 0,
							y: 0,
						},
					},
				},
			},
		};

		var parentChangeSet2 = {};

		var changeSet2 = new ChangeSet(originalChangeSet2);
		changeSet2._toReversibleChangeSet(parentChangeSet2);

		expect(changeSet2.getSerializedChangeSet()).to.eql(changeSet2.getSerializedChangeSet());
		changeSet2.toInverseChangeSet();

		expect(changeSet2.getSerializedChangeSet()).to.eql({
			remove: {
				"mysample:point2d-1.0.0": {
					"7485af0e-c992-af6a-ef36-6a024eb4b4e5---2": {
						String: {
							guid: "fb5f062f-9f56-55c3-f868-06caa5d8ce26",
						},
						Float64: {
							x: 0,
							y: 0,
						},
					},
				},
			},
		});
	});

	it("should test reversible changeset for an array of non primitive types", function () {
		var originalChangeSet = {
			modify: {
				"array<mysample:point2d-1.0.0>": {
					test2: {
						modify: [
							[
								0,
								[
									{
										Float64: {
											x: 15.104284463262685,
										},
										typeid: "mysample:point2d-1.0.0",
									},
								],
							],
						],
					},
				},
			},
		};

		var parentChangeSet = {
			insert: {
				"mysample:point2d-1.0.0": {
					test: {
						String: {
							guid: "cd36cd32-0bd3-5c55-f94c-b95933fdc58b",
						},
						Float64: {
							x: 65.18242364168808,
							y: 0,
						},
					},
				},
				"array<mysample:point2d-1.0.0>": {
					test2: {
						insert: [
							[
								0,
								[
									{
										String: {
											guid: "e66540ff-9e5e-d599-033e-d3dd55efc2a3",
										},
										Float64: {
											x: 0,
											y: 0,
										},
										typeid: "mysample:point2d-1.0.0",
									},
									{
										String: {
											guid: "daeb5439-baef-7986-f90a-6a3a2f082250",
										},
										Float64: {
											x: 0,
											y: 0,
										},
										typeid: "mysample:point2d-1.0.0",
									},
								],
							],
						],
					},
					test3: {},
				},
			},
			insertTemplates: {
				"mysample:point2d-1.0.0": {
					typeid: "mysample:point2d-1.0.0",
					inherits: "NamedProperty",
					properties: [
						{
							id: "x",
							typeid: "Float64",
						},
						{
							id: "y",
							typeid: "Float64",
						},
					],
				},
			},
		};

		var changeSet = new ChangeSet(originalChangeSet);
		changeSet._toReversibleChangeSet(parentChangeSet);

		expect(changeSet.getSerializedChangeSet()).to.eql({
			modify: {
				"array<mysample:point2d-1.0.0>": {
					test2: {
						modify: [
							[
								0,
								[
									{
										Float64: {
											x: {
												value: 15.104284463262685,
												oldValue: 0,
											},
										},
										typeid: "mysample:point2d-1.0.0",
									},
								],
							],
						],
					},
				},
			},
		});

		changeSet.toInverseChangeSet();

		expect(changeSet.getSerializedChangeSet()).to.eql({
			modify: {
				"array<mysample:point2d-1.0.0>": {
					test2: {
						modify: [
							[
								0,
								[
									{
										Float64: {
											x: {
												value: 0,
												oldValue: 15.104284463262685,
											},
										},
										typeid: "mysample:point2d-1.0.0",
									},
								],
							],
						],
					},
				},
			},
		});
	});

	it("should correctly reverse inserts of strings", function () {
		let CS = new ChangeSet({
			insert: {
				String: {
					test: "xxx",
				},
			},
		});
		CS.toInverseChangeSet();
		expect(CS.getSerializedChangeSet()).to.deep.equal({
			remove: {
				String: {
					test: "xxx",
				},
			},
		});
	});

	it("should correctly reverse inserts of literal strings within NodeProperties", function () {
		let CS = new ChangeSet({
			modify: {
				NodeProperty: {
					test: {
						insert: {
							String: {
								test: "xxx",
							},
						},
					},
				},
			},
		});
		CS.toInverseChangeSet();
		expect(CS.getSerializedChangeSet()).to.deep.equal({
			modify: {
				NodeProperty: {
					test: {
						remove: {
							String: {
								test: "xxx",
							},
						},
					},
				},
			},
		});
	});

	it("@regression should not fail when building reversible change sets", function () {
		var parentChangeSet =
			require("./validation/reversibleChangeSetTestData.js").parentChangeSet;
		var originalChangeSet =
			require("./validation/reversibleChangeSetTestData.js").originalChangeSet;

		var changeSet = new ChangeSet(originalChangeSet);
		changeSet._toReversibleChangeSet(parentChangeSet);
	});

	it("@regression should not fail when creating a reversible change set", function () {
		var cs = {
			modify: {
				"autodesk.compute:graph-1.0.0": {
					"5eb6ebe1-92c8-52fa-984b-b0b65c46d2a7": {
						"map<autodesk.compute:node-2.0.0>": {
							computeNodes: {
								modify: {
									"autodesk.compute:fanOut-1.0.0": {
										"a7e7d213-1202-9ee4-a3c1-8a33d6f36122": {
											"autodesk.compute:context-1.0.0": {
												computeContext: {
													"Reference<autodesk.compute:resource-2.0.0>": {
														resource: "/8ce10fdd-b2b6-7152-21dc-c0e199b579e3",
													},
												},
											},
											"map<autodesk.compute:node-2.0.0>": {
												computeNodes: {
													modify: {
														"autodesk.test:testCN-1.0.0": {
															"1e924300-92ef-eaad-391f-53b77fe01099": {
																"enum<Enum>": { status: 1 },
																"autodesk.compute:context-1.0.0": {
																	computeContext: {
																		"Reference<autodesk.compute:resource-2.0.0>": {
																			resource: "/c1a811ea-608e-5fcc-1487-c74ab6939dee",
																		},
																	},
																},
																"Reference<autodesk.core:user-1.0.0>": {
																	"inputs.input":
																		"/5eb6ebe1-92c8-52fa-984b-b0b65c46d2a7.computeNodes[a7e7d213-1202-9ee4-a3c1-8a33d6f36122]" +
																		".intermediateProperties[2c06da5c-8614-e9c2-3bd6-75ae739eba4f]",
																},
															},
														},
													},
												},
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
		var parent = {
			insert: {
				"autodesk.compute:graph-1.0.0": {
					"5eb6ebe1-92c8-52fa-984b-b0b65c46d2a7": {
						"map<autodesk.compute:node-2.0.0>": {
							computeNodes: {
								insert: {
									"autodesk.compute:fanOut-1.0.0": {
										"a7e7d213-1202-9ee4-a3c1-8a33d6f36122": {
											"autodesk.compute:context-1.0.0": {
												computeContext: {
													"Reference<autodesk.compute:resource-2.0.0>": {
														resource: "",
													},
												},
											},
											"map<autodesk.compute:node-2.0.0>": {
												computeNodes: {
													insert: {
														"autodesk.test:testCN-1.0.0": {
															"1e924300-92ef-eaad-391f-53b77fe01099": {
																"enum<Enum>": { status: 0 },
																"autodesk.compute:context-1.0.0": {
																	computeContext: {
																		"Reference<autodesk.compute:resource-2.0.0>": {
																			resource: "",
																		},
																	},
																},
																"Reference<autodesk.core:user-1.0.0>": { "inputs.input": "" },
															},
														},
													},
												},
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

		var b = new ChangeSet(cs);
		b._toReversibleChangeSet(parent);
	});
});
