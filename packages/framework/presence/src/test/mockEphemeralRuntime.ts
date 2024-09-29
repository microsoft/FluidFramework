/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type { IQuorumClients, ISequencedClient } from "@fluidframework/driver-definitions";
import { MockQuorumClients } from "@fluidframework/test-runtime-utils/internal";

import type { ClientConnectionId } from "../baseTypes.js";
import type { IEphemeralRuntime } from "../internalTypes.js";

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
			sequenceNumber: 10 * index,
		});
	}
	return new MockQuorumClients(...clients.entries());
}

/**
 * Mock ephemeral runtime for testing
 */
export class MockEphemeralRuntime implements IEphemeralRuntime {
	public logger?: ITelemetryBaseLogger;
	public readonly quorum: IQuorumClients;

	public readonly listeners: {
		connected: ((clientId: ClientConnectionId) => void)[];
	} = {
		connected: [],
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
		const quorum = makeMockQuorum([
			"client0",
			"client1",
			"client2",
			"client3",
			"client4",
			"client5",
		]);
		this.quorum = quorum;
		this.getQuorum = () => quorum;
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

	// #region IEphemeralRuntime

	public clientId: string | undefined;
	public connected: boolean = false;

	public on: IEphemeralRuntime["on"];

	public off: IEphemeralRuntime["off"] = (
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	): any => {
		throw new Error("IEphemeralRuntime.off method not implemented.");
	};

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
