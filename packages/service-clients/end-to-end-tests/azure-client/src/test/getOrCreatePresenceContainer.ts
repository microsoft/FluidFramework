/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";

import { AzureClient, type AzureContainerServices } from "@fluidframework/azure-client";
import { type AzureUser, ScopeType } from "@fluidframework/azure-client/internal";
import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { ContainerSchema, type IFluidContainer } from "@fluidframework/fluid-static";
import {
	acquirePresenceViaDataObject,
	ExperimentalPresenceDO,
	ExperimentalPresenceManager,
	type IPresence,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/presence/alpha";
import { timeoutPromise } from "@fluidframework/test-utils/internal";

import { createAzureClient } from "./AzureClientFactory.js";
import { configProvider } from "./utils.js";

const connectTimeoutMs = 10_000;

export async function getOrCreatePresenceContainer(
	id: string | undefined,
	user: AzureUser,
	config?: ReturnType<typeof configProvider>,
	scopes: ScopeType[] = [],
): Promise<{
	client: AzureClient;
	container: IFluidContainer;
	services: AzureContainerServices;
	containerId: string;
	presence: IPresence;
}> {
	const client = createAzureClient(user.id, user.name, undefined, config, scopes);
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

	assert.strictEqual(typeof containerId, "string", "Attach did not return a string ID");
	assert.strictEqual(
		container.attachState,
		AttachState.Attached,
		"Container not attached after attach",
	);

	const presence = acquirePresenceViaDataObject(
		container.initialObjects.presence as ExperimentalPresenceDO,
	);
	return {
		client,
		container,
		services,
		containerId,
		presence,
	};
}
