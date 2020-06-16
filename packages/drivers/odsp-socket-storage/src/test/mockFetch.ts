/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import sinon from "sinon";
import * as fetchModule from "node-fetch";

export async function mockFetch<T>(response: object, callback: () => Promise<T>): Promise<T> {
    const fetchStub = sinon.stub(fetchModule, "default");
    fetchStub.returns(
        Promise.resolve({
            ok: true,
            status: 200,
            text: async () => Promise.resolve(JSON.stringify(response)),
            headers: new fetchModule.Headers(),
        }));

    try {
        return await callback();
    } finally {
        fetchStub.restore();
    }
}
