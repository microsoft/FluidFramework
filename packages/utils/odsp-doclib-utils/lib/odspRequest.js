/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import fetch from "node-fetch";
import { authRequestWithRetry, } from "./odspAuth";
export async function getAsync(url, authRequestInfo) {
    return authRequest(authRequestInfo, async (config) => fetch(url, config));
}
export async function putAsync(url, authRequestInfo) {
    return authRequest(authRequestInfo, async (config) => {
        const putConfig = Object.assign(Object.assign({}, config), { method: "PUT" });
        return fetch(url, putConfig);
    });
}
export async function postAsync(url, body, authRequestInfo) {
    return authRequest(authRequestInfo, async (config) => {
        const postConfig = Object.assign(Object.assign({}, config), { body, method: "POST" });
        return fetch(url, postConfig);
    });
}
export async function unauthPostAsync(url, body) {
    return safeRequestCore(async () => {
        return fetch(url, { body, method: "POST" });
    });
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
    return response;
}
//# sourceMappingURL=odspRequest.js.map