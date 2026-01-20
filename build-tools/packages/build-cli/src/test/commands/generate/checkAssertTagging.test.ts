/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "mocha";
import { checkAssertTagging } from "../../../commands/generate/assertTags.js";

describe("checkAssertTagging", () => {
	it("should be exported and callable", () => {
		assert(typeof checkAssertTagging === "function", "checkAssertTagging should be a function");
	});
});
