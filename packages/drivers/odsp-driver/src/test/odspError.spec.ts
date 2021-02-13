/* eslint-disable max-len */
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import {
    createOdspNetworkError,
    fetchIncorrectResponse,
    invalidFileNameStatusCode,
    OdspError,
    OdspErrorType,
    throwOdspNetworkError,
} from "@fluidframework/odsp-doclib-utils";
import { IOdspSocketError } from "../contracts";
import { getWithRetryForTokenRefresh } from "../odspUtils";
import { errorObjectFromSocketError } from "../odspError";

describe("Odsp Error", () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const testResponse = { // Implements only part of Response.headers
        statusText: "testStatusText",
        type: "default",
        headers: { get(name: string): string | null {
            if (name === "sprequestguid") {
                return "xxx-xxx";
            }
            return null;
        } },
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
        } else {
            assert.notEqual(-1, networkError.message.indexOf("TestMessage"),
                "message should contain original message");
            assert.notEqual(-1, networkError.message.indexOf("testStatusText"),
                "message should contain Response.statusText");
            assert((networkError as any).responseType === "default", "message should contain Response.type");
            assert.equal(false, networkError.canRetry, "canRetry should be false");
        }
    });

    it("throwOdspNetworkError sprequestguid exists", async () => {
        const error1: any = createOdspNetworkErrorWithResponse("Error", 400);
        const errorBag = { ...error1.getTelemetryProperties() };
        assert.equal("xxx-xxx", errorBag.sprequestguid, "sprequestguid should be 'xxx-xxx'");
    });

    it("throwOdspNetworkError sprequestguid undefined", async () => {
        const error1: any = createOdspNetworkError("Error", 400);
        const errorBag = { ...error1.getTelemetryProperties() };
        assert.equal(undefined, errorBag.sprequestguid, "sprequestguid should not be defined");
    });

    it("errorObjectFromSocketError no retryAfter", async () => {
        const socketError: IOdspSocketError = {
            message: "testMessage",
            code: 400,
        };
        const networkError = errorObjectFromSocketError(socketError, "disconnect");
        if (networkError.errorType !== DriverErrorType.genericNetworkError) {
            assert.fail("networkError should be a genericNetworkError");
        } else {
            assert.equal(networkError.message, "socket.io: disconnect: testMessage");
            assert.equal(networkError.canRetry, false);
            assert.equal(networkError.statusCode, 400);
        }
    });

    it("errorObjectFromSocketError with retryFilter", async () => {
        const socketError: IOdspSocketError = {
            message: "testMessage",
            code: 400,
        };
        const networkError = errorObjectFromSocketError(socketError, "error");
        if (networkError.errorType !== DriverErrorType.genericNetworkError) {
            assert.fail("networkError should be a genericNetworkError");
        } else {
            assert.equal(networkError.message, "socket.io: error: testMessage");
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
        const networkError = errorObjectFromSocketError(socketError, "429");
        if (networkError.errorType !== DriverErrorType.throttlingError) {
            assert.fail("networkError should be a throttlingError");
        } else {
            assert.equal(networkError.message, "socket.io: 429: testMessage");
            assert.equal(networkError.retryAfterSeconds, 10);
        }
    });

    it("Access Denied retries", async () => {
        const res = await getWithRetryForTokenRefresh(async (options) => {
            if (options.refresh) {
                return 1;
            } else {
                throwOdspNetworkError("some error", 401);
            }
        });
        assert.equal(res, 1, "did not successfully retried with new token");
    });

    it("invalid file name - no retry", async () => {
        const res = getWithRetryForTokenRefresh(async (options) => {
            if (options.refresh) {
                return 1;
            } else {
                throwOdspNetworkError("some error", invalidFileNameStatusCode);
            }
        });
        await assert.rejects(res, "Invalid file name should not result in retry!");
    });

    it("fetch incorrect response retries", async () => {
        const res = await getWithRetryForTokenRefresh(async (options) => {
            if (options.refresh) {
                return 1;
            } else {
                throwOdspNetworkError("some error", fetchIncorrectResponse);
            }
        });
        assert.equal(res, 1, "did not successfully retried with new token");
    });

    it("Other errors - no retries", async () => {
        const res = getWithRetryForTokenRefresh(async (options) => {
            if (options.refresh) {
                return 1;
            } else {
                throwOdspNetworkError("some error", invalidFileNameStatusCode);
            }
        });
        await assert.rejects(res, "Other errors should not result in retries!");
    });

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const testResponseWithInsufficientClaims = {
        statusText: "testStatusText",
        type: "default",
        headers: { get(name: string): string | null {
            if (name === "sprequestguid") {
                return "xxx-xxx";
            }
            if (name === "www-authenticate") {
                return "Bearer realm=\"6c482541-f706-4168-9e58-8e35a9992f58\",client_id=\"00000003-0000-0ff1-ce00-000000000000\",trusted_issuers=\"00000001-0000-0000-c000-000000000000@*,D3776938-3DBA-481F-A652-4BEDFCAB7CD8@*,https://sts.windows.net/*/,00000003-0000-0ff1-ce00-000000000000@90140122-8516-11e1-8eff-49304924019b\",authorization_uri=\"https://login.windows.net/common/oauth2/authorize\",error=\"insufficient_claims\",claims=\"eyJhY2Nlc3NfdG9rZW4iOnsibmJmIjp7ImVzc2VudGlhbCI6dHJ1ZSwgInZhbHVlIjoiMTU5Nzk1OTA5MCJ9fX0=\"";
            }
            return null;
        } },
    } as Response;

    function throwAuthorizationErrorWithInsufficientClaims(errorMessage: string) {
        throwOdspNetworkError(
            errorMessage,
            401,
            testResponseWithInsufficientClaims,
        );
    }

    it("Authorization error with insufficient claims first-class properties", async () => {
        try {
            throwAuthorizationErrorWithInsufficientClaims("TestMessage");
        } catch (error) {
            assert.equal(error.errorType, DriverErrorType.authorizationError, "errorType should be authorizationError");
            assert.notEqual(error.message.indexOf("TestMessage"), -1,
                "message should contain original message");
            assert.equal(error.canRetry, false, "canRetry should be false");
            assert.equal(
                error.claims,
                "{\"access_token\":{\"nbf\":{\"essential\":true, \"value\":\"1597959090\"}}}",
                "claims should be extracted from response",
            );
        }
    });

    it("Authorization error with insufficient claims results in retry with claims passed in options", async () => {
        const res = await getWithRetryForTokenRefresh(async (options) => {
            if (
                options.refresh &&
                options.claims === "{\"access_token\":{\"nbf\":{\"essential\":true, \"value\":\"1597959090\"}}}"
            ) {
                return 1;
            } else {
                throwAuthorizationErrorWithInsufficientClaims("some error");
            }
        });
        assert.equal(res, 1, "did not successfully retried with claims");
    });

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const testResponseWithRealm = {
        statusText: "testStatusText",
        type: "default",
        headers: { get(name: string): string | null {
            if (name === "sprequestguid") {
                return "xxx-xxx";
            }
            if (name === "www-authenticate") {
                return "Bearer realm=\"6c482541-f706-4168-9e58-8e35a9992f58\",client_id=\"00000003-0000-0ff1-ce00-000000000000\",trusted_issuers=\"00000001-0000-0000-c000-000000000000@*,D3776938-3DBA-481F-A652-4BEDFCAB7CD8@*,https://sts.windows.net/*/,00000003-0000-0ff1-ce00-000000000000@90140122-8516-11e1-8eff-49304924019b\",authorization_uri=\"https://login.windows.net/common/oauth2/authorize\"";
            }
            return null;
        } },
    } as Response;

    function throwAuthorizationErrorWithRealm(errorMessage: string) {
        throwOdspNetworkError(
            errorMessage,
            401,
            testResponseWithRealm,
        );
    }

    it("Authorization error with realm first-class properties", async () => {
        try {
            throwAuthorizationErrorWithRealm("TestMessage");
        } catch (error) {
            assert.strictEqual(error.errorType, DriverErrorType.authorizationError, "errorType should be authorizationError");
            assert.notStrictEqual(error.message.indexOf("TestMessage"), -1, "message should contain original message");
            assert.strictEqual(error.canRetry, false, "canRetry should be false");
            assert.strictEqual(error.tenantId, "6c482541-f706-4168-9e58-8e35a9992f58", "realm should be extracted from response");
        }
    });

    it("Authorization error with realm results in retry and realm passed as tenant id", async () => {
        const res = await getWithRetryForTokenRefresh(async (options) => {
            if (
                options.refresh &&
                options.tenantId === "6c482541-f706-4168-9e58-8e35a9992f58"
            ) {
                return 1;
            } else {
                throwAuthorizationErrorWithRealm("some error");
            }
        });
        assert.strictEqual(res, 1, "did not successfully retried with realm passed as tenantId");
    });

    it("Check Epoch Mismatch error props", async () => {
        const error: any = createOdspNetworkErrorWithResponse("Epoch Mismatch", 409);
        assert.strictEqual(error.errorType, OdspErrorType.epochVersionMismatch, "Error type should be epoch mismatch");
        const errorBag = { ...error.getTelemetryProperties() };
        assert.strictEqual(errorBag.errorType, OdspErrorType.epochVersionMismatch, "Error type should exist in prop bag");
    });
});
