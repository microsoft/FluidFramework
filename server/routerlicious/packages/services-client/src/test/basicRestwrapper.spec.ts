/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { CorrelationIdHeaderName } from "../constants";
import type { FetchFn } from "../fetchTypes";
import { BasicRestWrapper } from "../restWrapper";
import { KJUR as jsrsasign } from "jsrsasign";
import { jwtDecode } from "jwt-decode";

describe("BasicRestWrapper", () => {
	const baseurl = "https://fake.microsoft.com";
	const requestUrl = "/fakerequesturl/";
	const headerCount = 1;
	const maxBodyLength = 1000 * 1024 * 1024;
	const maxContentLength = 1000 * 1024 * 1024;
	let fetchMock: FetchFn;
	let fetchErrorMock: FetchFn;
	let fetchTooManyRequestsZeroRetryAfterMock: FetchFn;
	let fetchTooManyRequestsNegativeRetryAfterMock: FetchFn;
	let fetchTooManyRequestsPositiveRetryAfterMock: FetchFn;
	let capturedUrl: string;
	let capturedInit: RequestInit;

	before(() => {
		fetchMock = async (url: string | URL | Request, init?: RequestInit) => {
			capturedUrl = url.toString();
			capturedInit = init ?? {};
			return new Response(JSON.stringify({}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		};

		fetchErrorMock = async (url: string | URL | Request, init?: RequestInit) => {
			capturedUrl = url.toString();
			capturedInit = init ?? {};
			return new Response(JSON.stringify({}), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			});
		};

		fetchTooManyRequestsZeroRetryAfterMock = async (
			url: string | URL | Request,
			init?: RequestInit,
		) => {
			capturedUrl = url.toString();
			capturedInit = init ?? {};
			return new Response(JSON.stringify({ retryAfter: 0, message: "throttled" }), {
				status: 429,
				headers: { "Content-Type": "application/json" },
			});
		};

		fetchTooManyRequestsNegativeRetryAfterMock = async (
			url: string | URL | Request,
			init?: RequestInit,
		) => {
			capturedUrl = url.toString();
			capturedInit = init ?? {};
			return new Response(JSON.stringify({ retryAfter: -1, message: "throttled" }), {
				status: 429,
				headers: { "Content-Type": "application/json" },
			});
		};

		let retryCallCount = 0;
		fetchTooManyRequestsPositiveRetryAfterMock = async (
			url: string | URL | Request,
			init?: RequestInit,
		) => {
			capturedUrl = url.toString();
			capturedInit = init ?? {};
			retryCallCount++;
			if (retryCallCount <= 1) {
				return new Response(JSON.stringify({ retryAfter: 1, message: "throttled" }), {
					status: 429,
					headers: { "Content-Type": "application/json" },
				});
			}
			return new Response(JSON.stringify("A successful request after being throttled."), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		};
	});

	describe(".get", () => {
		it("Invalid Response Code should reject Promise", async () => {
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				fetchErrorMock,
			);

			await rw.get(requestUrl).then(
				() => assert.fail("Promise was not rejected"),
				(err) => assert.ok(err, "Invalid response code rejected Promise"),
			);
		});

		it("429 Response Code should reject Promise with 0 retryAfter", async () => {
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				fetchTooManyRequestsZeroRetryAfterMock,
			);

			await rw.get(requestUrl).then(
				() => assert.fail("Promise was not rejected"),
				(err) => assert.ok(err, "Invalid response code rejected Promise"),
			);
		});

		it("429 Response Code should reject Promise with negative retryAfter", async () => {
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				fetchTooManyRequestsNegativeRetryAfterMock,
			);

			await rw.get(requestUrl).then(
				() => assert.fail("Promise was not rejected"),
				(err) => assert.ok(err, "Invalid response code rejected Promise"),
			);
		});

		it("429 Response Code should not reject Promise with positive retryAfter", async () => {
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				fetchTooManyRequestsPositiveRetryAfterMock,
			);

			await rw.get(requestUrl).then(
				(response) =>
					assert.strictEqual(response, "A successful request after being throttled."),
				(err) => assert.fail("Invalid response code rejected Promise"),
			);
		});

		it("Standard properties should not change", async () => {
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				undefined,
				fetchMock,
			);

			await rw.get(requestUrl);

			const expectedUrl = `${baseurl}${requestUrl}`;
			assert.strictEqual(expectedUrl, capturedUrl, "full URL should be base + request");
			assert.strictEqual("GET", capturedInit.method, "method should be GET");
			const headers = capturedInit.headers as Record<string, string>;
			assert.strictEqual(
				headerCount,
				Object.keys(headers).length,
				"Headers should only have 1 header",
			);
			assert.ok(
				CorrelationIdHeaderName in headers,
				"Headers should have x-correlation-id",
			);
		});

		it("Default QueryString and Default Headers", async () => {
			const defaultHeaders = { h1: "valueh1", h2: "valueh2" };
			const defaultQueryString = { q1: "valueq1", q2: "valueq2" };
			const rw = new BasicRestWrapper(
				baseurl,
				defaultQueryString,
				maxBodyLength,
				maxContentLength,
				defaultHeaders,
				fetchMock,
			);

			await rw.get(requestUrl);

			assert.ok(
				capturedUrl.includes("q1=valueq1"),
				"URL should contain query string",
			);
			assert.ok(
				capturedUrl.includes("q2=valueq2"),
				"URL should contain query string",
			);
			const headers = capturedInit.headers as Record<string, string>;
			assert.strictEqual(
				defaultHeaders.h1,
				headers.h1 as string,
				"Header1 value should be correct",
			);
			assert.strictEqual(
				defaultHeaders.h2,
				headers.h2 as string,
				"Header2 value should be correct",
			);
		});

		it("Default and Request, QueryString and Headers", async () => {
			const defaultHeaders = { h1: "valueh1", h2: "valueh2" };
			const requestHeaders = { h1: "valueh11", h3: "valueh3" };
			const defaultQueryString = { q1: "valueq1", q2: "valueq2" };
			const requestQueryString = { q1: "valueq11", q3: "valueq3" };
			const rw = new BasicRestWrapper(
				baseurl,
				defaultQueryString,
				maxBodyLength,
				maxContentLength,
				defaultHeaders,
				fetchMock,
			);

			await rw.get(requestUrl, requestQueryString, requestHeaders);

			assert.ok(
				capturedUrl.includes("q1=valueq11"),
				"q1 should be overridden",
			);
			assert.ok(
				capturedUrl.includes("q2=valueq2"),
				"q2 should still be present",
			);
			assert.ok(
				capturedUrl.includes("q3=valueq3"),
				"q3 should be added",
			);
			const headers = capturedInit.headers as Record<string, string>;
			assert.strictEqual(
				requestHeaders.h1,
				headers.h1 as string,
				"Header1 value should be updated",
			);
			assert.strictEqual(
				defaultHeaders.h2,
				headers.h2 as string,
				"Header2 value should be correct",
			);
			assert.strictEqual(
				requestHeaders.h3,
				headers.h3 as string,
				"Header3 value should be added",
			);
		});
	});

	describe(".post", () => {
		it("Invalid Response Code should reject Promise", async () => {
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				fetchErrorMock,
			);

			await rw.post(requestUrl, {}).then(
				() => assert.fail("Promise was not rejected"),
				(err) => assert.ok(err, "Invalid response code rejected Promise"),
			);
		});

		it("429 Response Code should reject Promise with 0 retryAfter", async () => {
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				fetchTooManyRequestsZeroRetryAfterMock,
			);

			await rw.post(requestUrl, {}).then(
				() => assert.fail("Promise was not rejected"),
				(err) => assert.ok(err, "Invalid response code rejected Promise"),
			);
		});

		it("Standard properties should not change", async () => {
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				undefined,
				fetchMock,
			);

			await rw.post(requestUrl, {});

			const expectedUrl = `${baseurl}${requestUrl}`;
			assert.strictEqual(expectedUrl, capturedUrl, "full URL should be base + request");
			assert.strictEqual("POST", capturedInit.method, "method should be POST");
		});

		it("Default QueryString and Default Headers", async () => {
			const defaultHeaders = { h1: "valueh1", h2: "valueh2" };
			const defaultQueryString = { q1: "valueq1", q2: "valueq2" };
			const rw = new BasicRestWrapper(
				baseurl,
				defaultQueryString,
				maxBodyLength,
				maxContentLength,
				defaultHeaders,
				fetchMock,
			);

			await rw.post(requestUrl, {});

			assert.ok(
				capturedUrl.includes("q1=valueq1&q2=valueq2"),
				"URL should contain query string",
			);
			const headers = capturedInit.headers as Record<string, string>;
			assert.strictEqual(
				defaultHeaders.h1,
				headers.h1 as string,
				"Header1 value should be correct",
			);
			assert.strictEqual(
				defaultHeaders.h2,
				headers.h2 as string,
				"Header2 value should be correct",
			);
		});

		it("Default and Request, QueryString and Headers", async () => {
			const defaultHeaders = { h1: "valueh1", h2: "valueh2" };
			const requestHeaders = { h1: "valueh11", h3: "valueh3" };
			const defaultQueryString = { q1: "valueq1", q2: "valueq2" };
			const requestQueryString = { q1: "valueq11", q3: "valueq3" };
			const rw = new BasicRestWrapper(
				baseurl,
				defaultQueryString,
				maxBodyLength,
				maxContentLength,
				defaultHeaders,
				fetchMock,
			);

			await rw.post(requestUrl, {}, requestQueryString, requestHeaders);

			assert.ok(
				capturedUrl.includes("q1=valueq11"),
				"q1 should be overridden",
			);
			const headers = capturedInit.headers as Record<string, string>;
			assert.strictEqual(
				requestHeaders.h1,
				headers.h1 as string,
				"Header1 value should be updated",
			);
			assert.strictEqual(
				defaultHeaders.h2,
				headers.h2 as string,
				"Header2 value should be correct",
			);
			assert.strictEqual(
				requestHeaders.h3,
				headers.h3 as string,
				"Header3 value should be added",
			);
		});
	});

	describe(".delete", () => {
		it("Invalid Response Code should reject Promise", async () => {
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				fetchErrorMock,
			);

			await rw.delete(requestUrl, {}).then(
				() => assert.fail("Promise was not rejected"),
				(err) => assert.ok(err, "Invalid response code rejected Promise"),
			);
		});

		it("Standard properties should not change", async () => {
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				undefined,
				fetchMock,
			);

			await rw.delete(requestUrl);

			const expectedUrl = `${baseurl}${requestUrl}`;
			assert.strictEqual(expectedUrl, capturedUrl, "full URL should be base + request");
			assert.strictEqual("DELETE", capturedInit.method, "method should be DELETE");
		});
	});

	describe(".patch", () => {
		it("Invalid Response Code should reject Promise", async () => {
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				fetchErrorMock,
			);

			await rw.patch(requestUrl, {}).then(
				() => assert.fail("Promise was not rejected"),
				(err) => assert.ok(err, "Invalid response code rejected Promise"),
			);
		});

		it("Standard properties should not change", async () => {
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				undefined,
				fetchMock,
			);

			await rw.patch(requestUrl, {});

			const expectedUrl = `${baseurl}${requestUrl}`;
			assert.strictEqual(expectedUrl, capturedUrl, "full URL should be base + request");
			assert.strictEqual("PATCH", capturedInit.method, "method should be PATCH");
		});
	});

	describe("Token refresh", () => {
		it("Token should be refreshed if callback is provided", async () => {
			const key = "1234";
			const expiredToken = jsrsasign.jws.JWS.sign(
				null,
				JSON.stringify({ alg: "HS256", typ: "JWT" }),
				{ exp: Math.round(new Date().getTime() / 1000) - 100 },
				key,
			);
			const getDefaultHeaders = () => {
				return {
					Authorization: `Basic ${expiredToken}`,
				};
			};
			const newToken = jsrsasign.jws.JWS.sign(
				null,
				JSON.stringify({ alg: "HS256", typ: "JWT" }),
				{ exp: Math.round(new Date().getTime() / 1000) + 10000 },
				key,
			);

			const refreshTokenIfNeeded = async () => {
				const tokenClaims = jwtDecode(expiredToken);
				if (tokenClaims.exp < new Date().getTime() / 1000) {
					return {
						Authorization: `Basic ${newToken}`,
					};
				} else {
					return undefined;
				}
			};

			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				getDefaultHeaders(),
				fetchMock,
				undefined,
				undefined,
				undefined,
				undefined,
				refreshTokenIfNeeded,
			);

			//act
			await rw.get(requestUrl).then(() => assert.ok(true));

			assert.notEqual(rw["defaultHeaders"].Authorization, `Basic ${expiredToken}`);
			assert.strictEqual(rw["defaultHeaders"].Authorization, `Basic ${newToken}`);
		});
	});
});
