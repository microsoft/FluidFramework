/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";

import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";
import { IThrottlingWarning } from "@fluidframework/driver-definitions/internal";

import {
	RouterliciousErrorTypes,
	createR11sNetworkError,
	errorObjectFromSocketError,
	getUrlForTelemetry,
	socketIoPath,
	throwR11sNetworkError,
} from "../errorUtils.js";

describe("ErrorUtils", () => {
	/**
	 * Checks if the input is an {@link IThrottlingWarning}.
	 */
	function isIThrottlingWarning(input: unknown): input is IThrottlingWarning {
		return (
			input !== undefined &&
			(input as Partial<IThrottlingWarning>).errorType === FluidErrorTypes.throttlingError &&
			(input as Partial<IThrottlingWarning>).retryAfterSeconds !== undefined
		);
	}

	describe("createR11sNetworkError()", () => {
		it("creates non-retriable authorization error on 401", () => {
			const message = "test error";
			const error = createR11sNetworkError(message, 401);
			assert.strictEqual(error.errorType, RouterliciousErrorTypes.authorizationError);
			assert.strictEqual(error.canRetry, false);
		});
		it("creates non-retriable authorization error on 403", () => {
			const message = "test error";
			const error = createR11sNetworkError(message, 403);
			assert.strictEqual(error.errorType, RouterliciousErrorTypes.authorizationError);
			assert.strictEqual(error.canRetry, false);
		});
		it("creates non-retriable not-found error on 404", () => {
			const message = "test error";
			const error = createR11sNetworkError(message, 404);
			assert.strictEqual(
				error.errorType,
				RouterliciousErrorTypes.fileNotFoundOrAccessDeniedError,
			);
			assert.strictEqual(error.canRetry, false);
		});
		it("creates retriable error on 429 with retry-after", () => {
			const message = "test error";
			const error = createR11sNetworkError(message, 429, 5000);
			assert.strictEqual(error.errorType, RouterliciousErrorTypes.throttlingError);
			assert.strictEqual(error.canRetry, true);
			assert.strictEqual((error as IThrottlingWarning).retryAfterSeconds, 5);
		});
		it("creates retriable error on 429 without retry-after", () => {
			const message = "test error";
			const error = createR11sNetworkError(message, 429);
			assert.strictEqual(error.errorType, RouterliciousErrorTypes.genericNetworkError);
			assert.strictEqual(error.canRetry, true);
		});
		it("creates retriable error on 500", () => {
			const message = "test error";
			const error = createR11sNetworkError(message, 500);
			assert.strictEqual(error.errorType, RouterliciousErrorTypes.genericNetworkError);
			assert.strictEqual(error.canRetry, true);
		});
		it("creates retriable error on anything else with retryAfter", () => {
			const message = "test error";
			const error = createR11sNetworkError(message, 400, 100000);
			assert.strictEqual(error.errorType, RouterliciousErrorTypes.throttlingError);
			assert.strictEqual(error.canRetry, true);
			assert.strictEqual((error as any).retryAfterSeconds, 100);
		});
		it("creates non-retriable error on anything else", () => {
			const message = "test error";
			const error2 = createR11sNetworkError(message, 400);
			assert.strictEqual(error2.errorType, RouterliciousErrorTypes.genericNetworkError);
			assert.strictEqual(error2.canRetry, false);
		});
	});
	describe("throwR11sNetworkError()", () => {
		it("throws non-retriable authorization error on 401", () => {
			const message = "test error";
			assert.throws(
				() => {
					throwR11sNetworkError(message, 401);
				},
				{
					errorType: RouterliciousErrorTypes.authorizationError,
					canRetry: false,
				},
			);
		});
		it("throws non-retriable authorization error on 403", () => {
			const message = "test error";
			assert.throws(
				() => {
					throwR11sNetworkError(message, 403);
				},
				{
					errorType: RouterliciousErrorTypes.authorizationError,
					canRetry: false,
				},
			);
		});
		it("throws non-retriable not-found error on 404", () => {
			const message = "test error";
			assert.throws(
				() => {
					throwR11sNetworkError(message, 404);
				},
				{
					errorType: RouterliciousErrorTypes.fileNotFoundOrAccessDeniedError,
					canRetry: false,
				},
			);
		});
		it("throws retriable error on 429 with retry-after", () => {
			const message = "test error";
			assert.throws(
				() => {
					throwR11sNetworkError(message, 429, 5000);
				},
				{
					errorType: RouterliciousErrorTypes.throttlingError,
					canRetry: true,
					retryAfterSeconds: 5,
				},
			);
		});
		it("throws retriable error on 429 without retry-after", () => {
			const message = "test error";
			assert.throws(
				() => {
					throwR11sNetworkError(message, 429);
				},
				{
					errorType: RouterliciousErrorTypes.genericNetworkError,
					canRetry: true,
				},
			);
		});
		it("throws retriable error on 500", () => {
			const message = "test error";
			assert.throws(
				() => {
					throwR11sNetworkError(message, 500);
				},
				{
					errorType: RouterliciousErrorTypes.genericNetworkError,
					canRetry: true,
				},
			);
		});
		it("throws retriable error on anything else with retryAfter", () => {
			const message = "test error";
			assert.throws(
				() => {
					throwR11sNetworkError(message, 400, 200000);
				},
				{
					errorType: RouterliciousErrorTypes.throttlingError,
					canRetry: true,
					retryAfterSeconds: 200,
				},
			);
		});
		it("throws non-retriable error on anything else", () => {
			const message = "test error";
			assert.throws(
				() => {
					throwR11sNetworkError(message, 400);
				},
				{
					errorType: RouterliciousErrorTypes.genericNetworkError,
					canRetry: false,
				},
			);
		});
	});
	describe("errorObjectFromSocketError()", () => {
		const handler = "test_handler";
		const message = "test error";
		const assertExpectedMessage = (actualMessage: string) => {
			assert(
				actualMessage.includes(message),
				"R11s error should include socket error message",
			);
			assert(actualMessage.includes(handler), "R11s error should include handler name");
		};
		it("creates non-retriable authorization error on 401", () => {
			const error = errorObjectFromSocketError(
				{
					code: 401,
					message,
				},
				handler,
			);
			assertExpectedMessage(error.message);
			assert.strictEqual(error.errorType, RouterliciousErrorTypes.authorizationError);
			assert.strictEqual(error.canRetry, false);
			assert.strictEqual((error as any).statusCode, 401);
		});
		it("creates non-retriable authorization error on 403", () => {
			const error = errorObjectFromSocketError(
				{
					code: 403,
					message,
				},
				handler,
			);
			assertExpectedMessage(error.message);
			assert.strictEqual(error.errorType, RouterliciousErrorTypes.authorizationError);
			assert.strictEqual(error.canRetry, false);
			assert.strictEqual((error as any).statusCode, 403);
		});
		it("creates non-retriable not-found error on 404", () => {
			const error = errorObjectFromSocketError(
				{
					code: 404,
					message,
				},
				handler,
			);
			assertExpectedMessage(error.message);
			assert.strictEqual(
				error.errorType,
				RouterliciousErrorTypes.fileNotFoundOrAccessDeniedError,
			);
			assert.strictEqual(error.canRetry, false);
			assert.strictEqual((error as any).statusCode, 404);
		});
		it("creates retriable error on 429 with retry-after", () => {
			const error = errorObjectFromSocketError(
				{
					code: 429,
					message,
					retryAfterMs: 5000,
				},
				handler,
			);

			assert(isIThrottlingWarning(error));
			assertExpectedMessage(error.message);
			assert.strictEqual(error.canRetry, true);
			assert.strictEqual(error.retryAfterSeconds, 5);
			assert.strictEqual((error as any).statusCode, 429);
		});
		it("creates retriable error on 429 without retry-after", () => {
			const error = errorObjectFromSocketError(
				{
					code: 429,
					message,
				},
				handler,
			);
			assertExpectedMessage(error.message);
			assert.strictEqual(error.errorType, RouterliciousErrorTypes.genericNetworkError);
			assert.strictEqual(error.canRetry, true);
		});
		it("creates retriable error on 500", () => {
			const error = errorObjectFromSocketError(
				{
					code: 500,
					message,
				},
				handler,
			);
			assertExpectedMessage(error.message);
			assert.strictEqual(error.errorType, RouterliciousErrorTypes.genericNetworkError);
			assert.strictEqual(error.canRetry, true);
			assert.strictEqual((error as any).statusCode, 500);
		});
		it("creates retriable error on 400 with retryAfter", () => {
			const error = errorObjectFromSocketError(
				{
					code: 400,
					message,
					retryAfterMs: 300000,
				},
				handler,
			);
			assertExpectedMessage(error.message);
			assert.strictEqual(error.errorType, RouterliciousErrorTypes.throttlingError);
			assert.strictEqual(error.canRetry, true);
			assert.strictEqual((error as any).retryAfterSeconds, 300);
			assert.strictEqual((error as any).statusCode, 400);
		});
	});

	describe("getUrlForTelemetry", () => {
		// 0:hostName 1:path 2:expectedOutput
		const testCases = [
			["", undefined, undefined],
			["/", undefined, undefined],
			["http://some.url.com", undefined, "some.url.com"],
			["http://some.url.com/", undefined, "some.url.com"],
			["https://some.url.com/", "", "some.url.com"],
			["something://some.url.com/", "", "something:"],
			["some.url.com/path", undefined, "some.url.com"],
			["some.url.com/", "randomPath", "some.url.com/REDACTED"],
			["some.url.com/", socketIoPath, `some.url.com/${socketIoPath}`],
			["http://some.url.com/", "repos", "some.url.com/repos"],
			["some.url.com/", "deltas", "some.url.com/deltas"],
			["https://some.url.com", "documents", "some.url.com/documents"],
			["https://some.url.com/", "/documents/", "some.url.com/documents"],
			["https://some.url.com/", "documents/morePath", "some.url.com/documents/REDACTED"],
			[
				"https://some.url.com",
				"documents/morePath/documents/latest/abc-123/",
				"some.url.com/documents/REDACTED/documents/latest/REDACTED",
			],
		];

		testCases.forEach((testCase) => {
			it(`Parses URL as expected hostName:[${testCase[0]}] path:[${testCase[1]}]`, () => {
				const actualOutput = getUrlForTelemetry(testCase[0]!, testCase[1]);
				assert.strictEqual(actualOutput, testCase[2]);
			});
		});
	});
});
