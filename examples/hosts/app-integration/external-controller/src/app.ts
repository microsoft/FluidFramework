/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    AzureFunctionTokenProvider,
    AzureClient,
    AzureConnectionConfig,
    InsecureTokenProvider,
    AzureResources,
} from "@fluidframework/azure-client";
import { AttachState } from "@fluidframework/container-definitions";
import { generateUser } from "@fluidframework/server-services-client";
import { SharedMap } from "fluid-framework";
import { DiceRollerController } from "./controller";
import { ConsoleLogger } from "./ConsoleLogger";
import { renderAudience, renderDiceRoller } from "./view";

export interface ICustomUserDetails {
    gender: string;
    email: string;
}

const userDetails: ICustomUserDetails = {
    gender: "female",
    email: "xyz@microsoft.com",
};

// Define the server we will be using and initialize Fluid
const useAzure = process.env.FLUID_CLIENT === "azure";

const user = generateUser() as any;

const azureUser = {
    userId: user.id,
    userName: user.name,
    additionalDetails: userDetails,
};

const connectionConfig: AzureConnectionConfig = useAzure ? {
    tenantId: "",
    tokenProvider: new AzureFunctionTokenProvider("", azureUser),
    orderer: "",
    storage: "",
} : {
    tenantId: "local",
    tokenProvider: new InsecureTokenProvider("fooBar", user),
    orderer: "http://localhost:7070",
    storage: "http://localhost:7070",
};

// Define the schema of our Container.
// This includes the DataObjects we support and any initial DataObjects we want created
// when the container is first created.
const containerSchema = {
    name: "dice-roller-container",
    initialObjects: {
        /* [id]: DataObject */
        map1: SharedMap,
        map2: SharedMap,
    },
};

async function start(): Promise<void> {
    // Create a custom ITelemetryBaseLogger object to pass into the Tinylicious container
    // and hook to the Telemetry system
    const consoleLogger: ConsoleLogger = new ConsoleLogger();

    const client = new AzureClient(connectionConfig, consoleLogger);
    let resources: AzureResources;

    // Get or create the document depending if we are running through the create new flow
    const createNew = !location.hash;
    if (createNew) {
        // The client will create a new detached container using the schema
        // A detached container will all our app to modify the container before attaching it to the client
        resources = await client.createDetachedContainer(containerSchema);
        // The new container has its own unique ID that can be used to access it in another session
        location.hash = resources.fluidContainer.id;
    } else {
        const containerId = location.hash.substring(1);
        // Use the unique container ID to fetch the container created earlier
        resources = await client.getContainer(containerId, containerSchema);
    }

    // create/get container API returns a combination of the container and associated container services
    const { fluidContainer, containerServices } = resources;
    document.title = fluidContainer.id;

    // We now get the first SharedMap from the container
    const sharedMap1 = fluidContainer.initialObjects.map1 as SharedMap;

    // Our controller manipulates the data object (model).
    const diceRollerController = new DiceRollerController(sharedMap1);
    await diceRollerController.initialize(createNew);

    // We create a view which uses the controller.
    const contentDiv = document.getElementById("content") as HTMLDivElement;
    const div1 = document.createElement("div");
    contentDiv.appendChild(div1);

    // We now get the second SharedMap from the container
    const sharedMap2 = fluidContainer.initialObjects.map2 as SharedMap;

    // Our controller manipulates the data object (model).
    const diceRollerController2 = new DiceRollerController(sharedMap2);
    await diceRollerController2.initialize(createNew);

    // We create a second view which uses the second controller.
    const div2 = document.createElement("div");
    contentDiv.appendChild(div2);

    // If the app is in a `createNew` state, and the container is detached, we attach the container
    // so that any new ops are communicated to the client
    if (createNew && fluidContainer.attachState === AttachState.Detached) {
        await fluidContainer.attach();
    }

    // Now that the container is attached, our app can render the views and listen for updates
    renderDiceRoller(diceRollerController, div1);
    renderDiceRoller(diceRollerController2, div2);

    // Render the audience information for the members currently in the session
    renderAudience(containerServices.audience, contentDiv);
}

start().catch(console.error);
