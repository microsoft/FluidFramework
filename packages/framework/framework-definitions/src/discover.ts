/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";

/**
 * The interfaces in this file are related to component interface discovery. The idea
 * is that a component could say, for example, that it only cares about (and wants to be
 * notified of) components that implement IComponentHTMLView. Then, using these patterns,
 * it will be notified of all loaded components that implement that type on load, and
 * of all new components that are loaded during that session that implement IComponentHTMLView.
 *
 * Components who want their functionality to be discoverable should implement
 * IComponentDiscoverableInterfaces and list the interfaces they implement. Components that
 * want to be notified of other components that implement certain interfaces should implement
 * IComponentDiscoverInterfaces.
 *
 * This file also includes the interface for an IComponentInterfacesRegistry, which we use
 * to implement a component that carries out the matching between different components.
 *
 * Disclaimer: These interfaces are experimental and are subject to change.
 */

declare module "@microsoft/fluid-component-core-interfaces" {
    /* eslint-disable @typescript-eslint/indent */
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<
        IProvideComponentDiscoverableInterfaces
        & IProvideComponentDiscoverInterfaces
        & IProvideComponentInterfacesRegistry>> { }
    /* eslint-enable @typescript-eslint/indent */
}

export const IComponentDiscoverableInterfaces = "IComponentDiscoverableInterfaces";

export interface IProvideComponentDiscoverableInterfaces {
    readonly [IComponentDiscoverableInterfaces]: IComponentDiscoverableInterfaces;
}

/**
 * The interface for a component that wants to allow its functionality to be discoverable,
 * i.e. other components in the ecosystem will be able to find and interact with this
 * component based on its functionality alone.
 */
export interface IComponentDiscoverableInterfaces extends IProvideComponentDiscoverableInterfaces {
    /**
     * The interfaces this component implements that it wants other components to be able
     * to discover.
     */
    readonly discoverableInterfaces: (keyof IComponent)[];
}

export const IComponentDiscoverInterfaces = "IComponentDiscoverInterfaces";

export interface IProvideComponentDiscoverInterfaces {
    readonly [IComponentDiscoverInterfaces]: IComponentDiscoverInterfaces;
}

/**
 * The interface for a component that wants to be notified of components that implement the
 * interfaces specified in interfacesToDiscover.
 *
 * Components should expect to be notified of other components when they are loaded, and should
 * not expect for this relationship to be persisted beyond the current session.
 */
export interface IComponentDiscoverInterfaces extends IProvideComponentDiscoverInterfaces {
    /**
     * The interfaces this component cares about, i.e. it wants to be notified when other components
     * that implement any of these interfaces are added to the ecosystem.
     */
    readonly interfacesToDiscover: (keyof IComponent)[];

    /**
     * Invoked when any components that implement any of the interfaces in interfacesToDiscover are
     * registered in the component ecosystem.
     *
     * This function should be called when:
     * 1. This component is initially loaded, to be notified of all existing components in the ecosystem
     * that implement interfaces in interfacesToDiscover, and
     * 2. Whenever subsequent components are loaded that implement the same interfaces.
     *
     * @param interfaceName - The name of the interface that the given components implement.
     * @param components - A list of the components that implement the given interface.
     */
    notifyComponentsDiscovered(interfaceName: keyof IComponent, components: readonly IComponent[]): void;
}

export const IComponentInterfacesRegistry = "IComponentInterfacesRegistry";

export interface IProvideComponentInterfacesRegistry {
    readonly [IComponentInterfacesRegistry]: IComponentInterfacesRegistry;
}

/**
 * IComponentInterfacesRegistry is the contract for a component that can act as a registry
 * of the interfaces of different components that are loaded in the container.
 *
 * The current use case of this pattern is that components who deal with interface discovery
 * will notify the interfaces registry when they are loaded. Then, the interface registry
 * can handle matching of components that implement/want to discover the same interfaces.
 *
 * This relationship only exists per session as components are loaded and we recommend against
 * persisting the registry.
 *
 */
export interface IComponentInterfacesRegistry extends IProvideComponentInterfacesRegistry {
    /**
     * Invoked when a component is to be registered as a component with discoverable interfaces.
     */
    registerComponentInterfaces(
        component: IProvideComponentDiscoverInterfaces | IProvideComponentDiscoverableInterfaces): void;

    /**
     * Invoked when a component is to be unregistered from the registry.
     */
    unregisterComponentInterfaces(
        component: IProvideComponentDiscoverInterfaces | IProvideComponentDiscoverableInterfaces): void;
}
