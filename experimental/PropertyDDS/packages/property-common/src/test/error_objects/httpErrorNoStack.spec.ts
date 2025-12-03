/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

/**
 * @fileoverview Tests the functions exported by error_objects/http_error_no_stack.js
 */

import { expect } from "chai";

import { HTTPError, HTTPErrorNoStack } from "../../index";

describe("property-common.HTTPErrorNoStack", () => {
	const errorMsg = "a test error message";

	describe("object", () => {
		it("is instanceof Error", (done) => {
			expect(new HTTPErrorNoStack() instanceof Error).to.equal(true);
			done();
		});

		it("is instanceof HTTPError", (done) => {
			expect(new HTTPErrorNoStack() instanceof HTTPError).to.equal(true);
			done();
		});

		it("is instanceof HTTPErrorNoStack", (done) => {
			expect(new HTTPErrorNoStack() instanceof HTTPErrorNoStack).to.equal(true);
			done();
		});

		it("has no stack parameter", (done) => {
			const httpErrorNoStack = new HTTPErrorNoStack(errorMsg);
			expect(httpErrorNoStack.stack).to.equal(undefined);
			done();
		});
	});

	describe("flags", () => {
		it("default at 0", (done) => {
			const actual = new HTTPErrorNoStack(errorMsg);
			expect(actual.flags).to.equal(0);
			done();
		});

		it("can be quiet", (done) => {
			const actual = new HTTPErrorNoStack(
				errorMsg,
				undefined,
				undefined,
				undefined,
				undefined,
				HTTPErrorNoStack.FLAGS.QUIET,
			);
			expect(actual.isQuiet()).to.equal(true);
			expect(actual.flags).to.equal(HTTPErrorNoStack.FLAGS.QUIET);
			done();
		});

		it("can be extended", (done) => {
			const actual = new HTTPErrorNoStack(
				errorMsg,
				undefined,
				undefined,
				undefined,
				undefined,
				HTTPErrorNoStack.FLAGS.QUIET | 4,
			);
			expect(actual.isQuiet()).to.equal(true);
			expect(actual.flags).to.equal(HTTPErrorNoStack.FLAGS.QUIET | 4);
			done();
		});
	});
});
