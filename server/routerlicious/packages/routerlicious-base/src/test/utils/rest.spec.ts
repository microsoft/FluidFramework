/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NetworkError } from "@fluidframework/server-services-client";
import assert from "assert";
import { Response } from "express";
import { handleResponse } from "../../utils";

class MockResponse {
    public statusCode: number = 200;
    public responseData: string = "";

    public status(status: number): MockResponse {
        this.statusCode = status;
        return this;
    }

    public json(json: any): MockResponse {
        this.responseData = JSON.stringify(json);
        return this;
    }

    public text(text: string): MockResponse {
        this.responseData = text;
        return this;
    }
}

class MockMongoError extends Error {
    constructor(public readonly code: number, public readonly message: string) {
        super(message);
    }
}

const defaultErrorCode = 400;

describe("Routerlicious Base", () => {
    describe("Rest Utils", () => {
        describe("handleResponse()", () => {
            it("handles success", async () => {
                const mockResponse = new MockResponse();
                const responseData = "hello";
                await handleResponse(Promise.resolve(responseData), (mockResponse as unknown) as Response);
                assert.strictEqual(mockResponse.statusCode, 200);
                assert.strictEqual(mockResponse.responseData, JSON.stringify(responseData));
            });
            it("handles NetworkError error", async () => {
                const mockResponse = new MockResponse();
                const responseError = new NetworkError(404, "Not Found");
                await handleResponse(Promise.reject(responseError), (mockResponse as unknown) as Response);
                assert.strictEqual(mockResponse.statusCode, responseError.code);
                assert.strictEqual(mockResponse.responseData, JSON.stringify(responseError.message));
            });
            it("handles MongoError error", async () => {
                const mockResponse = new MockResponse();
                const responseError = new MockMongoError(11000, "E11000: Duplicate Key");
                await handleResponse(Promise.reject(responseError), (mockResponse as unknown) as Response);
                assert.strictEqual(mockResponse.statusCode, defaultErrorCode);
                assert.strictEqual(mockResponse.responseData, JSON.stringify(responseError.message));
            });
            it("handles undefined error", async () => {
                const mockResponse = new MockResponse();
                const responseError = undefined;
                await handleResponse(Promise.reject(responseError), (mockResponse as unknown) as Response);
                assert.strictEqual(mockResponse.statusCode, defaultErrorCode);
                assert.strictEqual(mockResponse.responseData, JSON.stringify(undefined));
            });
            it("handles string error", async () => {
                const mockResponse = new MockResponse();
                const responseError = "Failure occurred";
                await handleResponse(Promise.reject(responseError), (mockResponse as unknown) as Response);
                assert.strictEqual(mockResponse.statusCode, defaultErrorCode);
                assert.strictEqual(mockResponse.responseData, JSON.stringify(responseError));
            });
            it("handles Error error", async () => {
                const mockResponse = new MockResponse();
                const responseError = new Error("Internal Error");
                await handleResponse(Promise.reject(responseError), (mockResponse as unknown) as Response);
                assert.strictEqual(mockResponse.statusCode, defaultErrorCode);
                assert.strictEqual(mockResponse.responseData, JSON.stringify(responseError.message));
            });
        });
    });
});
