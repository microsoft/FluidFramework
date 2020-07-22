/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fluidExport as cmfe } from "@fluid-example/codemirror/dist/codemirror";
import { fluidExport as pmfe } from "@fluid-example/prosemirror/dist/prosemirror";
import { ClickerInstantiationFactory } from "@fluid-example/clicker";
import { Spaces } from "@fluid-example/spaces";
import { ContainerRuntimeFactoryWithDefaultComponent } from "@fluidframework/aqueduct";
import { IFluidObject } from "@fluidframework/component-core-interfaces";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import {
    LastEditedTrackerComponentName,
    LastEditedTrackerComponent,
    setupLastEditedTrackerForContainer,
} from "@fluidframework/last-edited-experimental";
import {
    IComponentRegistry,
    IProvideComponentFactory,
    NamedComponentRegistryEntries,
} from "@fluidframework/runtime-definitions";

import {
    Anchor,
    AnchorName,
    TabsComponent,
    Vltava,
    VltavaName,
} from "./components";
import {
    IComponentInternalRegistry,
    IInternalRegistryEntry,
} from "./interfaces";

export class InternalRegistry implements IComponentRegistry, IComponentInternalRegistry {
    public get IComponentRegistry() { return this; }
    public get IComponentInternalRegistry() { return this; }

    constructor(
        private readonly containerComponentArray: IInternalRegistryEntry[],
    ) {
    }

    public async get(name: string): Promise<Readonly<IProvideComponentFactory | undefined>> {
        const index = this.containerComponentArray.findIndex(
            (containerComponent) => name === containerComponent.type,
        );
        if (index >= 0) {
            return this.containerComponentArray[index].factory;
        }

        return undefined;
    }

    public getFromCapability(capability: keyof IFluidObject): IInternalRegistryEntry[] {
        return this.containerComponentArray.filter(
            (componentDetails) => componentDetails.capabilities.includes(capability));
    }

    public hasCapability(type: string, capability: keyof IFluidObject) {
        const index = this.containerComponentArray.findIndex(
            (containerComponent) => type === containerComponent.type,
        );
        return index >= 0 && this.containerComponentArray[index].capabilities.includes(capability);
    }
}

export class VltavaRuntimeFactory extends ContainerRuntimeFactoryWithDefaultComponent {
    constructor(
        defaultComponentName: string,
        registryEntries: NamedComponentRegistryEntries,
    ) {
        super(defaultComponentName, registryEntries);
    }

    /**
     * {@inheritDoc BaseContainerRuntimeFactory.containerHasInitialized}
     */
    protected async containerHasInitialized(runtime: IContainerRuntime) {
        // Load the last edited tracker component (done by the setup method below). This component provides container
        // level tracking of last edit and has to be loaded before any other component.

        // Right now this setup has to be done asynchronously because in the case where we load the Container from
        // remote ops, the `Attach` message for the last edited tracker component has not arrived yet.
        // We should be able to wait here after the create-new workflow is in place.
        setupLastEditedTrackerForContainer(ContainerRuntimeFactoryWithDefaultComponent.defaultComponentId, runtime)
            .catch((error) => {
                console.error(error);
            });
    }
}

const generateFactory = () => {
    const containerComponentsDefinition: IInternalRegistryEntry[] = [
        {
            type: "clicker",
            factory: Promise.resolve(ClickerInstantiationFactory),
            capabilities: ["IComponentHTMLView", "IComponentLoadable"],
            friendlyName: "Clicker",
            fabricIconName: "NumberField",
        },
        {
            type: "tabs",
            factory: Promise.resolve(TabsComponent.getFactory()),
            capabilities: ["IComponentHTMLView", "IComponentLoadable"],
            friendlyName: "Tabs",
            fabricIconName: "BrowserTab",
        },
        {
            type: "spaces",
            factory: Promise.resolve(Spaces.getFactory()),
            capabilities: ["IComponentHTMLView", "IComponentLoadable"],
            friendlyName: "Spaces",
            fabricIconName: "SnapToGrid",
        },
        {
            type: "codemirror",
            factory: Promise.resolve(cmfe),
            capabilities: ["IComponentHTMLView", "IComponentLoadable"],
            friendlyName: "Codemirror",
            fabricIconName: "Code",
        },
        {
            type: "prosemirror",
            factory: Promise.resolve(pmfe),
            capabilities: ["IComponentHTMLView", "IComponentLoadable"],
            friendlyName: "Prosemirror",
            fabricIconName: "Edit",
        },
    ];

    const containerComponents: [string, Promise<IProvideComponentFactory>][] = [];
    containerComponentsDefinition.forEach((value) => {
        containerComponents.push([value.type, value.factory]);
    });

    // The last edited tracker component provides container level tracking of last edits. This is the first
    // component that is loaded.
    containerComponents.push(
        [LastEditedTrackerComponentName, Promise.resolve(LastEditedTrackerComponent.getFactory())]);

    // We don't want to include the default wrapper component in our list of available components
    containerComponents.push([AnchorName, Promise.resolve(Anchor.getFactory())]);
    containerComponents.push([VltavaName, Promise.resolve(Vltava.getFactory())]);

    const containerRegistries: NamedComponentRegistryEntries = [
        ["", Promise.resolve(new InternalRegistry(containerComponentsDefinition))],
    ];

    // TODO: You should be able to specify the default registry instead of just a list of components
    // and the default registry is already determined Issue:#1138
    return new VltavaRuntimeFactory(
        AnchorName,
        [
            ...containerComponents,
            ...containerRegistries,
        ],
    );
};

export const fluidExport = generateFactory();
