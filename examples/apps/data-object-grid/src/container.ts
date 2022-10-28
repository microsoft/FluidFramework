/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory } from "@fluid-example/example-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import { DataObjectGrid, IDataObjectGrid } from "./dataObjectGrid";

export interface IDataObjectGridAppModel {
    readonly dataObjectGrid: IDataObjectGrid;
}

class DataObjectGridAppModel implements IDataObjectGridAppModel {
    public constructor(public readonly dataObjectGrid: IDataObjectGrid) { }
}

const dataObjectGridId = "data-object-grid";

export class DataObjectGridContainerRuntimeFactory
    extends ModelContainerRuntimeFactory<IDataObjectGridAppModel> {
    constructor() {
        super(
            new Map([
                DataObjectGrid.getFactory().registryEntry,
            ]), // registryEntries
        );
    }

    /**
     * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const inventoryList = await runtime.createDataStore(DataObjectGrid.getFactory().type);
        await inventoryList.trySetAlias(dataObjectGridId);
    }

    /**
     * {@inheritDoc ModelContainerRuntimeFactory.createModel}
     */
    protected async createModel(runtime: IContainerRuntime, container: IContainer) {
        const dataObjectGrid = await requestFluidObject<IDataObjectGrid>(
            await runtime.getRootDataStore(dataObjectGridId),
            "",
        );
        return new DataObjectGridAppModel(dataObjectGrid);
    }
}
