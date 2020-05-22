/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { BaseContainerService, serviceRoutePathRoot } from "@fluidframework/aqueduct";
import { IComponent } from "@fluidframework/component-core-interfaces";
import {
    IComponentInterfacesRegistry,
    IProvideComponentDiscoverableInterfaces,
    IProvideComponentDiscoverInterfaces,
    IComponentDiscoverInterfaces,
    IComponentDiscoverableInterfaces,
} from "@fluidframework/framework-interfaces";
import { IComponentContext } from "@fluidframework/runtime-definitions";

export const MatchMakerContainerServiceId = "matchMaker";

const getMatchMakerContainerService = async (context: IComponentContext): Promise<IComponentInterfacesRegistry> => {
    const response = await context.containerRuntime.request({
        url:`/${serviceRoutePathRoot}/${MatchMakerContainerServiceId}`,
    });
    if (response.status === 200 && response.mimeType === "fluid/component") {
        const value = response.value as IComponent;
        const matchMaker = value.IComponentInterfacesRegistry;
        if (matchMaker) {
            return matchMaker;
        }
    }

    throw new Error("MatchMaker Container Service not registered");
};

/**
 * Helper function for registering with the MatchMaker. Manages getting the MatchMaker from the Container before
 * registering interfaces.
 *
 * @param context - Component Context
 * @param component - Discover/Discoverable instance
 */
export const registerWithMatchMaker = async (
    context: IComponentContext,
    component: IProvideComponentDiscoverInterfaces | IProvideComponentDiscoverableInterfaces,
): Promise<void> => {
    const matchMaker = await getMatchMakerContainerService(context);
    matchMaker.registerComponentInterfaces(component);
};

/**
 * Helper function for unregistering with the MatchMaker. Manages getting the MatchMaker from the Container before
 * unregistering interfaces.
 *
 * @param context - Component Context
 * @param component - Discover/Discoverable instance
 */
export const unregisterWithMatchMaker = async (
    context: IComponentContext,
    component: IProvideComponentDiscoverInterfaces | IProvideComponentDiscoverableInterfaces,
): Promise<void> => {
    const matchMaker = await getMatchMakerContainerService(context);
    matchMaker.unregisterComponentInterfaces(component);
};

/**
 * The MatchMaker is a Container Service that provides Components the ability to register based on capabilities.
 * It's an implementation of the Discover interfaces {@link @fluidframework/framework-interfaces}
 *
 * The MatchMaker is not meant to be used directly but to be used through the two provided
 * registerWithMatchMaker and unregisterWithMatchMaker functions.
 */
export class MatchMaker extends BaseContainerService implements IComponentInterfacesRegistry {
    private readonly discoverableInterfacesMap: Map<keyof IComponent, IComponentDiscoverableInterfaces[]> = new Map();

    private readonly discoverInterfacesMap: Map<keyof IComponent, IComponentDiscoverInterfaces[]> = new Map();

    public get IComponentInterfacesRegistry() { return this; }

    public registerComponentInterfaces(
        component: IProvideComponentDiscoverInterfaces | IProvideComponentDiscoverableInterfaces,
    ) {
        // Discover needs to go first to ensure we don't alert the component registering of itself.
        const discover = (component as IProvideComponentDiscoverInterfaces).IComponentDiscoverInterfaces;
        if (discover) {
            this.registerDiscoverInterfaces(discover);
        }

        const discoverable = (component as IProvideComponentDiscoverableInterfaces).IComponentDiscoverableInterfaces;
        if (discoverable) {
            // The below code is some crazy typescript magic that checks to see that the interface the component
            // is declaring as discoverable is implemented by the component itself. We can do this because
            // `keyof IComponent` allows us to iterate though to check if the component also implements a getter
            // with the same name.
            discoverable.discoverableInterfaces.forEach((interfaceName) => {
                assert(
                    component[interfaceName],
                    `Component registering discoverable interface: [${interfaceName}] but does not implement it.`,
                );
            });
            this.registerDiscoverableInterfaces(discoverable);
        }
    }

    public unregisterComponentInterfaces(
        component: IProvideComponentDiscoverInterfaces | IProvideComponentDiscoverableInterfaces,
    ) {
        const discoverable = (component as IProvideComponentDiscoverableInterfaces).IComponentDiscoverableInterfaces;
        if (discoverable) {
            discoverable.discoverableInterfaces.forEach((interfaceName) => {
                let interfacesMap = this.discoverableInterfacesMap.get(interfaceName);
                if (interfacesMap) {
                    interfacesMap = interfacesMap.filter((el) => el !== component);
                    this.discoverableInterfacesMap.set(interfaceName, interfacesMap);
                }
            });
        }

        const discover = (component as IProvideComponentDiscoverInterfaces).IComponentDiscoverInterfaces;
        if (discover) {
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
            if (!this.discoverInterfacesMap.has(interfaceName)) {
                this.discoverInterfacesMap.set(interfaceName, []);
            }

            // Add the component the interface map
            const existingInterfaces = this.discoverInterfacesMap.get(interfaceName);
            assert(existingInterfaces);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            existingInterfaces!.push(discover);

            // Since we are adding a new discover component we need to notify that component if there are existing
            // discoverable components that match it's interface key.
            const matchingComponents = this.discoverableInterfacesMap.get(interfaceName);
            if (matchingComponents) {
                discover.notifyComponentsDiscovered(interfaceName, matchingComponents);
            }
        });
    }

    private registerDiscoverableInterfaces(discoverableComponent: IComponentDiscoverableInterfaces) {
        // For each discover interface we will add it to the map
        discoverableComponent.discoverableInterfaces.forEach((interfaceName) => {
            // If it's the first interface of its type add it to the the map
            if (!this.discoverableInterfacesMap.has(interfaceName)) {
                this.discoverableInterfacesMap.set(interfaceName, []);
            }

            // Add the component the interface map
            const existingInterfaces = this.discoverableInterfacesMap.get(interfaceName);
            assert(existingInterfaces);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            existingInterfaces!.push(discoverableComponent);

            // Since we are adding a new discoverable component we need to notify existing discover components
            // that there is a new discoverable component.
            const discoverComponents = this.discoverInterfacesMap.get(interfaceName);
            if (discoverComponents) {
                discoverComponents.forEach((component) => {
                    if (component !== (discoverableComponent as IComponent)) {
                        component.notifyComponentsDiscovered(interfaceName, [discoverableComponent]);
                    }
                });
            }
        });
    }
}
