import { IComponent, IComponentRouter, IResponse } from "@microsoft/fluid-component-core-interfaces";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import { RequestParser, RuntimeRequestHandler } from "@microsoft/fluid-container-runtime";

// TODO: should this just be "s"?
export const serviceRoutePathRoot = "_services";

export interface IContainerService {
    id: string,
    getComponent(runtime: IHostRuntime): IComponent & IComponentRouter,
}

/**
 * A container service that uses a single component for a given container instance.
 */
export class SingletonContainerService implements IContainerService {
    private component: IComponent & IComponentRouter | undefined;

    public get id() {
        return this.serviceId;
    }

    public getComponent(runtime: IHostRuntime) {
        if (!this.component) {
            this.component = this.createComponent(runtime);
        }

        return this.component;
    }

    public constructor(
        private readonly serviceId: string,
        private readonly createComponent: (runtime: IHostRuntime) => IComponent & IComponentRouter) {
    }
}

/**
 * A container service that creates a new component every time `getComponent` is called.
 */
export class InstanceContainerService implements IContainerService {
    public get id() {
        return this.serviceId;
    }

    public getComponent(runtime: IHostRuntime) {
        return this.createComponent(runtime);
    }

    public constructor(
        private readonly serviceId: string,
        private readonly createComponent: (runtime: IHostRuntime) => IComponent & IComponentRouter) {
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
        services.forEach((service) => {
            if (request.pathParts[1] === service.id) {
                let subRequest = request.createSubRequest(2);
                if (!subRequest) {
                    // If there is nothing left of the url we will request with empty path.
                    subRequest = { url: "" };
                }

                responseP = service.getComponent(runtime).request({ url: "" });
                return;
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

