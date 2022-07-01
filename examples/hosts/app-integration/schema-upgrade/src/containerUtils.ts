/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IContainer, IFluidCodeDetails, IFluidModuleWithDetails } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { createTinyliciousCreateNewRequest } from "@fluidframework/tinylicious-driver";

import { applyStringData, fetchData } from "./dataHelpers";
import { DataMigrationService } from "./dataMigration";
import { IContainerDetails, IInventoryList } from "./interfaces";
import { TinyliciousService } from "./tinyliciousService";
import {
    InventoryListContainerRuntimeFactory as InventoryListContainerRuntimeFactory1,
} from "./version1";
import {
    InventoryListContainerRuntimeFactory as InventoryListContainerRuntimeFactory2,
} from "./version2";

export async function getInventoryListFromContainer(container: IContainer): Promise<IInventoryList> {
    // Since we're using a ContainerRuntimeFactoryWithDefaultDataStore, our inventory list is available at the URL "/".
    return requestFluidObject<IInventoryList>(container, { url: "/" });
}

const tinyliciousService = new TinyliciousService();

const loadCode = async (source: IFluidCodeDetails): Promise<IFluidModuleWithDetails> => {
    const useNewVersion = source.config?.version === "2.0";
    const containerRuntimeFactory = useNewVersion
        ? new InventoryListContainerRuntimeFactory2()
        : new InventoryListContainerRuntimeFactory1();
    return {
        module: { fluidExport: containerRuntimeFactory },
        details: { package: "no-dynamic-package", config: {} },
    };
};

const loader = new Loader({
    urlResolver: tinyliciousService.urlResolver,
    documentServiceFactory: tinyliciousService.documentServiceFactory,
    codeLoader: { load: loadCode },
});

export const createContainer = async (version: "1.0" | "2.0" = "1.0", seedData?: string):
    Promise<IContainerDetails> => {
    const container = await loader.createDetachedContainer({ package: "no-dynamic-package", config: { version } });
    const inventoryList = await getInventoryListFromContainer(container);
    const fetchedData = seedData ?? await fetchData();
    await applyStringData(inventoryList, fetchedData);
    await container.attach(createTinyliciousCreateNewRequest());

    // Discover the container ID after attaching
    const resolved = container.resolvedUrl;
    ensureFluidResolvedUrl(resolved);

    const dataMigration = await DataMigrationService.create(container);

    return { containerId: resolved.id, container, fetchedData, inventoryList, services: { dataMigration } };
};

export const loadContainer = async (containerId: string): Promise<IContainerDetails> => {
    const container = await loader.resolve({ url: containerId });
    const inventoryList = await getInventoryListFromContainer(container);
    const dataMigration = await DataMigrationService.create(container);
    return { containerId, container, inventoryList, services: { dataMigration } };
};
