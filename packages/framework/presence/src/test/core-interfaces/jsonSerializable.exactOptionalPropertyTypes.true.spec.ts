/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { passThru } from "./jsonSerializable.spec.js";
import { assertIdenticalTypes, createInstanceOf } from "./testUtils.js";
import { objectWithOptionalUndefined } from "./testValues.js";

describe("JsonSerializable under exactOptionalPropertyTypes=true", () => {
	describe("negative compilation tests", () => {
		describe("unsupported types cause compiler error", () => {
			describe("object", () => {
				describe("object with `undefined`", () => {
					it("as optional exact property type", () => {
						const { filteredIn } = passThru(
							// @ts-expect-error not assignable to `{ optUndef?: never; }`
							objectWithOptionalUndefined,
							{},
						);
						assertIdenticalTypes(filteredIn, createInstanceOf<{ optUndef?: never }>());
					});
				});
			});
		});
	});
});
