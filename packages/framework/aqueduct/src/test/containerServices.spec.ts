/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/consistent-type-assertions */

import { strict as assert } from "assert";
import { IRequest, IResponse } from "@fluidframework/core-interfaces";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { RequestParser } from "@fluidframework/runtime-utils";
import {
	BaseContainerService,
	generateContainerServicesRequestHandler,
	serviceRoutePathRoot,
} from "../container-services";

class ContainerServiceMock extends BaseContainerService {
	public route: string = "";

	public async request(request: IRequest): Promise<IResponse> {
		this.route = request.url;
		return {
			status: 200,
			mimeType: "fluid/object",
			value: this,
		};
	}
}

describe("Routerlicious", () => {
	describe("Aqueduct", () => {
		describe("generateContainerServicesRequestHandler", () => {
			it(`Request to ${serviceRoutePathRoot} and no id should fail`, async () => {
				const requestHandler = generateContainerServicesRequestHandler([]);
				const requestParser = RequestParser.create({ url: `/${serviceRoutePathRoot}` });

				const response = await requestHandler(requestParser, {} as IContainerRuntime);

				assert(response, "Response returned");
				assert(response?.status === 400, "Returned 400 Status Code");
			});

			it("Unknown service should return 404 with no services", async () => {
				const requestHandler = generateContainerServicesRequestHandler([]);
				const requestParser = RequestParser.create({ url: `/${serviceRoutePathRoot}/id1` });

				const response = await requestHandler(requestParser, {} as IContainerRuntime);

				assert(response, "Response returned");
				assert(response?.status === 404, "Returned 404 Status Code");
			});

			it("Unknown service should return 404 with services", async () => {
				const requestHandler = generateContainerServicesRequestHandler([
					["id1", async (r) => new ContainerServiceMock(r)],
				]);
				const requestParser = RequestParser.create({ url: `/${serviceRoutePathRoot}/id2` });

				const response = await requestHandler(requestParser, {} as IContainerRuntime);

				assert(response, "Response returned");
				assert(response?.status === 404, "Returned 404 Status Code");
			});

			it("Request to non-routeable service with sub-route should fail", async () => {
				const requestHandler = generateContainerServicesRequestHandler([
					[
						"id1",
						async (r) => {
							return {};
						},
					],
				]);
				const requestParser = RequestParser.create({
					url: `/${serviceRoutePathRoot}/id1/subroute`,
				});

				const response = await requestHandler(requestParser, {} as IContainerRuntime);

				assert(response, "Response returned");
				assert(response?.status === 400, "Returned 400 Status Code");
			});

			it("Correct service should be returned with single service", async () => {
				const service1 = new ContainerServiceMock({} as IContainerRuntime);
				const serviceMap = new Map();
				serviceMap.set("id1", async (r) => service1);
				const requestHandler = generateContainerServicesRequestHandler(serviceMap);
				const requestParser = RequestParser.create({ url: `/${serviceRoutePathRoot}/id1` });

				const response = await requestHandler(requestParser, {} as IContainerRuntime);

				assert(response, "Response returned");
				assert(response?.status === 200, "Returned 200 Status Code");
				assert(response?.value === service1, "Returned expected service");
			});

			it("Same service should be returned twice with two calls", async () => {
				const requestHandler = generateContainerServicesRequestHandler([
					["id1", async (r) => new ContainerServiceMock(r)],
				]);
				const requestParser = RequestParser.create({ url: `/${serviceRoutePathRoot}/id1` });

				const response1 = await requestHandler(requestParser, {} as IContainerRuntime);
				const response2 = await requestHandler(requestParser, {} as IContainerRuntime);

				assert(response1?.value === response2?.value, "Returned same service twice");
			});

			it("Correct service should be returned with multiple services", async () => {
				const service2 = new ContainerServiceMock({} as IContainerRuntime);
				const requestHandler = generateContainerServicesRequestHandler([
					["id1", async (r) => new ContainerServiceMock(r)],
					["id2", async (r) => service2],
				]);
				const requestParser = RequestParser.create({ url: `/${serviceRoutePathRoot}/id2` });

				const response = await requestHandler(requestParser, {} as IContainerRuntime);

				assert(response, "Response returned");
				assert(response?.status === 200, "Returned 200 Status Code");
				assert(response?.value === service2, "Returned expected service");
			});

			it("Last registered service should be returned with multiple services of the same name", async () => {
				const service1 = new ContainerServiceMock({} as IContainerRuntime);
				const requestHandler = generateContainerServicesRequestHandler([
					["id1", async (r) => new ContainerServiceMock(r)],
					["id1", async (r) => new ContainerServiceMock(r)],
					["id1", async (r) => new ContainerServiceMock(r)],
					["id1", async (r) => new ContainerServiceMock(r)],
					["id1", async (r) => new ContainerServiceMock(r)],
					["id1", async (r) => service1],
				]);
				const requestParser = RequestParser.create({ url: `/${serviceRoutePathRoot}/id1` });

				const response = await requestHandler(requestParser, {} as IContainerRuntime);

				assert(response, "Response returned");
				assert(response?.status === 200, "Returned 200 Status Code");
				assert(response?.value === service1, "Returned expected service");
			});

			it("Sub-route should be persisted through", async () => {
				const service1 = new ContainerServiceMock({} as IContainerRuntime);
				const requestHandler = generateContainerServicesRequestHandler([
					["id1", async (r) => service1],
				]);
				const requestParser = RequestParser.create({
					url: `/${serviceRoutePathRoot}/id1/sub1`,
				});

				const response = await requestHandler(requestParser, {} as IContainerRuntime);

				assert(response, "Response returned");
				assert(response?.status === 200, "Returned 200 Status Code");
				assert(response?.value === service1, "Returned expected service");
				assert(
					(response?.value as ContainerServiceMock).route === "/sub1",
					"sub-route persisted",
				);
			});
		});
	});
});
