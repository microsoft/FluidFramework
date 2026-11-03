/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Tests the functions exported by error_objects/http_error.js
 */

import { expect } from "chai";

import { FlaggedError } from "../../index.js";

describe("property-common.FlaggedError", function () {
	describe("Flags", function () {
		it("can be extended", function (done) {
			Object.keys(FlaggedError.FLAGS).forEach(function (key: string, index: number) {
				expect(FlaggedError.FLAGS[key as keyof typeof FlaggedError.FLAGS]).to.equal(
					Math.pow(2, index),
				);
			});
			done();
		});
	});
});
