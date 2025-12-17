/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { isAssignableTo, requireAssignableTo, requireFalse } from "../../util/index.js";

import type {
	SchemaType,
	SimpleAllowedTypeAttributes,
	SimpleNodeSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/simpleSchema.js";

// Verify the variance of SimpleAllowedTypeAttributes's "Type" parameter.
// Due to the issue noted in its private remarks, this validation is important to ensure the mitigation is effective.
{
	type _testA = requireAssignableTo<
		SimpleAllowedTypeAttributes<SchemaType.Stored>,
		SimpleAllowedTypeAttributes
	>;
	type _testB = requireAssignableTo<
		SimpleAllowedTypeAttributes<SchemaType.View>,
		SimpleAllowedTypeAttributes
	>;

	type _test = requireFalse<
		isAssignableTo<SimpleAllowedTypeAttributes, SimpleAllowedTypeAttributes<SchemaType.Stored>>
	>;
	type _test2 = requireFalse<
		isAssignableTo<SimpleAllowedTypeAttributes, SimpleAllowedTypeAttributes<SchemaType.View>>
	>;

	type X = SimpleAllowedTypeAttributes["isStaged"];
	type Y = SimpleAllowedTypeAttributes<SchemaType.Stored>["isStaged"];
	type Z = SimpleAllowedTypeAttributes<SchemaType.View>["isStaged"];

	type _testY = requireFalse<isAssignableTo<X, Y>>;
	type _testZ = requireFalse<isAssignableTo<X, Z>>;

	type _test3 = requireFalse<
		isAssignableTo<
			SimpleAllowedTypeAttributes<SchemaType.Stored>,
			SimpleAllowedTypeAttributes<SchemaType.View>
		>
	>;

	type _test4 = requireFalse<
		isAssignableTo<
			SimpleAllowedTypeAttributes<SchemaType.View>,
			SimpleAllowedTypeAttributes<SchemaType.Stored>
		>
	>;
}

// Verify the variance of SimpleNodeSchema's "Type" parameter.
{
	type _test = requireFalse<
		isAssignableTo<SimpleNodeSchema, SimpleNodeSchema<SchemaType.Stored>>
	>;
	type _test2 = requireFalse<
		isAssignableTo<SimpleNodeSchema, SimpleNodeSchema<SchemaType.View>>
	>;
}
