/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/consistent-type-assertions */
import assert from "assert";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { RequestParser } from "@fluidframework/runtime-utils";
import { IResponse } from "@fluidframework/component-core-interfaces";
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
            const runtime = {
                getComponentById: async (id, request, wait): Promise<IResponse> => {
                    assert.equal(id, "componentId");
                    assert.equal(wait, undefined);
                    return Promise.resolve(createComponentResponse({}));
                },
            };
            const response = await componentRuntimeRequestHandler(requestParser, runtime as any as IContainerRuntime);
            assert.notEqual(response, undefined);
        });

        it("Component request with wait", async () => {
            const requestParser = new RequestParser({ url: "/componentId", headers: { wait: true } });
            const runtime = {
                getComponentById: async (id, request, wait): Promise<IResponse> => {
                    assert.equal(id, "componentId");
                    assert.equal(wait, true);
                    return Promise.resolve(createComponentResponse({}));
                },
            };
            const response = await componentRuntimeRequestHandler(requestParser, runtime as any as IContainerRuntime);
            assert.notEqual(response, undefined);
        });

        it("Component request with sub route", async () => {
            const requestParser = new RequestParser({ url: "/componentId/route", headers: { wait: true } });
            const runtime = {
                getComponentById: async (id, request, wait): Promise<IResponse> => {
                    assert.equal(id, "componentId");
                    assert.equal(wait, true);
                    return Promise.resolve(createComponentResponse({}));
                },
            };
            const response = await componentRuntimeRequestHandler(requestParser, runtime as any as IContainerRuntime);
            assert.notEqual(response, undefined);
        });
    });
});
