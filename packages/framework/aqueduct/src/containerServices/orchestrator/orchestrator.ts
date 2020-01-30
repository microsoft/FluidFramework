/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerService, serviceRoutePathRoot } from "@microsoft/fluid-aqueduct";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    IComponentInterfacesRegistry,
    IProvideComponentDiscoverableInterfaces,
    IProvideComponentDiscoverInterfaces,
    IComponentDiscoverInterfaces,
    IComponentDiscoverableInterfaces,
} from "@microsoft/fluid-framework-interfaces";
import { IComponentContext } from "@microsoft/fluid-runtime-definitions";

export const OrchestratorContainerServiceId = "orchestrator";

const getOrchestrator = async (context: IComponentContext): Promise<IComponentInterfacesRegistry> => {
    const response = await context.request({url:`/${serviceRoutePathRoot}/${OrchestratorContainerServiceId}`});
    if (response.status === 200 && response.mimeType === "fluid/component") {
        const value = response.value as IComponent;
        const orchestrator = value.IComponentInterfacesRegistry;
        if (orchestrator) {
            return orchestrator;
        }
    }

    throw new Error("Orchestrator Container Service not registered");
};

/**
 * Helper function for registering with the Orchestrator. Manages getting the Orchestrator from the Container before
 * registering interfaces.
 *
 * @param context - Component Context
 * @param component - Discover/Discoverable instance
 */
export const registerWithOrchestrator = async (
    context: IComponentContext,
    component: IProvideComponentDiscoverInterfaces | IProvideComponentDiscoverableInterfaces,
): Promise<void> => {
    const orchestrator = await getOrchestrator(context);
    orchestrator.registerComponentInterfaces(component);
};

/**
 * Helper function for unregistering with the Orchestrator. Manages getting the Orchestrator from the Container before
 * unregistering interfaces.
 *
 * @param context - Component Context
 * @param component - Discover/Discoverable instance
 */
export const unregisterWithOrchestrator = async (
    context: IComponentContext,
    component: IProvideComponentDiscoverInterfaces | IProvideComponentDiscoverableInterfaces,
): Promise<void> => {
    const orchestrator = await getOrchestrator(context);
    orchestrator.unregisterComponentInterfaces(component);
};

/**
 * The Orchestrator is a Container Service that provides Components the ability to register based on capabilities.
 * It's an implementation of the Discover interfaces {@link @microsoft/fluid-framework-interfaces}
 *
 * The Orchestrator is not meant to be used directly but to be used through the two provided
 * registerWithOrchestrator and unregisterWithOrchestrator functions.
 */
export class Orchestrator extends BaseContainerService implements IComponentInterfacesRegistry {

    private readonly discoverableInterfacesMap: Map<keyof IComponent, IComponentDiscoverableInterfaces[]> = new Map();

    private readonly discoverInterfacesMap: Map<keyof IComponent, IComponentDiscoverInterfaces[]> = new Map();

    public get IComponentInterfacesRegistry() { return this; }

    public registerComponentInterfaces(
        component: IProvideComponentDiscoverInterfaces | IProvideComponentDiscoverableInterfaces,
    ) {
        const discoverable = (component as IProvideComponentDiscoverableInterfaces).IComponentDiscoverableInterfaces;
        if (discoverable){
            this.registerDiscoverableInterfaces(discoverable);
        }

        const discover = (component as IProvideComponentDiscoverInterfaces).IComponentDiscoverInterfaces;
        if (discover){
            this.registerDiscoverInterfaces(discover);
        }
    }

    public unregisterComponentInterfaces(
        component: IProvideComponentDiscoverInterfaces | IProvideComponentDiscoverableInterfaces,
    ) {
        const discoverable = (component as IProvideComponentDiscoverableInterfaces).IComponentDiscoverableInterfaces;
        if (discoverable){
            discoverable.discoverableInterfaces.forEach((interfaceName) => {
                let interfacesMap = this.discoverableInterfacesMap.get(interfaceName);
                if (interfacesMap) {
                    interfacesMap = interfacesMap.filter((el) => el !== component);
                    this.discoverableInterfacesMap.set(interfaceName, interfacesMap);
                }
            });
        }

        const discover = (component as IProvideComponentDiscoverInterfaces).IComponentDiscoverInterfaces;
        if (discover){
            discover.interfacesToDiscover.forEach((interfaceName) => {
                let interfacesMap = this.discoverInterfacesMap.get(interfaceName);
                if (interfacesMap) {
                    interfacesMap = interfacesMap.filter((el) => el !== component);
                    this.discoverInterfacesMap.set(interfaceName, interfacesMap);
                }
            });
        }
    }

    private registerDiscoverInterfaces(discover: IComponentDiscoverInterfaces) {
        // For each discover interface we will add it to the map
        discover.interfacesToDiscover.forEach((interfaceName) => {
            // If it's the first interface of its type add it to the the map
            if (!this.discoverInterfacesMap.has(interfaceName)){
                this.discoverInterfacesMap.set(interfaceName, []);
            }

            // Add the component the interface map
            const existingInterfaces = this.discoverInterfacesMap.get(interfaceName);
            existingInterfaces.push(discover);
            this.discoverInterfacesMap.set(interfaceName, existingInterfaces);

            // Since we are adding a new discover component we need to notify that component if there are existing
            // discoverable components that match it's interface key.
            const matchingComponents = this.discoverableInterfacesMap.get(interfaceName);
            if (matchingComponents) {
                discover.notifyComponentsDiscovered(interfaceName, matchingComponents);
            }
        });
    }

    private registerDiscoverableInterfaces(discoverable: IComponentDiscoverableInterfaces) {
        // For each discover interface we will add it to the map
        discoverable.discoverableInterfaces.forEach((interfaceName) => {
            // If it's the first interface of its type add it to the the map
            if (!this.discoverableInterfacesMap.has(interfaceName)){
                this.discoverableInterfacesMap.set(interfaceName, []);
            }

            // Add the component the interface map
            const existingInterfaces = this.discoverableInterfacesMap.get(interfaceName);
            existingInterfaces.push(discoverable);
            this.discoverableInterfacesMap.set(interfaceName, existingInterfaces);

            // Since we are adding a new discoverable component we need to notify existing discover components
            // that there is a new discoverable components that.
            const discoverComponents = this.discoverInterfacesMap.get(interfaceName);
            if (discoverComponents) {
                discoverComponents.forEach((component) => {
                    component.notifyComponentsDiscovered(interfaceName, [component]);
                });
            }
        });
    }
}
