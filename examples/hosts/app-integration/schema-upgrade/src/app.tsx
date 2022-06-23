/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer, IFluidModuleWithDetails } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { createTinyliciousCreateNewRequest } from "@fluidframework/tinylicious-driver";

import React from "react";
import ReactDOM from "react-dom";

import { AppView } from "./appView";
import { extractStringData, fetchData, applyStringData, writeData } from "./dataHelpers";
import type { IContainerKillBit, IInventoryList } from "./interfaces";
import { TinyliciousService } from "./tinyliciousService";
import {
    containerKillBitId,
    InventoryListContainerRuntimeFactory as InventoryListContainerRuntimeFactory1,
} from "./version1";
import {
    InventoryListContainerRuntimeFactory as InventoryListContainerRuntimeFactory2,
} from "./version2";

async function getInventoryListFromContainer(container: IContainer): Promise<IInventoryList> {
    // Our inventory list is available at the URL "/".
    return requestFluidObject<IInventoryList>(container, { url: "/" });
}

async function getContainerKillBitFromContainer(container: IContainer): Promise<IContainerKillBit> {
    // Our kill bit is available at the URL containerKillBitId.
    return requestFluidObject<IContainerKillBit>(container, { url: containerKillBitId });
}

async function createNewContainer(externalStringData?: string) {
    const tinyliciousService = new TinyliciousService();

    const load = async (): Promise<IFluidModuleWithDetails> => {
        // TODO: Use some reasonable logic to select the appropriate container code to load from.
        const useNewVersion = false;
        const containerRuntimeFactory = useNewVersion
            ? new InventoryListContainerRuntimeFactory2()
            : new InventoryListContainerRuntimeFactory1();

        return {
            module: { fluidExport: containerRuntimeFactory },
            details: { package: "no-dynamic-package", config: {} },
        };
    };
    const codeLoader = { load };

    const loader = new Loader({
        urlResolver: tinyliciousService.urlResolver,
        documentServiceFactory: tinyliciousService.documentServiceFactory,
        codeLoader,
    });

    const container = await loader.createDetachedContainer({ package: "no-dynamic-package", config: {} });
    if (externalStringData !== undefined) {
        const inventoryList = await getInventoryListFromContainer(container);
        await applyStringData(inventoryList, externalStringData);
    }
    await container.attach(createTinyliciousCreateNewRequest());

    return container;
}

async function start(): Promise<void> {
    const tinyliciousService = new TinyliciousService();

    const load = async (): Promise<IFluidModuleWithDetails> => {
        // TODO: Use some reasonable logic to select the appropriate container code to load from.
        const useNewVersion = false;
        const containerRuntimeFactory = useNewVersion
            ? new InventoryListContainerRuntimeFactory2()
            : new InventoryListContainerRuntimeFactory1();

        return {
            module: { fluidExport: containerRuntimeFactory },
            details: { package: "no-dynamic-package", config: {} },
        };
    };
    const codeLoader = { load };

    const loader = new Loader({
        urlResolver: tinyliciousService.urlResolver,
        documentServiceFactory: tinyliciousService.documentServiceFactory,
        codeLoader,
    });

    let fetchedData: string | undefined;
    let container: IContainer;
    let containerId: string;

    // In interacting with the service, we need to be explicit about whether we're creating a new container vs.
    // loading an existing one.  If loading, we also need to provide the unique ID for the container we are
    // loading from.

    // In this app, we'll choose to create a new container when navigating directly to http://localhost:8080.
    // A newly created container will generate its own ID, which we'll place in the URL hash.
    // If navigating to http://localhost:8080#containerId, we'll load from the ID in the hash.

    // These policy choices are arbitrary for demo purposes, and can be changed however you'd like.
    if (location.hash.length === 0) {
        fetchedData = await fetchData();
        container = await createNewContainer(fetchedData);

        // Discover the container ID after attaching
        const resolved = container.resolvedUrl;
        ensureFluidResolvedUrl(resolved);
        containerId = resolved.id;

        // Update the URL with the actual container ID
        location.hash = containerId;
    } else {
        containerId = location.hash.substring(1);
        container = await loader.resolve({ url: containerId });
    }

    // Put the container ID in the tab title
    document.title = containerId;

    const inventoryList = await getInventoryListFromContainer(container);
    const containerKillBit = await getContainerKillBitFromContainer(container);

    const writeToExternalStorage = async () => {
        // CONSIDER: it's perhaps more-correct to spawn a new client to extract with (to avoid local changes).
        // This can be done by making a loader.request() call with appropriate headers (same as we do for the
        // summarizing client).  E.g.
        // const exportContainer = await loader.resolve(...);
        // const inventoryList = (await exportContainer.request(...)).value;
        // const stringData = extractStringData(inventoryList);
        // exportContainer.close();

        const stringData = await extractStringData(inventoryList);
        await writeData(stringData);

        // Normally would be a void, we return the string here for demo purposes only.
        return stringData;
    };

    const saveAndEndSession = async () => {
        if (!containerKillBit.markedForDestruction) {
            await containerKillBit.markForDestruction();
        }

        if (containerKillBit.dead) {
            return undefined;
        }

        // After the quorum proposal is accepted, our system doesn't allow further edits to the string
        // So we can immediately get the data out even before taking the lock.
        const stringData = await extractStringData(inventoryList);
        if (containerKillBit.dead) {
            return stringData;
        }

        await containerKillBit.volunteerForDestruction();
        if (containerKillBit.dead) {
            return stringData;
        }

        await writeData(stringData);
        if (!containerKillBit.haveDestructionTask()) {
            throw new Error("Lost task during write");
        } else {
            await containerKillBit.setDead();
        }
        return stringData;
    };

    const migrateContainer = async () => {
        const exportedData = await saveAndEndSession();
        container.close();
        container = await createNewContainer(exportedData);

        // Discover the container ID after attaching
        const resolved = container.resolvedUrl;
        ensureFluidResolvedUrl(resolved);
        containerId = resolved.id;

        location.hash = containerId;
        document.title = containerId;
    };

    // Given an IInventoryList, we can render the list and provide controls for users to modify it.
    const div = document.getElementById("content") as HTMLDivElement;
    ReactDOM.render(
        <AppView
            importedStringData={ fetchedData }
            inventoryList={ inventoryList }
            writeToExternalStorage={ writeToExternalStorage }
            containerKillBit={ containerKillBit }
            saveAndEndSession={ saveAndEndSession }
            migrateContainer={ migrateContainer }
        />,
        div,
    );
}

start().catch((error) => console.error(error));
