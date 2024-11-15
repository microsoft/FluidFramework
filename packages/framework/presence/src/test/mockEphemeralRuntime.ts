/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type { IClient, ISequencedClient } from "@fluidframework/driver-definitions";
import { MockAudience, MockQuorumClients } from "@fluidframework/test-runtime-utils/internal";

import type { ClientConnectionId } from "../baseTypes.js";
import type { IEphemeralRuntime } from "../internalTypes.js";

type ClientData = [string, IClient];

function buildClientDataArray(clientIds: string[], numWriteClients: number): ClientData[] {
	const clients: ClientData[] = [];
	for (const [index, clientId] of clientIds.entries()) {
		// eslint-disable-next-line unicorn/prefer-code-point
		const stringId = String.fromCharCode(index + 65);
		const name = stringId.repeat(10);
		const userId = `${name}@microsoft.com`;
		const user = {
			id: userId,
		};
		clients.push([
			clientId,
			{
				mode: index < numWriteClients ? "write" : "read",
				details: { capabilities: { interactive: true } },
				permission: [],
				user,
				scopes: [],
			},
		]);
	}
	return clients;
}

/**
 * Creates a mock {@link @fluidframework/protocol-definitions#IQuorumClients} for testing.
 */
function makeMockQuorum(clients: ClientData[]): MockQuorumClients {
	return new MockQuorumClients(
		...clients
			.filter(([, client]) => client.mode === "write")
			.map(([clientId, client], index): [string, Partial<ISequencedClient>] => [
				clientId,
				{ client, sequenceNumber: 10 * index },
			]),
	);
}

/**
 * Creates a mock {@link @fluidframework/container-definitions#IAudience} for testing.
 */
function makeMockAudience(clients: ClientData[]): MockAudience {
	const audience = new MockAudience();
	for (const [clientId, client] of clients) {
		audience.addMember(clientId, client);
	}
	return audience;
}

/**
 * Mock ephemeral runtime for testing
 */
export class MockEphemeralRuntime implements IEphemeralRuntime {
	public logger?: ITelemetryBaseLogger;
	public readonly quorum: MockQuorumClients;
	public readonly audience: MockAudience;

	public readonly listeners: {
		connected: ((clientId: ClientConnectionId) => void)[];
		disconnected: (() => void)[];
	} = {
		connected: [],
		disconnected: [],
	};
	private isSupportedEvent(event: string): event is keyof typeof this.listeners {
		return event in this.listeners;
	}

	public constructor(
		logger?: ITelemetryBaseLogger,
		public readonly signalsExpected: Parameters<IEphemeralRuntime["submitSignal"]>[] = [],
	) {
		if (logger !== undefined) {
			this.logger = logger;
		}

		const clientsData = buildClientDataArray(
			["client0", "client1", "client2", "client3", "client4", "client5", "client6", "client7"],
			/* count of write clients (in quorum) */ 6,
		);
		this.quorum = makeMockQuorum(clientsData);
		this.getQuorum = () => this.quorum;
		this.audience = makeMockAudience(clientsData);
		this.getAudience = () => this.audience;
		this.on = (
			event: string,
			listener: (...args: any[]) => void,
			// Events style eventing does not lend itself to union that
			// IEphemeralRuntime is derived from, so we are using `any` here
			// but meet the intent of the interface.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		): any => {
			if (!this.isSupportedEvent(event)) {
				throw new Error(`Event ${event} is not supported`);
			}
			// Switch to allowing a single listener as commented when
			// implementation uses a single "connected" listener.
			// if (this.listeners[event]) {
			// 	throw new Error(`Event ${event} already has a listener`);
			// }
			// this.listeners[event] = listener;
			if (this.listeners[event].length > 1) {
				throw new Error(`Event ${event} already has multiple listeners`);
			}
			this.listeners[event].push(listener);
			return this;
		};
	}

	public assertAllSignalsSubmitted(): void {
		assert.strictEqual(
			this.signalsExpected.length,
			0,
			`Missing signals [\n${this.signalsExpected
				.map(
					(a) =>
						`\t{ type: ${a[0]}, content: ${JSON.stringify(a[1], undefined, "\t")}, targetClientId: ${a[2]} }`,
				)
				.join(",\n\t")}\n]`,
		);
	}

	public removeMember(clientId: ClientConnectionId): void {
		const client = this.audience.getMember(clientId);
		assert(client !== undefined, `Attempting to remove unknown connection: ${clientId}`);
		if (client.mode === "write") {
			this.quorum.removeMember(clientId);
		}
		this.audience.removeMember(clientId);
	}

	// #region IEphemeralRuntime

	public clientId: string | undefined;
	public connected: boolean = false;

	public on: IEphemeralRuntime["on"];

	public off: IEphemeralRuntime["off"] = (
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	): any => {
		throw new Error("IEphemeralRuntime.off method not implemented.");
	};

	public getAudience: () => ReturnType<IEphemeralRuntime["getAudience"]>;

	public getQuorum: () => ReturnType<IEphemeralRuntime["getQuorum"]>;

	public submitSignal: IEphemeralRuntime["submitSignal"] = (
		...args: Parameters<IEphemeralRuntime["submitSignal"]>
	) => {
		if (this.signalsExpected.length === 0) {
			throw new Error(`Unexpected signal: ${JSON.stringify(args)}`);
		}
		const expected = this.signalsExpected.shift();
		assert.deepStrictEqual(args, expected, "Unexpected signal");
	};

	// #endregion
}
