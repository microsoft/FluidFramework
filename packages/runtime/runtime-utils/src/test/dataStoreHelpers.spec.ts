/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IResponse } from "@fluidframework/core-interfaces";
import { DataProcessingError } from "@fluidframework/telemetry-utils/internal";

import {
	createResponseError,
	exceptionToResponse,
	responseExceptionMetadataSym,
	responseToException,
} from "../dataStoreHelpers.js";
import type { IErrorWithResponseExceptionMetadata } from "../dataStoreHelpers.js";

class TestError extends Error {
	public readonly sentinel = "test";
}

type ResponseExceptionLike = Error & {
	code?: number;
	errorFromRequestFluidObject?: true;
	underlyingResponseHeaders?: Record<string, unknown>;
};

describe("createResponseError", () => {
	it("Strip URL query param ", () => {
		const response = createResponseError(400, "SomeValue", { url: "http://foo.com?a=b" });
		assert.strictEqual(response.value, "SomeValue: http://foo.com");
	});

	it("request / response / error handling ", () => {
		const request = { url: "/foo/bar?something" };
		const response = createResponseError(401, "some value", request);
		const value = "some value: /foo/bar";
		assert.strict.equal(response.status, 401, "status code");
		assert.strict.equal(response.value, value, "value");
		const stack = response.stack;
		assert.strict.notEqual(stack, undefined, "stack");

		const exception = responseToException(response, request);
		assert.strict.equal(exception.message, value, "value2");
		assert.strict.equal(exception.stack, stack, "stack2");

		const response2 = exceptionToResponse(exception);
		assert.strict.equal(response2.status, 401, "status code3");
		assert.strict.equal(response2.value, value, "value3");
		assert.strict.equal(response.stack, stack, "stack3");
	});

	it("preserves the original Error object when available on the response", () => {
		const originalError = new TestError("hello");
		const response = exceptionToResponse(originalError);

		const exception = responseToException(response, { url: "/foo" });

		assert.strict.equal(exception, originalError);
		assert.strict.equal(exception.sentinel, "test");
	});

	// IMPORTANT: Although IResponseException isn't exported from the module,
	// there are known external consumers of these props, and so this test stands to ensure
	// we don't accidentally break the implicit contract, while we work on a more explicit one.
	it("preserves underlyingResponseHeaders on a preserved LoggingError", () => {
		const originalError = DataProcessingError.create(
			"hello",
			"codepath",
		) as ResponseExceptionLike;
		const headers = { tombstone: true };
		const response: IResponse & { originalError: unknown } = {
			mimeType: "text/plain",
			status: 404,
			value: "hello",
			headers,
			originalError,
		};

		const exception = responseToException(response, { url: "/foo" }) as ResponseExceptionLike;

		assert.strict.equal(exception, originalError);
		assert.strict.equal(exception.code, 404);
		assert.strict.equal(exception.errorFromRequestFluidObject, true);
		assert.strict.equal(exception.underlyingResponseHeaders, headers);

		const response2 = exceptionToResponse(exception);
		assert.strict.equal(response2.status, 404);
		assert.strict.equal(response2.headers, headers);
	});

	it("stores response exception metadata in the symbol-indexed bag", () => {
		const headers = { tombstone: true };
		const response = createResponseError(404, "not found", { url: "/foo" }, headers);
		const exception = responseToException(response, { url: "/foo" }) as ResponseExceptionLike &
			IErrorWithResponseExceptionMetadata;

		assert.deepStrictEqual(exception[responseExceptionMetadataSym], {
			code: 404,
			underlyingResponseHeaders: headers,
		});
		assert.strict.equal(exception.code, 404);
		assert.strict.equal(exception.underlyingResponseHeaders, headers);
	});
});
