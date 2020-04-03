/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext } from "@microsoft/fluid-container-definitions";
import {
    componentRuntimeRequestHandler,
    ContainerRuntime,
    RequestParser,
    RuntimeRequestHandler,
} from "@microsoft/fluid-container-runtime";
import { IHostRuntime, NamedComponentRegistryEntries } from "@microsoft/fluid-runtime-definitions";
import {
    generateContainerServicesRequestHandler,
    ContainerServiceRegistryEntries,
} from "../containerServices";

import { ModuleManager } from "../container-modules";

// TODO: Foo is a place holder. Will be removed.
// import { Foo } from "./sharedComponentFactory";
// import { IComponentFoo } from "./IComponentFoo";

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class SimpleContainerRuntimeFactory {
    public static readonly defaultComponentId = "default";

    /**
     * Helper function to instantiate a new default runtime
     */
    public static async instantiateRuntime(
        context: IContainerContext,
        chaincode: string,
        registryEntries: NamedComponentRegistryEntries,
        serviceRegistry: ContainerServiceRegistryEntries = [],
        requestHandlers: RuntimeRequestHandler[] = [],
        // TODO: This probably shouldn't be the module manager but some registry or list or something
        moduleManager: ModuleManager = new ModuleManager(),
    ): Promise<ContainerRuntime> {
        // We can set the parent module manager to the one provided by the host.
        moduleManager.parent = context.scope.IComponentModuleManager;
        const runtime = await ContainerRuntime.load(
            context,
            registryEntries,
            [
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
                defaultComponentRuntimeRequestHandler,
                generateContainerServicesRequestHandler(serviceRegistry),
                ...requestHandlers,
                componentRuntimeRequestHandler,
            ],
            undefined,
            moduleManager);
        // Debug("runtime loaded.");

        // On first boot create the base component
        if (!runtime.existing) {
            // Debug(`createAndAttachComponent(chaincode=${chaincode})`);
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            SimpleContainerRuntimeFactory.createAndAttachComponent(
                runtime, SimpleContainerRuntimeFactory.defaultComponentId, chaincode);
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
