/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fluidExport as cmfe } from "@fluid-example/codemirror/dist/codemirror";
import { fluidExport as pmfe } from "@fluid-example/prosemirror/dist/prosemirror";
import { ClickerInstantiationFactory } from "@fluid-example/clicker";
import { Spaces } from "@fluid-example/spaces";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { FluidObjectKeys } from "@fluidframework/core-interfaces";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import {
    setupLastEditedTrackerForContainer,
    IFluidLastEditedTracker,
} from "@fluid-experimental/last-edited";
import {
    IFluidDataStoreFactory,
    IFluidDataStoreRegistry,
    IProvideFluidDataStoreFactory,
    NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import {
    Anchor,
    TabsFluidObject,
} from "./fluidObjects";
import {
    DefaultRegistryTypes,
    IFluidObjectInternalRegistry,
    IInternalRegistryEntry,
} from "./interfaces";

export class InternalRegistry implements IFluidDataStoreRegistry, IFluidObjectInternalRegistry {
    public get IFluidDataStoreRegistry() { return this; }
    public get IFluidObjectInternalRegistry() { return this; }

    constructor(
        private readonly containerFluidObjectArray: IInternalRegistryEntry[],
    ) {
    }

    public async get(name: string): Promise<Readonly<IProvideFluidDataStoreFactory | undefined>> {
        const index = this.containerFluidObjectArray.findIndex(
            (containerFluidObject) => name === containerFluidObject.factory.type,
        );
        if (index >= 0) {
            return this.containerFluidObjectArray[index].factory;
        }

        return undefined;
    }

    public getFromCapability(capability: FluidObjectKeys<DefaultRegistryTypes>):
    IInternalRegistryEntry[] {
        return this.containerFluidObjectArray.filter(
            (fluidObjectDetails) => fluidObjectDetails.capabilities.includes(capability));
    }

    public hasCapability(type: string, capability: FluidObjectKeys<DefaultRegistryTypes>) {
        const index = this.containerFluidObjectArray.findIndex(
            (containerFluidObject) => type === containerFluidObject.factory.type,
        );
        return index >= 0 && this.containerFluidObjectArray[index].capabilities.includes(capability);
    }
}

export class VltavaRuntimeFactory extends ContainerRuntimeFactoryWithDefaultDataStore {
    constructor(
        defaultFactory: IFluidDataStoreFactory,
        registryEntries: NamedFluidDataStoreRegistryEntries,
    ) {
        super(defaultFactory, registryEntries);
    }

    /**
     * {@inheritDoc BaseContainerRuntimeFactory.containerHasInitialized}
     */
    protected async containerHasInitialized(runtime: IContainerRuntime) {
        // Load the last edited tracker fluidObject (done by the setup method below). This fluidObject
        // provides container level tracking of last edit and has to be loaded before any other fluidObject.
        const tracker = await requestFluidObject<IFluidLastEditedTracker>(
            await runtime.getRootDataStore(ContainerRuntimeFactoryWithDefaultDataStore.defaultDataStoreId),
            "");

        setupLastEditedTrackerForContainer(tracker.IFluidLastEditedTracker, runtime);
    }
}

const generateFactory = () => {
    const containerFluidObjectsDefinition: IInternalRegistryEntry[] = [
        {
            factory: ClickerInstantiationFactory,
            capabilities: ["IFluidHTMLView", "IFluidLoadable"],
            friendlyName: "Clicker",
            fabricIconName: "NumberField",
        },
        {
            factory: TabsFluidObject.getFactory(),
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

    const containerFluidObjects: [string, Promise<IProvideFluidDataStoreFactory>][] = [];
    containerFluidObjectsDefinition.forEach((value) => {
        containerFluidObjects.push([value.factory.type, Promise.resolve(value.factory)]);
    });

    // TODO: You should be able to specify the default registry instead of just a list of fluidObjects
    // and the default registry is already determined Issue:#1138
    return new VltavaRuntimeFactory(
        Anchor.getFactory(),
        [
            ...containerFluidObjects,
            // We don't want to include the default wrapper fluidObject in our list of available fluidObjects
            Anchor.getFactory().registryEntry,
            ["internalRegistry", Promise.resolve(new InternalRegistry(containerFluidObjectsDefinition))],
        ],
    );
};

export const fluidExport = generateFactory();
