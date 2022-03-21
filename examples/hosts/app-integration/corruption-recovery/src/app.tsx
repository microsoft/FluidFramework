/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import ReactDOM from "react-dom";

import { AzureClient } from "@fluidframework/azure-client";

import { IFluidContainer, SharedMap } from "fluid-framework";
import { DataController } from "./dataController";
import { RecoveryAgent } from "./recoveryAgent";
import { connectionConfig } from "./azureConfig";

import { AppView } from "./appView";

// Define the schema of our Container.
const containerSchema = {
    initialObjects: {
        dataMap: SharedMap,
        recoveryMap: SharedMap,
    },
};

async function initializeData(container: IFluidContainer): Promise<void> {
    const sharedMap = container.initialObjects.dataMap as SharedMap;
    await Promise.all([DataController.initializeModel(sharedMap)]);
}

async function createRecoveryAgent(
    container: IFluidContainer,
    containerId: string,
): Promise<void> {
    const rollContainerId = await RecoveryAgent.createRecoveryAgent(
        containerId,
    );
    const recMap = container.initialObjects.recoveryMap as SharedMap;
    recMap.set("recoverContainerId", rollContainerId);
}

function cleanRecoveryAgent(container: IFluidContainer): void {
    const recMap = container.initialObjects.recoveryMap as SharedMap;
    recMap.set("recoverContainerId", "");
}

async function getRecoveryAgent(
    container: IFluidContainer,
): Promise<RecoveryAgent | undefined> {
    const recMap = container.initialObjects.recoveryMap as SharedMap;
    let recoveryContainerId = recMap.get<string>("recoverContainerId");

    if (!(recoveryContainerId ?? "")) {
        await new Promise<void>((resolve) =>
            recMap.once("valueChanged", () => resolve()),
        );
        recoveryContainerId = recMap.get("recoverContainerId");
    }

    return RecoveryAgent.getRecoveryAgent(
        recoveryContainerId ?? "",
        containerSchema,
    );
}

async function start(): Promise<void> {
    const clientProps = {
        connection: connectionConfig,
    };
    const client = new AzureClient(clientProps);
    let container: IFluidContainer;
    let containerId: string;

    const div = document.getElementById("content") as HTMLDivElement;
    ReactDOM.render(
        <div className="d-flex justify-content-center m-5">
            <div className="spinner-border" role="status" />
        </div>,
        div,
    );

    // Get or create the document depending if we are running through the create new flow
    const createNew = location.hash.length === 0;
    if (createNew) {
        // The client will create a new detached container using the schema
        // A detached container will enable the app to modify the container before attaching it to the client
        ({ container } = await client.createContainer(containerSchema));

        // Initialize our models so they are ready for use with our controllers
        await initializeData(container);

        // If the app is in a `createNew` state, and the container is detached, we attach the container.
        // This uploads the container to the service and connects to the collaboration session.
        containerId = await container.attach();

        // Setup recovery agent
        await createRecoveryAgent(container, containerId);

        // The newly attached container is given a unique ID that can be used to access the container in another session
        location.hash = containerId;
    } else {
        containerId = location.hash.substring(1);
        // Use the unique container ID to fetch the container created earlier.  It will already be connected to the
        // collaboration session.
        ({ container } = await client.getContainer(
            containerId,
            containerSchema,
        ));
    }

    const dataMap = container.initialObjects.dataMap as SharedMap;
    const dataController = new DataController(dataMap);

    const updateCounter = async () => {
        dataController.updateData();
    };

    const forceCorruption = async () => {
        recoveryAgent?.markCorrupted();
    };

    const recoverContainer = async () => {
        const recDocId = await recoveryAgent?.recoverDoc((c) => {
            cleanRecoveryAgent(c);
        });

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!recDocId) {
            throw new Error("Could not recover doc.");
        }

        const resp = await client.getContainer(recDocId, containerSchema);
        await createRecoveryAgent(resp.container, recDocId);
    };

    const recoveryAgent = await getRecoveryAgent(container);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    recoveryAgent?.once("recoveryInfoChanged", recoverContainer);

    ReactDOM.render(
        <AppView
            recoveryAgent={recoveryAgent}
            dataController={dataController}
            updateCounter={updateCounter}
            forceCorruption={forceCorruption}
        />,
        div,
    );
}

start().catch((error) => console.error(error));
