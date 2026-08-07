/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview In this file, we will test Float32 object described in /src/properties/float32.js
 */

import { Float32Property } from "../../properties/floatProperties.js";

describe("Float32", function () {
	describe("Checking the value stored in ValueProperty", function () {
		it("should return the same value", function (done) {
			var fp;
			var error;
			const value = 100;
			try {
				fp =
					// @ts-expect-error - constructor is marked protected, but we want to test it directly here.
					new Float32Property(
						// separate from ts-expect-error
						{ id: "temperature" },
					);
				fp.setValue(value);
			} catch (e) {
				error = e;
			} finally {
				expect(fp).to.not.equal(null);
				expect(fp.getValue()).to.equal(value);
				expect(error).to.equal(undefined);
				done();
			}
		});
	});
});
