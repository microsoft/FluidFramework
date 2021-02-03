/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

/* eslint-disable @typescript-eslint/ban-types */

import sinon from "sinon";
import * as fetchModule from "node-fetch";

export const createResponse = async (response: object, ok: boolean, status: number) =>
    Promise.resolve({
        ok,
        status,
        text: async () => Promise.resolve(JSON.stringify(response)),
        headers: (response as any).headers
            ? new fetchModule.Headers({ ...(response as any).headers }) : new fetchModule.Headers(),
});

export const okResponse = async (response: object) => createResponse(response, true, 200);
export const notFound = async (response: object) => createResponse(response, false, 404);

export async function mockFetch<T>(response: object, callback: () => Promise<T>): Promise<T> {
    const fetchStub = sinon.stub(fetchModule, "default");
    fetchStub.returns(okResponse(response));
    try {
        return await callback();
    } finally {
        fetchStub.restore();
    }
}

export async function mockFetchCustom<T>(
    response: object,
    ok: boolean,
    status: number,
    callback: () => Promise<T>,
): Promise<T> {
    const fetchStub = sinon.stub(fetchModule, "default");
    fetchStub.returns(createResponse(response, ok, status));
    try {
        return await callback();
    } finally {
        fetchStub.restore();
    }
}
