/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    AzureFunctionTokenProvider,
    AzureClient,
    AzureConnectionConfig,
    AzureContainerServices,
} from "@fluidframework/azure-client";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils";
import {
    FluidContainer,
    SharedMap,
} from "fluid-framework";
import { v4 as uuid } from "uuid";
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

const user = {
    id: uuid(),
    name: uuid(),
};

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
    initialObjects: {
        /* [id]: DataObject */
        map1: SharedMap,
        map2: SharedMap,
    },
};

async function start(): Promise<void> {
    // Create a custom ITelemetryBaseLogger object to pass into the Tinylicious container
    // and hook to the Telemetry system
    const azureConfig = {
        connectionConfig,
        logger: new ConsoleLogger(),
    };
    const client = new AzureClient(azureConfig);
    let container: FluidContainer;
    let services: AzureContainerServices;
    let id: string;

    // Get or create the document depending if we are running through the create new flow
    const createNew = !location.hash;
    if (createNew) {
        // The client will create a new detached container using the schema
        // A detached container will enable the app to modify the container before attaching it to the client
        ({container, services} = await client.createContainer(containerSchema));

        // If the app is in a `createNew` state, and the container is detached, we attach the container
        // so that all new ops are communicated to the client
        id = await container.attach();
        // The newly attached container is given a unique ID that can be used to access the container in another session
        location.hash = id;
    } else {
        id = location.hash.substring(1);
        // Use the unique container ID to fetch the container created earlier
        ({container, services} = await client.getContainer(id, containerSchema));
    }

    document.title = id;

    // We now get the first SharedMap from the container
    const sharedMap1 = container.initialObjects.map1 as SharedMap;

    // Our controller manipulates the data object (model).
    const diceRollerController = new DiceRollerController(sharedMap1);
    await diceRollerController.initialize(createNew);

    // We create a view which uses the controller.
    const contentDiv = document.getElementById("content") as HTMLDivElement;
    const div1 = document.createElement("div");
    contentDiv.appendChild(div1);

    // We now get the second SharedMap from the container
    const sharedMap2 = container.initialObjects.map2 as SharedMap;

    // Our controller manipulates the data object (model).
    const diceRollerController2 = new DiceRollerController(sharedMap2);
    await diceRollerController2.initialize(createNew);

    // We create a second view which uses the second controller.
    const div2 = document.createElement("div");
    contentDiv.appendChild(div2);

    // Now that the container is attached, our app can render the views and listen for updates
    renderDiceRoller(diceRollerController, div1);
    renderDiceRoller(diceRollerController2, div2);

    // Render the audience information for the members currently in the session
    renderAudience(services.audience, contentDiv);
}

start().catch(console.error);
