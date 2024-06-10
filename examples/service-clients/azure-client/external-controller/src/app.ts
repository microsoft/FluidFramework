/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	AzureClient,
	AzureContainerServices,
	AzureLocalConnectionConfig,
	AzureRemoteConnectionConfig,
} from "@fluidframework/azure-client";
import { createDevtoolsLogger, initializeDevtools } from "@fluidframework/devtools/internal";
import { ISharedMap, IValueChanged, SharedMap } from "@fluidframework/map/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";
import { IFluidContainer } from "fluid-framework";
import { v4 as uuid } from "uuid";

import { AzureFunctionTokenProvider } from "./AzureFunctionTokenProvider.js";
import { DiceRollerController, DiceRollerControllerProps } from "./controller.js";
import { makeAppView } from "./view.js";

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
	id: user.id,
	name: user.name,
	additionalDetails: userDetails,
};

const connectionConfig: AzureRemoteConnectionConfig | AzureLocalConnectionConfig = useAzure
	? {
			type: "remote",
			tenantId: "",
			tokenProvider: new AzureFunctionTokenProvider("", azureUser),
			endpoint: "",
	  }
	: {
			type: "local",
			tokenProvider: new InsecureTokenProvider("fooBar", user),
			endpoint: "http://localhost:7070",
	  };

// Define the schema of our Container.
// This includes the DataObjects we support and any initial DataObjects we want created
// when the Container is first created.
const containerSchema = {
	initialObjects: {
		/* [id]: DataObject */
		map1: SharedMap,
		map2: SharedMap,
	},
};

function createDiceRollerControllerProps(map: ISharedMap): DiceRollerControllerProps {
	return {
		get: (key: string) => map.get(key) as number,
		set: (key: string, value: unknown) => map.set(key, value),
		on(
			event: "valueChanged",
			listener: (args: IValueChanged) => void,
		): DiceRollerControllerProps {
			map.on(event, listener);
			return this;
		},
		off(
			event: "valueChanged",
			listener: (args: IValueChanged) => void,
		): DiceRollerControllerProps {
			map.on(event, listener);
			return this;
		},
	};
}

function createDiceRollerControllerPropsFromContainer(
	container: IFluidContainer,
): [DiceRollerControllerProps, DiceRollerControllerProps] {
	const diceRollerController1Props: DiceRollerControllerProps = createDiceRollerControllerProps(
		container.initialObjects.map1 as ISharedMap,
	);
	const diceRollerController2Props: DiceRollerControllerProps = createDiceRollerControllerProps(
		container.initialObjects.map2 as ISharedMap,
	);
	return [diceRollerController1Props, diceRollerController2Props];
}

async function initializeNewContainer(
	container: IFluidContainer,
): Promise<[DiceRollerControllerProps, DiceRollerControllerProps]> {
	const [diceRollerController1Props, diceRollerController2Props] =
		createDiceRollerControllerPropsFromContainer(container);

	// Initialize both of our SharedMaps for usage with a DiceRollerController
	await Promise.all([
		DiceRollerController.initializeModel(diceRollerController1Props),
		DiceRollerController.initializeModel(diceRollerController2Props),
	]);

	return [diceRollerController1Props, diceRollerController2Props];
}

async function start(): Promise<void> {
	// Create a custom ITelemetryBaseLogger object to pass into the Tinylicious container
	// and hook to the Telemetry system
	const baseLogger = createChildLogger();

	// Wrap telemetry logger for use with Devtools
	const devtoolsLogger = createDevtoolsLogger(baseLogger);

	const clientProps = {
		connection: connectionConfig,
		logger: devtoolsLogger,
	};
	const client = new AzureClient(clientProps);
	let container: IFluidContainer;
	let services: AzureContainerServices;
	let id: string;

	// Get or create the document depending if we are running through the create new flow
	let diceRollerController1Props: DiceRollerControllerProps;
	let diceRollerController2Props: DiceRollerControllerProps;
	const createNew = location.hash.length === 0;
	if (createNew) {
		// The client will create a new detached container using the schema
		// A detached container will enable the app to modify the container before attaching it to the client
		({ container, services } = await client.createContainer(containerSchema, "2"));
		// const map1 = container.initialObjects.map1 as ISharedMap;
		// map1.set("diceValue", 1);
		// const map2 = container.initialObjects.map1 as ISharedMap;
		// map2.set("diceValue", 1);
		// console.log(map1.get("diceValue"));
		// Initialize our models so they are ready for use with our controllers
		[diceRollerController1Props, diceRollerController2Props] =
			await initializeNewContainer(container);

		// If the app is in a `createNew` state, and the container is detached, we attach the container.
		// This uploads the container to the service and connects to the collaboration session.
		id = await container.attach();
		// The newly attached container is given a unique ID that can be used to access the container in another session
		// eslint-disable-next-line require-atomic-updates
		location.hash = id;
	} else {
		id = location.hash.slice(1);
		// Use the unique container ID to fetch the container created earlier.  It will already be connected to the
		// collaboration session.
		({ container, services } = await client.getContainer(id, containerSchema, "2"));
		[diceRollerController1Props, diceRollerController2Props] =
			createDiceRollerControllerPropsFromContainer(container);
	}

	document.title = id;

	// Initialize Devtools
	initializeDevtools({
		logger: devtoolsLogger,
		initialContainers: [
			{
				container,
				containerKey: "Dice Roller Container",
			},
		],
	});

	// Here we are guaranteed that the maps have already been initialized for use with a DiceRollerController
	const diceRollerController1 = new DiceRollerController(diceRollerController1Props);
	const diceRollerController2 = new DiceRollerController(diceRollerController2Props);

	const contentDiv = document.querySelector("#content") as HTMLDivElement;
	contentDiv.append(
		makeAppView([diceRollerController1, diceRollerController2], services.audience),
	);
}

await start();
