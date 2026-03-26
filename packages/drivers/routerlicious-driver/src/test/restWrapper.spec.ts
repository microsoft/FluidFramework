/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { RateLimiter } from "@fluidframework/driver-utils/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import sinon from "sinon";

import { DefaultTokenProvider } from "../defaultTokenProvider.js";
import { RouterliciousErrorTypes } from "../errorUtils.js";
import {
	RouterliciousOrdererRestWrapper,
	toInstrumentedR11sOrdererTokenFetcher,
} from "../restWrapper.js";
import { ITokenResponse } from "../tokens.js";

/**
 * Creates a mock Response object matching the Fetch API's Response interface.
 */
function createMockResponse(
	status: number,
	body?: string | object,
	headers?: Record<string, string>,
): Response {
	const responseHeaders = new Headers(headers);
	if (typeof body === "object" && !responseHeaders.has("content-type")) {
		responseHeaders.set("content-type", "application/json");
	}
	const bodyStr = typeof body === "object" ? JSON.stringify(body) : (body ?? "");
	return new Response(bodyStr, { status, headers: responseHeaders });
}

/**
 * A queue-based fetch mock that returns pre-configured responses in order.
 * Each entry specifies optional request validation and a response to return.
 */
interface MockFetchEntry {
	// --- Request validation (assert on the incoming request) ---

	/** Assert that the request uses this HTTP method */
	method?: string;
	/** Assert that the request URL path (excluding query string) matches this value */
	path?: string;
	/** Assert that the request includes these headers with these exact values */
	reqheaders?: Record<string, string>;
	/** Assert that query params are present on the request (any values accepted) */
	expectAnyQuery?: boolean;
	/** Assert on query params via custom callback. Return true to pass. */
	queryCheck?: (query: URLSearchParams) => boolean;

	// --- Response definition (what the mock returns) ---

	/** HTTP status code to respond with (default: 200) */
	status?: number;
	/** Response body. Objects are JSON-serialized with content-type: application/json. */
	body?: string | object;
	/** Simulate a network error by rejecting fetch with a TypeError */
	networkError?: { code: string };
	/** Dynamically compute the response as [status, body] */
	replyFn?: () => [number, string | object];
}

function createMockFetch(entries: MockFetchEntry[]): sinon.SinonStub {
	const queue = [...entries];
	const stub = sinon.stub(globalThis, "fetch");
	stub.callsFake(async (input: RequestInfo | URL, init?: RequestInit) => {
		const entry = queue.shift();
		if (!entry) {
			throw new Error("Unexpected fetch call: no more mock entries in queue");
		}

		const inputUrl =
			input instanceof URL ? input.href : input instanceof Request ? input.url : input;

		const parsedUrl = new URL(inputUrl);

		// Validate method if specified
		if (entry.method) {
			assert.strictEqual(init?.method?.toUpperCase(), entry.method.toUpperCase());
		}

		// Validate URL path if specified
		if (entry.path) {
			assert.strictEqual(
				parsedUrl.pathname,
				entry.path,
				`Expected path "${entry.path}" but got "${parsedUrl.pathname}"`,
			);
		}

		// Validate headers if specified
		if (entry.reqheaders) {
			const reqHeaders = new Headers(init?.headers);
			for (const [key, value] of Object.entries(entry.reqheaders)) {
				assert.strictEqual(
					reqHeaders.get(key),
					value,
					`Expected header "${key}" to be "${value}" but got "${reqHeaders.get(key)}"`,
				);
			}
		}

		// Validate query params:
		// - queryCheck: call custom validation callback
		// - expectAnyQuery: assert that query params ARE present
		// - neither: assert that no query params are present
		if (entry.queryCheck) {
			assert(entry.queryCheck(parsedUrl.searchParams), "Query param check failed");
		} else if (entry.expectAnyQuery) {
			assert(parsedUrl.search, "Expected query params to be present but request had none.");
		} else if (parsedUrl.search) {
			assert.fail(
				`Unexpected query params on request: ${parsedUrl.search}. ` +
					`Use expectAnyQuery or queryCheck to allow query params.`,
			);
		}

		// Simulate network error
		if (entry.networkError) {
			const err = new TypeError(`request to ${inputUrl} failed`);
			(err as any).code = entry.networkError.code;
			throw err;
		}

		// Dynamic reply
		if (entry.replyFn) {
			const [status, body] = entry.replyFn();
			return createMockResponse(status, body);
		}

		return createMockResponse(entry.status ?? 200, entry.body);
	});
	return stub;
}

describe("RouterliciousDriverRestWrapper", () => {
	const rateLimiter = new RateLimiter(1);
	const testHost = "http://localhost:3030";
	const testPath = "/api/protected";
	const testUrl = `${testHost}${testPath}`;

	// Set up mock request authentication
	const token1 = "1234-auth-token-abcd";
	const token2 = "9876-auth-token-zyxw";
	const token3 = "abc-auth-token-123";
	let tokenQueue: string[] = [];

	// Set up mock throttling
	let throttleDurationInMs: number;
	let throttledAt: number;
	const throttle = (): void => {
		throttledAt = Date.now();
	};
	function replyWithThrottling(): [number, string | { retryAfter: number }] {
		const retryAfterSeconds = (throttleDurationInMs - Date.now() - throttledAt) / 1000;
		const throttled = retryAfterSeconds > 0;
		if (throttled) {
			return [429, { retryAfter: retryAfterSeconds }];
		}
		return [200, "OK"];
	}

	let restWrapper: RouterliciousOrdererRestWrapper;
	const logger = new MockLogger();
	let fetchStub: sinon.SinonStub;
	beforeEach(() => {
		// reset auth mocking
		tokenQueue = [token1, token2, token3];
		// reset throttling mocking
		throttledAt = 0;
		throttleDurationInMs = 50;
		const tokenProvider = new DefaultTokenProvider("testtoken");
		tokenProvider.fetchOrdererToken = async () => {
			// Pop a token off tokenQueue
			const newToken: ITokenResponse = {
				jwt: tokenQueue.shift() ?? "testtoken",
			};
			return newToken;
		};
		restWrapper = RouterliciousOrdererRestWrapper.load(
			toInstrumentedR11sOrdererTokenFetcher(
				"dummytenantid",
				"dummydocumentid",
				tokenProvider,
				logger.toTelemetryLogger(),
			),
			logger.toTelemetryLogger(),
			rateLimiter,
			false,
		);
	});
	afterEach(() => {
		if (fetchStub) {
			fetchStub.restore();
		}
		logger.assertMatchNone([{ category: "error" }]);
	});

	describe("get()", () => {
		it("sends a request with auth headers", async () => {
			fetchStub = createMockFetch([
				{
					method: "GET",
					path: testPath,
					reqheaders: { authorization: `Basic ${token1}` },
					status: 200,
				},
			]);
			await assert.doesNotReject(restWrapper.get(testUrl));
		});
		it("retries a request with fresh auth headers on 401", async () => {
			fetchStub = createMockFetch([
				{
					method: "GET",
					path: testPath,
					reqheaders: { authorization: `Basic ${token1}` },
					status: 401,
				},
				{
					method: "GET",
					path: testPath,
					reqheaders: { authorization: `Basic ${token2}` },
					expectAnyQuery: true,
					status: 200,
				},
			]);
			await assert.doesNotReject(restWrapper.get(testUrl));
		});
		it("throws a non-retriable error on 2nd 401", async () => {
			fetchStub = createMockFetch([
				{
					method: "GET",
					path: testPath,
					reqheaders: { authorization: `Basic ${token1}` },
					status: 401,
				},
				{
					method: "GET",
					path: testPath,
					reqheaders: { authorization: `Basic ${token2}` },
					expectAnyQuery: true,
					status: 401,
				},
			]);
			await assert.rejects(restWrapper.get(testUrl), {
				canRetry: false,
				errorType: RouterliciousErrorTypes.authorizationError,
			});
		});
		it("throws a retriable error on 500", async () => {
			fetchStub = createMockFetch([{ method: "GET", path: testPath, status: 500 }]);
			await assert.rejects(restWrapper.get(testUrl), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
		it("retries with delay on 429 with retryAfter", async () => {
			throttle();
			fetchStub = createMockFetch([
				{ method: "GET", path: testPath, replyFn: replyWithThrottling },
				{
					method: "GET",
					path: testPath,
					expectAnyQuery: true,
					replyFn: replyWithThrottling,
				},
			]);
			await assert.doesNotReject(restWrapper.get(testUrl));
		});
		it("throws a retriable error on 429 without retryAfter", async () => {
			fetchStub = createMockFetch([
				{
					method: "GET",
					path: testPath,
					status: 429,
					body: { retryAfter: undefined },
				},
			]);
			await assert.rejects(restWrapper.get(testUrl), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
		it("throws a non-retriable error on 404", async () => {
			fetchStub = createMockFetch([{ method: "GET", path: testPath, status: 404 }]);
			await assert.rejects(restWrapper.get(testUrl), {
				canRetry: false,
				errorType: RouterliciousErrorTypes.fileNotFoundOrAccessDeniedError,
			});
		});
		it("throws retriable error on Network Error", async () => {
			fetchStub = createMockFetch([
				{
					method: "GET",
					path: testPath,
					networkError: { code: "ECONNRESET" },
				},
			]);
			await assert.rejects(restWrapper.get(testUrl), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});

		it("retry query param is appended on subsequent api request - when retried from within request function", async () => {
			let retryQueryParamTested = false;
			fetchStub = createMockFetch([
				// Fail first request with retriable error
				{
					method: "GET",
					path: testPath,
					reqheaders: { authorization: `Basic ${token1}` },
					status: 401,
				},
				// Second request must contain the query param "retry=1"
				{
					method: "GET",
					path: testPath,
					queryCheck: (q) => {
						assert(q.get("retry") === "1");
						return true;
					},
					status: 429,
					body: { retryAfter: 0.001 },
				},
				// Third request must contain the query param "retry=2"
				{
					method: "GET",
					path: testPath,
					queryCheck: (q) => {
						assert(q.get("retry") === "2");
						retryQueryParamTested = true;
						return true;
					},
					status: 200,
				},
			]);
			await restWrapper.get(testUrl);
			assert(retryQueryParamTested);
		});

		it("retry query param is appended on subsequent api request - when request function is invoked multiple times externally on failure", async () => {
			let isTestedSuccessfully = false;
			fetchStub = createMockFetch([
				// Fail first request with retriable error
				{ method: "GET", path: testPath, status: 500 },
				// Second request must contain the query param "retry=1"
				{
					method: "GET",
					path: testPath,
					queryCheck: (q) => {
						assert(q.get("retry") === "1");
						return true;
					},
					status: 500,
				},
				// Third request must contain the query param "retry=2"
				{
					method: "GET",
					path: testPath,
					queryCheck: (q) => {
						assert(q.get("retry") === "2");
						return true;
					},
					status: 500,
				},
				// Fourth request is emulated to have predefined query params
				{
					method: "GET",
					path: testPath,
					queryCheck: (q) => {
						assert(q.get("retry") === null); // Check that original request's retry value is reset
						assert(q.get("param_1") === "param_1"); // Check other query params are not lost
						assert(q.get("param_2") === "param_2");
						isTestedSuccessfully = true;
						return true;
					},
					status: 500,
				},
			]);

			await restWrapper.get(testUrl).catch((_) => {});
			await restWrapper.get(testUrl).catch((_) => {});
			await restWrapper.get(testUrl).catch((_) => {});
			// with pre existing query params
			await restWrapper
				.get(testUrl, { param_1: "param_1", param_2: "param_2", retry: 100 })
				.catch((_) => {});
			assert(isTestedSuccessfully);
		});
	});

	describe("post()", () => {
		it("sends a request with auth headers", async () => {
			fetchStub = createMockFetch([
				{
					method: "POST",
					path: testPath,
					reqheaders: { authorization: `Basic ${token1}` },
					status: 200,
				},
			]);
			await assert.doesNotReject(restWrapper.post(testUrl, { test: "payload" }));
		});
		it("retries a request with fresh auth headers on 401", async () => {
			fetchStub = createMockFetch([
				{
					method: "POST",
					path: testPath,
					reqheaders: { authorization: `Basic ${token1}` },
					status: 401,
				},
				{
					method: "POST",
					path: testPath,
					reqheaders: { authorization: `Basic ${token2}` },
					expectAnyQuery: true,
					status: 200,
				},
			]);
			await assert.doesNotReject(restWrapper.post(testUrl, { test: "payload" }));
		});
		it("throws a non-retriable error on 2nd 401", async () => {
			fetchStub = createMockFetch([
				{
					method: "POST",
					path: testPath,
					reqheaders: { authorization: `Basic ${token1}` },
					status: 401,
				},
				{
					method: "POST",
					path: testPath,
					reqheaders: { authorization: `Basic ${token2}` },
					expectAnyQuery: true,
					status: 401,
				},
			]);
			await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
				canRetry: false,
				errorType: RouterliciousErrorTypes.authorizationError,
			});
		});
		it("throws a retriable error on 500", async () => {
			fetchStub = createMockFetch([{ method: "POST", path: testPath, status: 500 }]);
			await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
		it("retries with delay on 429 with retryAfter", async () => {
			throttle();
			fetchStub = createMockFetch([
				{ method: "POST", path: testPath, replyFn: replyWithThrottling },
				{
					method: "POST",
					path: testPath,
					expectAnyQuery: true,
					replyFn: replyWithThrottling,
				},
			]);
			await assert.doesNotReject(restWrapper.post(testUrl, { test: "payload" }));
		});
		it("throws a retriable error on 429 without retryAfter", async () => {
			fetchStub = createMockFetch([
				{
					method: "POST",
					path: testPath,
					status: 429,
					body: { retryAfter: undefined },
				},
			]);
			await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
		it("throws a non-retriable error on 404", async () => {
			fetchStub = createMockFetch([{ method: "POST", path: testPath, status: 404 }]);
			await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
				canRetry: false,
				errorType: RouterliciousErrorTypes.fileNotFoundOrAccessDeniedError,
			});
		});
		it("throws retriable error on Network Error", async () => {
			fetchStub = createMockFetch([
				{
					method: "POST",
					path: testPath,
					networkError: { code: "ECONNRESET" },
				},
			]);
			await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
	});

	describe("patch()", () => {
		it("sends a request with auth headers", async () => {
			fetchStub = createMockFetch([
				{
					method: "PATCH",
					path: testPath,
					reqheaders: { authorization: `Basic ${token1}` },
					status: 200,
				},
			]);
			await assert.doesNotReject(restWrapper.patch(testUrl, { test: "payload" }));
		});
		it("retries a request with fresh auth headers on 401", async () => {
			fetchStub = createMockFetch([
				{
					method: "PATCH",
					path: testPath,
					reqheaders: { authorization: `Basic ${token1}` },
					status: 401,
				},
				{
					method: "PATCH",
					path: testPath,
					reqheaders: { authorization: `Basic ${token2}` },
					expectAnyQuery: true,
					status: 200,
				},
			]);
			await assert.doesNotReject(restWrapper.patch(testUrl, { test: "payload" }));
		});
		it("throws a non-retriable error on 2nd 401", async () => {
			fetchStub = createMockFetch([
				{
					method: "PATCH",
					path: testPath,
					reqheaders: { authorization: `Basic ${token1}` },
					status: 401,
				},
				{
					method: "PATCH",
					path: testPath,
					reqheaders: { authorization: `Basic ${token2}` },
					expectAnyQuery: true,
					status: 401,
				},
			]);
			await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
				canRetry: false,
				errorType: RouterliciousErrorTypes.authorizationError,
			});
		});
		it("throws a retriable error on 500", async () => {
			fetchStub = createMockFetch([{ method: "PATCH", path: testPath, status: 500 }]);
			await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
		it("retries with delay on 429 with retryAfter", async () => {
			throttle();
			fetchStub = createMockFetch([
				{ method: "PATCH", path: testPath, replyFn: replyWithThrottling },
				{
					method: "PATCH",
					path: testPath,
					expectAnyQuery: true,
					replyFn: replyWithThrottling,
				},
			]);
			await assert.doesNotReject(restWrapper.patch(testUrl, { test: "payload" }));
		});
		it("throws a retriable error on 429 without retryAfter", async () => {
			fetchStub = createMockFetch([
				{
					method: "PATCH",
					path: testPath,
					status: 429,
					body: { retryAfter: undefined },
				},
			]);
			await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
		it("throws a non-retriable error on 404", async () => {
			fetchStub = createMockFetch([{ method: "PATCH", path: testPath, status: 404 }]);
			await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
				canRetry: false,
				errorType: RouterliciousErrorTypes.fileNotFoundOrAccessDeniedError,
			});
		});
		it("throws retriable error on Network Error", async () => {
			fetchStub = createMockFetch([
				{
					method: "PATCH",
					path: testPath,
					networkError: { code: "ECONNRESET" },
				},
			]);
			await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
	});

	describe("delete()", () => {
		it("sends a request with auth headers", async () => {
			fetchStub = createMockFetch([
				{
					method: "DELETE",
					path: testPath,
					reqheaders: { authorization: `Basic ${token1}` },
					status: 200,
				},
			]);
			await assert.doesNotReject(restWrapper.delete(testUrl));
		});
		it("retries a request with fresh auth headers on 401", async () => {
			fetchStub = createMockFetch([
				{
					method: "DELETE",
					path: testPath,
					reqheaders: { authorization: `Basic ${token1}` },
					status: 401,
				},
				{
					method: "DELETE",
					path: testPath,
					reqheaders: { authorization: `Basic ${token2}` },
					expectAnyQuery: true,
					status: 200,
				},
			]);
			await assert.doesNotReject(restWrapper.delete(testUrl));
		});
		it("throws a non-retriable error on 2nd 401", async () => {
			fetchStub = createMockFetch([
				{
					method: "DELETE",
					path: testPath,
					reqheaders: { authorization: `Basic ${token1}` },
					status: 401,
				},
				{
					method: "DELETE",
					path: testPath,
					reqheaders: { authorization: `Basic ${token2}` },
					expectAnyQuery: true,
					status: 401,
				},
			]);
			await assert.rejects(restWrapper.delete(testUrl), {
				canRetry: false,
				errorType: RouterliciousErrorTypes.authorizationError,
			});
		});
		it("throws a retriable error on 500", async () => {
			fetchStub = createMockFetch([{ method: "DELETE", path: testPath, status: 500 }]);
			await assert.rejects(restWrapper.delete(testUrl), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
		it("retries with delay on 429 with retryAfter", async () => {
			throttle();
			fetchStub = createMockFetch([
				{ method: "DELETE", path: testPath, replyFn: replyWithThrottling },
				{
					method: "DELETE",
					path: testPath,
					expectAnyQuery: true,
					replyFn: replyWithThrottling,
				},
			]);
			await assert.doesNotReject(restWrapper.delete(testUrl));
		});
		it("throws a retriable error on 429 without retryAfter", async () => {
			fetchStub = createMockFetch([
				{
					method: "DELETE",
					path: testPath,
					status: 429,
					body: { retryAfter: undefined },
				},
			]);
			await assert.rejects(restWrapper.delete(testUrl), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
		it("throws a non-retriable error on 404", async () => {
			fetchStub = createMockFetch([{ method: "DELETE", path: testPath, status: 404 }]);
			await assert.rejects(restWrapper.delete(testUrl), {
				canRetry: false,
				errorType: RouterliciousErrorTypes.fileNotFoundOrAccessDeniedError,
			});
		});
		it("throws retriable error on Network Error", async () => {
			fetchStub = createMockFetch([
				{
					method: "DELETE",
					path: testPath,
					networkError: { code: "ECONNRESET" },
				},
			]);
			await assert.rejects(restWrapper.delete(testUrl), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
	});
});
