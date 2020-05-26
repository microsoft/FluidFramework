/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { AxiosInstance, AxiosResponse } from "axios";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { IRequest } from "@fluidframework/component-core-interfaces";
import { ContainerUrlResolver } from "../urlResolver";

describe("Routerlicious Host", () => {
    describe("UrlResolver", () => {
        let axiosMock: Partial<AxiosInstance> & { failPost?: boolean };

        it("resolve should be retryable", async () => {
            axiosMock = {
                post: async () => {
                    if (axiosMock.failPost) {
                        throw new Error("Injecting failure to Axios.post");
                    }
                    const r: Partial<AxiosResponse<IResolvedUrl>> = { data: { type: "web", data: "http://resolved" } };
                    return r as AxiosResponse;
                },
            };
            const resolver = new ContainerUrlResolver("fakeBaseUrl", "fakeJwt", new Map(), axiosMock as AxiosInstance);
            const request: IRequest = { url: "http://some/url" };

            axiosMock.failPost = true;
            await assert.rejects(resolver.resolve(request), "resolving should fail if Axios.post fails");
            axiosMock.failPost = false;
            const resolvedUrl = await resolver.resolve(request);
            assert(resolvedUrl.type === "web" && resolvedUrl.data === "http://resolved",
                "resolving with successful Axios.post call should succeed after previous failure");
        });
    });
});
