/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { Deferred } from "@fluidframework/server-common-utils";
import { NetworkError } from "@fluidframework/server-services-client";
import type { Response, Request } from "express";
import {
	containsPathTraversal,
	defaultErrorMessage,
	handleResponse,
	validateRequestParams,
} from "../http";

class MockRequest {
	constructor(public readonly params: { [key: string]: string }) {}
}
class MockResponse {
	private _statusCode: number = 200;
	public get statusCode(): number {
		return this._statusCode;
	}
	private _responseData: string = "";
	public get responseData(): string {
		return this._responseData;
	}
	private _headers: { [key: string]: string } = {};
	public setHeader(name: string, value: string) {
		this._headers[name] = value;
	}

	public getHeader(name: string): string {
		return this._headers[name];
	}
	public readonly endedP: Deferred<any> = new Deferred();

	public status(status: number): MockResponse {
		this._statusCode = status;
		return this;
	}

	public json(json: any): MockResponse {
		this.endedP.resolve(undefined);
		this._responseData = JSON.stringify(json);
		return this;
	}

	public text(text: string): MockResponse {
		this.endedP.resolve(undefined);
		this._responseData = text;
		return this;
	}
}

async function waitForResponseEnd(mockResponse: MockResponse): Promise<void> {
	return new Promise((resolve, reject) => {
		mockResponse.endedP.promise.then(resolve).catch(reject);
	});
}

class MockMongoError extends Error {
	constructor(
		public readonly code: number,
		public readonly message: string,
	) {
		super(message);
	}
}

const defaultErrorCode = 400;

describe("HTTP Utils", () => {
	describe("containsPathTraversal()", () => {
		it("catches single upward traversal", () => {
			const testPath = "../path";
			assert.strictEqual(containsPathTraversal(testPath), true);
		});
		it("catches single upward + downward traversal", () => {
			const testPath = "../path/other";
			assert.strictEqual(containsPathTraversal(testPath), true);
		});
		it("catches multiple upward traversals", () => {
			const testPath = "../../../path";
			assert.strictEqual(containsPathTraversal(testPath), true);
		});
		it("catches root directory traversal", () => {
			const testPath = "/path";
			assert.strictEqual(containsPathTraversal(testPath), true);
		});
		it("does not flag downward traversal", () => {
			const testPath = "path/other";
			assert.strictEqual(containsPathTraversal(testPath), false);
		});
		it("does not flag no traversal", () => {
			const testPath = "path";
			assert.strictEqual(containsPathTraversal(testPath), false);
		});
	});
	describe("validateRequestParams()", () => {
		const param1Name = "param1";
		const param2Name = "param2";
		const invalidParam1 = "../hello/world";
		const invalidParam2 = "/goodbye";
		const validParam1 = "hello";
		const validParam2 = "world";
		let nextCalled = false;
		const mockNext = () => {
			nextCalled = true;
		};
		beforeEach(() => {
			nextCalled = false;
		});
		it("does not allow one invalid parameter", async () => {
			const mockReq = new MockRequest({ [param1Name]: invalidParam1 });
			const mockRes = new MockResponse();
			const middleware = validateRequestParams(param1Name);
			middleware(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);
			await waitForResponseEnd(mockRes);
			assert.strictEqual(mockRes.statusCode, 400);
			assert.strictEqual(nextCalled, false);
		});
		it("does not allow one invalid parameter amongst multiple", async () => {
			const mockReq = new MockRequest({
				[param1Name]: invalidParam1,
				[param2Name]: validParam2,
			});
			const mockRes = new MockResponse();
			const middleware = validateRequestParams(param1Name, param2Name);
			middleware(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);
			await waitForResponseEnd(mockRes);
			assert.strictEqual(mockRes.statusCode, 400);
			assert.strictEqual(nextCalled, false);
		});
		it("does not allow multiple invalid parameters", async () => {
			const mockReq = new MockRequest({
				[param1Name]: invalidParam1,
				[param2Name]: invalidParam2,
			});
			const mockRes = new MockResponse();
			const middleware = validateRequestParams(param1Name, param2Name);
			middleware(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);
			await waitForResponseEnd(mockRes);
			assert.strictEqual(mockRes.statusCode, 400);
			assert.strictEqual(nextCalled, false);
		});
		it("allows one valid parameter", async () => {
			const mockReq = new MockRequest({ [param1Name]: validParam1 });
			const mockRes = new MockResponse();
			const middleware = validateRequestParams(param1Name);
			middleware(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);
			assert.strictEqual(nextCalled, true);
			mockRes.endedP.resolve(undefined);
		});
		it("allows multiple valid parameters", async () => {
			const mockReq = new MockRequest({
				[param1Name]: validParam1,
				[param2Name]: validParam2,
			});
			const mockRes = new MockResponse();
			const middleware = validateRequestParams(param1Name, param2Name);
			middleware(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);
			assert.strictEqual(nextCalled, true);
			mockRes.endedP.resolve(undefined);
		});
		it("allows missing checked parameters", async () => {
			const mockReq = new MockRequest({ [param1Name]: validParam1 });
			const mockRes = new MockResponse();
			const middleware = validateRequestParams(param1Name, param2Name);
			middleware(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);
			assert.strictEqual(nextCalled, true);
			mockRes.endedP.resolve(undefined);
		});
		it("allows invalid not-checked parameters", async () => {
			const mockReq = new MockRequest({
				[param1Name]: validParam1,
				[param2Name]: invalidParam2,
			});
			const mockRes = new MockResponse();
			const middleware = validateRequestParams(param1Name);
			middleware(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);
			assert.strictEqual(nextCalled, true);
			mockRes.endedP.resolve(undefined);
		});
	});
	describe("handleResponse()", () => {
		it("handles success", async () => {
			const mockResponse = new MockResponse();
			const responseData = "hello";
			const exposedHeaders = "Content-Encoding, Content-Length, Content-Type";
			handleResponse(Promise.resolve(responseData), mockResponse as unknown as Response);
			await waitForResponseEnd(mockResponse);
			assert.strictEqual(mockResponse.statusCode, 200);
			assert.strictEqual(mockResponse.responseData, JSON.stringify(responseData));
			assert.strictEqual(
				mockResponse.getHeader("Access-Control-Expose-Headers"),
				exposedHeaders,
			);
			assert.strictEqual(mockResponse.getHeader("Timing-Allow-Origin"), "*");
		});
		it("handles NetworkError error", async () => {
			const mockResponse = new MockResponse();
			const responseError = new NetworkError(404, "Not Found");
			handleResponse(Promise.reject(responseError), mockResponse as unknown as Response);
			await waitForResponseEnd(mockResponse);
			assert.strictEqual(mockResponse.statusCode, responseError.code);
			assert.strictEqual(mockResponse.responseData, JSON.stringify(responseError.message));
		});
		it("handles MongoError error", async () => {
			const mockResponse = new MockResponse();
			const responseError = new MockMongoError(11000, "E11000: Duplicate Key");
			handleResponse(Promise.reject(responseError), mockResponse as unknown as Response);
			await waitForResponseEnd(mockResponse);
			assert.strictEqual(mockResponse.statusCode, defaultErrorCode);
			assert.strictEqual(mockResponse.responseData, JSON.stringify(defaultErrorMessage));
		});
		it("handles undefined error", async () => {
			const mockResponse = new MockResponse();
			const responseError = undefined;
			handleResponse(Promise.reject(responseError), mockResponse as unknown as Response);
			await waitForResponseEnd(mockResponse);
			assert.strictEqual(mockResponse.statusCode, defaultErrorCode);
			assert.strictEqual(mockResponse.responseData, JSON.stringify(defaultErrorMessage));
		});
		it("handles string error", async () => {
			const mockResponse = new MockResponse();
			const responseError = "Failure occurred";
			handleResponse(Promise.reject(responseError), mockResponse as unknown as Response);
			await waitForResponseEnd(mockResponse);
			assert.strictEqual(mockResponse.statusCode, defaultErrorCode);
			assert.strictEqual(mockResponse.responseData, JSON.stringify(defaultErrorMessage));
		});
		it("handles Error error", async () => {
			const mockResponse = new MockResponse();
			const responseError = new Error("Internal Error");
			handleResponse(Promise.reject(responseError), mockResponse as unknown as Response);
			await waitForResponseEnd(mockResponse);
			assert.strictEqual(mockResponse.statusCode, defaultErrorCode);
			assert.strictEqual(mockResponse.responseData, JSON.stringify(defaultErrorMessage));
		});
	});
});
