/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { createContainer, loadContainer } from "../containerUtils";
import { extractStringData, writeData } from "../dataHelpers";
import type { IContainerDetails } from "../interfaces";

import { ContainerView } from "./containerView";

// In interacting with the service, we need to be explicit about whether we're creating a new container vs.
// loading an existing one.  If loading, we also need to provide the unique ID for the container we are
// loading from.

// In this app, we'll choose to create a new container when navigating directly to http://localhost:8080.
// A newly created container will generate its own ID, which we'll place in the URL hash.
// If navigating to http://localhost:8080#containerId, we'll load from the ID in the hash.

// These policy choices are arbitrary for demo purposes, and can be changed however you'd like.
export const App: React.FC = () => {
    const [appState, setAppState] = React.useState<IContainerDetails>();

    // the core effect to bootstrap the application by loading/creating a container
    React.useEffect(() => {
        if (location.hash.length === 0) {
            createContainer()
                .then((details) => setAppState({ ...details }))
                .catch(console.error);
        } else {
            loadContainer(location.hash.substring(1))
                .then((details) => setAppState({ ...details }))
                .catch(console.error);
        }
    }, []);

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
        const { services, inventoryList } = appState;
        const fetchedData = await services.dataMigration.saveAndEndSession(inventoryList);
        return fetchedData;
    }, [appState]);

    const migrateContainer = React.useCallback(async () => {
        if (appState === undefined) {
            return;
        }
        const { container, services, inventoryList } = appState;

        // 1. End the current session, export data from the container and close it
        const fetchedData = await services.dataMigration.saveAndEndSession(inventoryList);

        // 2. Close the container instance
        container.close();

        // 3. Create a new container instance and seed it with exported data
        const containerDetails = await createContainer("2.0", fetchedData);

        // Update the application state with new container and components
        setAppState(containerDetails);
    }, [appState]);

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
            containerKillBit={appState.services.dataMigration.containerKillBit}
            saveAndEndSession={saveAndEndSession}
            migrateContainer={migrateContainer}
        />
    );
};
