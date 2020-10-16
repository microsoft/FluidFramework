/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import Axios from "axios";
import { authRequestWithRetry, } from "./odspAuth";
export async function getAsync(url, authRequestInfo) {
    return authRequest(authRequestInfo, async (config) => Axios.get(url, config));
}
export async function putAsync(url, authRequestInfo) {
    return authRequest(authRequestInfo, async (config) => Axios.put(url, undefined, config));
}
export async function postAsync(url, body, authRequestInfo) {
    return authRequest(authRequestInfo, async (config) => Axios.post(url, body, config));
}
export async function unauthPostAsync(url, body) {
    return safeRequestCore(async () => Axios.post(url, body));
}
async function authRequest(authRequestInfo, requestCallback) {
    return authRequestWithRetry(authRequestInfo, async (config) => safeRequestCore(async () => requestCallback(config)));
}
async function safeRequestCore(requestCallback) {
    var _a, _b;
    let response;
    try {
        response = await requestCallback();
    }
    catch (error) {
        if ((_b = (_a = error) === null || _a === void 0 ? void 0 : _a.response) === null || _b === void 0 ? void 0 : _b.status) {
            response = error.response;
        }
        else {
            throw error;
        }
    }
    return { href: response.config.url, status: response.status, data: response.data };
}
export function createErrorFromResponse(message, requestResult) {
    const error = Error(message);
    error.requestResult = requestResult;
    return error;
}
//# sourceMappingURL=odspRequest.js.map