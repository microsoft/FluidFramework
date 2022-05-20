/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/ban-types */
import assert from "assert";
import { stub } from "sinon";
import * as fetchModule from "node-fetch";

export const createResponse = async (headers: { [key: string]: string; }, response: any | undefined, status: number) =>
    Promise.resolve({
        ok: response !== undefined,
        status,
        text: async () => Promise.resolve(JSON.stringify(response)),
        arrayBuffer: async () => Promise.resolve({ byteLength: 10 }),
        headers: headers ? new fetchModule.Headers(headers) : new fetchModule.Headers(),
        json: async () => Promise.resolve(response),
    });

export const okResponse = async (headers: { [key: string]: string; }, response: any) =>
    createResponse(headers, response, 200);
export const notFound = async (headers: { [key: string]: string; } = {}) => createResponse(headers, undefined, 404);

export type FetchCallType = "internal" | "external" | "single";

export async function mockFetchMultiple<T>(
    callback: () => Promise<T>,
    responses: (() => Promise<object>)[],
    type: FetchCallType = "single",
): Promise<T> {
    const fetchStub = stub(fetchModule, "default");
    fetchStub.callsFake(async () => {
        if (type === "external") {
            fetchStub.restore();
        }
        const cb = responses.shift();
        assert(cb !== undefined, "the end");
        return cb() as Promise<fetchModule.Response>;
    });
    try {
        return await callback();
    } finally {
        if (type !== "internal") {
            fetchStub.restore();
        }
        assert(responses.length === 0, "all responses used");
    }
}

export async function mockFetchSingle<T>(
    callback: () => Promise<T>,
    responseType: () => Promise<object>,
    type: FetchCallType = "single",
): Promise<T> {
    return mockFetchMultiple(callback, [responseType], type);
}

export async function mockFetchOk<T>(
    callback: () => Promise<T>,
    response: object = {},
    headers: { [key: string]: string; } = {},
): Promise<T> {
    return mockFetchSingle(
        callback,
        async () => okResponse(headers, response));
}
