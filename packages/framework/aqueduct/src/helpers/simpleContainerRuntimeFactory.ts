/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-unassigned-import
import "reflect-metadata";

import ioc from "inversify";

import { IContainerContext } from "@microsoft/fluid-container-definitions";
import {
    componentRuntimeRequestHandler,
    ContainerRuntime,
    RequestParser,
    RuntimeRequestHandler,
} from "@microsoft/fluid-container-runtime";
import { IHostRuntime, NamedComponentRegistryEntries } from "@microsoft/fluid-runtime-definitions";
import { IComponentIocContainerProvider } from "@microsoft/fluid-framework-interfaces";
import {
    generateContainerServicesRequestHandler,
    ContainerServiceRegistryEntries,
} from "../containerServices";

class InversifyContainerProvider implements IComponentIocContainerProvider {
    public get IComponentIocContainerProvider() { return this; }

    public constructor(private readonly container: ioc.Container) { }

    public getIocContainer() { return this.container; }
}

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
        scopeModules: ioc.ContainerModule[] = [],
        scopeModulesAsync: ioc.AsyncContainerModule[] = [],
    ): Promise<ContainerRuntime> {

        // Setup our IocContainer that will do scope injection through our framework
        const iocContainer = new ioc.Container();

        // Load all the sync modules provided by the caller
        scopeModules.forEach((module) => {
            iocContainer.load(module);
        });

        // Load all the async modules provided by the caller
        scopeModulesAsync.forEach((module) => {
            iocContainer.load(module);
        });

        // If the loader provides an Ioc Container then we can make it the parent of our Container's scope
        const iocCapable = context.scope.IComponentIocContainerProvider;
        if (iocCapable) {
            iocContainer.parent = iocCapable.getIocContainer();
        }

        // Debug(`instantiateRuntime(chaincode=${chaincode},registry=${JSON.stringify(registry)})`);
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
            new InversifyContainerProvider(iocContainer));
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
