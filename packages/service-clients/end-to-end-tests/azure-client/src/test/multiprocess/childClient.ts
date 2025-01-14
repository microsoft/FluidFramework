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

interface MessageFromParent {
	command: string;
	containerId?: string;
	user?: AzureUser;
}

interface MessageToParent {
	event: string;
	sessionId?: string;
}
const connectTimeoutMs = 10_000;

const useAzure = process.env.FLUID_CLIENT === "azure";
const tenantId = useAzure
	? (process.env.azure__fluid__relay__service__tenantId as string)
	: "frs-client-tenant";
const endPoint = process.env.azure__fluid__relay__service__endpoint as string;
if (useAzure && endPoint === undefined) {
	throw new Error("Azure Fluid Relay service endpoint is missing");
}

const getPresenceContainer = async (
	id: string,
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

	const containerId = id;
	const { container, services } = await client.getContainer(containerId, schema, "2");

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

function setupMessageHandler(): void {
	process.on("message", (msg: MessageFromParent) => {
		(async () => {
			let presence: IPresence | undefined;
			let container: IFluidContainer | undefined;

			if (msg.command === "connect" && msg.containerId && msg.user) {
				const { container: c, presence: p } = await getPresenceContainer(
					msg.containerId,
					msg.user,
				);
				container = c;
				presence = p;

				presence.events.on("attendeeJoined", (attendee: ISessionClient) => {
					const m: MessageToParent = {
						event: "attendeeJoined",
						sessionId: attendee.sessionId,
					};
					process.send?.(m);
				});
				presence.events.on("attendeeDisconnected", (attendee: ISessionClient) => {
					const m: MessageToParent = {
						event: "attendeeDisconnected",
						sessionId: attendee.sessionId,
					};
					process.send?.(m);
				});

				// Signal ready
				process.send?.({ event: "ready", sessionId: presence?.getMyself().sessionId });
			} else if (msg.command === "disconnectSelf" && container) {
				container.disconnect();
				process.send?.({ event: "disconnectedSelf", sessionId: presence?.getMyself().sessionId });
			}
		})().catch((error) => {
			console.error("Error in child client", error);
		});
	});
}

setupMessageHandler();
