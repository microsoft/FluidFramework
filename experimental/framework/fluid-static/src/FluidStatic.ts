/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { getContainer, IGetContainerService } from "@fluid-experimental/get-container";
import { DataObject } from "@fluidframework/aqueduct";
import { Container } from "@fluidframework/container-loader";
import { NamedFluidDataStoreRegistryEntry } from "@fluidframework/runtime-definitions";
import {
    DOProviderContainerRuntimeFactory,
    IdToDataObjectCollection,
    IFluidStaticDataObjectClass,
    RootDataObject,
} from "./containerCode";

export interface ContainerConfig {
    dataObjects: IFluidStaticDataObjectClass[];
}

export interface ContainerCreateConfig extends ContainerConfig {
    /**
     * initialDataObjects defines dataObjects that will be created when the Container
     * is first created. It uses the key as the id and the value and the DataObject to create.
     *
     * In the example below two DataObjects will be created when the Container is first
     * created. One with id "foo1" that will return a `Foo` DataObject and the other with
     * id "bar2" that will return a `Bar` DataObject.
     *
     * ```
     * {
     *   ["foo1"]: Foo,
     *   ["bar2"]: Bar,
     * }
     * ```
     *
     * To get these DataObjects, call `container.getDataObject` passing in one of the ids.
     */
    initialDataObjects?: IdToDataObjectCollection;
}

export class FluidContainer extends EventEmitter implements Pick<Container, "audience" | "clientId"> {
    private readonly types: Set<string>;

    private readonly container: Container;

    public readonly audience: Container["audience"];

    public constructor(
        container: Container, // we anticipate using this later, e.g. for Audience
        namedRegistryEntries: NamedFluidDataStoreRegistryEntry[],
        private readonly rootDataObject: RootDataObject,
        public readonly createNew: boolean) {
            super();
            this.types = new Set();
            namedRegistryEntries.forEach((value: NamedFluidDataStoreRegistryEntry) => {
                const type = value[0];
                if (this.types.has(type)) {
                    throw new Error(`Multiple DataObjects share the same type identifier ${value}`);
                }
                this.types.add(type);
            });
            this.audience = container.audience;
            this.container = container;
            container.on("connected", (id: string) =>  this.emit("connected", id));
        }

    public get clientId() {
        return this.container.clientId;
    }

    public async createDataObject<T extends DataObject>(
        dataObjectClass: IFluidStaticDataObjectClass,
        id: string,
    ) {
        const type = dataObjectClass.factory.type;
        // This is a runtime check to ensure the developer doesn't try to create something they have not defined.
        if (!this.types.has(type)) {
            throw new Error(
                `Trying to create a DataObject with type ${type} that was not defined in Container initialization`);
        }

        return this.rootDataObject.createDataObject<T>(dataObjectClass, id);
    }

    public async getDataObject<T extends DataObject>(id: string) {
        return this.rootDataObject.getDataObject<T>(id);
    }
}

/**
 * FluidInstance provides the ability to have a Fluid object with a specific backing server outside of the
 * global context.
 */
export class FluidInstance {
    private readonly containerService: IGetContainerService;

    public constructor(getContainerService: IGetContainerService) {
        // This check is for non-typescript usages
        if (getContainerService === undefined) {
            throw new Error("Fluid cannot be initialized without a ContainerService");
        }

        this.containerService = getContainerService;
    }

    public async createContainer(id: string, config: ContainerCreateConfig): Promise<FluidContainer> {
        const registryEntries = this.getRegistryEntries(config.dataObjects);
        const container = await getContainer(
            this.containerService,
            id,
            new DOProviderContainerRuntimeFactory(registryEntries, config.initialDataObjects),
            true, /* createNew */
        );
        const rootDataObject = (await container.request({ url: "/" })).value;
        return new FluidContainer(container, registryEntries, rootDataObject, true /* createNew */);
    }

    public async getContainer(id: string, config: ContainerConfig): Promise<FluidContainer> {
        const registryEntries = this.getRegistryEntries(config.dataObjects);
        const container = await getContainer(
            this.containerService,
            id,
            new DOProviderContainerRuntimeFactory(registryEntries),
            false, /* createNew */
        );
        const rootDataObject = (await container.request({ url: "/" })).value;
        return new FluidContainer(container, registryEntries, rootDataObject, false /* createNew */);
    }

    private getRegistryEntries(dataObjects: IFluidStaticDataObjectClass[]) {
        if (dataObjects.length === 0) {
            throw new Error("Container cannot be initialized without DataObjects");
        }

        const dataObjectClassToRegistryEntry = (
            dataObjectClass: IFluidStaticDataObjectClass): NamedFluidDataStoreRegistryEntry =>
            [dataObjectClass.factory.type, Promise.resolve(dataObjectClass.factory)];

        return dataObjects.map(dataObjectClassToRegistryEntry);
    }
}

/**
 * Singular global instance that lets the developer define the Fluid server across all instances of Containers.
 */
let globalFluid: FluidInstance | undefined;
export const Fluid = {
    init(getContainerService: IGetContainerService) {
        if (globalFluid) {
            throw new Error("Fluid cannot be initialized more than once");
        }
        globalFluid = new FluidInstance(getContainerService);
    },
    async createContainer(
        id: string, config: ContainerCreateConfig): Promise<FluidContainer> {
        if (!globalFluid) {
            throw new Error("Fluid has not been properly initialized before attempting to create a container");
        }
        return globalFluid.createContainer(id, config);
    },
    async getContainer(
        id, config: ContainerConfig): Promise<FluidContainer> {
        if (!globalFluid) {
            throw new Error("Fluid has not been properly initialized before attempting to get a container");
        }
        return globalFluid.getContainer(id, config);
    },
};
