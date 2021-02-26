/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

/* eslint-disable @typescript-eslint/ban-types */
import sinon from "sinon";
import * as fetchModule from "node-fetch";

export const createResponse = async (headers: { [key: string]: string }, response: any | undefined, status: number) =>
    Promise.resolve({
        ok: response !== undefined,
        status,
        text: async () => Promise.resolve(JSON.stringify(response)),
        arrayBuffer: async () => Promise.resolve({ byteLength: 10 }),
        headers: headers ? new fetchModule.Headers(headers) : new fetchModule.Headers(),
    });

export const okResponse = async (headers: { [key: string]: string }, response: any) =>
    createResponse(headers, response, 200);
export const notFound = async (headers: { [key: string]: string } = {}) => createResponse(headers, undefined, 404);

export async function mockFetchMultiple<T>(
    responses: object[],
    callback: () => Promise<T>,
): Promise<T> {
    const fetchStub = sinon.stub(fetchModule, "default");
    fetchStub.callsFake(async () => {
        return responses.shift();
    });
    try {
        return await callback();
    } finally {
        fetchStub.restore();
    }
}

export type FetchCallType = "internal" | "external" | "single";

export async function mockFetchCore<T>(
    callback: () => Promise<T>,
    responseType: () => Promise<object>,
    type: FetchCallType = "single",
): Promise<T> {
    const fetchStub = sinon.stub(fetchModule, "default");
    fetchStub.callsFake(async () => {
        if (type === "external") {
            fetchStub.restore();
        }
        return responseType();
    });
    try {
        return await callback();
    } finally {
        if (type !== "internal") {
            fetchStub.restore();
        }
    }
}

export async function mockFetch<T>(
    response: object,
    callback: () => Promise<T>,
    headers: { [key: string]: string} = {},
): Promise<T> {
    return mockFetchCore(
        callback,
        async () => okResponse(headers, response));
}
