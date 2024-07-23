/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";

import { RateLimiter } from "@fluidframework/driver-utils/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import nock from "nock";

import { DefaultTokenProvider } from "../defaultTokenProvider.js";
import { RouterliciousErrorTypes } from "../errorUtils.js";
import {
	RouterliciousOrdererRestWrapper,
	toInstrumentedR11sOrdererTokenFetcher,
} from "../restWrapper.js";
import { ITokenResponse } from "../tokens.js";

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
	const throttle = () => {
		throttledAt = Date.now();
	};
	function replyWithThrottling() {
		const retryAfterSeconds = (throttleDurationInMs - Date.now() - throttledAt) / 1000;
		const throttled = retryAfterSeconds > 0;
		if (throttled) {
			return [429, { retryAfter: retryAfterSeconds }];
		}
		return [200, "OK"];
	}

	let restWrapper: RouterliciousOrdererRestWrapper;
	const logger = new MockLogger();
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
	after(() => {
		nock.restore();
	});
	afterEach(() => {
		logger.assertMatchNone([{ category: "error" }]);
	});

	describe("get()", () => {
		it("sends a request with auth headers", async () => {
			nock(testHost, { reqheaders: { authorization: `Basic ${token1}` } })
				.get(testPath)
				.reply(200);
			await assert.doesNotReject(restWrapper.get(testUrl));
		});
		it("retries a request with fresh auth headers on 401", async () => {
			nock(testHost, { reqheaders: { authorization: `Basic ${token1}` } })
				.get(testPath)
				.reply(401);
			nock(testHost, { reqheaders: { authorization: `Basic ${token2}` } })
				.get(testPath)
				.query(true)
				.reply(200);
			await assert.doesNotReject(restWrapper.get(testUrl));
		});
		it("throws a non-retriable error on 2nd 401", async () => {
			nock(testHost, { reqheaders: { authorization: `Basic ${token1}` } })
				.get(testPath)
				.reply(401);
			nock(testHost, { reqheaders: { authorization: `Basic ${token2}` } })
				.get(testPath)
				.query(true)
				.reply(401);
			await assert.rejects(restWrapper.get(testUrl), {
				canRetry: false,
				errorType: RouterliciousErrorTypes.authorizationError,
			});
		});
		it("throws a retriable error on 500", async () => {
			nock(testHost).get(testPath).reply(500);
			await assert.rejects(restWrapper.get(testUrl), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
		it("retries with delay on 429 with retryAfter", async () => {
			throttle();
			nock(testHost).get(testPath).reply(replyWithThrottling);
			await assert.doesNotReject(restWrapper.get(testUrl));
		});
		it("throws a retriable error on 429 without retryAfter", async () => {
			nock(testHost).get(testPath).reply(429, { retryAfter: undefined });
			await assert.rejects(restWrapper.get(testUrl), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
		it("throws a non-retriable error on 404", async () => {
			nock(testHost).get(testPath).reply(404);
			await assert.rejects(restWrapper.get(testUrl), {
				canRetry: false,
				errorType: RouterliciousErrorTypes.fileNotFoundOrAccessDeniedError,
			});
		});
		it("throws retriable error on Network Error", async () => {
			nock(testHost).get(testPath).replyWithError({ code: "ECONNRESET" });
			await assert.rejects(restWrapper.get(testUrl), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});

		it("retry query param is appended on subsequent api request - when retried from within request function", async () => {
			let retryQueryParamTested = false;
			// Fail first request with retriable error
			nock(testHost).get(testPath).reply(401);
			// Second request must contain the query param "retry=1"
			nock(testHost)
				.get(/.*/)
				.query((q) => {
					assert(q);
					assert(q.retry === "1");
					return true;
				})
				.reply(429, { retryAfter: 0.001 });
			// Third request must contain the query param "retry=2"
			nock(testHost)
				.get(/.*/)
				.query((q) => {
					assert(q);
					assert(q.retry === "2");
					retryQueryParamTested = true;
					return true;
				})
				.reply(200);
			await restWrapper.get(testUrl);
			assert(retryQueryParamTested);
		});

		it("retry query param is appended on subsequent api request - when request function is invoked multiple times externally on failure", async () => {
			let isTestedSuccessfully = false;
			// Fail first request with retriable error
			nock(testHost).get(testPath).reply(500);
			// Second request must contain the query param "retry=1"
			nock(testHost)
				.get(/.*/)
				.query((q) => {
					assert(q);
					assert(q.retry === "1");
					return true;
				})
				.reply(500);
			// Third request must contain the query param "retry=2"
			nock(testHost)
				.get(/.*/)
				.query((q) => {
					assert(q);
					assert(q.retry === "2");
					return true;
				})
				.reply(500);

			// Fourth request is emulated to have predefined query params, which should also continue to exist along with retry=1
			nock(testHost)
				.get(/.*/)
				.query((q) => {
					assert(q);
					assert(q.retry === undefined); // Check that original request's retry value is reset
					assert(q.param_1 === "param_1"); // Check other query params are not lost
					assert(q.param_2 === "param_2");
					isTestedSuccessfully = true;
					return true;
				})
				.reply(500);

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
			nock(testHost, { reqheaders: { authorization: `Basic ${token1}` } })
				.post(testPath)
				.reply(200);
			await assert.doesNotReject(restWrapper.post(testUrl, { test: "payload" }));
		});
		it("retries a request with fresh auth headers on 401", async () => {
			nock(testHost, { reqheaders: { authorization: `Basic ${token1}` } })
				.post(testPath)
				.reply(401);
			nock(testHost, { reqheaders: { authorization: `Basic ${token2}` } })
				.post(testPath)
				.query(true)
				.reply(200);
			await assert.doesNotReject(restWrapper.post(testUrl, { test: "payload" }));
		});
		it("throws a non-retriable error on 2nd 401", async () => {
			nock(testHost, { reqheaders: { authorization: `Basic ${token1}` } })
				.post(testPath)
				.reply(401);
			nock(testHost, { reqheaders: { authorization: `Basic ${token2}` } })
				.post(testPath)
				.query(true)
				.reply(401);
			await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
				canRetry: false,
				errorType: RouterliciousErrorTypes.authorizationError,
			});
		});
		it("throws a retriable error on 500", async () => {
			nock(testHost).post(testPath).reply(500);
			await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
		it("retries with delay on 429 with retryAfter", async () => {
			throttle();
			nock(testHost).post(testPath).reply(replyWithThrottling);
			await assert.doesNotReject(restWrapper.post(testUrl, { test: "payload" }));
		});
		it("throws a retriable error on 429 without retryAfter", async () => {
			nock(testHost).post(testPath).reply(429, { retryAfter: undefined });
			await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
		it("throws a non-retriable error on 404", async () => {
			nock(testHost).post(testPath).reply(404);
			await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
				canRetry: false,
				errorType: RouterliciousErrorTypes.fileNotFoundOrAccessDeniedError,
			});
		});
		it("throws retriable error on Network Error", async () => {
			nock(testHost).post(testPath).replyWithError({ code: "ECONNRESET" });
			await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
	});

	describe("patch()", () => {
		it("sends a request with auth headers", async () => {
			nock(testHost, { reqheaders: { authorization: `Basic ${token1}` } })
				.patch(testPath)
				.reply(200);
			await assert.doesNotReject(restWrapper.patch(testUrl, { test: "payload" }));
		});
		it("retries a request with fresh auth headers on 401", async () => {
			nock(testHost, { reqheaders: { authorization: `Basic ${token1}` } })
				.patch(testPath)
				.reply(401);
			nock(testHost, { reqheaders: { authorization: `Basic ${token2}` } })
				.patch(testPath)
				.query(true)
				.reply(200);
			await assert.doesNotReject(restWrapper.patch(testUrl, { test: "payload" }));
		});
		it("throws a non-retriable error on 2nd 401", async () => {
			nock(testHost, { reqheaders: { authorization: `Basic ${token1}` } })
				.patch(testPath)
				.reply(401);
			nock(testHost, { reqheaders: { authorization: `Basic ${token2}` } })
				.patch(testPath)
				.query(true)
				.reply(401);
			await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
				canRetry: false,
				errorType: RouterliciousErrorTypes.authorizationError,
			});
		});
		it("throws a retriable error on 500", async () => {
			nock(testHost).patch(testPath).reply(500);
			await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
		it("retries with delay on 429 with retryAfter", async () => {
			throttle();
			nock(testHost).patch(testPath).reply(replyWithThrottling);
			await assert.doesNotReject(restWrapper.patch(testUrl, { test: "payload" }));
		});
		it("throws a retriable error on 429 without retryAfter", async () => {
			nock(testHost).patch(testPath).reply(429, { retryAfter: undefined });
			await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
		it("throws a non-retriable error on 404", async () => {
			nock(testHost).patch(testPath).reply(404);
			await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
				canRetry: false,
				errorType: RouterliciousErrorTypes.fileNotFoundOrAccessDeniedError,
			});
		});
		it("throws retriable error on Network Error", async () => {
			nock(testHost).patch(testPath).replyWithError({ code: "ECONNRESET" });
			await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
	});

	describe("delete()", () => {
		it("sends a request with auth headers", async () => {
			nock(testHost, { reqheaders: { authorization: `Basic ${token1}` } })
				.delete(testPath)
				.reply(200);
			await assert.doesNotReject(restWrapper.delete(testUrl));
		});
		it("retries a request with fresh auth headers on 401", async () => {
			nock(testHost, { reqheaders: { authorization: `Basic ${token1}` } })
				.delete(testPath)
				.reply(401);
			nock(testHost, { reqheaders: { authorization: `Basic ${token2}` } })
				.delete(testPath)
				.query(true)
				.reply(200);
			await assert.doesNotReject(restWrapper.delete(testUrl));
		});
		it("throws a non-retriable error on 2nd 401", async () => {
			nock(testHost, { reqheaders: { authorization: `Basic ${token1}` } })
				.delete(testPath)
				.reply(401);
			nock(testHost, { reqheaders: { authorization: `Basic ${token2}` } })
				.delete(testPath)
				.query(true)
				.reply(401);
			await assert.rejects(restWrapper.delete(testUrl), {
				canRetry: false,
				errorType: RouterliciousErrorTypes.authorizationError,
			});
		});
		it("throws a retriable error on 500", async () => {
			nock(testHost).delete(testPath).reply(500);
			await assert.rejects(restWrapper.delete(testUrl), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
		it("retries with delay on 429 with retryAfter", async () => {
			throttle();
			nock(testHost).delete(testPath).reply(replyWithThrottling);
			await assert.doesNotReject(restWrapper.delete(testUrl));
		});
		it("throws a retriable error on 429 without retryAfter", async () => {
			nock(testHost).delete(testPath).reply(429, { retryAfter: undefined });
			await assert.rejects(restWrapper.delete(testUrl), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
		it("throws a non-retriable error on 404", async () => {
			nock(testHost).delete(testPath).reply(404);
			await assert.rejects(restWrapper.delete(testUrl), {
				canRetry: false,
				errorType: RouterliciousErrorTypes.fileNotFoundOrAccessDeniedError,
			});
		});
		it("throws retriable error on Network Error", async () => {
			nock(testHost).delete(testPath).replyWithError({ code: "ECONNRESET" });
			await assert.rejects(restWrapper.delete(testUrl), {
				canRetry: true,
				errorType: RouterliciousErrorTypes.genericNetworkError,
			});
		});
	});
});
