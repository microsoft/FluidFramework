/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/consistent-type-assertions */

import { strict as assert } from "assert";
import { RequestParser, create404Response } from "@fluidframework/runtime-utils";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidDataStoreChannel } from "@fluidframework/runtime-definitions";
import {
    IRequest,
    IResponse,
    IFluidRouter,
} from "@fluidframework/core-interfaces";
import { createFluidObjectResponse } from "@fluidframework/request-handler";
import { defaultRouteRequestHandler } from "../request-handlers";

class MockRuntime {
    public get IFluidHandleContext() { return this; }

    public async getRootDataStore(id, wait): Promise<IFluidRouter> {
        if (id === "objectId") {
            return {
                request: async (r) => {
                    if (r.url === "/" || r.url === "/route") {
                        return createFluidObjectResponse({ route: r.url });
                    }
                    return create404Response(r);
                },
            } as IFluidDataStoreChannel;
        }

        assert(wait !== true);
        throw new Error("No data store");
    }

    protected async resolveHandle(request: IRequest) {
        const requestParser = RequestParser.create(request);

        if (requestParser.pathParts.length > 0) {
            const wait =
                typeof request.headers?.wait === "boolean" ? request.headers.wait : undefined;

            const dataStore = await this.getRootDataStore(requestParser.pathParts[0], wait);
            const subRequest = requestParser.createSubRequest(1);
            return dataStore.request(subRequest);
        }
        return create404Response(request);
    }
}

async function assertRejected(p: Promise<IResponse | undefined>) {
    try {
        const res = await p;
        assert(res === undefined || res.status === 404, "not rejected");
    } catch (err) { }
}

describe("defaultRouteRequestHandler", () => {
    const runtime = new MockRuntime() as any as IContainerRuntime;

    it("Data store request with default ID", async () => {
        const handler = defaultRouteRequestHandler("objectId");

        const requestParser = RequestParser.create({ url: "", headers: {} });
        const response = await handler(requestParser, runtime);
        assert(response);
        assert.equal(response.status, 200);
        assert.equal(response.value.route, "/");

        const requestParser2 = RequestParser.create({ url: "/", headers: {} });
        const response2 = await handler(requestParser2, runtime);
        assert(response2);
        assert.equal(response2.status, 200);
        assert.equal(response.value.route, "/");
    });

    it("Data store request with non-existing default ID", async () => {
        const handler = defaultRouteRequestHandler("foobar");

        const requestParser = RequestParser.create({ url: "", headers: { wait: true } });
        const responseP = handler(requestParser, runtime);
        await assertRejected(responseP);

        const requestParser2 = RequestParser.create({ url: "/", headers: { wait: true } });
        const responseP2 = handler(requestParser2, runtime);
        await assertRejected(responseP2);
    });
});
