/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/consistent-type-assertions */
import * as assert from "assert";
import { IComponentRuntime, IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import { componentRuntimeRequestHandler, createComponentResponse } from "../requestHandlers";
import { RequestParser } from "../requestParser";

describe("RequestParser", () => {
    describe("componentRuntimeRequestHandler", () => {
        it("Empty request", async () => {
            const requestParser = new RequestParser({ url: "/" });
            const runtime: IHostRuntime = { } as IHostRuntime;
            const response = await componentRuntimeRequestHandler(requestParser, runtime);
            assert.equal(response, undefined);
        });

        it("Component request without wait", async () => {
            const requestParser = new RequestParser({ url: "/componentId" });
            const runtime: IHostRuntime = {
                getComponentRuntime: async (id, wait): Promise<IComponentRuntime> => {
                    assert.equal(id, "componentId");
                    assert.equal(wait, undefined);
                    return Promise.resolve<IComponentRuntime>({
                        request: async (r) => {
                            assert.equal(r.url, "");
                            return Promise.resolve(createComponentResponse({}));
                        },
                    } as IComponentRuntime);
                },
            } as IHostRuntime;
            const response = await componentRuntimeRequestHandler(requestParser, runtime);
            assert.notEqual(response, undefined);
        });

        it("Component request with wait", async () => {
            const requestParser = new RequestParser({ url: "/componentId", headers: { wait: true } });
            const runtime: IHostRuntime = {
                getComponentRuntime: async (id, wait): Promise<IComponentRuntime> => {
                    assert.equal(id, "componentId");
                    assert.equal(wait, true);
                    return Promise.resolve<IComponentRuntime>({
                        request: async (r) => {
                            assert.equal(r.url, "");
                            return Promise.resolve(createComponentResponse({}));
                        },
                    } as IComponentRuntime);
                },
            } as IHostRuntime;
            const response = await componentRuntimeRequestHandler(requestParser, runtime);
            assert.notEqual(response, undefined);
        });

        it("Component request with sub route", async () => {
            const requestParser = new RequestParser({ url: "/componentId/route", headers: { wait: true } });
            const runtime: IHostRuntime = {
                getComponentRuntime: async (id, wait): Promise<IComponentRuntime> => {
                    assert.equal(id, "componentId");
                    assert.equal(wait, true);
                    return Promise.resolve<IComponentRuntime>({
                        request: async (r) => {
                            assert.equal(r.url, "route");
                            return Promise.resolve(createComponentResponse({}));
                        },
                    } as IComponentRuntime);
                },
            } as IHostRuntime;
            const response = await componentRuntimeRequestHandler(requestParser, runtime);
            assert.notEqual(response, undefined);
        });
    });
});
