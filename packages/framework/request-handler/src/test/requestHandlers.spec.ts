/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { strict as assert } from "assert";
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
    innerRequestHandler,
    createFluidObjectResponse,
} from "../requestHandlers";

class MockRuntime {
    public get IFluidHandleContext() { return this; }

    public async getRootDataStore(id, wait): Promise<IFluidRouter> {
        if (id === "objectId") {
            return {
                request: async (r) => {
                    if (r.url === "" || r.url === "route") {
                        return createFluidObjectResponse({ route: r.url } as IFluidObject);
                    }
                    return { status: 404, mimeType: "text/plain", value: "not found" };
                },
            } as IFluidDataStoreChannel;
        }

        assert(wait !== true);
        throw new Error("No object");
    }

    public async resolveHandle(request: IRequest) {
        const requestParser = new RequestParser(request);

        if (requestParser.pathParts.length > 0) {
            const wait =
                typeof request.headers?.wait === "boolean" ? request.headers.wait : undefined;

            const fluidObject = await this.getRootDataStore(requestParser.pathParts[0], wait);
            const subRequest = requestParser.createSubRequest(1);
            if (subRequest !== undefined) {
                return fluidObject.request(subRequest);
            } else {
                return {
                    status: 200,
                    mimeType: "fluid/object",
                    value: fluidObject,
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
    } catch (err) { }
}

describe("RequestParser", () => {
    describe("innerRequestHandler", () => {
        const runtime = new MockRuntime() as any as IContainerRuntime;

        it("Empty request", async () => {
            const requestParser = new RequestParser({ url: "/" });
            const response = await innerRequestHandler(
                requestParser,
                runtime);
            assert.equal(response.status, 404);
        });

        it("Data store request without wait", async () => {
            const requestParser = new RequestParser({ url: "/nonExistingUri" });
            const responseP = innerRequestHandler(
                requestParser,
                runtime);
            await assertRejected(responseP);
        });

        it("Data store  request with wait", async () => {
            const requestParser = new RequestParser({ url: "/nonExistingUri", headers: { wait: true } });
            const responseP = innerRequestHandler(
                requestParser,
                runtime);
            await assertRejected(responseP);
        });

        it("Data store  request with sub route", async () => {
            const requestParser = new RequestParser({ url: "/objectId/route", headers: { wait: true } });
            const response = await innerRequestHandler(requestParser, runtime);
            assert.equal(response.status, 200);
            assert.equal(response.value.route, "route");
        });

        it("Data store  request with non-existing sub route", async () => {
            const requestParser = new RequestParser({ url: "/objectId/doesNotExist", headers: { wait: true } });
            const responseP = innerRequestHandler(requestParser, runtime);
            await assertRejected(responseP);
        });
    });
});
