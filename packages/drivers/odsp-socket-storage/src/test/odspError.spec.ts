/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { CriticalContainerError, ErrorType } from "@microsoft/fluid-container-definitions";
import { IOdspSocketError } from "../contracts";
import { throwOdspNetworkError, errorObjectFromSocketError } from "../odspUtils";

describe("Odsp Error", () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const testResponse = { // Implements only part of Response.headers
        statusText: "testStatusText",
        type: "default",
        headers: { get(name: string): string | null { return "xxx-xxx"; } },
    } as Response;

    function createOdspNetworkError(
        errorMessage: string,
        statusCode: number,
        canRetry: boolean,
        includeResponse: boolean,
    ) {
        try {
            throwOdspNetworkError(
                errorMessage,
                statusCode,
                canRetry,
                includeResponse ? testResponse : undefined,
            );
            assert.fail("Not reached - throwOdspNetworkError should have thrown");
        } catch (error) {
            return error as CriticalContainerError;
        }
    }

    it("throwOdspNetworkError first-class properties", async () => {
        const networkError: CriticalContainerError = createOdspNetworkError(
            "TestMessage",
            400,
            true /* canRetry */,
            true /* includeResponse */,
        );
        if (networkError.errorType !== ErrorType.genericNetworkError) {
            assert.fail("networkError should be a genericNetworkError");
        }
        else {
            assert.notEqual(-1, networkError.message.indexOf("TestMessage"),
                "message should contain original message");
            assert.notEqual(-1, networkError.message.indexOf("testStatusText"),
                "message should contain Response.statusText");
            assert.notEqual(-1, networkError.message.indexOf("default"),
                "message should contain Response.type");
            assert.equal(true, networkError.canRetry, "canRetry should be true");
        }
    });

    it("throwOdspNetworkError sprequestguid exist", async () => {
        const error1: any = createOdspNetworkError("Error", 400, true /* canRetry */, true /* includeResponse */);
        const errorBag = { ...error1.getCustomProperties() };
        assert.equal("xxx-xxx", errorBag.sprequestguid, "sprequestguid should be 'xxx-xxx'");
    });

    it("throwOdspNetworkError sprequestguid undefined", async () => {
        const error1: any = createOdspNetworkError("Error", 400, true /* canRetry */, false /* includeResponse */);
        const errorBag = { ...error1.getCustomProperties() };
        assert.equal(undefined, errorBag.sprequestguid, "sprequestguid should not be defined");
    });

    it("errorObjectFromSocketError no retryFilter, no retryAfter", async () => {
        const socketError: IOdspSocketError = {
            message: "testMessage",
            code: 400,
        };
        const networkError = errorObjectFromSocketError(socketError);
        if (networkError.errorType !== ErrorType.genericNetworkError) {
            assert.fail("networkError should be a genericNetworkError");
        }
        else {
            assert.equal(networkError.message, "testMessage");
            assert.equal(networkError.canRetry, true);
            assert.equal(networkError.statusCode, 400);
        }
    });

    it("errorObjectFromSocketError with retryFilter", async () => {
        const socketError: IOdspSocketError = {
            message: "testMessage",
            code: 400,
        };
        const retryFilter = (code: number) => false;
        const networkError = errorObjectFromSocketError(socketError, retryFilter);
        if (networkError.errorType !== ErrorType.genericNetworkError) {
            assert.fail("networkError should be a genericNetworkError");
        }
        else {
            assert.equal(networkError.message, "testMessage");
            assert.equal(networkError.canRetry, false);
            assert.equal(networkError.statusCode, 400);
        }
    });

    it("errorObjectFromSocketError with retryAfter", async () => {
        const socketError: IOdspSocketError = {
            message: "testMessage",
            code: 400,
            retryAfter: 10,
        };
        const networkError = errorObjectFromSocketError(socketError);
        if (networkError.errorType !== ErrorType.throttlingError) {
            assert.fail("networkError should be a throttlingError");
        }
        else {
            assert.equal(networkError.message, "testMessage");
            assert.equal(networkError.retryAfterSeconds, 10);
        }
    });
});
