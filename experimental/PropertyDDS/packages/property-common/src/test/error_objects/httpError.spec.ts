/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Tests the functions exported by error_objects/http_error.js
 */

import { expect } from "chai";

import { HTTPError } from "../..";

describe("property-common.HTTPError", () => {
	const errorMsg = "a test error message";

	describe("object", () => {
		it("is instanceof Error", (done) => {
			expect(new HTTPError() instanceof Error).to.equal(true);
			done();
		});

		it("is instanceof HTTPError", (done) => {
			expect(new HTTPError() instanceof HTTPError).to.equal(true);
			done();
		});
	});

	describe("toString", () => {
		it("basic error message", (done) => {
			const actual = new HTTPError(errorMsg);
			expect(actual.toString()).to.have.string(errorMsg);
			done();
		});
	});

	describe("JSON.stringify", () => {
		it("stringifies", (done) => {
			const actual = JSON.stringify(new HTTPError(errorMsg));
			expect(actual).to.have.string(errorMsg);
			done();
		});
	});

	describe("flags", () => {
		it("default at 0", (done) => {
			const actual = new HTTPError(errorMsg);
			expect(actual.flags).to.equal(0);
			done();
		});

		it("can be quiet", (done) => {
			const actual = new HTTPError(
				errorMsg,
				undefined,
				undefined,
				undefined,
				undefined,
				HTTPError.FLAGS.QUIET,
			);
			expect(actual.isQuiet()).to.equal(true);
			expect(actual.flags).to.equal(HTTPError.FLAGS.QUIET);
			done();
		});

		it("can be extended", (done) => {
			const actual = new HTTPError(
				errorMsg,
				undefined,
				undefined,
				undefined,
				undefined,
				// eslint-disable-next-line no-bitwise
				HTTPError.FLAGS.QUIET | 4,
			);
			expect(actual.isQuiet()).to.equal(true);
			// eslint-disable-next-line no-bitwise
			expect(actual.flags).to.equal(HTTPError.FLAGS.QUIET | 4);
			done();
		});
	});
});
