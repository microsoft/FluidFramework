/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview In this file, we will test the relationship property added to /src/property_factory.js
 */

const { PropertyFactory } = require("../..");

describe("RelationshipProperty", () => {
	it("should be able to add a relationship property whithin a schema", () => {
		const assetSchema = {
			typeid: "foo:bar-1.0.0",
			inherits: ["NodeProperty"],
			properties: [
				{
					id: "relationship",
					typeid: "RelationshipProperty",
				},
			],
		};
		PropertyFactory.register(assetSchema);
		const str = PropertyFactory.create("String");
		str.setValue("BAR");
		const foo = PropertyFactory.create(assetSchema.typeid);
		foo.insert("str", str);
		const relation = foo.get("relationship");
		expect(relation.get("guid").getValue()).to.be.a("string");
		expect(relation.resolvePath("to")).to.not.exist;
		relation.resolvePath("to*").setValue("/str");
		expect(relation.resolvePath("to")).to.exist;
		expect(relation.resolvePath("to").getValue()).to.equal("BAR");
	});
});
