/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IContainer, IFluidCodeDetails, IFluidModuleWithDetails } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { createTinyliciousCreateNewRequest } from "@fluidframework/tinylicious-driver";

import React from "react";

import { extractStringData, fetchData, applyStringData, writeData } from "../dataHelpers";
import type { IContainerKillBit, IInventoryList } from "../interfaces";
import { TinyliciousService } from "../tinyliciousService";
import {
    containerKillBitId,
    InventoryListContainerRuntimeFactory as InventoryListContainerRuntimeFactory1,
} from "../version1";
import {
    InventoryListContainerRuntimeFactory as InventoryListContainerRuntimeFactory2,
} from "../version2";

import { ContainerView } from "./containerView";

async function getInventoryListFromContainer(container: IContainer): Promise<IInventoryList> {
    // Since we're using a ContainerRuntimeFactoryWithDefaultDataStore, our inventory list is available at the URL "/".
    return requestFluidObject<IInventoryList>(container, { url: "/" });
}

async function getContainerKillBitFromContainer(container: IContainer): Promise<IContainerKillBit> {
    // Our kill bit is available at the URL containerKillBitId.
    return requestFluidObject<IContainerKillBit>(container, { url: containerKillBitId });
}

// In interacting with the service, we need to be explicit about whether we're creating a new container vs.
// loading an existing one.  If loading, we also need to provide the unique ID for the container we are
// loading from.

// In this app, we'll choose to create a new container when navigating directly to http://localhost:8080.
// A newly created container will generate its own ID, which we'll place in the URL hash.
// If navigating to http://localhost:8080#containerId, we'll load from the ID in the hash.

// These policy choices are arbitrary for demo purposes, and can be changed however you'd like.
export const App: React.FC = () => {
    // initialize the application by instantiating the backend service and loader
    const [loader, setLoader] = React.useState<Loader>();
    React.useEffect(() => {
        const tinyliciousService = new TinyliciousService();
        const load = async (source: IFluidCodeDetails): Promise<IFluidModuleWithDetails> => {
            const useNewVersion = source.config?.version === "2.0";
            const containerRuntimeFactory = useNewVersion
                ? new InventoryListContainerRuntimeFactory2()
                : new InventoryListContainerRuntimeFactory1();
            return {
                module: { fluidExport: containerRuntimeFactory },
                details: { package: "no-dynamic-package", config: {} },
            };
        };
        const theLoader = new Loader({
            urlResolver: tinyliciousService.urlResolver,
            documentServiceFactory: tinyliciousService.documentServiceFactory,
            codeLoader: { load },
        });
        setLoader(theLoader);
    }, []);

    // the application state combining the container and data components
    const [appState, setAppState] = React.useState<{
        containerId: string;
        fetchedData?: string;
        container: IContainer;
        inventoryList: IInventoryList;
        containerKillBit: IContainerKillBit;
    }>();
    // the core effect to bootstrap the application by loading/creating a container
    React.useEffect(() => {
        if (loader === undefined) {
            return;
        }
        const createContainer = async () => {
            const fetchedData = await fetchData();
            const container = await loader.createDetachedContainer({ package: "no-dynamic-package", config: {} });
            const inventoryList = await getInventoryListFromContainer(container);
            const containerKillBit = await getContainerKillBitFromContainer(container);
            await applyStringData(inventoryList, fetchedData);
            await container.attach(createTinyliciousCreateNewRequest());

            // Discover the container ID after attaching
            const resolved = container.resolvedUrl;
            ensureFluidResolvedUrl(resolved);

            // Update the application state
            setAppState({ containerId: resolved.id, fetchedData, container, inventoryList, containerKillBit });
        };
        const loadContainer = async (containerId: string) => {
            const container = await loader.resolve({ url: containerId });
            const containerKillBit = await getContainerKillBitFromContainer(container);
            const inventoryList = await getInventoryListFromContainer(container);
            setAppState({ containerId, container, inventoryList, containerKillBit });
        };
        if (location.hash.length === 0) {
            createContainer().catch(console.error);
        } else {
            loadContainer(location.hash.substring(1)).catch(console.error);
        }
    }, [loader]);

    React.useEffect(() => {
        if (appState?.containerId !== undefined) {
            // Update the URL with the actual container ID
            location.hash = appState.containerId ?? "";
            // Put the container ID in the tab title
            document.title = appState.containerId ?? "Loading...";
        }
    }, [appState]);

    const writeToExternalStorage = React.useCallback(async () => {
        if (appState === undefined) {
            return "";
        }
        // CONSIDER: it's perhaps more-correct to spawn a new client to extract with (to avoid local changes).
        // This can be done by making a loader.request() call with appropriate headers (same as we do for the
        // summarizing client).  E.g.
        // const exportContainer = await loader.resolve(...);
        // const inventoryList = (await exportContainer.request(...)).value;
        // const stringData = extractStringData(inventoryList);
        // exportContainer.close();

        const stringData = await extractStringData(appState.inventoryList);
        await writeData(stringData);

        // Normally would be a void, we return the string here for demo purposes only.
        return stringData;
    }, [appState]);

    const saveAndEndSession = React.useCallback(async () => {
        if (appState === undefined) {
            return;
        }
        const { containerKillBit, inventoryList } = appState;

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
    }, [appState]);

    const migrateContainer = React.useCallback(async () => {
        if (loader === undefined || appState === undefined) {
            return;
        }
        let { container } = appState;
        // 1. End the current session, export data from the container and close it
        const fetchedData = await saveAndEndSession();
        container.close();
        // 2. Create a new detached container with code version 2.0
        container = await loader.createDetachedContainer({
            package: "no-dynamic-package", config: { version: "2.0" },
        });
        const inventoryList = await getInventoryListFromContainer(container);
        const containerKillBit = await getContainerKillBitFromContainer(container);
        // 3. Hydrate the container with transformed data
        if (fetchedData !== undefined) {
            await applyStringData(inventoryList, fetchedData);
            inventoryList.addItem("migrated", 13);
        }
        // 4. Go live!
        await container.attach(createTinyliciousCreateNewRequest());

        // Discover the container ID after attaching
        const resolved = container.resolvedUrl;
        ensureFluidResolvedUrl(resolved);

        // Update the application state with new container and components
        setAppState({ containerId: resolved.id, fetchedData, container, inventoryList, containerKillBit });
    }, [loader, appState, saveAndEndSession]);

    if (appState === undefined) {
        // do not render anything until the container is ready
        return null;
    }

    // Given an IInventoryList, we can render the list and provide controls for users to modify it.
    return (
        <ContainerView
            containerId={appState.containerId}
            importedStringData={appState.fetchedData}
            inventoryList={appState.inventoryList}
            writeToExternalStorage={writeToExternalStorage}
            containerKillBit={appState.containerKillBit}
            saveAndEndSession={saveAndEndSession}
            migrateContainer={migrateContainer}
        />
    );
};
