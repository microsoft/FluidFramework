/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fluidExport as cmfe } from "@fluid-example/codemirror/dist/codemirror";
import { fluidExport as pmfe } from "@fluid-example/prosemirror/dist/prosemirror";
import { ClickerInstantiationFactory } from "@fluid-example/clicker";
import { Spaces } from "@fluid-example/spaces";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { IFluidObject } from "@fluidframework/core-interfaces";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import {
    LastEditedTrackerDataObject,
    setupLastEditedTrackerForContainer,
    IFluidLastEditedTracker,
} from "@fluidframework/last-edited-experimental";
import {
    IFluidDataStoreRegistry,
    IProvideFluidDataStoreFactory,
    IFluidDataStoreFactory,
    NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import {
    Anchor,
    TabsComponent,
    Vltava,
} from "./components";
import {
    IComponentInternalRegistry,
    IInternalRegistryEntry,
} from "./interfaces";

export class InternalRegistry implements IFluidDataStoreRegistry, IComponentInternalRegistry {
    public get IFluidDataStoreRegistry() { return this; }
    public get IComponentInternalRegistry() { return this; }

    constructor(
        private readonly containerComponentArray: IInternalRegistryEntry[],
    ) {
    }

    public async get(name: string): Promise<Readonly<IProvideFluidDataStoreFactory | undefined>> {
        const index = this.containerComponentArray.findIndex(
            (containerComponent) => name === containerComponent.factory.type,
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
            (containerComponent) => type === containerComponent.factory.type,
        );
        return index >= 0 && this.containerComponentArray[index].capabilities.includes(capability);
    }
}

export class VltavaRuntimeFactory extends ContainerRuntimeFactoryWithDefaultDataStore {
    constructor(
        defaultComponentName: string,
        registryEntries: NamedFluidDataStoreRegistryEntries,
    ) {
        super(defaultComponentName, registryEntries);
    }

    /**
     * {@inheritDoc BaseContainerRuntimeFactory.containerHasInitialized}
     */
    protected async containerHasInitialized(runtime: IContainerRuntime) {
        // Load the last edited tracker component (done by the setup method below). This component provides container
        // level tracking of last edit and has to be loaded before any other component.
        const tracker = await requestFluidObject<IFluidLastEditedTracker>(
            await runtime.getRootDataStore(ContainerRuntimeFactoryWithDefaultDataStore.defaultComponentId),
            "");

        setupLastEditedTrackerForContainer(tracker.IFluidLastEditedTracker, runtime);
    }
}

const generateFactory = () => {
    const containerComponentsDefinition: IInternalRegistryEntry[] = [
        {
            factory: ClickerInstantiationFactory,
            capabilities: ["IFluidHTMLView", "IFluidLoadable"],
            friendlyName: "Clicker",
            fabricIconName: "NumberField",
        },
        {
            factory: TabsComponent.getFactory(),
            capabilities: ["IFluidHTMLView", "IFluidLoadable"],
            friendlyName: "Tabs",
            fabricIconName: "BrowserTab",
        },
        {
            factory: Spaces.getFactory(),
            capabilities: ["IFluidHTMLView", "IFluidLoadable"],
            friendlyName: "Spaces",
            fabricIconName: "SnapToGrid",
        },
        {
            factory: cmfe,
            capabilities: ["IFluidHTMLView", "IFluidLoadable"],
            friendlyName: "Codemirror",
            fabricIconName: "Code",
        },
        {
            factory: pmfe,
            capabilities: ["IFluidHTMLView", "IFluidLoadable"],
            friendlyName: "Prosemirror",
            fabricIconName: "Edit",
        },
    ];

    const containerComponents: [string, Promise<IFluidDataStoreFactory>][] = [];
    containerComponentsDefinition.forEach((value) => {
        containerComponents.push([value.factory.type, Promise.resolve(value.factory)]);
    });

    // TODO: You should be able to specify the default registry instead of just a list of components
    // and the default registry is already determined Issue:#1138
    return new VltavaRuntimeFactory(
        Anchor.getFactory().type,
        [
            ...containerComponents,
            LastEditedTrackerDataObject.getFactory().registryEntry,
            // We don't want to include the default wrapper component in our list of available components
            Anchor.getFactory().registryEntry,
            Vltava.getFactory().registryEntry,
            ["internalRegistry", Promise.resolve(new InternalRegistry(containerComponentsDefinition))],
        ],
    );
};

export const fluidExport = generateFactory();
