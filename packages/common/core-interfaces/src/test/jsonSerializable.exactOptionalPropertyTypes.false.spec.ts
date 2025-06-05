/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { passThru } from "./jsonSerializable.spec.js";
import { assertIdenticalTypes } from "./testUtils.js";
import { objectWithOptionalUndefined } from "./testValues.js";

describe("JsonSerializable under exactOptionalPropertyTypes=false", () => {
	describe("positive compilation tests", () => {
		describe("supported object types", () => {
			it("object with optional exact `undefined`", () => {
				// Note that this case is "permitted". While exact `undefined` results
				// in a removed property, here the property is optional and thus
				// result will meet criteria (even if the output is always known
				// to be different than input). exactOptionalPropertyTypes=false
				// does not make it easy to detect exactly `undefined` properties
				// and produce the preferred `never` result.
				const { filteredIn } = passThru(objectWithOptionalUndefined, {});
				assertIdenticalTypes(filteredIn, objectWithOptionalUndefined);
			});
		});
	});
});
