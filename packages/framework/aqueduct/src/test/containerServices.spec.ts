/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/consistent-type-assertions */

import * as assert from "assert";

import { IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import { RequestParser } from "@microsoft/fluid-container-runtime";

import { generateContainerServicesRequestHandler, serviceRoutePathRoot } from "../";
import { BaseContainerService, InstanceContainerServiceFactory, SingletonContainerServiceFactory } from "../helpers";

class ContainerServiceMock extends BaseContainerService {

    public route: string = "";

    public async request(request: IRequest): Promise<IResponse> {
        this.route = request.url;
        return {
            status: 200,
            mimeType: "fluid/component",
            value: this,
        };
    }
}

describe("Routerlicious", () => {
    describe("Aqueduct", () => {
        describe("SingletonContainerServiceFactory", () => {
            describe("getService", () => {
                it("Two gets should return the same object", async () => {
                    const serviceFactory = new SingletonContainerServiceFactory("id1", ContainerServiceMock);

                    const component1 = serviceFactory.getService({} as IHostRuntime);
                    const component2 = serviceFactory.getService({} as IHostRuntime);

                    assert(component1 === component2, "Component objects are the same");
                });
            });
        });

        describe("InstanceContainerServiceFactory", () => {
            describe("getService", () => {
                it("Two gets should return different objects", async () => {
                    const serviceFactory = new InstanceContainerServiceFactory("id1", ContainerServiceMock);

                    const component1 = serviceFactory.getService({} as IHostRuntime);
                    const component2 = serviceFactory.getService({} as IHostRuntime);

                    assert(component1 !== component2, "Component objects are different");
                });
            });
        });

        describe("generateContainerServicesRequestHandler", () => {
            it(`Request to ${serviceRoutePathRoot} and no id should fail`, async () => {
                const requestHandler = generateContainerServicesRequestHandler([]);
                const requestParser = new RequestParser({url:`/${serviceRoutePathRoot}`});

                const response = await requestHandler(requestParser, {} as IHostRuntime);

                assert(response, "Response returned");
                assert(response?.status === 400, "Returned 400 Status Code");
            });

            it("Unknown service should return 404 with no services", async () => {
                const requestHandler = generateContainerServicesRequestHandler([]);
                const requestParser = new RequestParser({url:`/${serviceRoutePathRoot}/id1`});

                const response = await requestHandler(requestParser, {} as IHostRuntime);

                assert(response, "Response returned");
                assert(response?.status === 404, "Returned 404 Status Code");
            });

            it("Unknown service should return 404 with services", async () => {
                const serviceFactory1 = new SingletonContainerServiceFactory("id1", ContainerServiceMock);
                const requestHandler = generateContainerServicesRequestHandler([serviceFactory1]);
                const requestParser = new RequestParser({url:`/${serviceRoutePathRoot}/id2`});

                const response = await requestHandler(requestParser, {} as IHostRuntime);

                assert(response, "Response returned");
                assert(response?.status === 404, "Returned 404 Status Code");
            });

            it("Correct service should be returned with single service", async () => {
                const serviceFactory1 = new SingletonContainerServiceFactory("id1", ContainerServiceMock);
                const service1 = serviceFactory1.getService({} as IHostRuntime);

                const requestHandler = generateContainerServicesRequestHandler([serviceFactory1]);
                const requestParser = new RequestParser({url:`/${serviceRoutePathRoot}/id1`});

                const response = await requestHandler(requestParser, {} as IHostRuntime);

                assert(response, "Response returned");
                assert(response?.status === 200, "Returned 200 Status Code");
                assert(response?.value === service1, "Returned expected service");
            });

            it("Correct service should be returned with multiple services", async () => {
                const serviceFactory1 = new SingletonContainerServiceFactory("id1", ContainerServiceMock);
                const serviceFactory2 = new SingletonContainerServiceFactory("id2", ContainerServiceMock);
                const service2 = serviceFactory2.getService({} as IHostRuntime);
                const requestHandler = generateContainerServicesRequestHandler([serviceFactory1, serviceFactory2]);
                const requestParser = new RequestParser({url:`/${serviceRoutePathRoot}/id2`});

                const response = await requestHandler(requestParser, {} as IHostRuntime);

                assert(response, "Response returned");
                assert(response?.status === 200, "Returned 200 Status Code");
                assert(response?.value === service2, "Returned expected service");
            });

            it("First registered service should be returned with multiple services of the same name", async () => {
                const serviceFactory1 = new SingletonContainerServiceFactory("id1", ContainerServiceMock);
                const service1 = serviceFactory1.getService({} as IHostRuntime);
                const serviceFactory12 = new SingletonContainerServiceFactory("id1", ContainerServiceMock);
                const requestHandler = generateContainerServicesRequestHandler([serviceFactory1, serviceFactory12]);
                const requestParser = new RequestParser({url:`/${serviceRoutePathRoot}/id1`});

                const response = await requestHandler(requestParser, {} as IHostRuntime);

                assert(response, "Response returned");
                assert(response?.status === 200, "Returned 200 Status Code");
                assert(response?.value === service1, "Returned expected service");
            });

            it("Sub-route should be persisted through", async () => {
                const serviceFactory1 = new SingletonContainerServiceFactory("id1", ContainerServiceMock);
                const service1 = serviceFactory1.getService({} as IHostRuntime);
                const requestHandler = generateContainerServicesRequestHandler([serviceFactory1]);
                const requestParser = new RequestParser({url:`/${serviceRoutePathRoot}/id1/sub1`});

                const response = await requestHandler(requestParser, {} as IHostRuntime);

                assert(response, "Response returned");
                assert(response?.status === 200, "Returned 200 Status Code");
                assert(response?.value === service1, "Returned expected service");
                assert((response?.value as ContainerServiceMock).route === "sub1", "sub-route persisted");
            });
        });
    });
});
