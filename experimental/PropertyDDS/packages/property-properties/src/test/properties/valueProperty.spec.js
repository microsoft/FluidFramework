/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* globals assert */

/**
 * @fileoverview In this file, we will test ValueProperty object described in /src/properties/valueProperty.js
 */

const { Int64, Uint64 } = require("@fluid-experimental/property-common");

const { PropertyFactory } = require("../..");
const { ValueProperty } = require("../../properties/valueProperty");

describe("ValueProperty", function () {
	var OurTestTemplate;

	/**
	 * Get all the objects we need in this test here.
	 */
	before(function () {
		OurTestTemplate = {
			typeid: "autodesk.tests:TestID-1.0.0",
			properties: [
				{
					id: "MyFloat",
					typeid: "Float32",
				},
				{
					id: "MyInt",
					typeid: "Int32",
				},
				{
					id: "MyBool",
					typeid: "Bool",
				},
			],
		};
		PropertyFactory._reregister(OurTestTemplate);
	});

	describe("Allocating ValueProperty object with all parameters", function () {
		it("should succeed", function (done) {
			var vp;
			var error;
			try {
				vp = new ValueProperty({ id: "goodId" });
			} catch (e) {
				error = e;
			} finally {
				expect(vp).to.not.equal(null);
				expect(error).to.equal(undefined);
				done();
			}
		});
	});

	describe("API methods", function () {
		it(".getValue should work", function () {
			var myProp = PropertyFactory.create("Bool");
			myProp.setValue(true);
			expect(myProp.getValue()).to.equal(true);
		});
		it(".setValue should work to set the value and return nothing", function () {
			var myProp = PropertyFactory.create("Int32");
			expect(myProp.getValue()).to.equal(0);
			expect(myProp.setValue(88)).to.be.undefined;
			expect(myProp.getValue()).to.equal(88);
		});
	});

	describe("Setting a ValueProperty to the same value should not dirty it", function () {
		it("should not be dirty", function (done) {
			var error;
			var vp;
			try {
				vp = PropertyFactory.create("autodesk.tests:TestID-1.0.0");

				vp.properties.MyBool.value = true;
				vp.properties.MyInt.value = 1.2;
				vp.properties.MyFloat.value = 1 / 3;

				vp.cleanDirty();

				vp.properties.MyBool.value = true;
				vp.properties.MyInt.value = 1.2;
				vp.properties.MyFloat.value = 1 / 3;
			} catch (e) {
				error = e;
			} finally {
				expect(error).to.not.equal(null);
				expect(vp).to.not.equal(undefined);
				expect(vp.isDirty()).to.equal(false);
				done();
			}
		});
	});

	it("value properties should support default values", function () {
		expect(PropertyFactory.create("Int8", undefined, 10).value).to.equal(10);
		expect(PropertyFactory.create("Uint8", undefined, 10).value).to.equal(10);
		expect(PropertyFactory.create("Int16", undefined, 10).value).to.equal(10);
		expect(PropertyFactory.create("Uint16", undefined, 10).value).to.equal(10);
		expect(PropertyFactory.create("Int32", undefined, 10).value).to.equal(10);
		expect(PropertyFactory.create("Uint32", undefined, 10).value).to.equal(10);
		expect(PropertyFactory.create("Int64", undefined, new Int64(10, 10)).value).to.deep.equal(
			new Int64(10, 10),
		);
		expect(
			PropertyFactory.create("Uint64", undefined, new Uint64(10, 10)).value,
		).to.deep.equal(new Uint64(10, 10));
		expect(PropertyFactory.create("Float32", undefined, 10).value).to.equal(10);
		expect(PropertyFactory.create("Float64", undefined, 10).value).to.equal(10);
		expect(PropertyFactory.create("Bool", undefined, false).value).to.equal(false);
		expect(PropertyFactory.create("Bool", undefined, true).value).to.equal(true);
		expect(PropertyFactory.create("String", undefined, "test").value).to.equal("test");
		expect(PropertyFactory.create("Reference", undefined, "/").value).to.equal("/");
	});

	describe("ValueProperty serialize/deserialize tests", function () {
		it("should correctly serialize/deserialize", function () {
			var int32Prop = PropertyFactory.create("Int32");
			int32Prop.value = 11;

			var serialized = int32Prop.serialize({ dirtyOnly: true });
			expect(serialized).to.equal(11);
			int32Prop.cleanDirty();
			serialized = int32Prop._serialize(true);
			assert.deepEqual(serialized, {});

			var anotherInt32Prop = PropertyFactory.create("Int32");
			var deserializeResult = anotherInt32Prop.deserialize(
				int32Prop.serialize({ dirtyOnly: false }),
			);
			expect(deserializeResult).to.equal(11);
			deserializeResult = anotherInt32Prop.deserialize(int32Prop._serialize(false));
			assert.deepEqual(deserializeResult, undefined);
			expect(anotherInt32Prop.value).to.be.equal(11);
		});
	});
});
