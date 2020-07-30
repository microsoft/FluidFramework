/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/consistent-type-assertions */
import assert from "assert";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidDataStoreChannel } from "@fluidframework/runtime-definitions";
import { RequestParser } from "@fluidframework/runtime-utils";
import { componentRuntimeRequestHandler, createComponentResponse } from "../requestHandlers";

describe("RequestParser", () => {
    describe("componentRuntimeRequestHandler", () => {
        it("Empty request", async () => {
            const requestParser = new RequestParser({ url: "/" });
            const runtime: IContainerRuntime = {} as IContainerRuntime;
            const response = await componentRuntimeRequestHandler(requestParser, runtime);
            assert.equal(response, undefined);
        });

        it("Component request without wait", async () => {
            const requestParser = new RequestParser({ url: "/componentId" });
            const runtime: IContainerRuntime = {
                getDataStore: async (id, wait): Promise<IFluidDataStoreChannel> => {
                    assert.equal(id, "componentId");
                    assert.equal(wait, undefined);
                    return Promise.resolve<IFluidDataStoreChannel>({
                        request: async (r) => {
                            assert.equal(r.url, "");
                            return Promise.resolve(createComponentResponse({}));
                        },
                    } as IFluidDataStoreChannel);
                },
            } as IContainerRuntime;
            const response = await componentRuntimeRequestHandler(requestParser, runtime);
            assert.notEqual(response, undefined);
        });

        it("Component request with wait", async () => {
            const requestParser = new RequestParser({ url: "/componentId", headers: { wait: true } });
            const runtime: IContainerRuntime = {
                getDataStore: async (id, wait): Promise<IFluidDataStoreChannel> => {
                    assert.equal(id, "componentId");
                    assert.equal(wait, true);
                    return Promise.resolve<IFluidDataStoreChannel>({
                        request: async (r) => {
                            assert.equal(r.url, "");
                            return Promise.resolve(createComponentResponse({}));
                        },
                    } as IFluidDataStoreChannel);
                },
            } as IContainerRuntime;
            const response = await componentRuntimeRequestHandler(requestParser, runtime);
            assert.notEqual(response, undefined);
        });

        it("Component request with sub route", async () => {
            const requestParser = new RequestParser({ url: "/componentId/route", headers: { wait: true } });
            const runtime: IContainerRuntime = {
                getDataStore: async (id, wait): Promise<IFluidDataStoreChannel> => {
                    assert.equal(id, "componentId");
                    assert.equal(wait, true);
                    return Promise.resolve<IFluidDataStoreChannel>({
                        request: async (r) => {
                            assert.equal(r.url, "route");
                            return Promise.resolve(createComponentResponse({}));
                        },
                    } as IFluidDataStoreChannel);
                },
            } as IContainerRuntime;
            const response = await componentRuntimeRequestHandler(requestParser, runtime);
            assert.notEqual(response, undefined);
        });
    });
});
