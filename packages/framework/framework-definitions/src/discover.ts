/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@prague/component-core-interfaces";

declare module "@prague/component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<
        IProvideComponentDiscoverableInterfaces
        & IProvideComponentDiscoverInterfaces
        & IProvideComponentTracker>> {
    }
}

export interface IProvideComponentDiscoverableInterfaces {
    readonly IComponentDiscoverableInterfaces: IComponentDiscoverableInterfaces;
}

/**
 * The interface for a component that wants to allow its functionality to be discoverable,
 * i.e. other components in the ecosystem will be able to find and interact with this
 * component based on its functionality alone.
 */
export interface IComponentDiscoverableInterfaces {
    /**
     * The interfaces this component implements that it wants other components to be able
     * to discover.
     */
    readonly discoverableInterfaces: (keyof IComponent)[];
}

export interface IProvideComponentDiscoverInterfaces {
    readonly IComponentDiscoverInterfaces: IComponentDiscoverInterfaces;
}

/**
 * The interface for a component that wants to be notified of components that implement the
 * interfaces specified in interfacesToDiscover.
 */
export interface IComponentDiscoverInterfaces {
    /**
     * The interfaces this component cares about, i.e. it wants to be notified when other components
     * that implement any of these interfaces are added to the ecosystem.
     */
    readonly interfacesToDiscover: (keyof IComponent)[];

    /**
     * Invoked when any components that implement any of the interfaces in interfacesToDiscover enter
     * the component ecosystem.
     * @param interfaceName - The name of the interface that the given components implement.
     * @param components - A list of the components that implement the given interface.
     */
    onComponentsDiscovered(interfaceName: keyof IComponent, components: readonly IComponent[]): void;
}

export interface IProvideComponentTracker {
    readonly IComponentTracker: IComponentTracker;
}

/**
 * IComponentTracker is the contract for a component that tracks all other components with discoverable
 * functionality in a container. Currently the responsibility is on the container to notify the tracker
 * about new components that are created, but more optimally this would be part of the container itself,
 * instead of component behavior.
 */
export interface IComponentTracker extends IProvideComponentTracker {
    /**
     * Invoked when a component is added to the component ecosystem.
     */
    addComponent(component: IComponentDiscoverInterfaces | IComponentDiscoverableInterfaces): void;

    /**
     * Invoked when a component is removed from the component ecosystem.
     */
    removeComponent(component: IComponentDiscoverInterfaces | IComponentDiscoverableInterfaces): void;
}
