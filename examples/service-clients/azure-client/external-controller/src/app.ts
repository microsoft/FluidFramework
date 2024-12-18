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
import { createDevtoolsLogger, initializeDevtools } from "@fluidframework/devtools/beta";
import { ISharedMap, IValueChanged, SharedMap } from "@fluidframework/map/legacy";
import {
	acquirePresenceViaDataObject,
	ExperimentalPresenceManager,
} from "@fluidframework/presence/alpha";
import { createChildLogger } from "@fluidframework/telemetry-utils/legacy";
// eslint-disable-next-line import/no-internal-modules -- #26985: `test-runtime-utils` internal used in example
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";
import type { ContainerSchema } from "fluid-framework";
import { IFluidContainer } from "fluid-framework";
import { v4 as uuid } from "uuid";

import { AzureFunctionTokenProvider } from "./AzureFunctionTokenProvider.js";
import {
	DiceRollerController,
	DiceRollerControllerProps,
	type DieValue,
} from "./controller.js";
import { buildDicePresence } from "./presence.js";
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
		// A Presence Manager object temporarily needs to be placed within container schema
		// https://github.com/microsoft/FluidFramework/blob/main/packages/framework/presence/README.md#onboarding
		presence: ExperimentalPresenceManager,
	},
} satisfies ContainerSchema;
type DiceRollerContainerSchema = typeof containerSchema;

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
	container: IFluidContainer<DiceRollerContainerSchema>,
): [DiceRollerControllerProps, DiceRollerControllerProps] {
	const diceRollerController1Props: DiceRollerControllerProps =
		createDiceRollerControllerProps(container.initialObjects.map1);
	const diceRollerController2Props: DiceRollerControllerProps =
		createDiceRollerControllerProps(container.initialObjects.map2);
	return [diceRollerController1Props, diceRollerController2Props];
}

async function initializeNewContainer(
	container: IFluidContainer<DiceRollerContainerSchema>,
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
	let container: IFluidContainer<DiceRollerContainerSchema>;
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

	// Biome insist on no semicolon - https://dev.azure.com/fluidframework/internal/_workitems/edit/9083
	// eslint-disable-next-line @typescript-eslint/member-delimiter-style
	const lastRoll: { die1?: DieValue; die2?: DieValue } = {};
	const presence = acquirePresenceViaDataObject(container.initialObjects.presence);
	const states = buildDicePresence(presence).props;

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
	const diceRollerController1 = new DiceRollerController(
		diceRollerController1Props,
		(value) => {
			lastRoll.die1 = value;
			states.lastRoll.local = lastRoll;
			states.lastDiceRolls.local.set("die1", { value });
		},
	);
	const diceRollerController2 = new DiceRollerController(
		diceRollerController2Props,
		(value) => {
			lastRoll.die2 = value;
			states.lastRoll.local = lastRoll;
			states.lastDiceRolls.local.set("die2", { value });
		},
	);

	// lastDiceRolls is here just to demonstrate an example of LatestMap
	// Its updates are only logged to the console.
	states.lastDiceRolls.events.on("itemUpdated", (update) => {
		console.log(
			`Client ${update.client.sessionId.slice(0, 8)}'s ${update.key} rolled to ${update.value.value}`,
		);
	});

	const contentDiv = document.querySelector("#content") as HTMLDivElement;
	contentDiv.append(
		makeAppView(
			[diceRollerController1, diceRollerController2],
			{ presence, lastRoll: states.lastRoll },
			services.audience,
		),
	);
}

await start();
