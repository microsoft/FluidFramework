/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import Axios, { AxiosRequestConfig } from "axios";
import AxiosMockAdapter from "axios-mock-adapter";
import { R11sErrorType } from "../r11sError";
import { authorizedRequestWithRetry } from "../requestUtils";

describe("RequestUtils", () => {
    describe("authorizedRequestWithRetry()", () => {
        const axiosMockAdapter = new AxiosMockAdapter(Axios);
        let validToken;
        const token1 = "1234-auth-token-abcd";
        const token2 = "9876-auth-token-zyxw";
        const token3 = "abc-auth-token-123";
        let tokens: string[] = [];
        const isValidHeader = (header: string) => header.replace(/^Basic /, "") === validToken;
        const replyWithAuth = (requestConfig: AxiosRequestConfig) => {
            if (isValidHeader(requestConfig.headers?.Authorization)) {
                return [200, "OK"];
            }
            return [401, "Not Allowed"];
        };
        const getAuthHeader = async () => `Basic ${tokens.shift() || ""}`;

        beforeEach(() => {
            validToken = undefined;
            tokens = [token1, token2, token3];
            axiosMockAdapter.reset();
        });

        it("sends a request with auth headers", async () => {
            const url = "/api/protected";
            validToken = token1;
            axiosMockAdapter.onGet(url).reply(replyWithAuth);
            await assert.doesNotReject(authorizedRequestWithRetry(
                {
                    method: "get",
                    url,
                },
                getAuthHeader,
            ));
        });
        it("retries a request with fresh auth headers on 401", async () => {
            const url = "/api/protected";
            validToken = token2;
            axiosMockAdapter.onGet(url).reply(replyWithAuth);
            await assert.doesNotReject(authorizedRequestWithRetry(
                {
                    method: "get",
                    url,
                },
                getAuthHeader,
            ));
        });
        it("throws a non-retriable error on 2nd 401", async () => {
            const url = "/api/protected";
            validToken = token3;
            axiosMockAdapter.onGet(url).reply(replyWithAuth);
            await assert.rejects(authorizedRequestWithRetry(
                {
                    method: "get",
                    url,
                },
                getAuthHeader,
            ), {
                canRetry: false,
                errorType: R11sErrorType.authorizationError,
            });
        });
        it("throws a retriable error on 500", async () => {
            const url = "/api/protected";
            validToken = token1;
            axiosMockAdapter.onGet(url).reply(500);
            await assert.rejects(authorizedRequestWithRetry(
                {
                    method: "get",
                    url,
                },
                getAuthHeader,
            ), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("throws a retriable error with retryAfter on 429", async () => {
            const url = "/api/protected";
            const retryAfterSec = 5;
            validToken = token1;
            axiosMockAdapter.onGet(url).reply(429, {
                retryAfter: retryAfterSec,
            });
            await assert.rejects(authorizedRequestWithRetry(
                {
                    method: "get",
                    url,
                },
                getAuthHeader,
            ), {
                canRetry: true,
                errorType: DriverErrorType.throttlingError,
                retryAfterSeconds: retryAfterSec,
            });
        });
        it("throws a non-retriable error on 404", async () => {
            const url = "/api/protected";
            validToken = token1;
            axiosMockAdapter.onGet(url).reply(404);
            await assert.rejects(authorizedRequestWithRetry(
                {
                    method: "get",
                    url,
                },
                getAuthHeader,
            ), {
                canRetry: false,
                errorType: R11sErrorType.fileNotFoundOrAccessDeniedError,
            });
        });
    });
});
