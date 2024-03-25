/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	createResponseError,
	exceptionToResponse,
	responseToException,
} from "../dataStoreHelpers.js";

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
});
