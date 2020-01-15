import { IComponentRouter, IResponse, IRequest, IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IContainerService } from "@microsoft/fluid-framework-interfaces";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import { RequestParser, RuntimeRequestHandler } from "@microsoft/fluid-container-runtime";

// TODO: should this just be "s"?
export const serviceRoutePathRoot = "_services";

/**
 * Base Class for creating a Container Service
 */
export abstract class BaseContainerService implements IContainerService, IComponentRouter {

    public get IContainerService() { return this; }

    public get IComponentRouter() { return this; }

    public get serviceId() { return this.id; }

    public constructor(private readonly id: string) {
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            status: 200,
            mimeType: "fluid/component",
            value: this,
        };
    }
}

/**
 * Given a collection of IContainerServices will produce a RequestHandler for them all
 * @param services - Collection of Container Services
 */
export const generateContainerServicesRequestHandler = (services: IContainerService[]): RuntimeRequestHandler =>
    async (request: RequestParser, runtime: IHostRuntime) => {
        if (request.pathParts[0] !== serviceRoutePathRoot) {
            // If the request is not for a service we return undefined so the next handler can use it
            return undefined;
        }

        if (request.pathParts.length < 2) {
            // If there is not service to route to then return a failure
            return {
                status: 400,
                mimeType: "text/plain",
                value: `request url: [${request.url}] did not specify a service to route to`,
            };
        }

        let responseP: Promise<IResponse> | undefined;
        services.some((service) => {
            if (request.pathParts[1] === service.serviceId) {
                const router = (service as IComponent).IComponentRouter;
                if (router) {
                    // If the service is also a router then we will route to it
                    let subRequest = request.createSubRequest(2);
                    if (!subRequest) {
                        // If there is nothing left of the url we will request with empty path.
                        subRequest = { url: "" };
                    }

                    responseP = router.request(subRequest);
                } else {
                    // Otherwise we will just return the service
                    responseP = Promise.resolve({
                        status: 200,
                        mimeType: "fluid/component",
                        value: service,
                    });
                }
                return true;
            }
        });

        if (!responseP) {
            responseP = Promise.resolve({
                status: 404,
                mimeType: "text/plain",
                value: `Could not find a valid service for request url: [${request.url}]`,
            });
        }

        const response = await responseP;
        return response;
    };

