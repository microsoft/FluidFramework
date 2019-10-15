/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IContainerContext } from "@microsoft/fluid-container-definitions";
import { ContainerRuntime } from "@microsoft/fluid-container-runtime";
import { ComponentRegistryTypes, IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import { componentRuntimeRequestHandler, RequestParser, RuntimeRequestHandler, RuntimeRequestHandlerBuilder} from "@microsoft/fluid-runtime-router";

export class SimpleContainerRuntimeFactory {
    public static readonly defaultComponentId = "default";

    /**
     * Helper function to instantiate a new default runtime
     */
    public static async instantiateRuntime(
        context: IContainerContext,
        chaincode: string,
        registry: ComponentRegistryTypes,
        generateSummaries: boolean = false,
        requestHandlers: RuntimeRequestHandler[] = [],
    ): Promise<ContainerRuntime> {
        const runtimeRequestHandler = new RuntimeRequestHandlerBuilder();
        runtimeRequestHandler.pushHandler(defaultComponentRuntimeRequestHandler);
        runtimeRequestHandler.pushHandler(...requestHandlers);
        runtimeRequestHandler.pushHandler(componentRuntimeRequestHandler);

        // debug(`instantiateRuntime(chaincode=${chaincode},registry=${JSON.stringify(registry)})`);
        const runtime = await ContainerRuntime.load(context, registry, runtimeRequestHandler.createRequestHandlerFn, { generateSummaries });
        // debug("runtime loaded.");

        // On first boot create the base component
        if (!runtime.existing) {
            // debug(`createAndAttachComponent(chaincode=${chaincode})`);
            // tslint:disable-next-line: no-floating-promises
            this.createAndAttachComponent(runtime, this.defaultComponentId, chaincode);
        }

        return runtime;
    }

    /**
     * Calls create, initialize, and attach on a new component.
     *
     * @param runtime - It is the runtime for the container.
     * @param id - unique component id for the new component
     * @param pkg - package name for the new component
     */
    public static async createAndAttachComponent<T>(
        runtime: IHostRuntime,
        id: string,
        pkg: string,
    ): Promise<T> {
        try {
            const componentRuntime = await runtime.createComponent(id, pkg);

            const result = await componentRuntime.request({ url: "/" });
            if (result.status !== 200 || result.mimeType !== "fluid/component") {
                return Promise.reject("Default component is not a component.");
            }

            componentRuntime.attach();

            return result.value as T;
        } catch (error) {
            runtime.error(error);
            throw error;
        }
    }
}

export const defaultComponentRuntimeRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IHostRuntime) => {
        if (request.pathParts.length === 0) {
            return componentRuntimeRequestHandler(
                new RequestParser({
                    url: SimpleContainerRuntimeFactory.defaultComponentId,
                    headers: request.headers,
                }),
                runtime);
        }
        return undefined;
    };
