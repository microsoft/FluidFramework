/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IAudience } from "@fluidframework/container-definitions";
import {
	type IClient,
	type IQuorumClients,
	type ISequencedClient,
} from "@fluidframework/driver-definitions";
import { MockQuorumClients } from "@fluidframework/test-runtime-utils/internal";

/**
 * Creates a mock {@link @fluidframework/container-definitions#IAudience} for testing.
 */
export function makeMockAudience(clientIds: string[]): IAudience {
	const clients = new Map<string, IClient>();
	for (const [index, clientId] of clientIds.entries()) {
		// eslint-disable-next-line unicorn/prefer-code-point
		const stringId = String.fromCharCode(index + 65);
		const name = stringId.repeat(10);
		const userId = `${name}@microsoft.com`;
		const email = userId;
		const user = {
			id: userId,
			name,
			email,
		};
		clients.set(clientId, {
			mode: "write",
			details: { capabilities: { interactive: true } },
			permission: [],
			user,
			scopes: [],
		});
	}
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	return {
		getMember: (clientId: string): IClient | undefined => {
			return clients.get(clientId);
		},
	} as IAudience;
}

/**
 * Creates a mock {@link @fluidframework/protocol-definitions#IQuorumClients} for testing.
 */
export function makeMockQuorum(clientIds: string[]): IQuorumClients {
	const clients = new Map<string, ISequencedClient>();
	for (const [index, clientId] of clientIds.entries()) {
		// eslint-disable-next-line unicorn/prefer-code-point
		const stringId = String.fromCharCode(index + 65);
		const name = stringId.repeat(10);
		const userId = `${name}@microsoft.com`;
		const email = userId;
		const user = {
			id: userId,
			name,
			email,
		};
		clients.set(clientId, {
			client: {
				mode: "write",
				details: { capabilities: { interactive: true } },
				permission: [],
				user,
				scopes: [],
			},
			sequenceNumber: 0,
		});
	}
	return new MockQuorumClients(...clients.entries());
}
