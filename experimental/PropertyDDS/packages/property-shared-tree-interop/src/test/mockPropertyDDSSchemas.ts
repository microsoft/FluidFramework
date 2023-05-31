/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export default {
	independent: {
		typeid: "Test:IndependentType-1.0.0",
		properties: [{ id: "any", optional: true }],
	},
	neverType: {
		// does not inherit from "NodeProperty" and has no properties
		typeid: "Test:NeverType-1.0.0",
	},
	typeWithNestedProperties: {
		typeid: "Test:NestedProperties-1.0.0",
		properties: [{ id: "withNestedProperties", properties: [{ id: "foo", typeid: "String" }] }],
	},
	child: {
		inherits: ["Test:Optional-1.0.0"],
		typeid: "Test:Child-1.0.0",
		properties: [{ id: "backref", typeid: "Test:Optional-1.0.0", optional: true }],
	},
	optional: {
		inherits: ["NodeProperty"],
		typeid: "Test:Optional-1.0.0",
		properties: [
			{ id: "misc", typeid: "NodeProperty", optional: true },
			{ id: "child", typeid: "Test:Child-1.0.0", optional: true },
			{ id: "childMap", typeid: "Test:Child-1.0.0", optional: true, context: "map" },
			{ id: "childArray", typeid: "Test:Child-1.0.0", optional: true, context: "array" },
		],
	},
};
