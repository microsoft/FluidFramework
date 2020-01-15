import * as assert from "assert";

import { IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import { RequestParser } from "@microsoft/fluid-container-runtime";

import { generateContainerServicesRequestHandler, serviceRoutePathRoot } from "../";
import { BaseContainerService } from "../helpers";

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
                const service1 = new ContainerServiceMock("id1");
                const requestHandler = generateContainerServicesRequestHandler([service1]);
                const requestParser = new RequestParser({url:`/${serviceRoutePathRoot}/id2`});

                const response = await requestHandler(requestParser, {} as IHostRuntime);
                
                assert(response, "Response returned");
                assert(response?.status === 404, "Returned 404 Status Code")
            });

            it("Correct service should be returned with single service", async () => {
                const service1 = new ContainerServiceMock("id1");
                const requestHandler = generateContainerServicesRequestHandler([service1]);
                const requestParser = new RequestParser({url:`/${serviceRoutePathRoot}/id1`});

                const response = await requestHandler(requestParser, {} as IHostRuntime);
                
                assert(response, "Response returned");
                assert(response?.status === 200, "Returned 200 Status Code")
                assert(response?.value === service1, "Returned expected service");
            });

            it("Correct service should be returned with multiple services", async () => {
                const service1 = new ContainerServiceMock("id1");
                const service2 = new ContainerServiceMock("id2");
                const requestHandler = generateContainerServicesRequestHandler([service1, service2]);
                const requestParser = new RequestParser({url:`/${serviceRoutePathRoot}/id2`});

                const response = await requestHandler(requestParser, {} as IHostRuntime);
                
                assert(response, "Response returned");
                assert(response?.status === 200, "Returned 200 Status Code")
                assert(response?.value === service2, "Returned expected service");
            });

            it("First registered service should be returned with multiple services of the same name", async () => {
                const service1 = new ContainerServiceMock("id1");
                const service12 = new ContainerServiceMock("id1");
                const requestHandler = generateContainerServicesRequestHandler([service1, service12]);
                const requestParser = new RequestParser({url:`/${serviceRoutePathRoot}/id1`});

                const response = await requestHandler(requestParser, {} as IHostRuntime);
                
                assert(response, "Response returned");
                assert(response?.status === 200, "Returned 200 Status Code")
                assert(response?.value === service1, "Returned expected service");
            });

            it("Sub-route should be persisted through", async () => {
                const service1 = new ContainerServiceMock("id1");
                const requestHandler = generateContainerServicesRequestHandler([service1]);
                const requestParser = new RequestParser({url:`/${serviceRoutePathRoot}/id1/sub1`});

                const response = await requestHandler(requestParser, {} as IHostRuntime);
                
                assert(response, "Response returned");
                assert(response?.status === 200, "Returned 200 Status Code")
                assert(response?.value === service1, "Returned expected service");
                assert((response?.value as ContainerServiceMock).route === "sub1", "sub-route persisted");
            });
        });
    });
});
