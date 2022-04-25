/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import ReactDOM from "react-dom";

import { AzureClient } from "@fluidframework/azure-client";

import { ContainerSchema, IFluidContainer, SharedMap } from "fluid-framework";
import { DataController } from "./dataController";
import { RecoveryAgent } from "./recoveryAgent";
import { connectionConfig } from "./azureConfig";

import { AppView } from "./appView";

// Define the schema of our Container.
const containerSchema = {
    initialObjects: {
        dataMap: SharedMap,
    },
};

async function initializeData(container: IFluidContainer): Promise<void> {
    const sharedMap = container.initialObjects.dataMap as SharedMap;
    await Promise.all([DataController.initializeModel(sharedMap)]);
}

function createRecoveryAgent(
    containerId: string,
    schema: ContainerSchema,
): RecoveryAgent {
    return RecoveryAgent.createRecoveryAgent(
        containerId,
        schema,
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

    const recoveryAgent = createRecoveryAgent(containerId, containerSchema);

    const updateCounter = async () => {
        dataController.updateData();
    };

    const recoverContainer = async () => {
        await recoveryAgent?.startRecovery();
    };

    ReactDOM.render(
        <AppView
            recoveryAgent={recoveryAgent}
            dataController={dataController}
            updateCounter={updateCounter}
            recoverContainer={recoverContainer}
        />,
        div,
    );
}

start().catch((error) => console.error(error));
