/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Tests the functions exported by error_objects/http_error.js
 */

import { expect } from "chai";

import { FlaggedError } from "../..";

describe("property-common.FlaggedError", () => {
	describe("Flags", () => {
		it("can be extended", (done) => {
			Object.keys(FlaggedError.FLAGS).forEach((key, index) => {
				expect(FlaggedError.FLAGS[key]).to.equal(2 ** index);
			});
			done();
		});
	});
});
