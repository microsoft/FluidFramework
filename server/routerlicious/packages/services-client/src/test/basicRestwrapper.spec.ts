/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import Axios, { AxiosHeaders } from "axios";
import { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import AxiosMockAdapter from "axios-mock-adapter";
import { CorrelationIdHeaderName } from "../constants";
import { BasicRestWrapper } from "../restWrapper";
import { KJUR as jsrsasign } from "jsrsasign";
import { jwtDecode } from "jwt-decode";

describe("BasicRestWrapper", () => {
	const baseurl = "https://fake.microsoft.com";
	const requestUrl = "/fakerequesturl/";
	const headerCount = 1;
	const maxBodyLength = 1000 * 1024 * 1024;
	const maxContentLength = 1000 * 1024 * 1024;
	const axiosInstance = Axios.create();
	let axiosMock: Partial<AxiosInstance>;
	let axiosErrorMock: Partial<AxiosInstance>;
	let axiosTooManyRequestsErrorZeroRetryAfterMock: Partial<AxiosInstance>;
	let axiosTooManyRequestsErrorNegativeRetryAfterMock: Partial<AxiosInstance>;
	let axiosMockAdapterTooManyRequestsErrorPositiveRetryAfter: AxiosMockAdapter;
	let requestOptions: AxiosRequestConfig;

	before(() => {
		axiosMock = {
			request: async <T = any, R = AxiosResponse<T>>(options?) =>
				new Promise<R>((resolve, reject) => {
					requestOptions = options;
					const response: AxiosResponse<T> = {
						config: { headers: new AxiosHeaders() },
						data: {} as T,
						headers: {},
						request: options.responseType,
						status: 200,
						statusText: "OK",
					};

					resolve(response as any);
				}),
		};

		axiosErrorMock = {
			request: async <T = any, R = AxiosResponse<T>>(options?) =>
				new Promise<R>((resolve, reject) => {
					requestOptions = options;

					const response: AxiosResponse = {
						config: options,
						data: {},
						headers: {},
						request: options.responseType,
						status: 500,
						statusText: "ServerError",
					};

					const err: AxiosError = {
						code: "500",
						config: options,
						message: "",
						name: "ServerError",
						request: {},
						response,
						isAxiosError: true,
						toJSON: () => ({}),
					};

					throw err;
				}),
		};

		axiosTooManyRequestsErrorZeroRetryAfterMock = {
			request: async <T = any, R = AxiosResponse<T>>(options?) =>
				new Promise<R>((resolve, reject) => {
					requestOptions = options;

					const response: AxiosResponse = {
						config: options,
						data: { retryAfter: 0, message: "throttled" },
						headers: {},
						request: options.responseType,
						status: 429,
						statusText: "TooManyRequests",
					};

					const err: AxiosError = {
						code: "429",
						config: options,
						message: "throttled",
						name: "TooManyRequests",
						request: {},
						response,
						isAxiosError: true,
						toJSON: () => ({}),
					};

					throw err;
				}),
		};

		axiosTooManyRequestsErrorNegativeRetryAfterMock = {
			request: async <T = any, R = AxiosResponse<T>>(options?) =>
				new Promise<R>((resolve, reject) => {
					requestOptions = options;

					const response: AxiosResponse = {
						config: options,
						data: { retryAfter: -1, message: "throttled" },
						headers: {},
						request: options.responseType,
						status: 429,
						statusText: "TooManyRequests",
					};

					const err: AxiosError = {
						code: "429",
						config: options,
						message: "throttled",
						name: "TooManyRequests",
						request: {},
						response,
						isAxiosError: true,
						toJSON: () => ({}),
					};

					throw err;
				}),
		};

		axiosMockAdapterTooManyRequestsErrorPositiveRetryAfter = new AxiosMockAdapter(
			axiosInstance,
		);

		// For axios mock for testing 429 throttled requests with a valid retryAfter value,
		// first request should return 429 and then a 200 should be returned
		// in order to validate the successful request.
		axiosMockAdapterTooManyRequestsErrorPositiveRetryAfter
			.onAny()
			.replyOnce(429, { retryAfter: 1, message: "throttled" })
			.onAny()
			.reply(200, "A successful request after being throttled.");
	});

	describe(".get", () => {
		it("Invalid Response Code should reject Promise", async () => {
			// arrange
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				axiosErrorMock as AxiosInstance,
			);

			// act/assert
			await rw.get(requestUrl).then(
				// tslint:disable-next-line:no-void-expression
				() => assert.fail("Promise was not rejected"),
				// tslint:disable-next-line:no-void-expression
				(err) => assert.ok(err, "Invalid response code rejected Promise"),
			);
		});

		it("429 Response Code should reject Promise with 0 retryAfter", async () => {
			// arrange
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				axiosTooManyRequestsErrorZeroRetryAfterMock as AxiosInstance,
			);

			// act/assert
			await rw.get(requestUrl).then(
				// tslint:disable-next-line:no-void-expression
				() => assert.fail("Promise was not rejected"),
				// tslint:disable-next-line:no-void-expression
				(err) => assert.ok(err, "Invalid response code rejected Promise"),
			);
		});

		it("429 Response Code should reject Promise with negative retryAfter", async () => {
			// arrange
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				axiosTooManyRequestsErrorNegativeRetryAfterMock as AxiosInstance,
			);

			// act/assert
			await rw.get(requestUrl).then(
				// tslint:disable-next-line:no-void-expression
				() => assert.fail("Promise was not rejected"),
				// tslint:disable-next-line:no-void-expression
				(err) => assert.ok(err, "Invalid response code rejected Promise"),
			);
		});

		it("429 Response Code should not reject Promise with positive retryAfter", async () => {
			// arrange
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				axiosInstance,
			);

			// act/assert
			await rw.get(requestUrl).then(
				// tslint:disable-next-line:no-void-expression
				(response) =>
					assert.strictEqual(response, "A successful request after being throttled."),
				// tslint:disable-next-line:no-void-expression
				(err) => assert.fail("Invalid response code rejected Promise"),
			);
		});

		it("Standard properties should not change", async () => {
			// arrange
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				undefined,
				axiosMock as AxiosInstance,
			);

			// act
			await rw.get(requestUrl);

			// assert
			assert.strictEqual(baseurl, requestOptions.baseURL, "baseURL should be the same");
			assert.strictEqual(requestUrl, requestOptions.url, "requestUrl should be the same");
			assert.strictEqual(
				headerCount,
				Object.keys(requestOptions.headers).length,
				"Headers should only have 1 header",
			);
			assert.strictEqual(
				CorrelationIdHeaderName,
				Object.keys(requestOptions.headers)[0],
				"Headers should only have x-correlation-id",
			);
		});

		it("Default QueryString and Default Headers", async () => {
			// arrange
			const defaultHeaders = { h1: "valueh1", h2: "valueh2" };
			const defaultQueryString = { q1: "valueq1", q2: "valueq2" };
			const outputUrl = `${requestUrl}?q1=valueq1&q2=valueq2`;
			const rw = new BasicRestWrapper(
				baseurl,
				defaultQueryString,
				maxBodyLength,
				maxContentLength,
				defaultHeaders,
				axiosMock as AxiosInstance,
			);

			// act
			await rw.get(requestUrl);

			// assert
			// tslint:disable-next-line:max-line-length
			assert.strictEqual(
				outputUrl,
				requestOptions.url.substring(0, outputUrl.length),
				"requestUrl should be the same",
			);
			assert.strictEqual(
				defaultHeaders.h1,
				requestOptions.headers.h1 as string,
				"Header1 value should be correct",
			);
			assert.strictEqual(
				defaultHeaders.h2,
				requestOptions.headers.h2 as string,
				"Header2 value should be correct",
			);
		});

		it("Default and Request, QueryString and Headers", async () => {
			// arrange
			const defaultHeaders = { h1: "valueh1", h2: "valueh2" };
			const requestHeaders = { h1: "valueh11", h3: "valueh3" };
			const defaultQueryString = { q1: "valueq1", q2: "valueq2" };
			const requestQueryString = { q1: "valueq11", q3: "valueq3" };
			const outputUrl = `${requestUrl}?q1=valueq11&q2=valueq2&q3=valueq3`;
			const rw = new BasicRestWrapper(
				baseurl,
				defaultQueryString,
				maxBodyLength,
				maxContentLength,
				defaultHeaders,
				axiosMock as AxiosInstance,
			);

			// act
			await rw.get(requestUrl, requestQueryString, requestHeaders);

			// assert
			assert.strictEqual(
				outputUrl,
				requestOptions.url.substring(0, outputUrl.length),
				"requestUrl should be the same",
			);
			assert.strictEqual(
				requestHeaders.h1,
				requestOptions.headers.h1 as string,
				"Header1 value should be updated",
			);
			assert.strictEqual(
				defaultHeaders.h2,
				requestOptions.headers.h2 as string,
				"Header2 value should be correct",
			);
			assert.strictEqual(
				requestHeaders.h3,
				requestOptions.headers.h3 as string,
				"Header2 value should be added",
			);
		});
	});

	describe(".post", () => {
		it("Invalid Response Code should reject Promise", async () => {
			// arrange
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				axiosErrorMock as AxiosInstance,
			);

			// act/assert
			await rw.post(requestUrl, {}).then(
				// tslint:disable-next-line:no-void-expression
				() => assert.fail("Promise was not rejected"),
				// tslint:disable-next-line:no-void-expression
				(err) => assert.ok(err, "Invalid response code rejected Promise"),
			);
		});

		it("429 Response Code should reject Promise with 0 retryAfter", async () => {
			// arrange
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				axiosTooManyRequestsErrorZeroRetryAfterMock as AxiosInstance,
			);

			// act/assert
			await rw.post(requestUrl, {}).then(
				// tslint:disable-next-line:no-void-expression
				() => assert.fail("Promise was not rejected"),
				// tslint:disable-next-line:no-void-expression
				(err) => assert.ok(err, "Invalid response code rejected Promise"),
			);
		});

		it("429 Response Code should reject Promise with negative retryAfter", async () => {
			// arrange
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				axiosTooManyRequestsErrorNegativeRetryAfterMock as AxiosInstance,
			);

			// act/assert
			await rw.post(requestUrl, {}).then(
				// tslint:disable-next-line:no-void-expression
				() => assert.fail("Promise was not rejected"),
				// tslint:disable-next-line:no-void-expression
				(err) => assert.ok(err, "Invalid response code rejected Promise"),
			);
		});

		it("429 Response Code should not reject Promise with positive retryAfter", async () => {
			// arrange
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				axiosInstance,
			);

			// act/assert
			await rw.post(requestUrl, {}).then(
				// tslint:disable-next-line:no-void-expression
				(response) =>
					assert.strictEqual(response, "A successful request after being throttled."),
				// tslint:disable-next-line:no-void-expression
				(err) => assert.fail("Invalid response code rejected Promise"),
			);
		});

		it("Standard properties should not change", async () => {
			// arrange
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				undefined,
				axiosMock as AxiosInstance,
			);

			// act
			await rw.post(requestUrl, {});

			// assert
			assert.strictEqual(baseurl, requestOptions.baseURL, "baseURL should be the same");
			assert.strictEqual(requestUrl, requestOptions.url, "requestUrl should be the same");
			assert.strictEqual(
				headerCount,
				Object.keys(requestOptions.headers).length,
				"Headers should only have 1 header",
			);
			assert.strictEqual(
				CorrelationIdHeaderName,
				Object.keys(requestOptions.headers)[0],
				"Headers should only have x-correlation-id",
			);
		});

		it("Default QueryString and Default Headers", async () => {
			// arrange
			const defaultHeaders = { h1: "valueh1", h2: "valueh2" };
			const defaultQueryString = { q1: "valueq1", q2: "valueq2" };
			const rw = new BasicRestWrapper(
				baseurl,
				defaultQueryString,
				maxBodyLength,
				maxContentLength,
				defaultHeaders,
				axiosMock as AxiosInstance,
			);

			// act
			await rw.post(requestUrl, {});

			// assert
			assert.strictEqual(
				`${requestUrl}?q1=valueq1&q2=valueq2`,
				requestOptions.url,
				"requestUrl should be the same",
			);
			assert.strictEqual(
				defaultHeaders.h1,
				requestOptions.headers.h1 as string,
				"Header1 value should be correct",
			);
			assert.strictEqual(
				defaultHeaders.h2,
				requestOptions.headers.h2 as string,
				"Header2 value should be correct",
			);
		});

		it("Default and Request, QueryString and Headers", async () => {
			// arrange
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
				axiosMock as AxiosInstance,
			);

			// act
			await rw.post(requestUrl, {}, requestQueryString, requestHeaders);

			// assert
			assert.strictEqual(
				`${requestUrl}?q1=valueq11&q2=valueq2&q3=valueq3`,
				requestOptions.url,
				"requestUrl should be the same",
			);
			assert.strictEqual(
				requestHeaders.h1,
				requestOptions.headers.h1 as string,
				"Header1 value should be updated",
			);
			assert.strictEqual(
				defaultHeaders.h2,
				requestOptions.headers.h2 as string,
				"Header2 value should be correct",
			);
			assert.strictEqual(
				requestHeaders.h3,
				requestOptions.headers.h3 as string,
				"Header2 value should be added",
			);
		});
	});

	describe(".delete", () => {
		it("Invalid Response Code should reject Promise", async () => {
			// arrange
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				axiosErrorMock as AxiosInstance,
			);

			// act/assert
			await rw.delete(requestUrl, {}).then(
				// tslint:disable-next-line:no-void-expression
				() => assert.fail("Promise was not rejected"),
				// tslint:disable-next-line:no-void-expression
				(err) => assert.ok(err, "Invalid response code rejected Promise"),
			);
		});

		it("429 Response Code should reject Promise with 0 retryAfter", async () => {
			// arrange
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				axiosTooManyRequestsErrorZeroRetryAfterMock as AxiosInstance,
			);

			// act/assert
			await rw.delete(requestUrl, {}).then(
				// tslint:disable-next-line:no-void-expression
				() => assert.fail("Promise was not rejected"),
				// tslint:disable-next-line:no-void-expression
				(err) => assert.ok(err, "Invalid response code rejected Promise"),
			);
		});

		it("429 Response Code should reject Promise with negative retryAfter", async () => {
			// arrange
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				axiosTooManyRequestsErrorNegativeRetryAfterMock as AxiosInstance,
			);

			// act/assert
			await rw.delete(requestUrl, {}).then(
				// tslint:disable-next-line:no-void-expression
				() => assert.fail("Promise was not rejected"),
				// tslint:disable-next-line:no-void-expression
				(err) => assert.ok(err, "Invalid response code rejected Promise"),
			);
		});

		it("429 Response Code should not reject Promise with positive retryAfter", async () => {
			// arrange
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				axiosInstance,
			);

			// act/assert
			await rw.delete(requestUrl, {}).then(
				// tslint:disable-next-line:no-void-expression
				(response) =>
					assert.strictEqual(response, "A successful request after being throttled."),
				// tslint:disable-next-line:no-void-expression
				(err) => assert.fail("Invalid response code rejected Promise"),
			);
		});

		it("Standard properties should not change", async () => {
			// arrange
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				undefined,
				axiosMock as AxiosInstance,
			);

			// act
			await rw.delete(requestUrl);

			// assert
			assert.strictEqual(baseurl, requestOptions.baseURL, "baseURL should be the same");
			assert.strictEqual(requestUrl, requestOptions.url, "requestUrl should be the same");
			assert.strictEqual(
				headerCount,
				Object.keys(requestOptions.headers).length,
				"Headers should only have 1 header",
			);
			assert.strictEqual(
				CorrelationIdHeaderName,
				Object.keys(requestOptions.headers)[0],
				"Headers should only have x-correlation-id",
			);
		});

		it("Default QueryString and Default Headers", async () => {
			// arrange
			const defaultHeaders = { h1: "valueh1", h2: "valueh2" };
			const defaultQueryString = { q1: "valueq1", q2: "valueq2" };
			const rw = new BasicRestWrapper(
				baseurl,
				defaultQueryString,
				maxBodyLength,
				maxContentLength,
				defaultHeaders,
				axiosMock as AxiosInstance,
			);

			// act
			await rw.delete(requestUrl);

			// assert
			assert.strictEqual(
				`${requestUrl}?q1=valueq1&q2=valueq2`,
				requestOptions.url,
				"requestUrl should be the same",
			);
			assert.strictEqual(
				defaultHeaders.h1,
				requestOptions.headers.h1 as string,
				"Header1 value should be correct",
			);
			assert.strictEqual(
				defaultHeaders.h2,
				requestOptions.headers.h2 as string,
				"Header2 value should be correct",
			);
		});

		it("Default and Request, QueryString and Headers", async () => {
			// arrange
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
				axiosMock as AxiosInstance,
			);

			// act
			await rw.delete(requestUrl, requestQueryString, requestHeaders);

			// assert
			assert.strictEqual(
				`${requestUrl}?q1=valueq11&q2=valueq2&q3=valueq3`,
				requestOptions.url,
				"requestUrl should be the same",
			);
			assert.strictEqual(
				requestHeaders.h1,
				requestOptions.headers.h1 as string,
				"Header1 value should be updated",
			);
			assert.strictEqual(
				defaultHeaders.h2,
				requestOptions.headers.h2 as string,
				"Header2 value should be correct",
			);
			assert.strictEqual(
				requestHeaders.h3,
				requestOptions.headers.h3 as string,
				"Header2 value should be added",
			);
		});
	});

	describe(".patch", () => {
		it("Invalid Response Code should reject Promise", async () => {
			// arrange
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				axiosErrorMock as AxiosInstance,
			);

			// act/assert
			await rw.patch(requestUrl, {}).then(
				// tslint:disable-next-line:no-void-expression
				() => assert.fail("Promise was not rejected"),
				// tslint:disable-next-line:no-void-expression
				(err) => assert.ok(err, "Invalid response code rejected Promise"),
			);
		});

		it("429 Response Code should reject Promise with 0 retryAfter", async () => {
			// arrange
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				axiosTooManyRequestsErrorZeroRetryAfterMock as AxiosInstance,
			);

			// act/assert
			await rw.patch(requestUrl, {}).then(
				// tslint:disable-next-line:no-void-expression
				() => assert.fail("Promise was not rejected"),
				// tslint:disable-next-line:no-void-expression
				(err) => assert.ok(err, "Invalid response code rejected Promise"),
			);
		});

		it("429 Response Code should reject Promise with negative retryAfter", async () => {
			// arrange
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				axiosTooManyRequestsErrorNegativeRetryAfterMock as AxiosInstance,
			);

			// act/assert
			await rw.patch(requestUrl, {}).then(
				// tslint:disable-next-line:no-void-expression
				() => assert.fail("Promise was not rejected"),
				// tslint:disable-next-line:no-void-expression
				(err) => assert.ok(err, "Invalid response code rejected Promise"),
			);
		});

		it("429 Response Code should not reject Promise with positive retryAfter", async () => {
			// arrange
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				{},
				axiosInstance,
			);

			// act/assert
			await rw.patch(requestUrl, {}).then(
				// tslint:disable-next-line:no-void-expression
				(response) =>
					assert.strictEqual(response, "A successful request after being throttled."),
				// tslint:disable-next-line:no-void-expression
				(err) => assert.fail("Invalid response code rejected Promise"),
			);
		});

		it("Standard properties should not change", async () => {
			// arrange
			const rw = new BasicRestWrapper(
				baseurl,
				{},
				maxBodyLength,
				maxContentLength,
				undefined,
				axiosMock as AxiosInstance,
			);

			// act
			await rw.patch(requestUrl, {});

			// assert
			assert.strictEqual(baseurl, requestOptions.baseURL, "baseURL should be the same");
			assert.strictEqual(requestUrl, requestOptions.url, "requestUrl should be the same");
			assert.strictEqual(
				headerCount,
				Object.keys(requestOptions.headers).length,
				"Headers should only have 1 header",
			);
			assert.strictEqual(
				CorrelationIdHeaderName,
				Object.keys(requestOptions.headers)[0],
				"Headers should only have x-correlation-id",
			);
		});

		it("Default QueryString and Default Headers", async () => {
			// arrange
			const defaultHeaders = { h1: "valueh1", h2: "valueh2" };
			const defaultQueryString = { q1: "valueq1", q2: "valueq2" };
			const rw = new BasicRestWrapper(
				baseurl,
				defaultQueryString,
				maxBodyLength,
				maxContentLength,
				defaultHeaders,
				axiosMock as AxiosInstance,
			);

			// act
			await rw.patch(requestUrl, {});

			// assert
			assert.strictEqual(
				`${requestUrl}?q1=valueq1&q2=valueq2`,
				requestOptions.url,
				"requestUrl should be the same",
			);
			assert.strictEqual(
				defaultHeaders.h1,
				requestOptions.headers.h1 as string,
				"Header1 value should be correct",
			);
			assert.strictEqual(
				defaultHeaders.h2,
				requestOptions.headers.h2 as string,
				"Header2 value should be correct",
			);
		});

		it("Default and Request, QueryString and Headers", async () => {
			// arrange
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
				axiosMock as AxiosInstance,
			);

			// act
			await rw.patch(requestUrl, {}, requestQueryString, requestHeaders);

			// assert
			assert.strictEqual(
				`${requestUrl}?q1=valueq11&q2=valueq2&q3=valueq3`,
				requestOptions.url,
				"requestUrl should be the same",
			);
			assert.strictEqual(
				requestHeaders.h1,
				requestOptions.headers.h1 as string,
				"Header1 value should be updated",
			);
			assert.strictEqual(
				defaultHeaders.h2,
				requestOptions.headers.h2 as string,
				"Header2 value should be correct",
			);
			assert.strictEqual(
				requestHeaders.h3,
				requestOptions.headers.h3 as string,
				"Header2 value should be added",
			);
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
				axiosMock as AxiosInstance,
				undefined,
				undefined,
				undefined,
				undefined,
				refreshTokenIfNeeded,
			);

			//act
			await rw.get(requestUrl).then(
				// tslint:disable-next-line:no-void-expression
				() => assert.ok(true),
			);

			assert.notEqual(rw["defaultHeaders"].Authorization, `Basic ${expiredToken}`);
			assert.strictEqual(rw["defaultHeaders"].Authorization, `Basic ${newToken}`);
		});
	});
});
