/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* globals sinon */

const { MSG } = require("@fluid-experimental/property-common").constants;
const { generateGUID } = require("@fluid-experimental/property-common").GuidUtils;

const { PropertyFactory } = require("..");
const { StringProperty } = require("../properties/stringProperty");

describe("PropertyFactory", function () {
	beforeEach(() => {
		PropertyFactory._clear();
	});

	let SimplePoint = {
		typeid: "SimpleTest:PointID-1.0.0",
		properties: [
			{
				id: "position",
				properties: [
					{
						id: "x",
						typeid: "Float32",
					},
					{
						id: "y",
						typeid: "Float32",
					},
					{
						id: "z",
						typeid: "Float32",
					},
				],
			},
			{
				id: "normal",
				typeid: "Float32",
				context: "array",
				size: 3,
			},
		],
	};

	it("is not a function.", function (done) {
		expect(PropertyFactory).to.not.be.a("function");
		expect(PropertyFactory).to.be.an("object");
		done();
	});

	it("should validate a simple file", function () {
		var testFile1 = require("./validation/goodPointId");
		var result = PropertyFactory.validate(testFile1);
		expect(result.isValid).to.equal(true);
	});

	it("should fail an invalid file", function () {
		var testFile1 = require("./validation/badPrimitiveTypeid");
		var result = PropertyFactory.validate(testFile1);
		expect(result.isValid).to.equal(false);
		expect(result.errors.length).to.be.greaterThan(0);
		expect(result.unresolvedTypes.length).to.equal(1);
	});

	it("should create and initialize a property set", function () {
		PropertyFactory.register(SimplePoint);
		var goodPointTest = PropertyFactory.create("SimpleTest:PointID-1.0.0");
		expect(goodPointTest.resolvePath("normal")._dataArrayRef._buffer.length).to.equal(3);

		var goodPoint = PropertyFactory.create("SimpleTest:PointID-1.0.0", null, {
			position: {
				x: 0.0,
				y: 1.0,
				z: 2.0,
			},
			normal: [1.23, 2.3399999141693115, 3.45],
		});

		expect(goodPoint.resolvePath("normal").get(1)).to.equal(2.3399999141693115);
	});

	it("should throw on unknown Template", function () {
		var insertUnknownPropertyChangeSet = {
			insert: {
				UnknownProperty: {
					test: {
						String: {
							unknownStringProperty: "Hi There!",
						},
					},
				},
			},
		};
		var root = PropertyFactory.create("NodeProperty");
		expect(function () {
			root.deserialize(insertUnknownPropertyChangeSet);
		}).to.throw();
	});

	it("should throw when trying to create with undefined as typeid", function () {
		var creationFunction = function () {
			PropertyFactory.create(undefined);
		};
		expect(creationFunction).to.throw(MSG.UNKNOWN_TYPEID_SPECIFIED + "undefined");
	});

	it("should throw when trying to create with a number as typeid", function () {
		var creationFunction = function () {
			PropertyFactory.create(1);
		};
		expect(creationFunction).to.throw(MSG.UNKNOWN_TYPEID_SPECIFIED + "1");
	});

	it("should support the creation of a polymorphic collection", function () {
		var testSet = {
			typeid: "autodesk.examples:test.set-1.0.0",
			inherits: "NamedProperty",
		};
		PropertyFactory.register(testSet);

		var testTemplate = {
			typeid: "autodesk.examples:polymorphic.collection.test-1.0.0",
			properties: [
				{ id: "testMap", context: "map" },
				{ id: "testSet", typeid: "autodesk.examples:test.set-1.0.0", context: "set" },
				// TODO: add array as soon as polymorphic arrays are supported: {id: 'testArray', context:'array' }
			],
		};

		PropertyFactory._reregister(testTemplate);
		var instance = PropertyFactory.create(
			"autodesk.examples:polymorphic.collection.test-1.0.0",
		);

		expect(instance._properties.testMap).to.exist;
		expect(instance._properties.testMap.getContext()).to.equal("map");
		expect(instance._properties.testMap.getTypeid()).to.equal("BaseProperty");

		expect(instance._properties.testSet).to.exist;
		expect(instance._properties.testSet.getContext()).to.equal("set");
		expect(
			PropertyFactory.inheritsFrom(instance._properties.testSet.getTypeid(), "NamedProperty"),
		).to.equal(true);
	});

	it("should return correct template based on typeid", function () {
		PropertyFactory.register(SimplePoint);
		var returnedTemplate = JSON.parse(
			JSON.stringify(PropertyFactory.getTemplate(SimplePoint.typeid)),
		);
		if (!SimplePoint.annotation) {
			delete returnedTemplate.annotation;
		}
		if (!SimplePoint.length) {
			delete returnedTemplate.length;
		}
		delete returnedTemplate._serializedParams;

		expect(returnedTemplate).to.deep.equal(SimplePoint);
		expect(PropertyFactory.getTemplate("Adsk.Library:Colors.ColorPalette-1.0.0")).to.be
			.undefined;
	});

	describe("Inheritance", function () {
		beforeEach(function () {
			PropertyFactory._clear();

			var Shape = {
				typeid: "SimpleTest:Shape-1.0.0",
				properties: [
					{
						id: "props",
						properties: [
							{ id: "x", typeid: "Float32" },
							{ id: "y", typeid: "Float32" },
							{
								id: "size",
								properties: [
									{ id: "width", typeid: "Float32" },
									{ id: "height", typeid: "Float32" },
									{
										id: "border",
										properties: [{ id: "weight", typeid: "Int32" }],
									},
								],
							},
						],
					},
				],
			};
			PropertyFactory.register(Shape);

			var Color = {
				typeid: "SimpleTest:Color-1.0.0",
				properties: [
					{ id: "stroke", typeid: "String" },
					{
						id: "fill",
						properties: [{ id: "rgb", typeid: "String" }],
					},
				],
			};
			PropertyFactory.register(Color);

			var EntryWithOverriddenDefaults = {
				typeid: "SimpleTest:EntryWithOverriddenDefaults-1.0.0",
				inherits: ["NamedProperty"],
				properties: [{ id: "string", typeid: "String", value: "entry_string" }],
			};
			PropertyFactory.register(EntryWithOverriddenDefaults);

			var EntryWithOverriddenPolyDefaults = {
				typeid: "SimpleTest:EntryWithOverriddenPolyDefaults-1.0.0",
				inherits: ["SimpleTest:EntryWithOverriddenDefaults-1.0.0"],
				properties: [{ id: "string", typeid: "String", value: "entry_string" }],
			};
			PropertyFactory.register(EntryWithOverriddenPolyDefaults);

			var DynamicWithOverriddenDefaults = {
				typeid: "SimpleTest:DynamicWithOverriddenDefaults-1.0.0",
				properties: [
					{ id: "num", typeid: "Uint32" },
					{
						id: "dynamic",
						properties: [{ id: "dynamic_string", typeid: "String" }],
					},
				],
			};
			PropertyFactory.register(DynamicWithOverriddenDefaults);
		});

		it("should allow the creation of an inherited type", function () {
			var Square = {
				typeid: "SimpleTest:Square-1.0.0",
				inherits: ["SimpleTest:Shape-1.0.0"],
				properties: [{ id: "area", typeid: "Float32" }],
			};

			PropertyFactory.register(Square);

			var square = PropertyFactory.create("SimpleTest:Square-1.0.0");

			expect(square._getChildrenCount()).to.equal(2);
			expect(square.get("props")).to.exist;
			expect(square.get("area")).to.exist;
		});

		it("should inherit constants", function () {
			var ShapeWithConstant = {
				typeid: "SimpleTest:ShapeWithConstant-1.0.0",
				inherits: ["SimpleTest:Shape-1.0.0"],
				constants: [{ id: "originX", typeid: "Int8", value: 10 }],
			};

			var SquareWithConstant = {
				typeid: "SimpleTest:SquareWithConstant-1.0.0",
				inherits: ["SimpleTest:ShapeWithConstant-1.0.0"],
				constants: [{ id: "originY", typeid: "Int8", value: 20 }],
			};

			PropertyFactory.register(ShapeWithConstant);
			PropertyFactory.register(SquareWithConstant);

			var square = PropertyFactory.create("SimpleTest:ShapeWithConstant-1.0.0");
			var square = PropertyFactory.create("SimpleTest:SquareWithConstant-1.0.0");

			expect(square._getChildrenCount()).to.equal(3);
			expect(square.get("props")).to.exist;
			expect(square.get("originX")).to.exist;
			expect(square.get("originY")).to.exist;

			expect(square.get("originX").getValue()).to.equal(10);
			expect(square.get("originY").getValue()).to.equal(20);
		});

		it("Will complete constants definition from inherited template", function () {
			var template1 = {
				typeid: "consttest:template-1.0.0",
				constants: [
					{
						id: "const1",
						typeid: "String",
						value: "hello",
						annotation: { description: "The first constant." },
					},
					{
						id: "const2",
						typeid: "String",
						value: ["hello"],
						context: "array",
						annotation: { description: "The second constant." },
					},
				],
			};

			var testedTemplate = {
				typeid: "consttest:template-2.0.0",
				inherits: "consttest:template-1.0.0",
				constants: [
					{
						id: "const1",
						value: "hello2",
					},
					{
						id: "const2",
						value: ["hello2"],
					},
				],
			};

			PropertyFactory.register(testedTemplate);
			PropertyFactory.register(template1);

			var tested = PropertyFactory.create("consttest:template-2.0.0");
			expect(tested._getChildrenCount()).to.equal(2);
			expect(tested.get("const1")).to.exist;
			expect(tested.get("const2")).to.exist;
			expect(tested.get("const1").getValue()).to.equal("hello2");
			expect(tested.get("const2").getValues()).to.deep.equal(["hello2"]);
		});

		it("Will throw because typeid is still missing at creation", function () {
			var template1 = {
				typeid: "consttest2:template-1.0.0",
				constants: [
					{
						id: "const2",
						typeid: "String",
						value: "hello",
						annotation: { description: "The first constant." },
					},
				],
			};

			var testedTemplate = {
				typeid: "consttest2:template-2.0.0",
				inherits: "consttest2:template-1.0.0",
				constants: [
					{
						id: "const1",
						value: "hello2",
					},
				],
			};

			PropertyFactory.register(template1);
			PropertyFactory.register(testedTemplate);

			try {
				PropertyFactory.create("consttest2:template-2.0.0");
			} catch (error) {
				expect(error.message).to.include(
					'PF-043: Field "typeid" is required.' +
						' It is the "typeid" of the resulting PropertySets Template.const1.typeid',
				);
			}
		});

		it("Will throw because of a type mismatch when creating template", function () {
			var template1 = {
				typeid: "consttest3:template-1.0.0",
				constants: [
					{
						id: "const1",
						typeid: "String",
						value: "hello",
						annotation: { description: "The first constant." },
					},
				],
			};

			var template2 = {
				typeid: "consttest3:template-2.0.0",
				constants: [
					{
						id: "const1",
						typeid: "Uint8",
						value: 3,
					},
				],
			};

			var testedTemplate = {
				typeid: "consttest3:template-3.0.0",
				inherits: ["consttest3:template-2.0.0", "consttest3:template-1.0.0"],
				constants: [
					{
						id: "const1",
						value: "hello2",
					},
				],
			};

			PropertyFactory.register(template2);
			PropertyFactory.register(template1);
			PropertyFactory.register(testedTemplate);

			try {
				PropertyFactory.create("consttest3:template-3.0.0");
			} catch (error) {
				expect(error.message).to.include("PF-001: Id already exists: const1");
			}
		});

		it("Will fail if inheriting constants with the same id from multiple templates", function () {
			var template1 = {
				typeid: "consttest4:template-1.0.0",
				constants: [
					{
						id: "const1",
						typeid: "String",
						value: "hello",
					},
					{
						id: "const2",
						typeid: "Uint8",
						value: 5,
					},
				],
			};

			var template2 = {
				typeid: "consttest4:template-2.0.0",
				constants: [
					{
						id: "const1",
						typeid: "String",
						value: "bye",
						annotation: { description: "The first constant." },
					},
				],
			};

			var testedTemplate = {
				typeid: "consttest4:template-3.0.0",
				inherits: ["consttest4:template-1.0.0", "consttest4:template-2.0.0"],
				constants: [
					{
						id: "const1",
						value: "hello2",
					},
					{
						id: "const2",
						value: 14,
					},
				],
			};

			PropertyFactory.register(testedTemplate);
			PropertyFactory.register(template1);
			PropertyFactory.register(template2);

			expect(
				PropertyFactory.create.bind(PropertyFactory, "consttest4:template-3.0.0"),
			).to.throw(MSG.OVERWRITING_ID + "const1");
		});

		it("Will allow to register the same inherited template again", function () {
			var template1 = {
				typeid: "consttest5:template-1.0.0",
				constants: [
					{
						id: "const1",
						typeid: "String",
						value: "hello",
						annotation: { description: "The first constant." },
					},
				],
			};

			var testedTemplate = {
				typeid: "consttest5:template-2.0.0",
				inherits: "consttest5:template-1.0.0",
				constants: [
					{
						id: "const1",
						value: "hello2",
					},
				],
			};

			PropertyFactory.register(template1);
			PropertyFactory.register(testedTemplate);
			PropertyFactory.register(testedTemplate);
		});

		it("Will not allow to register a different template under the same id", function () {
			var template1 = {
				typeid: "consttest6:template-1.0.0",
				constants: [
					{
						id: "const1",
						typeid: "String",
						value: "hello",
						annotation: { description: "The first constant." },
					},
				],
			};

			var testedTemplate = {
				typeid: "consttest6:template-2.0.0",
				inherits: "consttest6:template-1.0.0",
				constants: [
					{
						id: "const1",
						value: "hello2",
					},
				],
			};

			var testedTemplate2 = {
				typeid: "consttest6:template-2.0.0",
				inherits: "consttest6:template-1.0.0",
				constants: [
					{
						id: "const1",
						value: "hello3",
					},
				],
			};

			try {
				PropertyFactory.register(template1);
				PropertyFactory.register(testedTemplate);
				PropertyFactory.register(testedTemplate2);
				throw new Error("Should have failed");
			} catch (error) {
				expect(error.message).to.include(
					"PF-004: Template structures do not match for typeid: consttest6:template-2.0.0",
				);
			}
		});

		it("Wont register if constant id is missing", function () {
			var template1 = {
				typeid: "consttest7:template-1.0.0",
				constants: [
					{
						id: "const1",
						typeid: "String",
						value: "hello",
						annotation: { description: "The first constant." },
					},
				],
			};

			var testedTemplate = {
				typeid: "consttest7:template-2.0.0",
				inherits: "consttest7:template-1.0.0",
				constants: [
					{
						value: "hello2",
					},
				],
			};

			try {
				PropertyFactory.register(template1);
				PropertyFactory.register(testedTemplate);
				throw new Error("Should have failed");
			} catch (error) {
				expect(error.message).to.include(
					"PF-050: Failed to register typeid = consttest7:template-2.0.0",
				);
			}
		});

		it("should allow inheriting from schemas with no properties defined", function () {
			var ShapeAbstract1 = {
				typeid: "SimpleTest:ShapeAbstract1-1.0.0",
			};

			var ShapeAbstract2 = {
				typeid: "SimpleTest:ShapeAbstract2-1.0.0",
				properties: [{ id: "area", properties: [] }, { id: "color" }],
			};

			var SquareAbstract = {
				typeid: "SimpleTest:SquareAbstract-1.0.0",
				inherits: ["SimpleTest:ShapeAbstract1-1.0.0", "SimpleTest:ShapeAbstract2-1.0.0"],
				properties: [
					{ id: "originX", properties: [] },
					{ id: "originY" },
					{
						id: "color",
						properties: [{ id: "rgb", typeid: "Int64" }],
					},
				],
			};

			PropertyFactory.register(ShapeAbstract1);
			PropertyFactory.register(ShapeAbstract2);
			PropertyFactory.register(SquareAbstract);

			var square = PropertyFactory.create("SimpleTest:SquareAbstract-1.0.0");

			expect(square._getChildrenCount()).to.equal(4);
			expect(square.get("area")).to.exist;
			expect(square.get("color")).to.exist;
			expect(square.get("originX")).to.exist;
			expect(square.get("originY")).to.exist;
			expect(square.get(["color", "rgb"])).to.exist;
		});

		it("should allow multiple inheritance", function () {
			var SquareWithColor = {
				typeid: "SimpleTest:SquareWithColor-1.0.0",
				inherits: ["SimpleTest:Shape-1.0.0", "SimpleTest:Color-1.0.0"],
				properties: [{ id: "area", typeid: "Float32" }],
			};

			PropertyFactory.register(SquareWithColor);

			var square = PropertyFactory.create("SimpleTest:SquareWithColor-1.0.0");

			expect(square._getChildrenCount()).to.equal(4);
			expect(square.get("area")).to.exist;
			expect(square.get("props")).to.exist;
			expect(square.get("stroke")).to.exist;
			expect(square.get("fill")).to.exist;
		});

		it("should fail when inheriting from multiple types that have the same property name", function () {
			var Point = {
				typeid: "SimpleTest:Point-1.0.0",
				properties: [
					{
						id: "props",
						properties: [
							{ id: "x", typeid: "Float32" },
							{ id: "y", typeid: "Float32" },
						],
					},
				],
			};

			var ShapeWithInheritanceError = {
				typeid: "SimpleTest:ShapeWithInheritanceError-1.0.0",
				inherits: ["SimpleTest:Shape-1.0.0", "SimpleTest:Point-1.0.0"],
				properties: [{ id: "weight", typeid: "Float32" }],
			};

			PropertyFactory.register(Point);
			PropertyFactory.register(ShapeWithInheritanceError);

			expect(
				PropertyFactory.create.bind(
					PropertyFactory,
					"SimpleTest:ShapeWithInheritanceError-1.0.0",
				),
			).to.throw(MSG.OVERWRITING_ID + "props");
		});

		it("should fail when overriding an inherited typed property", function () {
			var ShapeWithOverridesError = {
				typeid: "SimpleTest:ShapeWithOverridesError-1.0.0",
				inherits: ["SimpleTest:Shape-1.0.0"],
				properties: [{ id: "props", typeid: "Float32" }],
			};

			PropertyFactory.register(ShapeWithOverridesError);

			expect(
				PropertyFactory.create.bind(
					PropertyFactory,
					"SimpleTest:ShapeWithOverridesError-1.0.0",
				),
			).to.throw(MSG.OVERRIDEN_PROP_MUST_HAVE_SAME_FIELD_VALUES_AS_BASE_TYPE);
		});

		it("should allow extending inherited nested untyped properties", function () {
			var SquareWithOverrides = {
				typeid: "SimpleTest:SquareWithOverrides-1.0.0",
				inherits: ["SimpleTest:Shape-1.0.0", "SimpleTest:Color-1.0.0"],
				properties: [
					{ id: "normal", typeid: "Float32", context: "array", size: 3 },
					{
						id: "props",
						properties: [
							{ id: "z", typeid: "Float32" },
							{
								id: "size",
								properties: [
									{ id: "unit", typeid: "Int32" },
									{
										id: "border",
										properties: [{ id: "color", typeid: "String" }],
									},
								],
							},
						],
					},
					{
						id: "fill",
						properties: [{ id: "unit", typeid: "Int32" }],
					},
				],
			};

			PropertyFactory.register(SquareWithOverrides);

			var square = PropertyFactory.create("SimpleTest:SquareWithOverrides-1.0.0");

			expect(square._getChildrenCount()).to.equal(4);
			expect(square.get("normal")).to.exist;
			expect(square.get("props")).to.exist;
			expect(square.get("stroke")).to.exist;
			expect(square.get("fill")).to.exist;

			expect(square.get("props")._getChildrenCount()).to.equal(4);
			expect(square.get(["props", "x"])).to.exist;
			expect(square.get(["props", "y"])).to.exist;
			expect(square.get(["props", "z"])).to.exist;
			expect(square.get(["props", "size"])).to.exist;

			expect(square.get(["props", "size"])._getChildrenCount()).to.equal(4);
			expect(square.get(["props", "size", "unit"])).to.exist;
			expect(square.get(["props", "size", "border"])).to.exist;
			expect(square.get(["props", "size", "width"])).to.exist;
			expect(square.get(["props", "size", "height"])).to.exist;

			expect(square.get(["props", "size", "border"])._getChildrenCount()).to.equal(2);
			expect(square.get(["props", "size", "border", "color"])).to.exist;
			expect(square.get(["props", "size", "border", "weight"])).to.exist;

			expect(square.get("fill")._getChildrenCount()).to.equal(2);
			expect(square.get(["fill", "rgb"])).to.exist;
			expect(square.get(["fill", "unit"])).to.exist;
		});

		it("should support more than one level of inheritance", function () {
			var ShapeWithArea = {
				typeid: "SimpleTest:ShapeWithArea-1.0.0",
				inherits: ["SimpleTest:Shape-1.0.0"],
				properties: [
					{
						id: "props",
						properties: [
							{
								id: "area",
								properties: [{ id: "length", typeid: "Float32" }],
							},
						],
					},
				],
			};

			var SquareWithArea = {
				typeid: "SimpleTest:SquareWithArea-1.0.0",
				inherits: ["SimpleTest:ShapeWithArea-1.0.0"],
				properties: [
					{ id: "normal", typeid: "String" },
					{
						id: "props",
						properties: [
							{ id: "color", typeid: "String" },
							{
								id: "area",
								properties: [{ id: "unit", typeid: "String" }],
							},
						],
					},
				],
			};

			PropertyFactory.register(ShapeWithArea);
			PropertyFactory.register(SquareWithArea);

			var square = PropertyFactory.create("SimpleTest:SquareWithArea-1.0.0");

			expect(square._getChildrenCount()).to.equal(2);
			expect(square.get("normal")).to.exist;
			expect(square.get("props")).to.exist;

			expect(square.get("props")._getChildrenCount()).to.equal(5);
			expect(square.get(["props", "x"])).to.exist;
			expect(square.get(["props", "y"])).to.exist;
			expect(square.get(["props", "size"])).to.exist;
			expect(square.get(["props", "color"])).to.exist;
			expect(square.get(["props", "area"])).to.exist;

			expect(square.get(["props", "area"])._getChildrenCount()).to.equal(2);
			expect(square.get(["props", "area", "unit"])).to.exist;
			expect(square.get(["props", "area", "length"])).to.exist;
		});

		it('should work with properties named "length"', function () {
			var DefaultInitialValue = {
				typeid: "autodesk.product:components.physicalProperties-0.0.0",
				properties: [
					{
						id: "mass",
						properties: [
							{
								id: "value",
								typeid: "Float64",
							},
							{
								id: "unit",
								typeid: "String",
							},
						],
					},
					{
						id: "boundingBox",
						properties: [
							{
								id: "length",
								typeid: "Float64",
							},
							{
								id: "width",
								typeid: "Float64",
							},
							{
								id: "height",
								typeid: "Float64",
							},
							{
								id: "unit",
								typeid: "String",
							},
						],
					},
					{
						id: "material",
						typeid: "String",
					},
				],
				annotation: {
					description:
						"Specialized component storing physical properties computed from a model.",
				},
			};

			PropertyFactory.register(DefaultInitialValue);

			var prop = PropertyFactory.create(
				"autodesk.product:components.physicalProperties-0.0.0",
				null,
				{
					mass: {
						value: 1.2,
						unit: "units",
					},
					boundingBox: {
						length: 1.2,
						width: 1.4,
						height: 34.2,
						unit: "units",
					},
					material: "ABS Plastic",
				},
			);

			expect(prop.get("boundingBox").get("length").value).to.equal(1.2);
		});

		describe("Overriding default values", function () {
			it("should allow overriding default values", function () {
				var MapNestedWithOverriddenDefaults = {
					typeid: "SimpleTest:MapNestedWithOverriddenDefaults-1.0.0",
					inherits: ["NamedProperty"],
					properties: [
						{
							id: "map_nested",
							typeid: "SimpleTest:EntryWithOverriddenDefaults-1.0.0",
							context: "map",
						},
					],
				};

				var SetNestedWithOverriddenDefaults = {
					typeid: "SimpleTest:SetNestedWithOverriddenDefaults-1.0.0",
					inherits: ["NamedProperty"],
					properties: [
						{
							id: "set_nested",
							typeid: "SimpleTest:EntryWithOverriddenDefaults-1.0.0",
							context: "set",
						},
					],
				};

				var ShapeWithOverriddenDefaults = {
					typeid: "SimpleTest:ShapeWithOverriddenDefaults-1.0.0",
					properties: [
						{ id: "num", typeid: "Int8", value: 1 },
						{
							id: "array",
							typeid: "String",
							value: ["array_string_1", "array_string_2"],
							context: "array",
						},
						{
							id: "array_poly",
							typeid: "SimpleTest:EntryWithOverriddenDefaults-1.0.0",
							context: "array",
							value: [{ string: "entry_string_poly" }],
						},
						{
							id: "enum",
							typeid: "Enum",
							properties: [
								{ id: "solid", value: 1 },
								{ id: "dashed", value: 2 },
							],
							value: "solid",
						},
						{
							id: "untyped",
							properties: [
								{ id: "num", typeid: "Uint32" },
								{ id: "string", typeid: "String" },
							],
							value: { string: "untyped_string", num: 1 },
						},
						{
							id: "template",
							typeid: "SimpleTest:DynamicWithOverriddenDefaults-1.0.0",
							value: {
								num: 1,
								dynamic: { dynamic_string: "dynamic_string" },
							},
						},
						{
							id: "map_primitive",
							typeid: "Int32",
							context: "map",
							value: {
								key1: 1,
								key3: 3,
							},
						},
						{
							id: "map",
							typeid: "SimpleTest:EntryWithOverriddenDefaults-1.0.0",
							context: "map",
							value: {
								key1: { string: "map_string_1" },
								key3: { string: "map_string_3" },
							},
						},
						{
							id: "map_poly",
							typeid: "SimpleTest:EntryWithOverriddenDefaults-1.0.0",
							context: "map",
							value: {
								key1: { string: "map_poly_string_1" },
								key3: { string: "map_poly_string_3" },
							},
						},
						{
							id: "map_nest",
							typeid: "SimpleTest:MapNestedWithOverriddenDefaults-1.0.0",
							context: "map",
							value: {
								key1: {
									map_nested: {
										key1_1: { string: "map_nested_1_string_1" },
										key1_3: { string: "map_nested_1_string_3" },
									},
								},
								key3: {
									map_nested: {
										key3_1: { string: "map_nested_3_string_1" },
									},
								},
							},
						},
						{
							id: "set",
							typeid: "SimpleTest:EntryWithOverriddenDefaults-1.0.0",
							context: "set",
							value: [{ string: "set_string_1" }, { string: "set_string_2" }],
						},
						{
							id: "set_poly",
							typeid: "SimpleTest:EntryWithOverriddenDefaults-1.0.0",
							context: "set",
							value: [{ string: "set_poly_string_1" }, { string: "set_poly_string_1" }],
						},
						{
							id: "set_nest",
							typeid: "SimpleTest:SetNestedWithOverriddenDefaults-1.0.0",
							context: "set",
							value: [
								{
									set_nested: [
										{ string: "set_nested_1_string_1" },
										{ string: "set_nested_1_string_2" },
									],
								},
								{
									set_nested: [
										{ string: "set_nested_3_string_1" },
										{ string: "set_nested_3_string_2" },
									],
								},
							],
						},
					],
				};

				var SquareWithOverriddenDefaults = {
					typeid: "SimpleTest:SquareWithOverriddenDefaults-1.0.0",
					inherits: ["SimpleTest:ShapeWithOverriddenDefaults-1.0.0"],
					properties: [
						{ id: "num", typeid: "Int8", value: 2 },
						{
							id: "array",
							typeid: "String",
							value: ["array_string_1_inherited", "array_string_2_inherited"],
							context: "array",
						},
						{
							id: "array_poly",
							typeid: "SimpleTest:EntryWithOverriddenDefaults-1.0.0",
							context: "array",
							typedValue: [
								{
									typeid: "SimpleTest:EntryWithOverriddenPolyDefaults-1.0.0",
									value: { string: "entry_string_poly_1_inherited" },
								},
								{
									typeid: "SimpleTest:EntryWithOverriddenPolyDefaults-1.0.0",
									value: { string: "entry_string_poly_2_inherited" },
								},
							],
						},
						{
							id: "enum",
							typeid: "Enum",
							properties: [
								{ id: "solid", value: 1 },
								{ id: "dashed", value: 2 },
							],
							value: "dashed",
						},
						{
							id: "untyped",
							properties: [
								{ id: "num", typeid: "Uint32" },
								{ id: "string", typeid: "String" },
							],
							value: { string: "untyped_string_inherited", num: 2 },
						},
						{
							id: "template",
							typeid: "SimpleTest:DynamicWithOverriddenDefaults-1.0.0",
							value: {
								num: 2,
								dynamic: { dynamic_string: "dynamic_string_inherited" },
							},
						},
						{
							id: "map_primitive",
							typeid: "Int32",
							context: "map",
							value: {
								key2: 2,
								key3: 3,
							},
						},
						{
							id: "map",
							typeid: "SimpleTest:EntryWithOverriddenDefaults-1.0.0",
							context: "map",
							value: {
								key2: { string: "map_string_2_inherited" },
								key3: { string: "map_string_3_inherited" },
							},
						},
						{
							id: "map_poly",
							typeid: "SimpleTest:EntryWithOverriddenDefaults-1.0.0",
							context: "map",
							typedValue: {
								key2: {
									typeid: "SimpleTest:EntryWithOverriddenPolyDefaults-1.0.0",
									value: { string: "map_poly_string_2_inherited" },
								},
								key3: {
									typeid: "SimpleTest:EntryWithOverriddenPolyDefaults-1.0.0",
									value: { string: "map_poly_string_3_inherited" },
								},
							},
						},
						{
							id: "map_nest",
							typeid: "SimpleTest:MapNestedWithOverriddenDefaults-1.0.0",
							context: "map",
							value: {
								key2: {
									map_nested: {
										key2_2: { string: "map_nested_2_string_2_inherited" },
										key2_3: { string: "map_nested_2_string_3_inherited" },
									},
								},
								key3: {
									map_nested: {
										key3_1: { string: "map_nested_3_string_1_inherited" },
									},
								},
							},
						},
						{
							id: "set",
							typeid: "SimpleTest:EntryWithOverriddenDefaults-1.0.0",
							context: "set",
							value: [
								{ string: "set_string_2_inherited" },
								{ string: "set_string_3_inherited" },
							],
						},
						{
							id: "set_poly",
							typeid: "SimpleTest:EntryWithOverriddenDefaults-1.0.0",
							context: "set",
							typedValue: [
								{
									typeid: "SimpleTest:EntryWithOverriddenDefaults-1.0.0",
									value: { string: "set_poly_string_2_inherited" },
								},
								{
									typeid: "SimpleTest:EntryWithOverriddenDefaults-1.0.0",
									value: { string: "set_poly_string_3_inherited" },
								},
							],
						},
						{
							id: "set_nest",
							typeid: "SimpleTest:SetNestedWithOverriddenDefaults-1.0.0",
							context: "set",
							value: [
								{
									set_nested: [
										{ string: "set_nested_2_string_1_inherited" },
										{ string: "set_nested_2_string_2_inherited" },
									],
								},
							],
						},
					],
				};

				PropertyFactory.register(MapNestedWithOverriddenDefaults);
				PropertyFactory.register(SetNestedWithOverriddenDefaults);
				PropertyFactory.register(ShapeWithOverriddenDefaults);
				PropertyFactory.register(SquareWithOverriddenDefaults);

				var instance = PropertyFactory.create("SimpleTest:SquareWithOverriddenDefaults-1.0.0");

				expect(instance._getChildrenCount()).to.equal(13);
				expect(instance.resolvePath("num").getValue()).and.eql(2);
				expect(instance.resolvePath("array").getValues()).and.eql([
					"array_string_1_inherited",
					"array_string_2_inherited",
				]);
				expect(instance.resolvePath("array_poly").getValues().length).to.eql(2);
				expect(instance.resolvePath("array_poly").getValues()[0].string).to.eql(
					"entry_string_poly_1_inherited",
				);
				expect(instance.resolvePath("array_poly").getValues()[1].string).to.eql(
					"entry_string_poly_2_inherited",
				);
				expect(instance.resolvePath("enum").getValue()).and.eql(2);
				expect(instance.resolvePath("untyped.num").getValue()).and.eql(2);
				expect(instance.resolvePath("untyped.string").getValue()).and.eql(
					"untyped_string_inherited",
				);
				expect(instance.resolvePath("template.num").getValue()).and.eql(2);
				expect(instance.resolvePath("template.dynamic.dynamic_string").getValue()).and.eql(
					"dynamic_string_inherited",
				);
				expect(instance.resolvePath("map_primitive").getIds().length).to.equal(2);
				expect(instance.resolvePath("map_primitive").getEntriesReadOnly().key2).to.equal(2);
				expect(instance.resolvePath("map_primitive").getEntriesReadOnly().key3).to.equal(3);
				expect(instance.resolvePath("map").getIds().length).to.equal(2);
				expect(
					instance.resolvePath("map").getEntriesReadOnly().key2.get("string").getValue(),
				).to.equal("map_string_2_inherited");
				expect(
					instance.resolvePath("map").getEntriesReadOnly().key3.get("string").getValue(),
				).to.equal("map_string_3_inherited");
				expect(instance.resolvePath("map_poly").getIds().length).to.equal(2);
				expect(
					instance.resolvePath("map_poly").getEntriesReadOnly().key2.get("string").getValue(),
				).to.equal("map_poly_string_2_inherited");
				expect(
					instance.resolvePath("map_poly").getEntriesReadOnly().key3.get("string").getValue(),
				).to.equal("map_poly_string_3_inherited");
				expect(instance.resolvePath("map_nest").getIds().length).to.equal(2);
				expect(
					instance.resolvePath("map_nest").getEntriesReadOnly().key2.get("map_nested").getIds()
						.length,
				).to.equal(2);
				expect(
					instance
						.resolvePath("map_nest")
						.getEntriesReadOnly()
						.key2.get("map_nested")
						.getAsArray().length,
				).to.equal(2);
				expect(
					instance
						.resolvePath("map_nest")
						.getEntriesReadOnly()
						.key2.get("map_nested")
						.getAsArray()[0]
						.get("string")
						.getValue(),
				).to.equal("map_nested_2_string_2_inherited");
				expect(
					instance
						.resolvePath("map_nest")
						.getEntriesReadOnly()
						.key2.get("map_nested")
						.getAsArray()[1]
						.get("string")
						.getValue(),
				).to.equal("map_nested_2_string_3_inherited");
				expect(
					instance.resolvePath("map_nest").getEntriesReadOnly().key3.get("map_nested").getIds()
						.length,
				).to.equal(1);
				expect(
					instance
						.resolvePath("map_nest")
						.getEntriesReadOnly()
						.key3.get("map_nested")
						.getAsArray()[0]
						.get("string")
						.getValue(),
				).to.equal("map_nested_3_string_1_inherited");
				expect(instance.resolvePath("set").getIds().length).to.equal(2);
				expect(instance.resolvePath("set").getAsArray()[0].get("string").getValue()).to.equal(
					"set_string_2_inherited",
				);
				expect(instance.resolvePath("set").getAsArray()[1].get("string").getValue()).to.equal(
					"set_string_3_inherited",
				);
				expect(instance.resolvePath("set_poly").getIds().length).to.equal(2);
				expect(
					instance.resolvePath("set_poly").getAsArray()[0].get("string").getValue(),
				).to.equal("set_poly_string_2_inherited");
				expect(
					instance.resolvePath("set_poly").getAsArray()[1].get("string").getValue(),
				).to.equal("set_poly_string_3_inherited");
				expect(instance.resolvePath("set_nest").getIds().length).to.equal(1);
				expect(
					instance.resolvePath("set_nest").getAsArray()[0].get("set_nested").getIds().length,
				).to.equal(2);
				expect(
					instance
						.resolvePath("set_nest")
						.getAsArray()[0]
						.get("set_nested")
						.getAsArray()[0]
						.get("string")
						.getValue(),
				).to.equal("set_nested_2_string_1_inherited");
				expect(
					instance
						.resolvePath("set_nest")
						.getAsArray()[0]
						.get("set_nested")
						.getAsArray()[1]
						.get("string")
						.getValue(),
				).to.equal("set_nested_2_string_2_inherited");
			});

			it("should not allow overriding default values when typeid is different", function () {
				var ShapeWithDiffTypeidDefaults = {
					typeid: "SimpleTest:ShapeWithDiffTypeidDefaults-1.0.0",
					properties: [{ id: "num", typeid: "Int8", value: 1 }],
				};

				var SquareWithDiffTypeidDefaults = {
					typeid: "SimpleTest:SquareWithDiffTypeidDefaults-1.0.0",
					inherits: ["SimpleTest:ShapeWithDiffTypeidDefaults-1.0.0"],
					properties: [{ id: "num", typeid: "Int32", value: 2 }],
				};

				PropertyFactory.register(ShapeWithDiffTypeidDefaults);
				PropertyFactory.register(SquareWithDiffTypeidDefaults);

				expect(
					PropertyFactory.create.bind(
						PropertyFactory,
						"SimpleTest:SquareWithDiffTypeidDefaults-1.0.0",
					),
				).to.throw(MSG.OVERRIDEN_PROP_MUST_HAVE_SAME_FIELD_VALUES_AS_BASE_TYPE);
			});

			it("should not allow overriding default values when context is different", function () {
				var ShapeWithDiffContextDefaults = {
					typeid: "SimpleTest:ShapeWithDiffContextDefaults-1.0.0",
					properties: [{ id: "num", typeid: "Int8", value: 1 }],
				};

				var SquareWithDiffContextDefaults = {
					typeid: "SimpleTest:SquareWithDiffContextDefaults-1.0.0",
					inherits: ["SimpleTest:ShapeWithDiffContextDefaults-1.0.0"],
					properties: [{ id: "num", typeid: "Int8", value: [1, 2], context: "array" }],
				};

				PropertyFactory.register(ShapeWithDiffContextDefaults);
				PropertyFactory.register(SquareWithDiffContextDefaults);

				expect(
					PropertyFactory.create.bind(
						PropertyFactory,
						"SimpleTest:SquareWithDiffContextDefaults-1.0.0",
					),
				).to.throw(MSG.OVERRIDEN_PROP_MUST_HAVE_SAME_FIELD_VALUES_AS_BASE_TYPE);
			});
		});

		describe("Overriding constants", function () {
			it("should allow overriding constants", function () {
				var EntryWithOverriddenConstants = {
					typeid: "SimpleTest:EntryWithOverriddenConstants-1.0.0",
					inherits: ["NamedProperty"],
					constants: [{ id: "string", typeid: "String", value: "entry_string" }],
				};

				var EntryWithOverriddenPolyConstants = {
					typeid: "SimpleTest:EntryWithOverriddenPolyConstants-1.0.0",
					inherits: ["SimpleTest:EntryWithOverriddenConstants-1.0.0"],
					constants: [{ id: "string", typeid: "String", value: "entry_string" }],
				};

				var DynamicWithOverriddenConstants = {
					typeid: "SimpleTest:DynamicWithOverriddenConstants-1.0.0",
					constants: [{ id: "num", typeid: "Uint32", value: 1 }],
					properties: [
						{
							id: "dynamic",
							properties: [{ id: "dynamic_string", typeid: "String" }],
						},
					],
				};

				var MapNestedWithOverriddenConstants = {
					typeid: "SimpleTest:MapNestedWithOverriddenConstants-1.0.0",
					inherits: ["NamedProperty"],
					constants: [
						{
							id: "map_nested",
							typeid: "SimpleTest:EntryWithOverriddenConstants-1.0.0",
							context: "map",
							value: {},
						},
					],
				};

				var SetNestedWithOverriddenConstants = {
					typeid: "SimpleTest:SetNestedWithOverriddenConstants-1.0.0",
					inherits: ["NamedProperty"],
					constants: [
						{
							id: "set_nested",
							typeid: "SimpleTest:EntryWithOverriddenConstants-1.0.0",
							context: "set",
							value: [],
						},
					],
				};

				var ShapeWithOverriddenConstants = {
					typeid: "SimpleTest:ShapeWithOverriddenConstants-1.0.0",
					constants: [
						{ id: "num", typeid: "Int8", value: 1 },
						{
							id: "array",
							typeid: "String",
							value: ["array_string_1", "array_string_2"],
							context: "array",
						},
						{
							id: "array_poly",
							typeid: "SimpleTest:EntryWithOverriddenConstants-1.0.0",
							context: "array",
							value: [{ string: "entry_string_poly" }],
						},
						{
							id: "template",
							typeid: "SimpleTest:DynamicWithOverriddenConstants-1.0.0",
							value: {
								num: 1,
								dynamic: { dynamic_string: "dynamic_string" },
							},
						},
						{
							id: "map_primitive",
							typeid: "Int32",
							context: "map",
							value: {
								key1: 1,
								key3: 3,
							},
						},
						{
							id: "map",
							typeid: "SimpleTest:EntryWithOverriddenConstants-1.0.0",
							context: "map",
							value: {
								key1: { string: "map_string_1" },
								key3: { string: "map_string_3" },
							},
						},
						{
							id: "map_poly",
							typeid: "SimpleTest:EntryWithOverriddenConstants-1.0.0",
							context: "map",
							value: {
								key1: { string: "map_poly_string_1" },
								key3: { string: "map_poly_string_3" },
							},
						},
						{
							id: "map_nest",
							typeid: "SimpleTest:MapNestedWithOverriddenConstants-1.0.0",
							context: "map",
							value: {
								key1: {
									map_nested: {
										key1_1: { string: "map_nested_1_string_1" },
										key1_3: { string: "map_nested_1_string_3" },
									},
								},
								key3: {
									map_nested: {
										key3_1: { string: "map_nested_3_string_1" },
									},
								},
							},
						},
						{
							id: "set",
							typeid: "SimpleTest:EntryWithOverriddenConstants-1.0.0",
							context: "set",
							value: [{ string: "set_string_1" }, { string: "set_string_2" }],
						},
						{
							id: "set_poly",
							typeid: "SimpleTest:EntryWithOverriddenConstants-1.0.0",
							context: "set",
							value: [{ string: "set_poly_string_1" }, { string: "set_poly_string_1" }],
						},
						{
							id: "set_nest",
							typeid: "SimpleTest:SetNestedWithOverriddenConstants-1.0.0",
							context: "set",
							value: [
								{
									set_nested: [
										{ string: "set_nested_1_string_1" },
										{ string: "set_nested_1_string_2" },
									],
								},
								{
									set_nested: [
										{ string: "set_nested_3_string_1" },
										{ string: "set_nested_3_string_2" },
									],
								},
							],
						},
					],
				};

				var SquareWithOverriddenConstants = {
					typeid: "SimpleTest:SquareWithOverriddenConstants-1.0.0",
					inherits: ["SimpleTest:ShapeWithOverriddenConstants-1.0.0"],
					constants: [
						{ id: "num", typeid: "Int8", value: 2 },
						{
							id: "array",
							typeid: "String",
							value: ["array_string_1_inherited", "array_string_2_inherited"],
							context: "array",
						},
						{
							id: "array_poly",
							typeid: "SimpleTest:EntryWithOverriddenConstants-1.0.0",
							context: "array",
							typedValue: [
								{
									typeid: "SimpleTest:EntryWithOverriddenPolyConstants-1.0.0",
									value: { string: "entry_string_poly_1_inherited" },
								},
								{
									typeid: "SimpleTest:EntryWithOverriddenPolyConstants-1.0.0",
									value: { string: "entry_string_poly_2_inherited" },
								},
							],
						},
						{
							id: "template",
							typeid: "SimpleTest:DynamicWithOverriddenConstants-1.0.0",
							value: {
								num: 2,
								dynamic: { dynamic_string: "dynamic_string_inherited" },
							},
						},
						{
							id: "map_primitive",
							typeid: "Int32",
							context: "map",
							value: {
								key2: 2,
								key3: 3,
							},
						},
						{
							id: "map",
							typeid: "SimpleTest:EntryWithOverriddenConstants-1.0.0",
							context: "map",
							value: {
								key2: { string: "map_string_2_inherited" },
								key3: { string: "map_string_3_inherited" },
							},
						},
						{
							id: "map_poly",
							typeid: "SimpleTest:EntryWithOverriddenConstants-1.0.0",
							context: "map",
							typedValue: {
								key2: {
									typeid: "SimpleTest:EntryWithOverriddenPolyConstants-1.0.0",
									value: { string: "map_poly_string_2_inherited" },
								},
								key3: {
									typeid: "SimpleTest:EntryWithOverriddenPolyConstants-1.0.0",
									value: { string: "map_poly_string_3_inherited" },
								},
							},
						},
						{
							id: "map_nest",
							typeid: "SimpleTest:MapNestedWithOverriddenConstants-1.0.0",
							context: "map",
							value: {
								key2: {
									map_nested: {
										key2_2: { string: "map_nested_2_string_2_inherited" },
										key2_3: { string: "map_nested_2_string_3_inherited" },
									},
								},
								key3: {
									map_nested: {
										key3_1: { string: "map_nested_3_string_1_inherited" },
									},
								},
							},
						},
						{
							id: "set",
							typeid: "SimpleTest:EntryWithOverriddenConstants-1.0.0",
							context: "set",
							value: [
								{ string: "set_string_2_inherited" },
								{ string: "set_string_3_inherited" },
							],
						},
						{
							id: "set_poly",
							typeid: "SimpleTest:EntryWithOverriddenConstants-1.0.0",
							context: "set",
							typedValue: [
								{
									typeid: "SimpleTest:EntryWithOverriddenConstants-1.0.0",
									value: { string: "set_poly_string_2_inherited" },
								},
								{
									typeid: "SimpleTest:EntryWithOverriddenConstants-1.0.0",
									value: { string: "set_poly_string_3_inherited" },
								},
							],
						},
						{
							id: "set_nest",
							typeid: "SimpleTest:SetNestedWithOverriddenConstants-1.0.0",
							context: "set",
							value: [
								{
									set_nested: [
										{ string: "set_nested_2_string_1_inherited" },
										{ string: "set_nested_2_string_2_inherited" },
									],
								},
							],
						},
					],
				};

				PropertyFactory.register(EntryWithOverriddenConstants);
				PropertyFactory.register(EntryWithOverriddenPolyConstants);
				PropertyFactory.register(DynamicWithOverriddenConstants);
				PropertyFactory.register(MapNestedWithOverriddenConstants);
				PropertyFactory.register(SetNestedWithOverriddenConstants);
				PropertyFactory.register(ShapeWithOverriddenConstants);
				PropertyFactory.register(SquareWithOverriddenConstants);

				var instance = PropertyFactory.create(
					"SimpleTest:SquareWithOverriddenConstants-1.0.0",
				);

				expect(instance._getChildrenCount()).to.equal(11);
				expect(instance.resolvePath("num").getValue()).and.eql(2);
				expect(instance.resolvePath("array").getValues()).and.eql([
					"array_string_1_inherited",
					"array_string_2_inherited",
				]);
				expect(instance.resolvePath("array_poly").getValues().length).to.eql(2);
				expect(instance.resolvePath("array_poly").getValues()[0].string).to.eql(
					"entry_string_poly_1_inherited",
				);
				expect(instance.resolvePath("array_poly").getValues()[1].string).to.eql(
					"entry_string_poly_2_inherited",
				);
				expect(instance.resolvePath("template.num").getValue()).and.eql(2);
				expect(instance.resolvePath("template.dynamic.dynamic_string").getValue()).and.eql(
					"dynamic_string_inherited",
				);
				expect(instance.resolvePath("map_primitive").getIds().length).to.equal(2);
				expect(instance.resolvePath("map_primitive").getEntriesReadOnly().key2).to.equal(2);
				expect(instance.resolvePath("map_primitive").getEntriesReadOnly().key3).to.equal(3);
				expect(instance.resolvePath("map").getIds().length).to.equal(2);
				expect(
					instance.resolvePath("map").getEntriesReadOnly().key2.get("string").getValue(),
				).to.equal("map_string_2_inherited");
				expect(
					instance.resolvePath("map").getEntriesReadOnly().key3.get("string").getValue(),
				).to.equal("map_string_3_inherited");
				expect(instance.resolvePath("map_poly").getIds().length).to.equal(2);
				expect(
					instance.resolvePath("map_poly").getEntriesReadOnly().key2.get("string").getValue(),
				).to.equal("map_poly_string_2_inherited");
				expect(
					instance.resolvePath("map_poly").getEntriesReadOnly().key3.get("string").getValue(),
				).to.equal("map_poly_string_3_inherited");
				expect(instance.resolvePath("map_nest").getIds().length).to.equal(2);
				expect(
					instance.resolvePath("map_nest").getEntriesReadOnly().key2.get("map_nested").getIds()
						.length,
				).to.equal(2);
				expect(
					instance
						.resolvePath("map_nest")
						.getEntriesReadOnly()
						.key2.get("map_nested")
						.getAsArray().length,
				).to.equal(2);
				expect(
					instance
						.resolvePath("map_nest")
						.getEntriesReadOnly()
						.key2.get("map_nested")
						.getAsArray()[0]
						.get("string")
						.getValue(),
				).to.equal("map_nested_2_string_2_inherited");
				expect(
					instance
						.resolvePath("map_nest")
						.getEntriesReadOnly()
						.key2.get("map_nested")
						.getAsArray()[1]
						.get("string")
						.getValue(),
				).to.equal("map_nested_2_string_3_inherited");
				expect(
					instance.resolvePath("map_nest").getEntriesReadOnly().key3.get("map_nested").getIds()
						.length,
				).to.equal(1);
				expect(
					instance
						.resolvePath("map_nest")
						.getEntriesReadOnly()
						.key3.get("map_nested")
						.getAsArray()[0]
						.get("string")
						.getValue(),
				).to.equal("map_nested_3_string_1_inherited");
				expect(instance.resolvePath("set").getIds().length).to.equal(2);
				expect(instance.resolvePath("set").getAsArray()[0].get("string").getValue()).to.equal(
					"set_string_2_inherited",
				);
				expect(instance.resolvePath("set").getAsArray()[1].get("string").getValue()).to.equal(
					"set_string_3_inherited",
				);
				expect(instance.resolvePath("set_poly").getIds().length).to.equal(2);
				expect(
					instance.resolvePath("set_poly").getAsArray()[0].get("string").getValue(),
				).to.equal("set_poly_string_2_inherited");
				expect(
					instance.resolvePath("set_poly").getAsArray()[1].get("string").getValue(),
				).to.equal("set_poly_string_3_inherited");
				expect(instance.resolvePath("set_nest").getIds().length).to.equal(1);
				expect(
					instance.resolvePath("set_nest").getAsArray()[0].get("set_nested").getIds().length,
				).to.equal(2);
				expect(
					instance
						.resolvePath("set_nest")
						.getAsArray()[0]
						.get("set_nested")
						.getAsArray()[0]
						.get("string")
						.getValue(),
				).to.equal("set_nested_2_string_1_inherited");
				expect(
					instance
						.resolvePath("set_nest")
						.getAsArray()[0]
						.get("set_nested")
						.getAsArray()[1]
						.get("string")
						.getValue(),
				).to.equal("set_nested_2_string_2_inherited");
			});

			it("should allow overriding constants with typed values", function () {
				var EntryWithTypedOverriddenConstants = {
					typeid: "SimpleTest:EntryWithTypedOverriddenConstants-1.0.0",
					inherits: ["NamedProperty"],
					constants: [{ id: "string", typeid: "String", value: "entry_string" }],
				};

				var EntryWithTypedOverriddenPolyConstants = {
					typeid: "SimpleTest:EntryWithTypedOverriddenPolyConstants-1.0.0",
					inherits: ["SimpleTest:EntryWithTypedOverriddenConstants-1.0.0"],
					constants: [
						{ id: "string", typeid: "String", value: "entry_string" },
						{ id: "name", typeid: "String", value: "entry2" },
					],
				};

				var ShapeWithTypedOverriddenConstants = {
					typeid: "SimpleTest:ShapeWithTypedOverriddenConstants-1.0.0",
					constants: [
						{
							id: "entry1",
							typeid: "SimpleTest:EntryWithTypedOverriddenConstants-1.0.0",
						},
						{
							id: "entry2",
							typeid: "SimpleTest:EntryWithTypedOverriddenConstants-1.0.0",
						},
						{
							id: "array",
							typeid: "SimpleTest:EntryWithTypedOverriddenConstants-1.0.0",
							context: "array",
							value: [{ string: "entry_string" }],
						},
						{
							id: "map",
							typeid: "SimpleTest:EntryWithTypedOverriddenConstants-1.0.0",
							context: "map",
							value: {
								key1: { string: "map_string_1" },
								key3: { string: "map_string_3" },
							},
						},
						{
							id: "set",
							typeid: "SimpleTest:EntryWithTypedOverriddenConstants-1.0.0",
							context: "set",
							value: [{ string: "set_string_1" }, { string: "set_string_1" }],
						},
					],
				};

				var SquareWithTypedOverriddenConstants = {
					typeid: "SimpleTest:SquareWithTypedOverriddenConstants-1.0.0",
					inherits: ["SimpleTest:ShapeWithTypedOverriddenConstants-1.0.0"],
					constants: [
						{
							id: "entry1",
							typedValue: {
								typeid: "SimpleTest:EntryWithTypedOverriddenConstants-1.0.0",
								value: { string: "entry_string_1" },
							},
						},
						{
							id: "entry2",
							typedValue: {
								typeid: "SimpleTest:EntryWithTypedOverriddenPolyConstants-1.0.0",
								value: { string: "entry_string_2", name: "entry2" },
							},
						},
						{
							id: "array",
							context: "array",
							typedValue: [
								{
									typeid: "SimpleTest:EntryWithTypedOverriddenPolyConstants-1.0.0",
									value: {
										string: "entry_string_1_inherited",
										name: "entry_string_1",
									},
								},
								{
									typeid: "SimpleTest:EntryWithTypedOverriddenPolyConstants-1.0.0",
									value: {
										string: "entry_string_2_inherited",
										name: "entry_string_2",
									},
								},
							],
						},
						{
							id: "map",
							typeid: "SimpleTest:EntryWithTypedOverriddenConstants-1.0.0",
							context: "map",
							typedValue: {
								key2: {
									typeid: "SimpleTest:EntryWithTypedOverriddenPolyConstants-1.0.0",
									value: {
										string: "map_string_2_inherited",
										name: "map_string_2",
									},
								},
								key3: {
									typeid: "SimpleTest:EntryWithTypedOverriddenPolyConstants-1.0.0",
									value: {
										string: "map_string_3_inherited",
										name: "map_string_3",
									},
								},
							},
						},
						{
							id: "set",
							typeid: "SimpleTest:EntryWithTypedOverriddenConstants-1.0.0",
							context: "set",
							typedValue: [
								{
									typeid: "SimpleTest:EntryWithTypedOverriddenPolyConstants-1.0.0",
									value: {
										string: "set_string_2_inherited",
										name: "set_string_2",
									},
								},
								{
									typeid: "SimpleTest:EntryWithTypedOverriddenPolyConstants-1.0.0",
									value: {
										string: "set_string_3_inherited",
										name: "set_string_3",
									},
								},
							],
						},
					],
				};

				PropertyFactory.register(EntryWithTypedOverriddenConstants);
				PropertyFactory.register(EntryWithTypedOverriddenPolyConstants);
				PropertyFactory.register(ShapeWithTypedOverriddenConstants);
				PropertyFactory.register(SquareWithTypedOverriddenConstants);

				var instance = PropertyFactory.create(
					"SimpleTest:SquareWithTypedOverriddenConstants-1.0.0",
				);

				expect(instance._getChildrenCount()).to.equal(5);
				expect(instance.resolvePath("entry1").getTypeid()).to.eql(
					"SimpleTest:EntryWithTypedOverriddenConstants-1.0.0",
				);
				expect(instance.resolvePath("entry1.string").getValue()).to.eql("entry_string_1");
				expect(instance.resolvePath("entry2").getTypeid()).to.eql(
					"SimpleTest:EntryWithTypedOverriddenPolyConstants-1.0.0",
				);
				expect(instance.resolvePath("entry2.name").getValue()).to.eql("entry2");
				expect(instance.resolvePath("entry2.string").getValue()).to.eql("entry_string_2");
				expect(instance.resolvePath("array").getValues().length).to.eql(2);
				expect(instance.resolvePath("array").getValues()[0].name).to.eql("entry_string_1");
				expect(instance.resolvePath("array").getValues()[0].string).to.eql(
					"entry_string_1_inherited",
				);
				expect(instance.resolvePath("array").getValues()[1].name).to.eql("entry_string_2");
				expect(instance.resolvePath("array").getValues()[1].string).to.eql(
					"entry_string_2_inherited",
				);
				expect(instance.resolvePath("map").getIds().length).to.equal(2);
				expect(
					instance.resolvePath("map").getEntriesReadOnly().key2.get("name").getValue(),
				).to.equal("map_string_2");
				expect(
					instance.resolvePath("map").getEntriesReadOnly().key2.get("string").getValue(),
				).to.equal("map_string_2_inherited");
				expect(
					instance.resolvePath("map").getEntriesReadOnly().key3.get("name").getValue(),
				).to.equal("map_string_3");
				expect(
					instance.resolvePath("map").getEntriesReadOnly().key3.get("string").getValue(),
				).to.equal("map_string_3_inherited");
				expect(instance.resolvePath("set").getIds().length).to.equal(2);
				expect(instance.resolvePath("set").getAsArray()[0].get("name").getValue()).to.equal(
					"set_string_2",
				);
				expect(instance.resolvePath("set").getAsArray()[0].get("string").getValue()).to.equal(
					"set_string_2_inherited",
				);
				expect(instance.resolvePath("set").getAsArray()[1].get("name").getValue()).to.equal(
					"set_string_3",
				);
				expect(instance.resolvePath("set").getAsArray()[1].get("string").getValue()).to.equal(
					"set_string_3_inherited",
				);
			});

			it("should not allow overriding constants when typeid is different", function () {
				var ShapeWithDiffTypeidConstants = {
					typeid: "SimpleTest:ShapeWithDiffTypeidConstants-1.0.0",
					constants: [{ id: "num", typeid: "Int8", value: 1 }],
				};

				var SquareWithDiffTypeidConstants = {
					typeid: "SimpleTest:SquareWithDiffTypeidConstants-1.0.0",
					inherits: ["SimpleTest:ShapeWithDiffTypeidConstants-1.0.0"],
					constants: [{ id: "num", typeid: "Int32", value: 2 }],
				};

				PropertyFactory.register(ShapeWithDiffTypeidConstants);
				PropertyFactory.register(SquareWithDiffTypeidConstants);

				expect(
					PropertyFactory.create.bind(
						PropertyFactory,
						"SimpleTest:SquareWithDiffTypeidConstants-1.0.0",
					),
				).to.throw(MSG.OVERRIDEN_PROP_MUST_HAVE_SAME_FIELD_VALUES_AS_BASE_TYPE);
			});

			it("should not allow overriding constants when context is different", function () {
				var ShapeWithDiffContextConstants = {
					typeid: "SimpleTest:ShapeWithDiffContextConstants-1.0.0",
					constants: [{ id: "num", typeid: "Int8", value: 1 }],
				};

				var SquareWithDiffContextConstants = {
					typeid: "SimpleTest:SquareWithDiffContextConstants-1.0.0",
					inherits: ["SimpleTest:ShapeWithDiffContextConstants-1.0.0"],
					constants: [{ id: "num", typeid: "Int8", value: [1, 2], context: "array" }],
				};

				PropertyFactory.register(ShapeWithDiffContextConstants);
				PropertyFactory.register(SquareWithDiffContextConstants);

				expect(
					PropertyFactory.create.bind(
						PropertyFactory,
						"SimpleTest:SquareWithDiffContextConstants-1.0.0",
					),
				).to.throw(MSG.OVERRIDEN_PROP_MUST_HAVE_SAME_FIELD_VALUES_AS_BASE_TYPE);
			});

			it("should not allow overriding constants with a typedValue that does not inherit from base type", function () {
				var Type1 = {
					typeid: "SimpleTest:Type1-1.0.0",
					constants: [{ id: "num", typeid: "Int32", value: 1 }],
				};

				var Type2 = {
					typeid: "SimpleTest:Type2-1.0.0",
					constants: [{ id: "num", typeid: "Int32", value: 1 }],
				};

				var ShapeWithDiffTypedTypeidConstants = {
					typeid: "SimpleTest:ShapeWithDiffTypeidConstants-1.0.0",
					constants: [{ id: "type", typeid: "SimpleTest:Type1-1.0.0" }],
				};

				var SquareWithDiffTypedTypeidConstants = {
					typeid: "SimpleTest:SquareWithDiffTypeidConstants-1.0.0",
					inherits: ["SimpleTest:ShapeWithDiffTypeidConstants-1.0.0"],
					constants: [{ id: "type", typedValue: { typeid: "SimpleTest:Type2-1.0.0" } }],
				};

				PropertyFactory.register(Type1);
				PropertyFactory.register(Type2);
				PropertyFactory.register(ShapeWithDiffTypedTypeidConstants);
				PropertyFactory.register(SquareWithDiffTypedTypeidConstants);

				expect(
					PropertyFactory.create.bind(
						PropertyFactory,
						"SimpleTest:SquareWithDiffTypeidConstants-1.0.0",
					),
				).to.throw(
					MSG.TYPED_VALUES_MUST_DERIVE_FROM_BASE_TYPE +
						"SimpleTest:Type2-1.0.0 must be a subclass of SimpleTest:Type1-1.0.0",
				);
			});
		});
	});

	describe("Default values", function () {
		it("should set default values for primitive property", function () {
			var DefaultPrimitive = {
				typeid: "SimpleTest:DefaultPrimitive-1.0.0",
				properties: [
					{ id: "num", typeid: "Uint32", value: 111 },
					{ id: "bool", typeid: "Bool", value: true },
				],
			};

			PropertyFactory.register(DefaultPrimitive);

			var instance = PropertyFactory.create("SimpleTest:DefaultPrimitive-1.0.0");
			expect(instance.get("num").getValue()).to.equal(111);
			expect(instance.get("bool").getValue()).to.equal(true);
		});

		it("should set a default value for a string property", function () {
			var DefaultString = {
				typeid: "SimpleTest:DefaultString-1.0.0",
				properties: [{ id: "string", typeid: "String", value: "I am a string" }],
			};

			PropertyFactory.register(DefaultString);

			var instance = PropertyFactory.create("SimpleTest:DefaultString-1.0.0");
			expect(instance.get("string").getValue()).to.equal("I am a string");
		});

		it("should set a default value for a primitive array property", function () {
			var DefaultArray = {
				typeid: "SimpleTest:DefaultArray-1.0.0",
				properties: [{ id: "array", typeid: "Int32", value: [111, 222], context: "array" }],
			};

			PropertyFactory.register(DefaultArray);

			var instance = PropertyFactory.create("SimpleTest:DefaultArray-1.0.0");
			expect(instance.get("array").get(0)).to.equal(111);
			expect(instance.get("array").get(1)).to.equal(222);
		});

		it("should set a default value for a typed array property", function () {
			var DefaultTypedArrayEntry = {
				typeid: "SimpleTest:DefaultTypedArrayEntry-1.0.0",
				properties: [{ id: "string", typeid: "String" }],
			};

			var DefaultTypedArray = {
				typeid: "SimpleTest:DefaultTypedArray-1.0.0",
				properties: [
					{
						id: "array",
						typeid: "SimpleTest:DefaultTypedArrayEntry-1.0.0",
						context: "array",
						value: [{ string: "I am string 1" }, { string: "I am string 2" }],
					},
				],
			};

			PropertyFactory.register(DefaultTypedArrayEntry);
			PropertyFactory.register(DefaultTypedArray);

			var instance = PropertyFactory.create("SimpleTest:DefaultTypedArray-1.0.0");
			expect(instance.get("array").get(0).get("string").value).to.equal("I am string 1");
			expect(instance.get("array").get(1).get("string").value).to.equal("I am string 2");
		});

		it("should set a default value for an enum property", function () {
			var DefaultEnum = {
				typeid: "SimpleTest:DefaultEnum-1.0.0",
				properties: [
					{
						id: "enum",
						typeid: "Enum",
						properties: [
							{ id: "solid", value: 111 },
							{ id: "dashed", value: 222 },
							{ id: "dotted", value: 333 },
						],
						value: "dashed",
					},
				],
			};

			PropertyFactory.register(DefaultEnum);

			var instance = PropertyFactory.create("SimpleTest:DefaultEnum-1.0.0");
			expect(instance.get("enum").getValue()).to.equal(222);
		});

		it("should set a default value for an untyped property, parent default value has precedence", function () {
			var DefaultUntyped = {
				typeid: "SimpleTest:DefaultUntyped-1.0.0",
				properties: [
					{
						id: "untyped",
						properties: [
							{ id: "num", typeid: "Uint32", value: 222 },
							{ id: "string", typeid: "String", value: "I should not be set" },
						],
						value: { string: "I am a string", num: 111 },
					},
				],
			};

			PropertyFactory.register(DefaultUntyped);

			var instance = PropertyFactory.create("SimpleTest:DefaultUntyped-1.0.0");

			expect(instance.get("untyped").get("string").getValue()).to.equal("I am a string");
			expect(instance.get("untyped").get("num").getValue()).to.equal(111);
		});

		it("should set a default value for a template, parent default value has precedence", function () {
			var DefaultTemplateEntry = {
				typeid: "SimpleTest:DefaultTemplateEntry-1.0.0",
				properties: [
					{ id: "num", typeid: "Uint32", value: "222" },
					{
						id: "dynamic",
						properties: [{ id: "dynamic_string", typeid: "String" }],
						value: { dynamic_string: "I should not be set" },
					},
				],
			};

			var DefaultTemplate = {
				typeid: "SimpleTest:DefaultTemplate-1.0.0",
				properties: [
					{
						id: "template",
						typeid: "SimpleTest:DefaultTemplateEntry-1.0.0",
						value: {
							num: 111,
							dynamic: { dynamic_string: "I am a string" },
						},
					},
				],
			};

			PropertyFactory.register(DefaultTemplateEntry);
			PropertyFactory.register(DefaultTemplate);

			var instance = PropertyFactory.create("SimpleTest:DefaultTemplate-1.0.0");

			expect(instance.get("template").get("num").getValue()).to.equal(111);
			expect(
				instance.get("template").get("dynamic").get("dynamic_string").getValue(),
			).to.equal("I am a string");
		});

		it("should set a default value for a set", function () {
			var DefaultSetEntry = {
				typeid: "SimpleTest:DefaultSetEntry-1.0.0",
				inherits: ["NamedProperty"],
				properties: [{ id: "string", typeid: "String" }],
			};

			var DefaultSet = {
				typeid: "SimpleTest:DefaultSet-1.0.0",
				properties: [
					{
						id: "set",
						typeid: "SimpleTest:DefaultSetEntry-1.0.0",
						context: "set",
						value: [{ string: "I am a string 1" }, { string: "I am a string 2" }],
					},
				],
			};

			PropertyFactory.register(DefaultSetEntry);
			PropertyFactory.register(DefaultSet);

			var instance = PropertyFactory.create("SimpleTest:DefaultSet-1.0.0");

			expect(instance.get("set").getAsArray().length).to.equal(2);
			expect(instance.get("set").getAsArray()[0].get("string").getValue()).to.equal(
				"I am a string 1",
			);
			expect(instance.get("set").getAsArray()[1].get("string").getValue()).to.equal(
				"I am a string 2",
			);
		});

		it("should set a default value for a primitive map", function () {
			var DefaultPrimitiveMap = {
				typeid: "SimpleTest:DefaultPrimitiveMap-1.0.0",
				properties: [
					{
						id: "map",
						typeid: "Int32",
						context: "map",
						value: {
							key1: 111,
							key2: 222,
						},
					},
				],
			};

			PropertyFactory.register(DefaultPrimitiveMap);

			var instance = PropertyFactory.create("SimpleTest:DefaultPrimitiveMap-1.0.0");

			expect(instance.get("map").getEntriesReadOnly().key1).to.equal(111);
			expect(instance.get("map").getEntriesReadOnly().key2).to.equal(222);
		});

		it("should set a default value for a typed map", function () {
			var DefaultTypedMapEntry = {
				typeid: "SimpleTest:DefaultTypedMapEntry-1.0.0",
				inherits: ["NamedProperty"],
				properties: [{ id: "string", typeid: "String" }],
			};

			var DefaultTypedMap = {
				typeid: "SimpleTest:DefaultTypedMap-1.0.0",
				properties: [
					{
						id: "map",
						typeid: "SimpleTest:DefaultTypedMapEntry-1.0.0",
						context: "map",
						value: {
							key1: { string: "I am a string 1" },
							key2: { string: "I am a string 2" },
						},
					},
				],
			};

			PropertyFactory.register(DefaultTypedMapEntry);
			PropertyFactory.register(DefaultTypedMap);

			var instance = PropertyFactory.create("SimpleTest:DefaultTypedMap-1.0.0");

			expect(instance.get("map").getEntriesReadOnly().key1.get("string").getValue()).to.equal(
				"I am a string 1",
			);
			expect(instance.get("map").getEntriesReadOnly().key2.get("string").getValue()).to.equal(
				"I am a string 2",
			);
		});

		it("initial values should override default values", function () {
			var DefaultInitialValue = {
				typeid: "SimpleTest:DefaultInitialValue-1.0.0",
				properties: [{ id: "string", typeid: "String", value: "I should not be set" }],
			};

			PropertyFactory.register(DefaultInitialValue);

			var instance = PropertyFactory.create("SimpleTest:DefaultInitialValue-1.0.0", null, {
				string: "I am a string",
			});

			expect(instance.get("string").getValue()).to.equal("I am a string");
		});

		describe("#Polymorphic", function () {
			var DefaultPolyBase = {
				typeid: "SimpleTest:DefaultPolyBase-1.0.0",
				inherits: ["NamedProperty"],
				properties: [{ id: "num", typeid: "Uint32", value: 111 }],
			};

			var DefaultPolySub = {
				typeid: "SimpleTest:DefaultPolySub-1.0.0",
				inherits: "SimpleTest:DefaultPolyBase-1.0.0",
				properties: [
					{ id: "num", typeid: "Uint32", value: 222 },
					{ id: "str", typeid: "String", value: "Sub" },
				],
			};

			var DefaultPolySubSub = {
				typeid: "SimpleTest:DefaultPolySubSub-1.0.0",
				inherits: "SimpleTest:DefaultPolySub-1.0.0",
				properties: [
					{ id: "num", typeid: "Uint32", value: 333 },
					{ id: "num2", typeid: "Uint32", value: 111 },
					{ id: "str", typeid: "String", value: "SubSub" },
				],
			};

			beforeEach(function () {
				PropertyFactory._clear();
				PropertyFactory.register(DefaultPolyBase);
				PropertyFactory.register(DefaultPolySub);
				PropertyFactory.register(DefaultPolySubSub);
			});

			it("should set default polymorphic values for non-primitive properties", function () {
				var DefaultPolyContainer = {
					typeid: "SimpleTest:DefaultPolyContainer-1.0.0",
					properties: [
						{
							id: "polySub",
							typeid: "SimpleTest:DefaultPolyBase-1.0.0",
							typedValue: {
								typeid: "SimpleTest:DefaultPolySub-1.0.0",
								value: { num: 333, str: "PolySub" },
							},
						},
						{
							id: "polySubSub",
							typeid: "SimpleTest:DefaultPolyBase-1.0.0",
							typedValue: {
								typeid: "SimpleTest:DefaultPolySubSub-1.0.0",
								value: { num: 444, str: "PolySubSub" },
							},
						},
					],
				};

				PropertyFactory.register(DefaultPolyContainer);

				var instance = PropertyFactory.create("SimpleTest:DefaultPolyContainer-1.0.0");
				expect(instance.get("polySub").get("num").getValue()).to.equal(333);
				expect(instance.get("polySub").get("str").getValue()).to.equal("PolySub");

				expect(instance.get("polySubSub").get("num").getValue()).to.equal(444);
				expect(instance.get("polySubSub").get("str").getValue()).to.equal("PolySubSub");
				expect(instance.get("polySubSub").get("num2").getValue()).to.equal(111);
			});

			it("should fail when setting a default typedValue that doesnt have a typeid.", function () {
				var DefaultPolyNoTypeIdContainer = {
					typeid: "SimpleTest:DefaultPolyNoTypeIdContainer-1.0.0",
					properties: [
						{
							id: "polySub",
							typeid: "SimpleTest:DefaultPolyBase-1.0.0",
							typedValue: { value: { num: 333, str: "PolySub" } },
						},
					],
				};

				PropertyFactory.register(DefaultPolyNoTypeIdContainer);

				expect(
					PropertyFactory.create.bind(
						PropertyFactory,
						"SimpleTest:DefaultPolyNoTypeIdContainer-1.0.0",
					),
				).to.throw(
					MSG.FIELD_TYPEID_IS_REQUIRED + "typedValue SimpleTest:DefaultPolyBase-1.0.0",
				);
			});

			it("should set a default polymorphic value for a non-primitive array", function () {
				var DefaultPolyArrayContainer = {
					typeid: "SimpleTest:DefaultPolyArrayContainer-1.0.0",
					properties: [
						{
							id: "array",
							typeid: "SimpleTest:DefaultPolyBase-1.0.0",
							context: "array",
							typedValue: [
								{ typeid: "SimpleTest:DefaultPolySub-1.0.0" },
								{
									typeid: "SimpleTest:DefaultPolySub-1.0.0",
									value: { str: "ArrSub" },
								},
								{
									typeid: "SimpleTest:DefaultPolySubSub-1.0.0",
									value: { str: "ArrSubSub" },
								},
							],
						},
					],
				};

				PropertyFactory.register(DefaultPolyArrayContainer);

				var instance = PropertyFactory.create("SimpleTest:DefaultPolyArrayContainer-1.0.0");
				expect(instance.get("array").get(0).get("num").value).to.equal(222);
				expect(instance.get("array").get(0).get("str").value).to.equal("Sub");
				expect(instance.get("array").get(1).get("num").value).to.equal(222);
				expect(instance.get("array").get(1).get("str").value).to.equal("ArrSub");
				expect(instance.get("array").get(2).get("num").value).to.equal(333);
				expect(instance.get("array").get(2).get("str").value).to.equal("ArrSubSub");
				expect(instance.get("array").get(2).get("num2").value).to.equal(111);
			});

			it("should set a default polymorphic value for a non-primitive set", function () {
				var DefaultPolySetContainer = {
					typeid: "SimpleTest:DefaultPolySetContainer-1.0.0",
					properties: [
						{
							id: "set",
							typeid: "SimpleTest:DefaultPolyBase-1.0.0",
							context: "set",
							typedValue: [
								{ typeid: "SimpleTest:DefaultPolySub-1.0.0" },
								{
									typeid: "SimpleTest:DefaultPolySub-1.0.0",
									value: { str: "ArrSub" },
								},
								{
									typeid: "SimpleTest:DefaultPolySubSub-1.0.0",
									value: { str: "ArrSubSub" },
								},
							],
						},
					],
				};

				PropertyFactory.register(DefaultPolySetContainer);

				var instance = PropertyFactory.create("SimpleTest:DefaultPolySetContainer-1.0.0");

				expect(instance.get("set").getAsArray().length).to.equal(3);
				expect(instance.get("set").getAsArray()[0].get("num").getValue()).to.equal(222);
				expect(instance.get("set").getAsArray()[0].get("str").getValue()).to.equal("Sub");
				expect(instance.get("set").getAsArray()[1].get("num").getValue()).to.equal(222);
				expect(instance.get("set").getAsArray()[1].get("str").getValue()).to.equal("ArrSub");
				expect(instance.get("set").getAsArray()[2].get("num").getValue()).to.equal(333);
				expect(instance.get("set").getAsArray()[2].get("str").getValue()).to.equal(
					"ArrSubSub",
				);
				expect(instance.get("set").getAsArray()[2].get("num2").getValue()).to.equal(111);
			});

			it("should set a default polymorphic value for a non-primitive map", function () {
				var DefaultPolyMapContainer = {
					typeid: "SimpleTest:DefaultPolyMapContainer-1.0.0",
					properties: [
						{
							id: "map",
							typeid: "SimpleTest:DefaultPolyBase-1.0.0",
							context: "map",
							typedValue: {
								key1: { typeid: "SimpleTest:DefaultPolySub-1.0.0" },
								key2: {
									typeid: "SimpleTest:DefaultPolySub-1.0.0",
									value: { str: "ArrSub" },
								},
								key3: {
									typeid: "SimpleTest:DefaultPolySubSub-1.0.0",
									value: { str: "ArrSubSub" },
								},
							},
						},
					],
				};

				PropertyFactory.register(DefaultPolyMapContainer);

				var instance = PropertyFactory.create("SimpleTest:DefaultPolyMapContainer-1.0.0");

				expect(instance.get("map").getEntriesReadOnly().key1.get("num").getValue()).to.equal(
					222,
				);
				expect(instance.get("map").getEntriesReadOnly().key1.get("str").getValue()).to.equal(
					"Sub",
				);
				expect(instance.get("map").getEntriesReadOnly().key2.get("num").getValue()).to.equal(
					222,
				);
				expect(instance.get("map").getEntriesReadOnly().key2.get("str").getValue()).to.equal(
					"ArrSub",
				);
				expect(instance.get("map").getEntriesReadOnly().key3.get("num").getValue()).to.equal(
					333,
				);
				expect(instance.get("map").getEntriesReadOnly().key3.get("str").getValue()).to.equal(
					"ArrSubSub",
				);
				expect(instance.get("map").getEntriesReadOnly().key3.get("num2").getValue()).to.equal(
					111,
				);
			});

			it("should fail when setting default polymorphic values not derived from base type", function () {
				var DefaultPoly = {
					typeid: "SimpleTest:DefaultPoly-1.0.0",
					properties: [{ id: "num", typeid: "Uint32", value: 111 }],
				};

				var DefaultPolyUnderivedContainer = {
					typeid: "SimpleTest:DefaultPolyUnderivedContainer-1.0.0",
					properties: [
						{
							id: "poly",
							typeid: "SimpleTest:DefaultPolyBase-1.0.0",
							typedValue: {
								typeid: "SimpleTest:DefaultPoly-1.0.0",
								value: { num: 333 },
							},
						},
					],
				};

				PropertyFactory.register(DefaultPoly);
				PropertyFactory.register(DefaultPolyUnderivedContainer);

				expect(
					PropertyFactory.create.bind(
						PropertyFactory,
						"SimpleTest:DefaultPolyUnderivedContainer-1.0.0",
					),
				).to.throw(
					MSG.TYPED_VALUES_MUST_DERIVE_FROM_BASE_TYPE + "SimpleTest:DefaultPoly-1.0.0",
				);
			});

			it("@bugfix should use default value when value field is missing", function () {
				var DefaultPoly = {
					typeid: "SimpleTest:PolyWithNoValue-1.0.0",
					constants: [
						{
							id: "type",
							typeid: "SimpleTest:DefaultPolyBase-1.0.0",
							typedValue: { typeid: "SimpleTest:DefaultPolyBase-1.0.0" },
						},
					],
				};

				PropertyFactory.register(DefaultPoly);
				var prop = PropertyFactory.create(DefaultPoly.typeid);

				expect(prop.get("type").get("num").value).to.equal(111);
			});

			it("should fail when setting a typedValue to a primitive.", function () {
				var DefaultPrimitiveArrayPoly = {
					typeid: "SimpleTest:DefaultPrimitivePoly-1.0.0",
					properties: [
						{
							id: "int",
							typeid: "Int32",
							typedValue: { typeid: "Int32", value: 123 },
						},
					],
				};

				PropertyFactory.register(DefaultPrimitiveArrayPoly);

				expect(
					PropertyFactory.create.bind(
						PropertyFactory,
						"SimpleTest:DefaultPrimitivePoly-1.0.0",
					),
				).to.throw(MSG.TYPED_VALUES_FOR_PRIMITIVES_NOT_SUPPORTED + "int");
			});

			it("should fail when setting a typedValue to a primitive array.", function () {
				var DefaultPrimitiveArrayPoly = {
					typeid: "SimpleTest:DefaultPrimitiveArrayPoly-1.0.0",
					properties: [
						{
							id: "array",
							context: "array",
							typeid: "Int32",
							typedValue: [{ typeid: "Int32", value: 123 }],
						},
					],
				};

				PropertyFactory.register(DefaultPrimitiveArrayPoly);

				expect(
					PropertyFactory.create.bind(
						PropertyFactory,
						"SimpleTest:DefaultPrimitiveArrayPoly-1.0.0",
					),
				).to.throw(MSG.TYPED_VALUES_FOR_PRIMITIVES_NOT_SUPPORTED + "array");
			});

			it("should fail when setting a typedValue to a primitive map.", function () {
				var DefaultPrimitiveMapPoly = {
					typeid: "SimpleTest:DefaultPrimitiveMapPoly-1.0.0",
					properties: [
						{
							id: "map",
							context: "map",
							typeid: "Int32",
							typedValue: {
								key1: { typeid: "Int32", value: 1 },
								key2: { typeid: "Int32", value: 2 },
							},
						},
					],
				};

				PropertyFactory.register(DefaultPrimitiveMapPoly);

				expect(
					PropertyFactory.create.bind(
						PropertyFactory,
						"SimpleTest:DefaultPrimitiveMapPoly-1.0.0",
					),
				).to.throw(MSG.TYPED_VALUES_FOR_PRIMITIVES_NOT_SUPPORTED + "map");
			});
		});
	});

	describe("Constants", function () {
		it("should set constant properties as readonly", function () {
			var ConstantReadonly = {
				typeid: "SimpleTest:ConstantReadonly-1.0.0",
				constants: [{ id: "num", typeid: "Uint32", value: 111 }],
				properties: [{ id: "default", typeid: "Uint32" }],
			};

			PropertyFactory.register(ConstantReadonly);

			var instance = PropertyFactory.create("SimpleTest:ConstantReadonly-1.0.0");

			expect(instance.get("num").getValue()).to.equal(111);
			expect(instance.get("num")._isConstant).to.equal(true);
			expect(instance.get("num")._checkIsNotReadOnly.bind(instance.get("num"), true)).to.throw(
				MSG.MODIFICATION_OF_CONSTANT_PROPERTY,
			);
			expect(instance.get("num").setValue.bind(instance.get("num"), 1111)).to.throw(
				MSG.MODIFICATION_OF_CONSTANT_PROPERTY,
			);
		});

		it("should set constant child properties as readonly", function () {
			var ConstantChildReadonlyEntry = {
				typeid: "SimpleTest:ConstantChildReadonlyEntry-1.0.0",
				properties: [
					{ id: "num", typeid: "Uint32" },
					{
						id: "dynamic",
						properties: [{ id: "dynamic_string", typeid: "String" }],
					},
				],
			};

			var ConstantChildReadonly = {
				typeid: "SimpleTest:ConstantChildReadonly-1.0.0",
				constants: [
					{
						id: "template",
						typeid: "SimpleTest:ConstantChildReadonlyEntry-1.0.0",
						value: {
							num: 111,
							dynamic: { dynamic_string: "I am a string" },
						},
					},
				],
				properties: [{ id: "default", typeid: "Uint32" }],
			};

			PropertyFactory.register(ConstantChildReadonlyEntry);
			PropertyFactory.register(ConstantChildReadonly);

			var instance = PropertyFactory.create("SimpleTest:ConstantChildReadonly-1.0.0");

			expect(instance.get("template").get("num")._isConstant).to.equal(true);
			expect(instance.get("template").get("dynamic")._isConstant).to.equal(true);
			expect(
				instance.get("template").get("dynamic").get("dynamic_string")._isConstant,
			).to.equal(true);
			expect(
				instance
					.get("template")
					.get("num")
					._checkIsNotReadOnly.bind(instance.get("template").get("num"), true),
			).to.throw(MSG.MODIFICATION_OF_CONSTANT_PROPERTY);
			expect(
				instance
					.get("template")
					.get("num")
					.setValue.bind(instance.get("template").get("num"), 1111),
			).to.throw(MSG.MODIFICATION_OF_CONSTANT_PROPERTY);
			expect(
				instance
					.get("template")
					.get("dynamic")
					.get("dynamic_string")
					._checkIsNotReadOnly.bind(
						instance.get("template").get("dynamic").get("dynamic_string"),
						true,
					),
			).to.throw(MSG.MODIFICATION_OF_CONSTANT_PROPERTY);
			expect(
				instance
					.get("template")
					.get("dynamic")
					.get("dynamic_string")
					.setValue.bind(
						instance.get("template").get("dynamic").get("dynamic_string"),
						"should throw",
					),
			).to.throw(MSG.MODIFICATION_OF_CONSTANT_PROPERTY);
		});

		it("should support primitive constants", function () {
			var ConstantPrimitive = {
				typeid: "SimpleTest:ConstantPrimitive-1.0.0",
				constants: [
					{ id: "num", typeid: "Uint32", value: 111 },
					{ id: "bool", typeid: "Bool", value: true },
				],
				properties: [{ id: "default", typeid: "Uint32" }],
			};

			PropertyFactory.register(ConstantPrimitive);

			var instance = PropertyFactory.create("SimpleTest:ConstantPrimitive-1.0.0");

			expect(instance.get("num").getValue()).to.equal(111);
			expect(instance.get("bool").getValue()).to.equal(true);
		});

		it("should support typed constants", function () {
			var ConstantEntry = {
				typeid: "SimpleTest:ConstantEntry-1.0.0",
				constants: [
					{ id: "num", typeid: "Uint32", value: 111 },
					{ id: "bool", typeid: "Bool", value: true },
				],
				properties: [{ id: "default", typeid: "Uint32" }],
			};

			var ConstantTyped = {
				typeid: "SimpleTest:ConstantTyped-1.0.0",
				constants: [
					{
						id: "entry",
						typeid: "SimpleTest:ConstantEntry-1.0.0",
						value: { num: 222, bool: false },
					},
				],
				properties: [{ id: "default2", typeid: "Uint32" }],
			};

			PropertyFactory.register(ConstantEntry);
			PropertyFactory.register(ConstantTyped);

			var instance = PropertyFactory.create("SimpleTest:ConstantTyped-1.0.0");

			expect(instance.get("entry").get("num").getValue()).to.equal(222);
			expect(instance.get("entry").get("bool").getValue()).to.equal(false);
		});

		it("should support string constants", function () {
			var ConstantString = {
				typeid: "SimpleTest:ConstantString-1.0.0",
				constants: [{ id: "string", typeid: "String", value: "I am a string" }],
				properties: [{ id: "default", typeid: "Uint32" }],
			};

			PropertyFactory.register(ConstantString);

			var instance = PropertyFactory.create("SimpleTest:ConstantString-1.0.0");

			expect(instance.get("string").getValue()).to.equal("I am a string");
		});

		it("should support primitive array constants", function () {
			var ConstantArray = {
				typeid: "SimpleTest:ConstantArray-1.0.0",
				constants: [{ id: "array", typeid: "Int32", value: [111, 222], context: "array" }],
				properties: [{ id: "default", typeid: "Uint32" }],
			};

			PropertyFactory.register(ConstantArray);

			var instance = PropertyFactory.create("SimpleTest:ConstantArray-1.0.0");
			expect(instance.get("array").get(0)).to.equal(111);
			expect(instance.get("array").get(1)).to.equal(222);
		});

		it("should support typed array constants", function () {
			var ConstantTypedArrayEntry = {
				typeid: "SimpleTest:ConstantTypedArrayEntry-1.0.0",
				properties: [{ id: "string", typeid: "String" }],
			};

			var ConstantTypedArray = {
				typeid: "SimpleTest:ConstantTypedArray-1.0.0",
				constants: [
					{
						id: "array",
						typeid: "SimpleTest:ConstantTypedArrayEntry-1.0.0",
						context: "array",
						value: [{ string: "I am string 1" }, { string: "I am string 2" }],
					},
				],
			};

			PropertyFactory.register(ConstantTypedArrayEntry);
			PropertyFactory.register(ConstantTypedArray);

			var instance = PropertyFactory.create("SimpleTest:ConstantTypedArray-1.0.0");
			expect(instance.get("array").get(0).get("string").value).to.equal("I am string 1");
			expect(instance.get("array").get(1).get("string").value).to.equal("I am string 2");
		});

		it("should support template constants", function () {
			var ConstantTemplateEntry = {
				typeid: "SimpleTest:ConstantTemplateEntry-1.0.0",
				properties: [
					{ id: "num", typeid: "Uint32" },
					{
						id: "dynamic",
						properties: [{ id: "dynamic_string", typeid: "String" }],
					},
				],
			};

			var ConstantTemplate = {
				typeid: "SimpleTest:ConstantTemplate-1.0.0",
				constants: [
					{
						id: "template",
						typeid: "SimpleTest:ConstantTemplateEntry-1.0.0",
						value: {
							num: 111,
							dynamic: { dynamic_string: "I am a string" },
						},
					},
				],
				properties: [{ id: "default", typeid: "Uint32" }],
			};

			PropertyFactory.register(ConstantTemplateEntry);
			PropertyFactory._reregister(ConstantTemplate);

			var instance = PropertyFactory.create("SimpleTest:ConstantTemplate-1.0.0");

			expect(instance.get("template").get("num").getValue()).to.equal(111);
			expect(
				instance.get("template").get("dynamic").get("dynamic_string").getValue(),
			).to.equal("I am a string");
		});

		it("should support set constants", function () {
			var ConstantSetEntry = {
				typeid: "SimpleTest:ConstantSetEntry-1.0.0",
				inherits: ["NamedProperty"],
				properties: [{ id: "string", typeid: "String" }],
			};

			var ConstantSet = {
				typeid: "SimpleTest:ConstantSet-1.0.0",
				constants: [
					{
						id: "set",
						typeid: "SimpleTest:ConstantSetEntry-1.0.0",
						context: "set",
						value: [{ string: "I am a string 1" }, { string: "I am a string 2" }],
					},
				],
				properties: [{ id: "default", typeid: "Uint32" }],
			};

			PropertyFactory.register(ConstantSetEntry);
			PropertyFactory.register(ConstantSet);

			var instance = PropertyFactory.create("SimpleTest:ConstantSet-1.0.0");

			expect(instance.get("set").getAsArray().length).to.equal(2);
			expect(instance.get("set").getAsArray()[0].get("string").getValue()).to.equal(
				"I am a string 1",
			);
			expect(instance.get("set").getAsArray()[1].get("string").getValue()).to.equal(
				"I am a string 2",
			);

			// All instances should share the same constant objects
			var instance2 = PropertyFactory.create("SimpleTest:ConstantSet-1.0.0");
			expect(instance.get("set") === instance2.get("set")).to.be.true;
		});

		it("should support primitive map constants", function () {
			var ConstantPrimitiveMap = {
				typeid: "SimpleTest:ConstantPrimitiveMap-1.0.0",
				constants: [
					{
						id: "map",
						typeid: "Int32",
						context: "map",
						value: {
							key1: 111,
							key2: 222,
						},
					},
				],
				properties: [{ id: "default", typeid: "Uint32" }],
			};

			PropertyFactory.register(ConstantPrimitiveMap);

			var instance = PropertyFactory.create("SimpleTest:ConstantPrimitiveMap-1.0.0");

			expect(instance.get("map").getEntriesReadOnly().key1).to.equal(111);
			expect(instance.get("map").getEntriesReadOnly().key2).to.equal(222);
		});

		it("should support typed map constants", function () {
			var ConstantTypedMapEntry = {
				typeid: "SimpleTest:ConstantTypedMapEntry-1.0.0",
				inherits: ["NamedProperty"],
				properties: [{ id: "string", typeid: "String" }],
			};

			var ConstantTypedMap = {
				typeid: "SimpleTest:ConstantTypedMap-1.0.0",
				constants: [
					{
						id: "map",
						typeid: "SimpleTest:ConstantTypedMapEntry-1.0.0",
						context: "map",
						value: {
							key1: { string: "I am a string 1" },
							key2: { string: "I am a string 2" },
						},
					},
				],
				properties: [{ id: "default", typeid: "Uint32" }],
			};

			PropertyFactory.register(ConstantTypedMapEntry);
			PropertyFactory.register(ConstantTypedMap);

			var instance = PropertyFactory.create("SimpleTest:ConstantTypedMap-1.0.0");

			expect(instance.get("map")._contextKeyType).to.equal("string");
			expect(instance.get("map").getEntriesReadOnly().key1.get("string").getValue()).to.equal(
				"I am a string 1",
			);
			expect(instance.get("map").getEntriesReadOnly().key2.get("string").getValue()).to.equal(
				"I am a string 2",
			);
		});

		it("should support map constants with templateid keys", function () {
			var ConstantTemplate = {
				typeid: "SimpleTest:ConstantTemplate-1.0.0",
				constants: [
					{
						id: "map",
						typeid: "Int32",
						context: "map",
						contextKeyType: "typeid",
						value: {
							"SimpleTest:ConstantTemplate1-1.0.0": 1,
							"SimpleTest:ConstantTemplate2-1.0.0": -1,
						},
					},
				],
				properties: [{ id: "default", typeid: "Uint32" }],
			};
			PropertyFactory._reregister(ConstantTemplate);
			var instance = PropertyFactory.create("SimpleTest:ConstantTemplate-1.0.0");

			expect(instance.get("map")._contextKeyType).to.equal("typeid");
			expect(instance.get("map").get("SimpleTest:ConstantTemplate1-1.0.0")).to.equal(1);
			expect(instance.get("map").get("SimpleTest:ConstantTemplate2-1.0.0")).to.equal(-1);
		});

		it("should support constants with no value defined", function () {
			var ConstantNoValueEntry = {
				typeid: "SimpleTest:ConstantNoValueEntry-1.0.0",
				inherits: ["NamedProperty"],
				constants: [
					{ id: "num", typeid: "Int16" },
					{ id: "bool", typeid: "Bool" },
					{ id: "string", typeid: "String" },
				],
			};

			var ConstantNoValue = {
				typeid: "SimpleTest:ConstantNoValue-1.0.0",
				constants: [
					{ id: "int", typeid: "Int32" },
					{ id: "bool", typeid: "Bool" },
					{ id: "string", typeid: "String" },
					{ id: "array", typeid: "Int16", context: "array" },
					{
						id: "array_typed",
						typeid: "SimpleTest:ConstantNoValueEntry-1.0.0",
						context: "array",
					},
					{ id: "set", typeid: "SimpleTest:ConstantNoValueEntry-1.0.0", context: "set" },
					{ id: "map", typeid: "SimpleTest:ConstantNoValueEntry-1.0.0", context: "map" },
				],
			};

			var ConstantNoValueInherited = {
				typeid: "SimpleTest:ConstantNoValueInherited-1.0.0",
				inherits: "SimpleTest:ConstantNoValue-1.0.0",
				constants: [
					{ id: "int", typeid: "Int32", value: 100 },
					{ id: "bool", typeid: "Bool", value: true },
					{ id: "string", typeid: "String", value: "I am a string" },
					{ id: "array", typeid: "Int16", context: "array", value: [100, 200] },
					{
						id: "array_typed",
						typeid: "SimpleTest:ConstantNoValueEntry-1.0.0",
						context: "array",
						value: [{ num: 100 }, { num: 200, string: "I am a string 2", bool: true }],
					},
					{
						id: "set",
						typeid: "SimpleTest:ConstantNoValueEntry-1.0.0",
						context: "set",
						value: [{ num: 100 }, { num: 200, string: "I am a string 2", bool: true }],
					},
					{
						id: "map",
						typeid: "SimpleTest:ConstantNoValueEntry-1.0.0",
						context: "map",
						value: {
							key1: { num: 100 },
							key2: { num: 200, string: "I am a string 2", bool: true },
						},
					},
				],
			};

			PropertyFactory.register(ConstantNoValueEntry);
			PropertyFactory.register(ConstantNoValue);
			PropertyFactory.register(ConstantNoValueInherited);

			var instance = PropertyFactory.create("SimpleTest:ConstantNoValue-1.0.0");
			var instanceInherited = PropertyFactory.create(
				"SimpleTest:ConstantNoValueInherited-1.0.0",
			);

			expect(instance.get("int").getValue()).to.equal(0);
			expect(instance.get("bool").getValue()).to.equal(false);
			expect(instance.get("string").getValue()).to.equal("");
			expect(instance.get("array").getValues()).to.deep.equal([]);
			expect(instance.get("array_typed").getValues()).to.deep.equal([]);
			expect(instance.get("set").getAsArray()).to.deep.equal([]);
			expect(instance.get("map").getEntriesReadOnly()).to.deep.equal({});

			expect(instanceInherited.get("int").getValue()).to.equal(100);
			expect(instanceInherited.get("bool").getValue()).to.equal(true);
			expect(instanceInherited.get("string").getValue()).to.equal("I am a string");
			expect(instanceInherited.get("array").getValues()).to.deep.equal([100, 200]);

			let arr = instanceInherited.get("array_typed").getValues();
			expect(arr[0]["num"]).to.equal(100);
			expect(arr[0]["string"]).to.equal("");
			expect(arr[0]["bool"]).to.equal(false);
			expect(arr[1]["num"]).to.equal(200);
			expect(arr[1]["string"]).to.equal("I am a string 2");
			expect(arr[1]["bool"]).to.equal(true);

			let set = instanceInherited.get("set").getAsArray();

			expect(set[0].get("num").getValue()).to.equal(100);
			expect(set[0].get("string").getValue()).to.equal("");
			expect(set[0].get("bool").getValue()).to.equal(false);
			expect(set[1].get("num").getValue()).to.equal(200);
			expect(set[1].get("string").getValue()).to.equal("I am a string 2");
			expect(set[1].get("bool").getValue()).to.equal(true);

			let map = instanceInherited.get("map").getEntriesReadOnly();
			expect(map.key1.get("num").getValue()).to.equal(100);
			expect(map.key1.get("string").getValue()).to.equal("");
			expect(map.key1.get("bool").getValue()).to.equal(false);
			expect(map.key2.get("num").getValue()).to.equal(200);
			expect(map.key2.get("string").getValue()).to.equal("I am a string 2");
			expect(map.key2.get("bool").getValue()).to.equal(true);
		});

		describe("#Polymorphic", function () {
			var ConstantPolyBase = {
				typeid: "SimpleTest:ConstantPolyBase-1.0.0",
				inherits: ["NamedProperty"],
				constants: [{ id: "num", typeid: "Uint32", value: 111 }],
			};

			var ConstantPolySub = {
				typeid: "SimpleTest:ConstantPolySub-1.0.0",
				inherits: "SimpleTest:ConstantPolyBase-1.0.0",
				constants: [
					{ id: "num", typeid: "Uint32", value: 222 },
					{ id: "str", typeid: "String", value: "Sub" },
				],
			};

			var ConstantPolySubSub = {
				typeid: "SimpleTest:ConstantPolySubSub-1.0.0",
				inherits: "SimpleTest:ConstantPolySub-1.0.0",
				constants: [
					{ id: "num", typeid: "Uint32", value: 333 },
					{ id: "num2", typeid: "Uint32", value: 111 },
					{ id: "str", typeid: "String", value: "SubSub" },
				],
			};

			beforeEach(function () {
				PropertyFactory._clear();
				PropertyFactory.register(ConstantPolyBase);
				PropertyFactory.register(ConstantPolySub);
				PropertyFactory.register(ConstantPolySubSub);
			});

			it("should set constant polymorphic values for non-primitive constants", function () {
				var ConstantPolyContainer = {
					typeid: "SimpleTest:ConstantPolyContainer-1.0.0",
					constants: [
						{
							id: "polySub",
							typeid: "SimpleTest:ConstantPolyBase-1.0.0",
							typedValue: {
								typeid: "SimpleTest:ConstantPolySub-1.0.0",
								value: { num: 333, str: "PolySub" },
							},
						},
						{
							id: "polySubSub",
							typeid: "SimpleTest:ConstantPolyBase-1.0.0",
							typedValue: {
								typeid: "SimpleTest:ConstantPolySubSub-1.0.0",
								value: { num: 444, str: "PolySubSub" },
							},
						},
					],
				};

				PropertyFactory.register(ConstantPolyContainer);

				var instance = PropertyFactory.create("SimpleTest:ConstantPolyContainer-1.0.0");
				expect(instance.get("polySub").get("num").getValue()).to.equal(333);
				expect(instance.get("polySub").get("str").getValue()).to.equal("PolySub");

				expect(instance.get("polySubSub").get("num").getValue()).to.equal(444);
				expect(instance.get("polySubSub").get("str").getValue()).to.equal("PolySubSub");
				expect(instance.get("polySubSub").get("num2").getValue()).to.equal(111);
			});

			it("should pass when setting a constant typedValue that doesnt have a value.", function () {
				var ConstantPolyNoValueContainer = {
					typeid: "SimpleTest:ConstantPolyNoValueContainer-1.0.0",
					constants: [
						{
							id: "polySub",
							typeid: "SimpleTest:ConstantPolyBase-1.0.0",
							typedValue: { typeid: "SimpleTest:ConstantPolySub-1.0.0" },
						},
					],
				};

				PropertyFactory.register(ConstantPolyNoValueContainer);
				var prop = PropertyFactory.create("SimpleTest:ConstantPolyNoValueContainer-1.0.0");

				expect(prop.get("polySub").get("str").value).to.equal("Sub");
			});

			it("should fail when setting a constant typedValue that doesnt have a typeid.", function () {
				var ConstantPolyNoTypeIdContainer = {
					typeid: "SimpleTest:ConstantPolyNoTypeIdContainer-1.0.0",
					constants: [
						{
							id: "polySub",
							typeid: "SimpleTest:ConstantPolyBase-1.0.0",
							typedValue: { value: { num: 333, str: "PolySub" } },
						},
					],
				};

				PropertyFactory.register(ConstantPolyNoTypeIdContainer);

				expect(
					PropertyFactory.create.bind(
						PropertyFactory,
						"SimpleTest:ConstantPolyNoTypeIdContainer-1.0.0",
					),
				).to.throw(
					MSG.FIELD_TYPEID_IS_REQUIRED + "typedValue SimpleTest:ConstantPolyBase-1.0.0",
				);
			});

			it("should set a constant polymorphic value for a non-primitive array", function () {
				var ConstantPolyArrayContainer = {
					typeid: "SimpleTest:ConstantPolyArrayContainer-1.0.0",
					constants: [
						{
							id: "array",
							typeid: "SimpleTest:ConstantPolyBase-1.0.0",
							context: "array",
							typedValue: [
								{ typeid: "SimpleTest:ConstantPolySub-1.0.0" },
								{
									typeid: "SimpleTest:ConstantPolySub-1.0.0",
									value: { str: "ArrSub" },
								},
								{
									typeid: "SimpleTest:ConstantPolySubSub-1.0.0",
									value: { str: "ArrSubSub" },
								},
							],
						},
					],
				};

				PropertyFactory.register(ConstantPolyArrayContainer);

				var instance = PropertyFactory.create("SimpleTest:ConstantPolyArrayContainer-1.0.0");
				expect(instance.get("array").get(0).get("num").value).to.equal(222);
				expect(instance.get("array").get(0).get("str").value).to.equal("Sub");
				expect(instance.get("array").get(1).get("num").value).to.equal(222);
				expect(instance.get("array").get(1).get("str").value).to.equal("ArrSub");
				expect(instance.get("array").get(2).get("num").value).to.equal(333);
				expect(instance.get("array").get(2).get("str").value).to.equal("ArrSubSub");
				expect(instance.get("array").get(2).get("num2").value).to.equal(111);
			});

			it("should set a constant polymorphic value for a non-primitive set", function () {
				var ConstantPolySetContainer = {
					typeid: "SimpleTest:ConstantPolySetContainer-1.0.0",
					constants: [
						{
							id: "set",
							typeid: "SimpleTest:ConstantPolyBase-1.0.0",
							context: "set",
							typedValue: [
								{ typeid: "SimpleTest:ConstantPolySub-1.0.0" },
								{
									typeid: "SimpleTest:ConstantPolySub-1.0.0",
									value: { str: "ArrSub" },
								},
								{
									typeid: "SimpleTest:ConstantPolySubSub-1.0.0",
									value: { str: "ArrSubSub" },
								},
							],
						},
					],
				};

				PropertyFactory.register(ConstantPolySetContainer);

				var instance = PropertyFactory.create("SimpleTest:ConstantPolySetContainer-1.0.0");

				expect(instance.get("set").getAsArray().length).to.equal(3);
				expect(instance.get("set").getAsArray()[0].get("num").getValue()).to.equal(222);
				expect(instance.get("set").getAsArray()[0].get("str").getValue()).to.equal("Sub");
				expect(instance.get("set").getAsArray()[1].get("num").getValue()).to.equal(222);
				expect(instance.get("set").getAsArray()[1].get("str").getValue()).to.equal("ArrSub");
				expect(instance.get("set").getAsArray()[2].get("num").getValue()).to.equal(333);
				expect(instance.get("set").getAsArray()[2].get("str").getValue()).to.equal(
					"ArrSubSub",
				);
				expect(instance.get("set").getAsArray()[2].get("num2").getValue()).to.equal(111);
			});

			it("should set a constant polymorphic value for a non-primitive map", function () {
				var ConstantPolyMapContainer = {
					typeid: "SimpleTest:ConstantPolyMapContainer-1.0.0",
					constants: [
						{
							id: "map",
							typeid: "SimpleTest:ConstantPolyBase-1.0.0",
							context: "map",
							typedValue: {
								key1: { typeid: "SimpleTest:ConstantPolySub-1.0.0" },
								key2: {
									typeid: "SimpleTest:ConstantPolySub-1.0.0",
									value: { str: "ArrSub" },
								},
								key3: {
									typeid: "SimpleTest:ConstantPolySubSub-1.0.0",
									value: { str: "ArrSubSub" },
								},
							},
						},
					],
				};

				PropertyFactory.register(ConstantPolyMapContainer);

				var instance = PropertyFactory.create("SimpleTest:ConstantPolyMapContainer-1.0.0");

				expect(instance.get("map").getEntriesReadOnly().key1.get("num").getValue()).to.equal(
					222,
				);
				expect(instance.get("map").getEntriesReadOnly().key1.get("str").getValue()).to.equal(
					"Sub",
				);
				expect(instance.get("map").getEntriesReadOnly().key2.get("num").getValue()).to.equal(
					222,
				);
				expect(instance.get("map").getEntriesReadOnly().key2.get("str").getValue()).to.equal(
					"ArrSub",
				);
				expect(instance.get("map").getEntriesReadOnly().key3.get("num").getValue()).to.equal(
					333,
				);
				expect(instance.get("map").getEntriesReadOnly().key3.get("str").getValue()).to.equal(
					"ArrSubSub",
				);
				expect(instance.get("map").getEntriesReadOnly().key3.get("num2").getValue()).to.equal(
					111,
				);
			});

			it("should fail when setting constant polymorphic values not derived from base type", function () {
				var ConstantPoly = {
					typeid: "SimpleTest:ConstantPoly-1.0.0",
					constants: [{ id: "num", typeid: "Uint32", value: 111 }],
				};

				var ConstantPolyUnderivedContainer = {
					typeid: "SimpleTest:ConstantPolyUnderivedContainer-1.0.0",
					constants: [
						{
							id: "poly",
							typeid: "SimpleTest:ConstantPolyBase-1.0.0",
							typedValue: {
								typeid: "SimpleTest:ConstantPoly-1.0.0",
								value: { num: 333 },
							},
						},
					],
				};

				PropertyFactory.register(ConstantPoly);
				PropertyFactory.register(ConstantPolyUnderivedContainer);

				expect(
					PropertyFactory.create.bind(
						PropertyFactory,
						"SimpleTest:ConstantPolyUnderivedContainer-1.0.0",
					),
				).to.throw(
					MSG.TYPED_VALUES_MUST_DERIVE_FROM_BASE_TYPE + "SimpleTest:ConstantPoly-1.0.0",
				);
			});

			it("should fail when setting a typedValue to a primitive.", function () {
				var DefaultPrimitiveArrayPoly = {
					typeid: "SimpleTest:DefaultPrimitivePoly-1.0.0",
					constants: [
						{
							id: "int",
							typeid: "Int32",
							typedValue: { typeid: "Int32", value: 123 },
						},
					],
				};

				PropertyFactory.register(DefaultPrimitiveArrayPoly);

				expect(
					PropertyFactory.create.bind(
						PropertyFactory,
						"SimpleTest:DefaultPrimitivePoly-1.0.0",
					),
				).to.throw(MSG.TYPED_VALUES_FOR_PRIMITIVES_NOT_SUPPORTED + "int");
			});

			it("should fail when setting a typedValue to a primitive array.", function () {
				var DefaultPrimitiveArrayPoly = {
					typeid: "SimpleTest:DefaultPrimitiveArrayPoly-1.0.0",
					constants: [
						{
							id: "array",
							context: "array",
							typeid: "Int32",
							typedValue: [{ typeid: "Int32", value: 123 }],
						},
					],
				};

				PropertyFactory.register(DefaultPrimitiveArrayPoly);

				expect(
					PropertyFactory.create.bind(
						PropertyFactory,
						"SimpleTest:DefaultPrimitiveArrayPoly-1.0.0",
					),
				).to.throw(MSG.TYPED_VALUES_FOR_PRIMITIVES_NOT_SUPPORTED + "array");
			});

			it("should fail when setting a typedValue to a primitive map.", function () {
				var DefaultPrimitiveMapPoly = {
					typeid: "SimpleTest:DefaultPrimitiveMapPoly-1.0.0",
					constants: [
						{
							id: "map",
							context: "map",
							typeid: "Int32",
							typedValue: {
								key1: { typeid: "Int32", value: 1 },
								key2: { typeid: "Int32", value: 2 },
							},
						},
					],
				};

				PropertyFactory.register(DefaultPrimitiveMapPoly);

				expect(
					PropertyFactory.create.bind(
						PropertyFactory,
						"SimpleTest:DefaultPrimitiveMapPoly-1.0.0",
					),
				).to.throw(MSG.TYPED_VALUES_FOR_PRIMITIVES_NOT_SUPPORTED + "map");
			});
		});
	});

	describe("InstanceOf Type Checking", function () {
		it("Native types pass instanceOf check", function () {
			var contextSingleTypes = ["NodeProperty", "Enum"];
			var propTypes = [
				"String",
				"Bool",
				"Int8",
				"Uint8",
				"Int16",
				"Uint16",
				"Int32",
				"Int64",
				"Uint64",
				"Uint32",
				"Float32",
				"Float64",
				"Reference",
			];

			var contextSingleTypes = propTypes.concat(["NodeProperty", "Enum"]);
			for (var i = 0; i < contextSingleTypes.length; ++i) {
				var propType = contextSingleTypes[i];
				expect(PropertyFactory.instanceOf(PropertyFactory.create(propType), propType)).to.be
					.true;
			}

			for (var j = 0; j < propTypes.length; ++j) {
				var propType = propTypes[j];
				expect(
					PropertyFactory.instanceOf(PropertyFactory.create(propType, "map"), propType, "map"),
				).to.be.true;
			}

			var contextArrayTypes = propTypes.concat(["Enum"]);
			for (var k = 0; k < contextArrayTypes.length; ++k) {
				var propType = contextArrayTypes[k];
				expect(
					PropertyFactory.instanceOf(
						PropertyFactory.create(propType, "array"),
						propType,
						"array",
					),
				).to.be.true;
			}
		});

		it("instanceOf check succeeds for schema based properties and native typeids", function () {
			PropertyFactory.register(SimplePoint);
			expect(
				PropertyFactory.instanceOf(PropertyFactory.create(SimplePoint.typeid), "BaseProperty"),
			).to.be.true;

			const testEnum = {
				inherits: "Enum",
				typeid: "test:testEnum-1.0.0",
				properties: [{ id: "test", value: 1 }],
			};
			PropertyFactory.register(testEnum);
			expect(
				PropertyFactory.instanceOf(
					PropertyFactory.create(testEnum.typeid, "array"),
					"Enum",
					"array",
				),
			).to.be.true;
		});

		it("instanceOf check fails for non native typeids", function () {
			PropertyFactory.register(SimplePoint);
			expect(
				PropertyFactory.instanceOf(
					PropertyFactory.create(SimplePoint.typeid),
					SimplePoint.typeid,
				),
			).to.be.false;
		});
	});
});

describe("Template registration", function () {
	var ColorID, myPropertyFactory;

	before(function () {
		ColorID = require("./validation/goodColorId");
	});

	beforeEach(function () {
		this.sinon = sinon.createSandbox();
		this.sinon.stub(console, "warn");
		myPropertyFactory = new PropertyFactory.constructor();
	});

	afterEach(function () {
		this.sinon.restore();
	});

	it("should register a versioned template", function () {
		myPropertyFactory.register(ColorID["1-0-0"].original);
	});

	it("should print a warning when registering an existing template that is not different from what is in the registry", function () {
		myPropertyFactory.register(ColorID["1-0-0"].original);
		myPropertyFactory.register(ColorID["1-0-0"].original);
		expect(console.warn.callCount).to.equal(1);
	});

	it("should accept registering a different template from what is in the registry if it is semantically equivalent", function () {
		var testPropertyTypeId = "TEST:array.Float32-0.0.1";
		var ValuesTemplate1 = {
			typeid: testPropertyTypeId,
			inherits: "NamedProperty",
			properties: [
				{
					id: "values",
					context: "array",
					typeid: "Float32",
				},
			],
		};

		var ValuesTemplate2 = {
			typeid: testPropertyTypeId,
			inherits: ["NamedProperty"],
			properties: [
				{
					id: "values",
					context: "array",
					typeid: "Float32",
					length: 0,
				},
			],
		};

		myPropertyFactory.register(ValuesTemplate1);
		expect(myPropertyFactory.register.bind(myPropertyFactory, ValuesTemplate2)).to.not.throw();
	});

	it("should throw when registering an existing template version that is different from what is in the registry", function () {
		myPropertyFactory.register(ColorID["1-0-0"].original);
		expect(
			myPropertyFactory.register.bind(myPropertyFactory, ColorID["1-0-0"].modified),
		).to.throw(Error);
	});

	it("should throw when registering an unversioned template", function () {
		expect(
			myPropertyFactory.register.bind(
				myPropertyFactory,
				require("./validation/badMissingSemverInTypeid"),
			),
		).to.throw(Error);
	});

	it("should throw when registering an invalid versioned template", function () {
		expect(
			myPropertyFactory.register.bind(
				myPropertyFactory,
				require("./validation/badPrimitiveTypeid"),
			),
		).to.throw(Error);
	});

	it("should throw when registering a primitive property through the public API", function () {
		expect(
			myPropertyFactory.register.bind(myPropertyFactory, "String", StringProperty),
		).to.throw(Error);
	});

	it("should register templates out of order without any warnings or errors", function () {
		myPropertyFactory.register(ColorID["1-0-0"].original);
		myPropertyFactory.register(ColorID["1-1-0"].goodSemver);
		myPropertyFactory.register(ColorID["1-0-1"].goodSemver);

		myPropertyFactory = new PropertyFactory.constructor();

		myPropertyFactory.register(ColorID["1-1-0"].goodSemver);
		myPropertyFactory.register(ColorID["1-0-0"].original);
		myPropertyFactory.register(ColorID["1-0-1"].goodSemver);

		expect(console.warn.callCount).to.equal(0);
	});

	it("should register a new template with the PATCH version updated", function () {
		myPropertyFactory.register(ColorID["1-0-0"].original);
		myPropertyFactory.register(ColorID["1-0-1"].goodSemver);
		expect(console.warn.callCount).to.equal(0);
	});

	it("should register a new template with the MINOR version updated", function () {
		myPropertyFactory.register(ColorID["1-0-0"].original);
		myPropertyFactory.register(ColorID["1-1-0"].goodSemver);
		expect(console.warn.callCount).to.equal(0);
	});

	it("should print a warning when registering a new template with the wrong version updated", function () {
		myPropertyFactory.register(ColorID["1-0-0"].original);
		myPropertyFactory.register(ColorID["1-1-0"].badSemver1);

		myPropertyFactory = new PropertyFactory.constructor();
		myPropertyFactory.register(ColorID["1-0-0"].original);
		myPropertyFactory.register(ColorID["1-1-0"].badSemver2);

		myPropertyFactory = new PropertyFactory.constructor();
		myPropertyFactory.register(ColorID["1-0-0"].original);
		myPropertyFactory._registerRemoteTemplate(ColorID["1-1-0"].badSemver1, generateGUID());

		myPropertyFactory = new PropertyFactory.constructor();
		myPropertyFactory.register(ColorID["1-1-0"].badSemver2);
		myPropertyFactory._registerRemoteTemplate(ColorID["1-0-0"].original, generateGUID());

		expect(console.warn.callCount).to.equal(4);
	});

	it("should register a new template with the MAJOR version updated", function () {
		myPropertyFactory.register(ColorID["1-0-0"].original);
		myPropertyFactory.register(ColorID["2-0-0"]);
		expect(console.warn.callCount).to.equal(0);
	});

	it("should register a versioned remote template", function () {
		myPropertyFactory._registerRemoteTemplate(ColorID["1-0-0"].original, generateGUID());
	});

	// biome-ignore format: https://github.com/biomejs/biome/issues/4202
	it(
		"should pass when registering a versioned remote template that exists" +
			" in the local registry but is the same from what is locally registered",
		function () {
			myPropertyFactory.register(ColorID["1-0-0"].original);
			myPropertyFactory._registerRemoteTemplate(ColorID["1-0-0"].original, generateGUID());

			myPropertyFactory = new PropertyFactory.constructor();

			myPropertyFactory._registerRemoteTemplate(ColorID["1-0-0"].original, generateGUID());
			myPropertyFactory.register(ColorID["1-0-0"].original);
			expect(console.warn.callCount).to.equal(0);
		},
	);

	// biome-ignore format: https://github.com/biomejs/biome/issues/4202
	it(
		"should fail when registering a versioned remote template that exists" +
			" in the local registry but differs from what is locally registered",
		function () {
			myPropertyFactory.register(ColorID["1-0-0"].original);
			expect(
				myPropertyFactory._registerRemoteTemplate.bind(
					myPropertyFactory,
					ColorID["1-0-0"].modified,
					generateGUID(),
				),
			).to.throw(Error);
		},
	);

	it("should throw when registering an unversioned remote template", function () {
		expect(
			myPropertyFactory._registerRemoteTemplate.bind(
				myPropertyFactory,
				require("./validation/badMissingSemverInTypeid"),
				generateGUID(),
			),
		).to.throw(Error);
	});

	it("should register a remote template even when there are other versions of the same template in the local registry", function () {
		var scope = generateGUID();
		myPropertyFactory.register(ColorID["1-0-0"].original);
		myPropertyFactory.register(ColorID["2-0-0"]);

		myPropertyFactory._registerRemoteTemplate(ColorID["1-1-0"].goodSemver, scope);
		myPropertyFactory._registerRemoteTemplate(ColorID["1-0-1"].goodSemver, scope);
		expect(console.warn.callCount).to.equal(0);
	});

	it("should register a local template even when there are other versions of the same template in the remote registry", function () {
		var scope = generateGUID();
		var scope2 = generateGUID();
		myPropertyFactory._registerRemoteTemplate(ColorID["1-1-0"].goodSemver, scope);
		myPropertyFactory._registerRemoteTemplate(ColorID["1-0-1"].goodSemver, scope);
		myPropertyFactory._registerRemoteTemplate(require("./validation/goodPointId"), scope2);
		myPropertyFactory._registerRemoteTemplate(
			require("./validation/goodColorPalette"),
			scope2,
		);

		myPropertyFactory.register(ColorID["1-0-0"].original);
		myPropertyFactory.register(ColorID["2-0-0"]);

		expect(console.warn.callCount).to.equal(0);
	});

	it("`registered` event is triggered when registering a template", function (done) {
		var typeid = "test:schemaReg-1.0.0";
		var registeredEventListener = function (template) {
			expect(template).to.exist;
			expect(template.typeid).to.equal(typeid);
			done();
		};

		PropertyFactory.addListener("registered", registeredEventListener);

		PropertyFactory.register({
			typeid: typeid,
		});
		// We remove the listener to avoid unnecessary calls for later templates registration.
		PropertyFactory.removeListener("registered", registeredEventListener);
	});
});

describe('Only properties and constants that inherit from NamedProperty can have the "set" context', function () {
	beforeEach(() => PropertyFactory._clear());
	afterEach(() => PropertyFactory._clear());

	describe("Properties", () => {
		describe("should throw when trying to register a set not inheriting from a namedProperty", () => {
			it("declared in a template", () => {
				var templateChild = {
					typeid: "adsk.test:anotherTestSchema-1.0.0",
				};

				var template = {
					typeid: "adsk.test:testSchema-1.0.0",
					properties: [
						{
							id: "something",
							context: "set",
							typeid: "adsk.test:anotherTestSchema-1.0.0",
						},
					],
				};

				PropertyFactory.register(template);
				PropertyFactory.register(templateChild);

				expect(() => {
					PropertyFactory.create(template.typeid);
				}).to.throw(MSG.SET_ONLY_NAMED_PROPS + templateChild.typeid);
			});

			it("declared in a template with two level of inheritance", () => {
				var itemParentTemplate = {
					typeid: "adsk.test:itemParent-1.0.0",
				};

				var itemTemplate = {
					typeid: "adsk.test:item-1.0.0",
					inherits: "adsk.test:itemParent-1.0.0",
				};

				var template = {
					typeid: "adsk.test:set-1.0.0",
					properties: [
						{
							id: "something",
							context: "set",
							typeid: "adsk.test:item-1.0.0",
						},
					],
				};

				PropertyFactory.register(itemParentTemplate);
				PropertyFactory.register(itemTemplate);
				PropertyFactory.register(template);

				expect(() => {
					PropertyFactory.create(template.typeid);
				}).to.throw(MSG.SET_ONLY_NAMED_PROPS + itemTemplate.typeid);
			});

			it("when passed as a parameter of the create method", () => {
				var template = {
					typeid: "adsk.test:test-1.0.0",
				};

				PropertyFactory.register(template);

				expect(() => {
					PropertyFactory.create(template.typeid, "set");
				}).to.throw(MSG.SET_ONLY_NAMED_PROPS + template.typeid);
			});
		});
	});

	describe("Constants", () => {
		describe("should throw when trying to register a set not inheriting from a namedProperty", () => {
			it("declared in a template", () => {
				var templateChild = {
					typeid: "adsk.test:anotherTestSchema-1.0.0",
				};

				var template = {
					typeid: "adsk.test:testSchema-1.0.0",
					constants: [
						{
							id: "something",
							context: "set",
							typeid: "adsk.test:anotherTestSchema-1.0.0",
							value: "hello",
						},
					],
				};

				PropertyFactory.register(template);
				PropertyFactory.register(templateChild);

				expect(() => {
					PropertyFactory.create(template.typeid);
				}).to.throw(MSG.SET_ONLY_NAMED_PROPS + templateChild.typeid);
			});

			it("declared in a template with two level of inheritance", () => {
				var itemParentTemplate = {
					typeid: "adsk.test:itemParent-1.0.0",
				};

				var itemTemplate = {
					typeid: "adsk.test:item-1.0.0",
					inherits: "adsk.test:itemParent-1.0.0",
				};

				var template = {
					typeid: "adsk.test:set-1.0.0",
					constants: [
						{
							id: "something",
							context: "set",
							typeid: "adsk.test:item-1.0.0",
							value: "hello",
						},
					],
				};

				PropertyFactory.register(itemParentTemplate);
				PropertyFactory.register(itemTemplate);
				PropertyFactory.register(template);

				expect(() => {
					PropertyFactory.create(template.typeid);
				}).to.throw(MSG.SET_ONLY_NAMED_PROPS + itemTemplate.typeid);
			});
			var unit = {
				annotation: {
					description: "A definite magnitude used as a standard of measurement.",
					doc: "http://docs.adskunits.apiary.io/#introduction/definitions/measurement-units",
				},
				typeid: "autodesk.unit:unit-1.0.0",
				constants: [
					{
						id: "name",
						typeid: "String",
					},
				],
			};
			var quantity = {
				annotation: {
					description:
						"A quantity typically measured in a particular set of compatible units.",
				},
				typeid: "autodesk.unit:quantity-1.0.0",
				constants: [
					{
						id: "name",
						typeid: "String",
					},
					{
						id: "units",
						typeid: "autodesk.unit:unit-1.0.0",
						context: "array",
						typedValue: [],
						annotation: {
							description:
								"List of all measurement units applicable to the measurable quantity.",
						},
					},
				],
			};
			var area = {
				annotation: { description: "Area." },
				typeid: "autodesk.unit.quantity:area-1.0.0",
				inherits: ["autodesk.unit:quantity-1.0.0"],
				constants: [
					{ id: "name", value: "Area" },
					{
						id: "units",
						typedValue: [{ typeid: "autodesk.unit.unit:squareCentimeters-1.0.0" }],
					},
				],
			};
			var centimeter = {
				annotation: { description: "Square centimeters." },
				typeid: "autodesk.unit.unit:squareCentimeters-1.0.0",
				inherits: ["autodesk.unit:unit-1.0.0"],
				constants: [{ id: "name", value: "Square centimeters" }],
			};
			it("@bugfix should support constant which inhirets from a polymorphic array", () => {
				PropertyFactory.register(unit);
				PropertyFactory.register(quantity);
				PropertyFactory.register(area);
				PropertyFactory.register(centimeter);
				var centimeterProp = PropertyFactory.create(centimeter.typeid);

				var areaProp = PropertyFactory.create(area.typeid);

				expect(areaProp.get("units").get(0).get("name").value).to.equal(
					centimeterProp.get("name").value,
				);
			});
		});
	});
});

describe("Async validation", function () {
	var TemplateValidator;
	var inheritsFromAsync = async function (child, ancestor) {
		return new Promise(function (resolve, reject) {
			setTimeout(function () {
				try {
					resolve(PropertyFactory.inheritsFrom(child, ancestor));
				} catch (error) {
					reject(error);
				}
			}, 0);
		});
	};

	var hasSchemaAsync = async function (typeid) {
		return new Promise(function (resolve, reject) {
			setTimeout(function () {
				resolve(PropertyFactory._has(typeid));
			}, 0);
		});
	};

	before(function () {
		TemplateValidator = require("@fluid-experimental/property-changeset").TemplateValidator;
	});

	it("can validate asynchronously", function () {
		var templateValidator = new TemplateValidator({
			inheritsFromAsync: inheritsFromAsync,
			hasSchemaAsync: hasSchemaAsync,
		});

		var templatePrevious = JSON.parse(JSON.stringify(require("./validation/goodPointId")));
		var template = JSON.parse(JSON.stringify(templatePrevious));
		template.typeid = "TeamLeoValidation2:PointID-0.9.9";
		return templateValidator.validateAsync(template, templatePrevious).then(function (result) {
			expect(result).property("isValid", false);
			expect(result.errors.length).to.be.at.least(1);
			expect(result.errors[0].message).to.have.string(MSG.VERSION_REGRESSION_1);
		});
	});

	it("can perform context validation asynchronously", function (done) {
		var templateValidator = new TemplateValidator({
			inheritsFromAsync: inheritsFromAsync,
			hasSchemaAsync: hasSchemaAsync,
		});

		// Doesn't inherit from 'NamedProperty'. Will cause an error
		var grandParentSchema = {
			typeid: "test:grandparentschema-1.0.0",
		};

		var parentSchema = {
			typeid: "test:parentschema-1.0.0",
			inherits: ["test:grandparentschema-1.0.0"],
		};

		var childSchema = {
			typeid: "test:childchema-1.0.0",
			properties: [
				{
					id: "set",
					typeid: "test:parentschema-1.0.0",
					context: "set",
				},
			],
		};

		PropertyFactory.register(grandParentSchema);
		PropertyFactory.register(parentSchema);

		templateValidator
			.validateAsync(childSchema)
			.then(function (result) {
				done(new Error("Should not be valid!"));
			})
			.catch(function (error) {
				expect(error).to.exist;
				done();
			});
	});
});

describe("inheritsFrom() method", () => {
	beforeEach(() => {
		PropertyFactory._clear();
		PropertyFactory.register([
			{
				typeid: "autodesk.examples:test.set-1.0.0",
				inherits: "NamedProperty",
			},
		]);
	});

	it("should recognize that the Int8 only inherits from BaseProperty", () => {
		const result = PropertyFactory.inheritsFrom("Int8", "BaseProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the Uint8 only inherits from BaseProperty", () => {
		const result = PropertyFactory.inheritsFrom("Uint8", "BaseProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the Int16 only inherits from BaseProperty", () => {
		const result = PropertyFactory.inheritsFrom("Int16", "BaseProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the Uint16 only inherits from BaseProperty", () => {
		const result = PropertyFactory.inheritsFrom("Uint16", "BaseProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the Int32 only inherits from BaseProperty", () => {
		const result = PropertyFactory.inheritsFrom("Int32", "BaseProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the Uint32 only inherits from BaseProperty", () => {
		const result = PropertyFactory.inheritsFrom("Uint32", "BaseProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the Float32 only inherits from BaseProperty", () => {
		const result = PropertyFactory.inheritsFrom("Float32", "BaseProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the Int64 only inherits from BaseProperty", () => {
		const result = PropertyFactory.inheritsFrom("Int64", "BaseProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the Uint64 only inherits from BaseProperty", () => {
		const result = PropertyFactory.inheritsFrom("Uint64", "BaseProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the Float64 only inherits from BaseProperty", () => {
		const result = PropertyFactory.inheritsFrom("Float64", "BaseProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the Bool only inherits from BaseProperty", () => {
		const result = PropertyFactory.inheritsFrom("Bool", "BaseProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the Reference only inherits from BaseProperty", () => {
		const result = PropertyFactory.inheritsFrom("Reference", "BaseProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the Enum only inherits from BaseProperty", () => {
		const result = PropertyFactory.inheritsFrom("Enum", "BaseProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the String inherits from BaseProperty", () => {
		const result = PropertyFactory.inheritsFrom("String", "BaseProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the NodeProperty inherits from BaseProperty", () => {
		const result = PropertyFactory.inheritsFrom("NodeProperty", "BaseProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the ContainerProperty inherits from BaseProperty", () => {
		const result = PropertyFactory.inheritsFrom("ContainerProperty", "BaseProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the NamedProperty inherits from BaseProperty", () => {
		const result = PropertyFactory.inheritsFrom("NamedProperty", "BaseProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the NamedNodeProperty inherits from BaseProperty", () => {
		const result = PropertyFactory.inheritsFrom("NamedNodeProperty", "BaseProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the NodeProperty inherits from ContainerProperty", () => {
		const result = PropertyFactory.inheritsFrom("NodeProperty", "ContainerProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the NamedProperty inherits from ContainerProperty", () => {
		const result = PropertyFactory.inheritsFrom("NamedProperty", "ContainerProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the String inherits from ContainerProperty", () => {
		const result = PropertyFactory.inheritsFrom("String", "ContainerProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the NamedNodeProperty inherits from NamedProperty", () => {
		const result = PropertyFactory.inheritsFrom("NamedNodeProperty", "NamedProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the NamedNodeProperty inherits from NodeProperty", () => {
		const result = PropertyFactory.inheritsFrom("NamedNodeProperty", "NodeProperty");

		expect(result).to.be.true;
	});

	it("should recognize that the test set that inherits from NamedNodeProperty also inherits from BaseProperty", () => {
		PropertyFactory._reregister({
			typeid: "autodesk.examples:test.set-1.0.0",
			inherits: "NamedNodeProperty",
		});
		const result = PropertyFactory.inheritsFrom(
			"autodesk.examples:test.set-1.0.0",
			"BaseProperty",
		);

		expect(result).to.be.true;
	});

	// biome-ignore format: https://github.com/biomejs/biome/issues/4202
	it(
		"should recognize that the test set that inherits from NamedNodeProperty" +
			" also inherits from AbstractStaticCollectionProperty",
		() => {
			PropertyFactory._reregister({
				typeid: "autodesk.examples:test.set-1.0.0",
				inherits: "NamedNodeProperty",
			});
			const result = PropertyFactory.inheritsFrom(
				"autodesk.examples:test.set-1.0.0",
				"AbstractStaticCollectionProperty",
			);

			expect(result).to.be.true;
		},
	);

	it("should recognize that the test set that inherits from NamedNodeProperty also inherits from NodeProperty", () => {
		PropertyFactory._reregister({
			typeid: "autodesk.examples:test.set-1.0.0",
			inherits: "NamedNodeProperty",
		});
		const result = PropertyFactory.inheritsFrom(
			"autodesk.examples:test.set-1.0.0",
			"NodeProperty",
		);

		expect(result).to.be.true;
	});

	it("should recognize that the test set that inherits from NamedNodeProperty also inherits from NamedProperty", () => {
		PropertyFactory._reregister({
			typeid: "autodesk.examples:test.set-1.0.0",
			inherits: "NamedNodeProperty",
		});
		const result = PropertyFactory.inheritsFrom(
			"autodesk.examples:test.set-1.0.0",
			"NamedProperty",
		);

		expect(result).to.be.true;
	});

	it("should recognize that the testSet doesn't inherits from foe", () => {
		const result = PropertyFactory.inheritsFrom("autodesk.examples:test.set-1.0.0", "foe");

		expect(result).to.be.false;
	});

	it("should return true if in_templateTypeid = in_baseTypeid", () => {
		const result = PropertyFactory.inheritsFrom(
			"autodesk.examples:test.set-1.0.0",
			"autodesk.examples:test.set-1.0.0",
		);

		expect(result).to.be.true;
	});

	it("should return false if in_templateTypeid = in_baseTypeid but in_options.includeSelf is false", () => {
		const result = PropertyFactory.inheritsFrom(
			"autodesk.examples:test.set-1.0.0",
			"autodesk.examples:test.set-1.0.0",
			{ includeSelf: false },
		);

		expect(result).to.be.false;
	});

	describe("Caching", () => {
		beforeEach(() => {
			// add a second schema for the cache tests
			PropertyFactory.register({
				typeid: "autodesk.examples:test.set-2.0.0",
				inherits: "NamedProperty",
			});
		});

		it("should cache results", () => {
			PropertyFactory.inheritsFrom("autodesk.examples:test.set-1.0.0", "NamedProperty");
			PropertyFactory.inheritsFrom("autodesk.examples:test.set-2.0.0", "NamedProperty");

			const expectedResults = {
				"autodesk.examples:test.set-1.0.0": {
					BaseProperty: true,
					AbstractStaticCollectionProperty: true,
					NamedProperty: true,
				},
				"autodesk.examples:test.set-2.0.0": {
					BaseProperty: true,
					AbstractStaticCollectionProperty: true,
					NamedProperty: true,
				},
			};

			expect(PropertyFactory._inheritanceCache).to.deep.equal(expectedResults);
		});

		it("should refresh the cache when _reregister() is called", () => {
			PropertyFactory.inheritsFrom("autodesk.examples:test.set-1.0.0", "NamedProperty");

			PropertyFactory._reregister({
				typeid: "autodesk.examples:test.set-1.0.0",
				inherits: "NodeProperty",
			});
			expect(PropertyFactory.inheritsFrom("autodesk.examples:test.set-1.0.0", "NodeProperty"))
				.to.be.true;

			PropertyFactory._reregister({
				typeid: "autodesk.examples:test.set-2.0.0",
				inherits: "NodeProperty",
			});
			expect(PropertyFactory.inheritsFrom("autodesk.examples:test.set-2.0.0", "NodeProperty"))
				.to.be.true;

			const expectedResults = {
				"autodesk.examples:test.set-1.0.0": {
					BaseProperty: true,
					AbstractStaticCollectionProperty: true,
					NodeProperty: true,
				},
				"autodesk.examples:test.set-2.0.0": {
					BaseProperty: true,
					AbstractStaticCollectionProperty: true,
					NodeProperty: true,
				},
			};

			expect(PropertyFactory._inheritanceCache).to.deep.equal(expectedResults);
		});

		it("should flush the cache when _clear() is called", () => {
			expect(PropertyFactory.inheritsFrom("autodesk.examples:test.set-1.0.0", "NamedProperty"))
				.to.be.true;
			expect(PropertyFactory.inheritsFrom("autodesk.examples:test.set-2.0.0", "NamedProperty"))
				.to.be.true;

			PropertyFactory._clear();
			expect(PropertyFactory._inheritanceCache).to.be.empty;
		});
	});
});

describe("Remote template scope collection", () => {
	var ColorID;
	var scope = () => PropertyFactory._remoteScopedAndVersionedTemplates;

	before(() => {
		ColorID = require("./validation/goodColorId");
	});

	beforeEach(() => {
		PropertyFactory._clear();
	});

	it("should collect registered remote templates in the scope.", () => {
		const scopeGuid = generateGUID();
		const templateA = Object.assign({}, ColorID["1-0-0"].original, {
			typeid: "testA:ColorID-1.0.0",
		});
		const templateB = Object.assign({}, ColorID["1-0-0"].original, {
			typeid: "testB:ColorID-1.0.0",
		});

		PropertyFactory._registerRemoteTemplate(templateA, scopeGuid);
		PropertyFactory._registerRemoteTemplate(templateB, scopeGuid);

		expect(scope().getCount()).to.be.equal(1);
		expect(scope().has(scopeGuid)).to.be.true;
		expect(scope().item(scopeGuid).getCount()).to.be.equal(2);

		expect(scope().item(scopeGuid).has("testA:ColorID")).to.be.true;
		expect(scope().item(scopeGuid).item("testA:ColorID").getKeys()).to.have.members(["1.0.0"]);

		expect(scope().item(scopeGuid).has("testB:ColorID")).to.be.true;
		expect(scope().item(scopeGuid).item("testB:ColorID").getKeys()).to.have.members(["1.0.0"]);
	});

	it("should remove a specific scope from the scope collection when _removeScope is called.", () => {
		const scopeGuidA = generateGUID();
		const scopeGuidB = generateGUID();
		const templateA = Object.assign({}, ColorID["1-0-0"].original, {
			typeid: "testA:ColorID-1.0.0",
		});
		const templateB = Object.assign({}, ColorID["1-0-0"].original, {
			typeid: "testB:ColorID-1.0.0",
		});

		PropertyFactory._registerRemoteTemplate(templateA, scopeGuidA);
		PropertyFactory._registerRemoteTemplate(templateB, scopeGuidB);

		expect(scope().getCount()).to.be.equal(2);
		expect(scope().has(scopeGuidA)).to.be.true;
		expect(scope().has(scopeGuidB)).to.be.true;

		PropertyFactory._removeScope(scopeGuidA);

		expect(scope().getCount()).to.be.equal(1);
		expect(scope().has(scopeGuidA)).to.be.false;
		expect(scope().has(scopeGuidB)).to.be.true;
	});

	it("should be able to get a specific template from the scope collection.", () => {
		const scopeGuidA = generateGUID();
		const scopeGuidB = generateGUID();
		const templateA = Object.assign({}, ColorID["1-0-0"].original, {
			typeid: "testA:ColorID-1.0.0",
		});
		const templateB = Object.assign({}, ColorID["1-0-0"].original, {
			typeid: "testB:ColorID-1.0.0",
		});

		PropertyFactory._registerRemoteTemplate(templateA, scopeGuidA);
		PropertyFactory._registerRemoteTemplate(templateB, scopeGuidB);

		expect(
			PropertyFactory._get("testA:ColorID-1.0.0", undefined, scopeGuidA).typeid,
		).to.be.equal("testA:ColorID-1.0.0");

		expect(
			PropertyFactory._get("testB:ColorID-1.0.0", undefined, scopeGuidB).typeid,
		).to.be.equal("testB:ColorID-1.0.0");
	});

	it("should be cleared when the PropertyFactory is.", () => {
		const scopeGuid = generateGUID();
		const template = Object.assign({}, ColorID["1-0-0"].original, {
			typeid: "test:ColorID-1.0.0",
		});

		PropertyFactory._registerRemoteTemplate(template, scopeGuid);
		PropertyFactory._clear();

		expect(scope().getCount()).to.be.equal(0);
	});
});
