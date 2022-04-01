/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { strict as assert } from "assert";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import {
    createOdspNetworkError,
    throwOdspNetworkError,
} from "@fluidframework/odsp-doclib-utils";
import { NonRetryableError } from "@fluidframework/driver-utils";
import { OdspError, OdspErrorType } from "@fluidframework/odsp-driver-definitions";
import { IOdspSocketError } from "../contracts";
import { getWithRetryForTokenRefresh } from "../odspUtils";
import { errorObjectFromSocketError } from "../odspError";
import { pkgVersion } from "../packageVersion";

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
        response?: Response,
        responseText?: string,
    ) {
        try {
            throwOdspNetworkError(
                errorMessage,
                statusCode,
                response ?? testResponse,
                responseText,
            );
            assert.fail("Not reached - throwOdspNetworkError should have thrown");
        } catch (error) {
            return error as OdspError;
        }
    }

    it("throwOdspNetworkError first-class properties", async () => {
        const networkError = createOdspNetworkErrorWithResponse(
            "some message",
            400,
        );
        if (networkError.errorType !== DriverErrorType.genericNetworkError) {
            assert.fail("networkError should be a genericNetworkError");
        } else {
            assert(networkError.message.includes("some message"), "message should contain original message");
            assert((networkError as any).responseType === "default", "message should contain Response.type");
            assert.equal(false, networkError.canRetry, "canRetry should be false");
        }
    });

    it("throwOdspNetworkError sprequestguid exists", async () => {
        const error1: any = createOdspNetworkErrorWithResponse("some message", 400);
        const errorBag = { ...error1.getTelemetryProperties() };
        assert.equal("xxx-xxx", errorBag.sprequestguid, "sprequestguid should be 'xxx-xxx'");
    });

    it("throwOdspNetworkError sprequestguid undefined", async () => {
        const error1: any = createOdspNetworkError("some message", 400);
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
            assert(networkError.message.includes("disconnect"), "error message should include handler name");
            assert(networkError.message.includes("testMessage"), "error message should include socket error message");
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
            assert(networkError.message.includes("error"), "error message should include handler name");
            assert(networkError.message.includes("testMessage"), "error message should include socket error message");
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
        const networkError = errorObjectFromSocketError(socketError, "handler");
        if (networkError.errorType !== DriverErrorType.throttlingError) {
            assert.fail("networkError should be a throttlingError");
        } else {
            assert(networkError.message.includes("handler"), "error message should include handler name");
            assert(networkError.message.includes("testMessage"), "error message should include socket error message");
            assert.equal(networkError.retryAfterSeconds, 10);
        }
    });

    it("Access Denied retries", async () => {
        const res = await getWithRetryForTokenRefresh(async (options) => {
            if (options.refresh) {
                return 1;
            } else {
                throwOdspNetworkError("some error", 401, testResponse);
            }
        });
        assert.equal(res, 1, "did not successfully retried with new token");
    });

    it("fetch incorrect response retries", async () => {
        const res = await getWithRetryForTokenRefresh(async (options) => {
            if (options.refresh) {
                return 1;
            } else {
                throw new NonRetryableError(
                    "some message",
                    DriverErrorType.incorrectServerResponse,
                    { driverVersion: pkgVersion });
            }
        });
        assert.equal(res, 1, "did not successfully retried with new token");
    });

    it("404 errors - no retries", async () => {
        const res = getWithRetryForTokenRefresh(async (options) => {
            if (options.refresh) {
                return 1;
            } else {
                throwOdspNetworkError("some error", 404, testResponse);
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
            assert(error.message.includes("TestMessage"), "message should contain original message");
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
            assert(error.message.includes("TestMessage"), "message should contain original message");
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
        const error: any = createOdspNetworkErrorWithResponse("epochMismatch", 409);
        assert.strictEqual(error.errorType, DriverErrorType.fileOverwrittenInStorage, "Error type should be fileOverwrittenInStorage");
        const errorBag = { ...error.getTelemetryProperties() };
        assert.strictEqual(errorBag.errorType, DriverErrorType.fileOverwrittenInStorage, "Error type should exist in prop bag");
    });

    it("Check odsp domain move error", async () => {
        const redirectLocation = "www.fake.com";
        const responseText = {
            error: {
                "@error.redirectLocation": redirectLocation,
                "code": "itemNotFound",
                "message": "The site has been moved to a new location.",
                "innerError": {},
            },
        };
        const error: any = createOdspNetworkErrorWithResponse(
            "The site has been moved to a new location.", 404, undefined, JSON.stringify(responseText));
        assert.strictEqual(error.errorType, OdspErrorType.locationRedirection, "Error type should be locationRedirection");
        assert.strictEqual(error.redirectLocation, redirectLocation, "Site location should match");
        assert.strictEqual(error.statusCode, 404, "Status code should match");
    });
});
