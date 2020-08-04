/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { IOdspSocketError } from "../contracts";
import {
    getWithRetryForTokenRefresh,
} from "../odspUtils";
import {
    createOdspNetworkError,
    errorObjectFromSocketError,
    fetchIncorrectResponse,
    throwOdspNetworkError,
    invalidFileNameStatusCode,
    OdspError,
} from "../odspError";

describe("Odsp Error", () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const testResponse = { // Implements only part of Response.headers
        statusText: "testStatusText",
        type: "default",
        headers: { get(name: string): string | null { return "xxx-xxx"; } },
    } as Response;

    function createOdspNetworkErrorWithResponse(
        errorMessage: string,
        statusCode: number,
    ) {
        try {
            throwOdspNetworkError(
                errorMessage,
                statusCode,
                testResponse,
            );
            assert.fail("Not reached - throwOdspNetworkError should have thrown");
        } catch (error) {
            return error as OdspError;
        }
    }

    it("throwOdspNetworkError first-class properties", async () => {
        const networkError = createOdspNetworkErrorWithResponse(
            "TestMessage",
            400,
        );
        if (networkError.errorType !== DriverErrorType.genericNetworkError) {
            assert.fail("networkError should be a genericNetworkError");
        }
        else {
            assert.notEqual(-1, networkError.message.indexOf("TestMessage"),
                "message should contain original message");
            assert.notEqual(-1, networkError.message.indexOf("testStatusText"),
                "message should contain Response.statusText");
            assert.notEqual(-1, networkError.message.indexOf("default"),
                "message should contain Response.type");
            assert.equal(false, networkError.canRetry, "canRetry should be false");
        }
    });

    it("throwOdspNetworkError sprequestguid exist", async () => {
        const error1: any = createOdspNetworkErrorWithResponse("Error", 400);
        const errorBag = { ...error1.getCustomProperties() };
        assert.equal("xxx-xxx", errorBag.sprequestguid, "sprequestguid should be 'xxx-xxx'");
    });

    it("throwOdspNetworkError sprequestguid undefined", async () => {
        const error1: any = createOdspNetworkError("Error", 400);
        const errorBag = { ...error1.getCustomProperties() };
        assert.equal(undefined, errorBag.sprequestguid, "sprequestguid should not be defined");
    });

    it("errorObjectFromSocketError no retryAfter", async () => {
        const socketError: IOdspSocketError = {
            message: "testMessage",
            code: 400,
        };
        const networkError = errorObjectFromSocketError(socketError);
        if (networkError.errorType !== DriverErrorType.genericNetworkError) {
            assert.fail("networkError should be a genericNetworkError");
        }
        else {
            assert.equal(networkError.message, "testMessage");
            assert.equal(networkError.canRetry, false);
            assert.equal(networkError.statusCode, 400);
        }
    });

    it("errorObjectFromSocketError with retryFilter", async () => {
        const socketError: IOdspSocketError = {
            message: "testMessage",
            code: 400,
        };
        const networkError = errorObjectFromSocketError(socketError);
        if (networkError.errorType !== DriverErrorType.genericNetworkError) {
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
            code: 429,
            retryAfter: 10,
        };
        const networkError = errorObjectFromSocketError(socketError);
        if (networkError.errorType !== DriverErrorType.throttlingError) {
            assert.fail("networkError should be a throttlingError");
        }
        else {
            assert.equal(networkError.message, "testMessage");
            assert.equal(networkError.retryAfterSeconds, 10);
        }
    });

    it("Access Denied retries", async () => {
        const res = await getWithRetryForTokenRefresh(async (refresh) => {
            if (refresh) {
                return 1;
            } else {
                throwOdspNetworkError("some error", 401);
            }
        });
        assert.equal(res, 1, "did not successfully retried with new token");
    });

    it("Access Denied retries", async () => {
        const res = getWithRetryForTokenRefresh(async (refresh) => {
            if (refresh) {
                return 1;
            } else {
                throwOdspNetworkError("some error", invalidFileNameStatusCode);
            }
        });
        await assert.rejects(res, "did not successfully retried with new token");
    });

    it("fetch incorrect response retries", async () => {
        const res = await getWithRetryForTokenRefresh(async (refresh) => {
            if (refresh) {
                return 1;
            } else {
                throwOdspNetworkError("some error", fetchIncorrectResponse);
            }
        });
        assert.equal(res, 1, "did not successfully retried with new token");
    });

    it("Other errors - no retries", async () => {
        const res = getWithRetryForTokenRefresh(async (refresh) => {
            if (refresh) {
                return 1;
            } else {
                throwOdspNetworkError("some error", invalidFileNameStatusCode);
            }
        });
        await assert.rejects(res, "Other errors should not result in retries!");
    });
});
