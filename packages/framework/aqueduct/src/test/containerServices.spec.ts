import * as assert from "assert";

import { generateContainerServicesRequestHandler, InstanceContainerService, SingletonContainerService, serviceRoutePathRoot } from "../";
import { IComponentRouter, IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import { RequestParser } from "@microsoft/fluid-container-runtime";

class ExampleServiceMock implements IComponentRouter {

    public get IComponentRouter() { return this; }

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
        describe("SingletonContainerService", () => {
            describe("getComponent", () => {
                it("Two gets should return the same object", async () => {
                    const service = new SingletonContainerService("id", () => new ExampleServiceMock());

                    const component1 = service.getComponent({} as IHostRuntime);
                    const component2 = service.getComponent({} as IHostRuntime);

                    assert(component1 === component2, "Component objects are the same");
                });
            });
        });

        describe("InstanceContainerService", () => {
            describe("getComponent", () => {
                it("Two gets should return different objects", async () => {
                    const service = new InstanceContainerService("id", () => new ExampleServiceMock());

                    const component1 = service.getComponent({} as IHostRuntime);
                    const component2 = service.getComponent({} as IHostRuntime);

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
                assert(response?.status === 400, "Returned 400 Status Code")
            });

            it("Unknown service should return 404 with no services", async () => {
                const requestHandler = generateContainerServicesRequestHandler([]);
                const requestParser = new RequestParser({url:`/${serviceRoutePathRoot}/id1`});

                const response = await requestHandler(requestParser, {} as IHostRuntime);
                
                assert(response, "Response returned");
                assert(response?.status === 404, "Returned 404 Status Code")
            });

            it("Unknown service should return 404 with services", async () => {
                const component = new ExampleServiceMock();
                const service1 = new SingletonContainerService("id1", () => component);
                const requestHandler = generateContainerServicesRequestHandler([service1]);
                const requestParser = new RequestParser({url:`/${serviceRoutePathRoot}/id2`});

                const response = await requestHandler(requestParser, {} as IHostRuntime);
                
                assert(response, "Response returned");
                assert(response?.status === 404, "Returned 404 Status Code")
            });

            it("Correct service should be returned with single service", async () => {
                const component = new ExampleServiceMock();
                const service1 = new SingletonContainerService("id1", () => component);
                const requestHandler = generateContainerServicesRequestHandler([service1]);
                const requestParser = new RequestParser({url:`/${serviceRoutePathRoot}/id1`});

                const response = await requestHandler(requestParser, {} as IHostRuntime);
                
                assert(response, "Response returned");
                assert(response?.status === 200, "Returned 200 Status Code")
                assert(response?.value === component, "Returned expected service");
            });

            it("Correct service should be returned with multiple services", async () => {
                const service1 = new SingletonContainerService("id1", () => new ExampleServiceMock());
                const component = new ExampleServiceMock();
                const service2 = new SingletonContainerService("id2", () => component);
                const requestHandler = generateContainerServicesRequestHandler([service1, service2]);
                const requestParser = new RequestParser({url:`/${serviceRoutePathRoot}/id2`});

                const response = await requestHandler(requestParser, {} as IHostRuntime);
                
                assert(response, "Response returned");
                assert(response?.status === 200, "Returned 200 Status Code")
                assert(response?.value === component, "Returned expected service");
            });

            it("Sub-route should be persisted through", async () => {
                const component = new ExampleServiceMock();
                const service1 = new SingletonContainerService("id1", () => component);
                const requestHandler = generateContainerServicesRequestHandler([service1]);
                const requestParser = new RequestParser({url:`/${serviceRoutePathRoot}/id1/sub1`});

                const response = await requestHandler(requestParser, {} as IHostRuntime);
                
                assert(response, "Response returned");
                assert(response?.status === 200, "Returned 200 Status Code")
                assert(response?.value === component, "Returned expected service");
                assert((response?.value as ExampleServiceMock).route === "sub1", "sub-route persisted");
            });
        });
    });
});
