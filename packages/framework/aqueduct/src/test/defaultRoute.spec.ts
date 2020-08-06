/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/consistent-type-assertions */

import assert from "assert";
import { RequestParser } from "@fluidframework/runtime-utils";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidDataStoreChannel } from "@fluidframework/runtime-definitions";
import { IRequest, IResponse, IFluidObject, IFluidRouter } from "@fluidframework/core-interfaces";
import { createComponentResponse } from "@fluidframework/request-handler";
import { defaultRouteRequestHandler } from "../requestHandlers";

class MockRuntime {
    public async getRootDataStore(id, wait): Promise<IFluidRouter> {
        if (id === "componentId") {
            return {
                request: async (r) => {
                    if (r.url === "" || r.url === "route") {
                        return createComponentResponse({ route: r.url } as IFluidObject);
                    }
                    return { status: 404, mimeType: "text/plain", value: "not found" };
                },
            } as IFluidDataStoreChannel;
        }

        assert(wait !== true);
        throw new Error("No component");
    }

    public async resolveHandle(request: IRequest) {
        const requestParser = new RequestParser(request);

        if (requestParser.pathParts.length > 0) {
            const wait =
                typeof request.headers?.wait === "boolean" ? request.headers.wait : undefined;

            const component = await this.getRootDataStore(requestParser.pathParts[0], wait);
            const subRequest = requestParser.createSubRequest(1);
            if (subRequest !== undefined) {
                return component.request(subRequest);
            } else {
                return {
                    status: 200,
                    mimeType: "fluid/object",
                    value: component,
                };
            }
        }
        return { status: 404, mimeType: "text/plain", value: "not found" };
    }
}

async function assertRejected(p: Promise<IResponse | undefined>) {
    try {
        const res = await p;
        assert(res === undefined || res.status === 404, "not rejected");
    } catch (err) {}
}

describe("defaultRouteRequestHandler", () => {
    const runtime = new MockRuntime() as IContainerRuntime;

    it("Component request with default ID", async () => {
        const handler = defaultRouteRequestHandler("componentId");

        const requestParser = new RequestParser({ url: "", headers: { } });
        const response = await handler(requestParser, runtime);
        assert(response);
        assert.equal(response.status, 200);
        assert.equal(response.value.route, "");

        const requestParser2 = new RequestParser({ url: "/", headers: { } });
        const response2 = await handler(requestParser2, runtime);
        assert(response2);
        assert.equal(response2.status, 200);
        assert.equal(response.value.route, "");
    });

    it("Component request with non-existing default ID", async () => {
        const handler = defaultRouteRequestHandler("foobar");

        const requestParser = new RequestParser({ url: "", headers: { wait: true } });
        const responseP = handler(requestParser, runtime);
        await assertRejected(responseP);

        const requestParser2 = new RequestParser({ url: "/", headers: { wait: true } });
        const responseP2 = handler(requestParser2, runtime);
        await assertRejected(responseP2);
    });
});
