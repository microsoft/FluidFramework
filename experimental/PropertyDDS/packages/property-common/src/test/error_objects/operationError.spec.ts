/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

/**
 * @fileoverview Tests the functions exported by error_objects/operation_error.js
 */

import { expect } from "chai";

import { OperationError } from "../../index";

describe("property-common.OperationError", () => {
	const errorMsg = "a test error message";
	const operation = "TestOperation";

	describe("object", () => {
		it("is instanceof Error", (done) => {
			expect(new OperationError() instanceof Error).to.equal(true);
			done();
		});

		it("is instanceof OperationError", (done) => {
			expect(new OperationError() instanceof OperationError).to.equal(true);
			done();
		});

		it("stringifies", (done) => {
			const actual = JSON.stringify(new OperationError(errorMsg));
			const expected = '{"flags":0,"name":"OperationError"}';
			expect(actual).to.equal(expected);
			done();
		});
	});

	describe("toString", () => {
		it("basic error message", (done) => {
			const expected = `OperationError: ${errorMsg}`;
			const actual = new OperationError(errorMsg).toString();
			expect(actual).to.not.equal(undefined);
			expect(actual).to.have.string(expected);
			done();
		});

		it("full OperationError", (done) => {
			const code = 99;
			const expected = `OperationError[${operation}, ${code}, 1 [TRANSIENT]]: ${errorMsg}`;
			const actual = new OperationError(
				errorMsg,
				operation,
				code,
				OperationError.FLAGS.TRANSIENT,
			);
			expect(actual.toString()).to.have.string(expected);
			done();
		});

		it("partial OperationError", (done) => {
			const expected = `OperationError[${operation}]: ${errorMsg}`;
			const actual = new OperationError(errorMsg, operation);
			expect(actual.toString()).to.have.string(expected);
			done();
		});

		it("code only", (done) => {
			const code = 99;
			const expected = `OperationError[${code}]: ${errorMsg}`;
			const actual = new OperationError(errorMsg, undefined, code);
			expect(actual.toString()).to.have.string(expected);
			done();
		});

		it("extended flags", (done) => {
			const code = 99;
			const expected = `OperationError[${operation}, ${code}, 5 [TRANSIENT]]: ${errorMsg}`;
			const actual = new OperationError(
				errorMsg,
				operation,
				code,
				OperationError.FLAGS.TRANSIENT | 4,
			);
			expect(actual.toString()).to.have.string(expected);
			done();
		});
	});

	describe("fields", () => {
		it("name", (done) => {
			const actual = new OperationError();
			expect(actual.name).to.equal("OperationError");
			done();
		});

		it("stack", (done) => {
			const actual = new OperationError();
			expect(actual).to.have.property("stack");
			done();
		});

		it("operation", (done) => {
			const actual = new OperationError(errorMsg, operation);
			expect(actual.operation).to.equal(operation);
			done();
		});

		it("statusCode", (done) => {
			const code = 99;
			const actual = new OperationError(errorMsg, operation, code);
			expect(actual.statusCode).to.equal(code);
			done();
		});

		it("can set the stack", (done) => {
			const e = new OperationError();
			const e2 = new Error();
			e.stack = e2.stack;
			done();
		});
	});

	describe("flags", () => {
		it("default at 0", (done) => {
			const actual = new OperationError(
				errorMsg,
				operation,
				undefined,
				undefined,
			);
			expect(actual.flags).to.equal(0);
			done();
		});

		it("can be transiant", (done) => {
			const actual = new OperationError(
				errorMsg,
				operation,
				undefined,
				OperationError.FLAGS.TRANSIENT,
			);
			expect(actual.isTransient()).to.equal(true);
			expect(actual.flags).to.equal(OperationError.FLAGS.TRANSIENT);
			done();
		});

		it("can be quiet", (done) => {
			const actual = new OperationError(
				errorMsg,
				operation,
				undefined,
				OperationError.FLAGS.QUIET,
			);
			expect(actual.isQuiet()).to.equal(true);
			expect(actual.flags).to.equal(OperationError.FLAGS.QUIET);
			done();
		});

		it("can be transient and quiet", (done) => {
			const actual = new OperationError(
				errorMsg,
				operation,
				undefined,
				OperationError.FLAGS.TRANSIENT | OperationError.FLAGS.QUIET,
			);
			expect(actual.isTransient()).to.equal(true);
			expect(actual.isQuiet()).to.equal(true);
			expect(actual.flags).to.equal(
				OperationError.FLAGS.TRANSIENT | OperationError.FLAGS.QUIET,
			);
			done();
		});

		it("can be extended", (done) => {
			const actual = new OperationError(
				errorMsg,
				operation,
				undefined,
				OperationError.FLAGS.TRANSIENT | 4 | OperationError.FLAGS.QUIET,
			);
			expect(actual.isTransient()).to.equal(true);
			expect(actual.isQuiet()).to.equal(true);
			expect(actual.flags).to.equal(
				OperationError.FLAGS.TRANSIENT | 4 | OperationError.FLAGS.QUIET,
			);
			done();
		});
	});
});
