/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { strict as assert } from "assert";
import {
    IRequest,
    IResponse,
    IFluidRouter,
} from "@fluidframework/core-interfaces";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidDataStoreChannel } from "@fluidframework/runtime-definitions";
import { RequestParser, create404Response } from "@fluidframework/runtime-utils";
import {
    innerRequestHandler,
    createFluidObjectResponse,
    rootDataStoreRequestHandler,
} from "../requestHandlers";

class MockRuntime {
    public get IFluidHandleContext() { return this; }

    public async getRootDataStore(id, wait): Promise<IFluidRouter> {
        if (id === "objectId") {
            const router: any = {
                request: async (request: IRequest) => {
                    if (request.url === "" || request.url === "/route") {
                        return createFluidObjectResponse({ route: request.url });
                    }
                    return create404Response(request);
                },
            };
            router.IFluidRouter = router;
            return router as IFluidDataStoreChannel;
        }

        assert(wait !== true);
        throw new Error("No object");
    }

    public async resolveHandle(request: IRequest) {
        const requestParser = RequestParser.create(request);

        if (requestParser.pathParts.length > 0) {
            const wait =
                typeof request.headers?.wait === "boolean" ? request.headers.wait : undefined;

            const fluidObject = await this.getRootDataStore(requestParser.pathParts[0], wait);
            const subRequest = requestParser.createSubRequest(1);
            return fluidObject.request(subRequest);
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

describe("RequestParser", () => {
    describe("innerRequestHandler", () => {
        const runtime = new MockRuntime() as any as IContainerRuntime;

        it("Empty request", async () => {
            const requestParser = RequestParser.create({ url: "/" });
            const response = await innerRequestHandler(
                requestParser,
                runtime);
            assert.equal(response.status, 404);
        });

        it("Data store request without wait", async () => {
            const requestParser = RequestParser.create({ url: "/nonExistingUri" });
            const responseP = innerRequestHandler(
                requestParser,
                runtime);
            await assertRejected(responseP);
        });

        it("Data store request with wait", async () => {
            const requestParser = RequestParser.create({ url: "/nonExistingUri", headers: { wait: true } });
            const responseP = innerRequestHandler(
                requestParser,
                runtime);
            await assertRejected(responseP);
        });

        it("Data store request with sub route", async () => {
            const requestParser = RequestParser.create({ url: "/objectId/route", headers: { wait: true } });
            const response = await innerRequestHandler(requestParser, runtime);
            assert.equal(response.status, 200);
            assert.equal(response.value.route, "/route");
        });

        it("Data store request with non-existing sub route", async () => {
            const requestParser = RequestParser.create({ url: "/objectId/doesNotExist", headers: { wait: true } });
            const responseP = innerRequestHandler(requestParser, runtime);
            await assertRejected(responseP);
        });
    });

    describe("rootDataStoreRequestHandler", () => {
        const runtime = new MockRuntime() as any as IContainerRuntime;

        it("Empty request", async () => {
            const requestParser = RequestParser.create({ url: "/" });
            const response = await rootDataStoreRequestHandler(
                requestParser,
                runtime);
            assert.equal(response.status, 404);
        });

        it("Data store request without wait", async () => {
            const requestParser = RequestParser.create({ url: "/nonExistingUri" });
            const responseP = rootDataStoreRequestHandler(
                requestParser,
                runtime);
            await assertRejected(responseP);
        });

        it("Data store request with wait", async () => {
            const requestParser = RequestParser.create({ url: "/nonExistingUri", headers: { wait: true } });
            const responseP = rootDataStoreRequestHandler(
                requestParser,
                runtime);
            await assertRejected(responseP);
        });

        it("Data store request with sub route", async () => {
            const requestParser = RequestParser.create({ url: "/objectId/route", headers: { wait: true } });
            const response = await rootDataStoreRequestHandler(requestParser, runtime);
            assert.equal(response.status, 200);
            assert.equal(response.value.route, "/route");
        });

        it("Data store request with non-existing sub route", async () => {
            const requestParser = RequestParser.create({ url: "/objectId/doesNotExist", headers: { wait: true } });
            const responseP = rootDataStoreRequestHandler(requestParser, runtime);
            await assertRejected(responseP);
        });
    });
});
