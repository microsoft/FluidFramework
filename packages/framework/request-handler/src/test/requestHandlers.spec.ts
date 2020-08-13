/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/consistent-type-assertions */
import assert from "assert";
import {
    IRequest,
    IResponse,
    IFluidObject,
    IFluidRouter,
} from "@fluidframework/core-interfaces";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidDataStoreChannel } from "@fluidframework/runtime-definitions";
import { RequestParser } from "@fluidframework/runtime-utils";
import {
    deprecated_innerRequestHandler,
    createComponentResponse,
} from "../requestHandlers";

class MockRuntime {
    public get IFluidHandleContext() { return this; }

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

describe("RequestParser", () => {
    describe("deprecated_innerRequestHandler", () => {
        const runtime = new MockRuntime() as any as IContainerRuntime;

        it("Empty request", async () => {
            const requestParser = new RequestParser({ url: "/" });
            const response = await deprecated_innerRequestHandler(
                requestParser,
                runtime);
            assert.equal(response.status, 404);
        });

        it("Component request without wait", async () => {
            const requestParser = new RequestParser({ url: "/nonExistingUri" });
            const responseP = deprecated_innerRequestHandler(
                requestParser,
                runtime);
            await assertRejected(responseP);
        });

        it("Component request with wait", async () => {
            const requestParser = new RequestParser({ url: "/nonExistingUri", headers: { wait: true } });
            const responseP = deprecated_innerRequestHandler(
                requestParser,
                runtime);
            await assertRejected(responseP);
        });

        it("Component request with sub route", async () => {
            const requestParser = new RequestParser({ url: "/componentId/route", headers: { wait: true } });
            const response = await deprecated_innerRequestHandler(requestParser, runtime);
            assert.equal(response.status, 200);
            assert.equal(response.value.route, "route");
        });

        it("Component request with non-existing sub route", async () => {
            const requestParser = new RequestParser({ url: "/componentId/doesNotExist", headers: { wait: true } });
            const responseP = deprecated_innerRequestHandler(requestParser, runtime);
            await assertRejected(responseP);
        });
    });
});
