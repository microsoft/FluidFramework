/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Clicker, ClickerInstantiationFactory, ClickerReactView } from "@fluid-example/clicker";
import { CodeMirrorComponent, CodeMirrorView, SmdeFactory } from "@fluid-example/codemirror";
import { ProseMirror, ProseMirrorFactory, ProseMirrorView } from "@fluid-example/prosemirror";
import { Spaces, SpacesView } from "@fluid-example/spaces";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { FluidObjectKeys, IFluidHandle } from "@fluidframework/core-interfaces";
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
import { ReactViewAdapter } from "@fluidframework/view-adapters";
import React from "react";

import {
    Anchor,
    TabsFluidObject,
} from "./fluidObjects";
import {
    DefaultRegistryTypes,
    IFluidObjectInternalRegistry,
    IInternalRegistryEntry,
} from "./interfaces";

const codeMirrorFactory = new SmdeFactory();
const proseMirrorFactory = new ProseMirrorFactory();

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

    public getByFactory(factoryId: string): IInternalRegistryEntry<DefaultRegistryTypes> | undefined {
        return this.containerFluidObjectArray.find((entry) => entry.factory.type === factoryId);
    }

    public getAll(): IInternalRegistryEntry<DefaultRegistryTypes>[] {
        return this.containerFluidObjectArray;
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


interface ISingleHandleItem {
    handle: IFluidHandle;
}

const getAdaptedViewForSingleHandleItem = async (serializableObject: ISingleHandleItem) => {
    const handle = serializableObject.handle;
    const component = await handle.get();
    return React.createElement(ReactViewAdapter, { view: component });
};

const getClickerView = async (serializableObject: ISingleHandleItem) => {
    const handle = serializableObject.handle as IFluidHandle<Clicker>;
    const clicker = await handle.get();
    return React.createElement(ClickerReactView, { clicker });
};

const getSpacesView = async (serializableObject: ISingleHandleItem) => {
    const handle = serializableObject.handle as IFluidHandle<Spaces>;
    const spaces = await handle.get();
    return React.createElement(SpacesView, { model: spaces });
};

const getCodeMirrorView = async (serializableObject: ISingleHandleItem) => {
    const handle = serializableObject.handle as IFluidHandle<CodeMirrorComponent>;
    const codeMirror = await handle.get();
    return React.createElement(
        ReactViewAdapter,
        { view: new CodeMirrorView(codeMirror.text, codeMirror.presenceManager) },
    );
};

const getProseMirrorView = async (serializableObject: ISingleHandleItem) => {
    const handle = serializableObject.handle as IFluidHandle<ProseMirror>;
    const proseMirror = await handle.get();
    return React.createElement(
        ReactViewAdapter,
        { view: new ProseMirrorView(proseMirror.collabManager) },
    );
};

const generateFactory = () => {
    const containerFluidObjectsDefinition: IInternalRegistryEntry[] = [
        {
            factory: ClickerInstantiationFactory,
            capabilities: ["IFluidLoadable"],
            friendlyName: "Clicker",
            fabricIconName: "NumberField",
            getView: getClickerView,
        },
        {
            factory: TabsFluidObject.getFactory(),
            capabilities: ["IFluidLoadable"],
            friendlyName: "Tabs",
            fabricIconName: "BrowserTab",
            getView: getAdaptedViewForSingleHandleItem,
        },
        {
            factory: Spaces.getFactory(),
            capabilities: ["IFluidLoadable"],
            friendlyName: "Spaces",
            fabricIconName: "SnapToGrid",
            getView: getSpacesView,
        },
        {
            factory: codeMirrorFactory,
            capabilities: ["IFluidLoadable"],
            friendlyName: "Codemirror",
            fabricIconName: "Code",
            getView: getCodeMirrorView,
        },
        {
            factory: proseMirrorFactory,
            capabilities: ["IFluidLoadable"],
            friendlyName: "Prosemirror",
            fabricIconName: "Edit",
            getView: getProseMirrorView,
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
