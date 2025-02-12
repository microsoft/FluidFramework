/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	AzureClient,
	type AzureContainerServices,
	AzureLocalConnectionConfig,
	AzureRemoteConnectionConfig,
} from "@fluidframework/azure-client";
import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { ContainerSchema, type IFluidContainer } from "@fluidframework/fluid-static";
import {
	acquirePresenceViaDataObject,
	ExperimentalPresenceManager,
	type ExperimentalPresenceDO,
	type IPresence,
	type ISessionClient,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/presence/alpha";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";
import { timeoutPromise } from "@fluidframework/test-utils/internal";

import { ScopeType } from "../AzureClientFactory.js";
import { createAzureTokenProvider } from "../AzureTokenFactory.js";
import { configProvider } from "../utils.js";

import { MessageFromChild, MessageToChild } from "./messageTypes.js";

type MessageFromParent = MessageToChild;
type MessageToParent = Required<MessageFromChild>;
interface UserIdAndName {
	id: string;
	name: string;
}

const connectTimeoutMs = 10_000;
// Identifier given to child process
const process_id = process.argv[2];

const useAzure = process.env.FLUID_CLIENT === "azure";
const tenantId = useAzure
	? (process.env.azure__fluid__relay__service__tenantId as string)
	: "frs-client-tenant";
const endPoint = process.env.azure__fluid__relay__service__endpoint as string;
if (useAzure && endPoint === undefined) {
	throw new Error("Azure Fluid Relay service endpoint is missing");
}

/**
 * Get or create a Fluid container with Presence in initialObjects.
 */
const getOrCreatePresenceContainer = async (
	id: string | undefined,
	user: UserIdAndName,
	config?: ReturnType<typeof configProvider>,
	scopes?: ScopeType[],
): Promise<{
	container: IFluidContainer;
	presence: IPresence;
	services: AzureContainerServices;
	client: AzureClient;
	containerId: string;
}> => {
	let container: IFluidContainer;
	let containerId: string;
	const connectionProps: AzureRemoteConnectionConfig | AzureLocalConnectionConfig = useAzure
		? {
				tenantId,
				tokenProvider: createAzureTokenProvider(user.id ?? "foo", user.name ?? "bar", scopes),
				endpoint: endPoint,
				type: "remote",
			}
		: {
				tokenProvider: new InsecureTokenProvider("fooBar", user, scopes),
				endpoint: "http://localhost:7071",
				type: "local",
			};
	const client = new AzureClient({ connection: connectionProps });
	const schema: ContainerSchema = {
		initialObjects: {
			presence: ExperimentalPresenceManager,
		},
	};
	let services: AzureContainerServices;
	if (id === undefined) {
		({ container, services } = await client.createContainer(schema, "2"));
		containerId = await container.attach();
	} else {
		containerId = id;
		({ container, services } = await client.getContainer(containerId, schema, "2"));
	}
	/**
	 * Fluid container should be connected here as the creating client connects to a container when it calls the container's attach method.
	 * A subsequent client connects to the attached container by calling the client's getContainer method.
	 * See {@link https://fluidframework.com/docs/build/containers#connecting-to-a-container}
	 */
	if (container.connectionState !== ConnectionState.Connected) {
		await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
			durationMs: connectTimeoutMs,
			errorMsg: "container connect() timeout",
		});
	}
	assert.strictEqual(
		container.attachState,
		AttachState.Attached,
		"Container is not attached after attach is called",
	);

	const presence = acquirePresenceViaDataObject(
		container.initialObjects.presence as ExperimentalPresenceDO,
	);
	return {
		client,
		container,
		presence,
		services,
		containerId,
	};
};
function createSendFunction(): (msg: MessageToParent) => void {
	if (process.send) {
		return process.send.bind(process);
	}
	throw new Error("process.send is not defined");
}

const send = createSendFunction();

function isConnected(container: IFluidContainer | undefined): boolean {
	return container !== undefined && container.connectionState === ConnectionState.Connected;
}

class MessageHandler {
	public presence: IPresence | undefined;
	public container: IFluidContainer | undefined;
	public containerId: string | undefined;

	public async onMessage(msg: MessageFromParent): Promise<void> {
		switch (msg.command) {
			// Respond to connect command by connecting to Fluid container with the provided user information.
			case "connect": {
				// Check if valid user information has been provided by parent/orchestrator
				if (!msg.user) {
					send({ event: "error", error: `${process_id}: No azure user information given` });
					break;
				}
				// Check if already connected to container
				if (isConnected(this.container)) {
					send({ event: "error", error: `${process_id}: Already connected to container` });
					break;
				}
				const { container, presence, containerId } = await getOrCreatePresenceContainer(
					msg.containerId,
					msg.user,
				);
				this.container = container;
				this.presence = presence;
				this.containerId = containerId;

				// Listen for presence events to notify parent/orchestrator when a new attendee joins or leaves the session.
				presence.events.on("attendeeJoined", (attendee: ISessionClient) => {
					const m: MessageToParent = {
						event: "attendeeJoined",
						sessionId: attendee.sessionId,
					};
					send(m);
				});
				presence.events.on("attendeeDisconnected", (attendee: ISessionClient) => {
					const m: MessageToParent = {
						event: "attendeeDisconnected",
						sessionId: attendee.sessionId,
					};
					send(m);
				});
				send({ event: "ready", containerId, sessionId: presence.getMyself().sessionId });

				break;
			}

			// Respond to disconnect command by disconnecting self from Fluid container.
			case "disconnectSelf": {
				if (!this.container) {
					send({ event: "error", error: `${process_id} is not connected to container` });
					break;
				}
				if (!this.presence) {
					send({ event: "error", error: `${process_id} is not connected to presence` });
					break;
				}

				this.container.disconnect();
				send({
					event: "disconnectedSelf",
					sessionId: this.presence.getMyself().sessionId,
				});

				break;
			}
			default: {
				console.error(`${process_id}: Unknown command`);
				send({ event: "error", error: `${process_id} Unknown command` });
				break;
			}
		}
	}
}

function setupMessageHandler(): void {
	const messageHandler = new MessageHandler();
	process.on("message", (msg: MessageFromParent) => {
		messageHandler.onMessage(msg).catch((error: Error) => {
			console.error(`Error in client ${process_id}`, error);
			send({ event: "error", error: `${process_id}: ${error.message}` });
		});
	});
}

setupMessageHandler();
