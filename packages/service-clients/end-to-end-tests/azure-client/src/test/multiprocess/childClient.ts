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
import { type AzureUser, ScopeType } from "@fluidframework/azure-client/internal";
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

import { createAzureTokenProvider } from "../AzureTokenFactory.js";
import { configProvider } from "../utils.js";

import { MessageFromChild, MessageToChild } from "./messageTypes.js";

type MessageFromParent = MessageToChild;
type MessageToParent = MessageFromChild;

const connectTimeoutMs = 10_000;

const useAzure = process.env.FLUID_CLIENT === "azure";
const tenantId = useAzure
	? (process.env.azure__fluid__relay__service__tenantId as string)
	: "frs-client-tenant";
const endPoint = process.env.azure__fluid__relay__service__endpoint as string;
if (useAzure && endPoint === undefined) {
	throw new Error("Azure Fluid Relay service endpoint is missing");
}

const getOrCreatePresenceContainer = async (
	id: string | undefined,
	user: AzureUser,
	config?: ReturnType<typeof configProvider>,
	scopes?: ScopeType[],
): Promise<{
	container: IFluidContainer;
	presence: IPresence;
	services: AzureContainerServices;
	client: AzureClient;
	containerId: string;
}> => {
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

	let container: IFluidContainer;
	let services: AzureContainerServices;
	let containerId: string;

	if (id === undefined) {
		({ container, services } = await client.createContainer(schema, "2"));
		containerId = await container.attach();
	} else {
		containerId = id;
		({ container, services } = await client.getContainer(containerId, schema, "2"));
	}

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
let send: (msg: MessageToParent) => void;
if (process.send) {
	send = process.send.bind(process);
} else {
	throw new Error("process.send is not defined");
}
function setupMessageHandler(): void {
	let presence: IPresence | undefined;
	let container: IFluidContainer | undefined;
	let containerId: string;
	process.on("message", (msg: MessageFromParent) => {
		(async () => {
			if (msg.command === "connect" && msg.user) {
				const {
					container: c,
					presence: p,
					containerId: id,
				} = await getOrCreatePresenceContainer(msg.containerId, msg.user);
				container = c;
				presence = p;
				containerId = id;

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

				// Signal ready
				send({ event: "ready", containerId, sessionId: presence.getMyself().sessionId });
			} else if (msg.command === "disconnectSelf" && container && presence) {
				container.disconnect();
				send({
					event: "disconnectedSelf",
					sessionId: presence.getMyself().sessionId,
				});
			}
		})().catch((error) => {
			console.error("Error in child client", error);
		});
	});
}

setupMessageHandler();
