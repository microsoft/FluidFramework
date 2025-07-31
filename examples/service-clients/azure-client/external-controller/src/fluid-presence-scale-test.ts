/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AzureClientProps } from "@fluidframework/azure-client";
import { AzureClient } from "@fluidframework/azure-client";
import { ExperimentalPresenceManager } from "@fluidframework/presence/alpha";
import type {
	LatestMapRaw,
	Presence,
	StatesWorkspaceSchema,
} from "@fluidframework/presence/beta";
import { getPresence, StateFactory } from "@fluidframework/presence/beta";
// eslint-disable-next-line import/no-internal-modules
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";
import type { TinyliciousConnectionConfig } from "@fluidframework/tinylicious-client";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import type { ContainerSchema } from "fluid-framework";
// import { SharedTree, TreeViewConfiguration, SchemaFactory, type TreeView } from "fluid-framework";

// Argument processing
// First unnamed argument is the number of clients to create.
// Second unnamed argument is the number of seconds to wait for clients to stabilize - default is 10s.
// Third unnamed argument is the extra wait factor for message propagation - default is *1.75.
const useTinylicious = process.argv.includes("--tinylicious"); // Otherwise use Azure Fluid Relay
const usePassiveReadonly = process.argv.includes("--passive-readonly"); // Use passive readonly clients (not yet supported with Presence)
const onlyListenForWorkspace = process.argv.includes("--listen-for-workspace");
const useCanary = process.argv.includes("--canary"); // Use Canary service connection
const argv = process.argv.filter((arg) => !arg.startsWith("-"));
const clientCount = Number.parseInt(argv[2] ?? "500", 10);
const stabilizeTimeoutSeconds = Number.parseInt(argv[3] ?? "10", 10);
const extraWaitFactor = Number.parseFloat(argv[4] ?? "1.75");

console.log(`Using ${useTinylicious ? "Tinylicious" : "Azure Fluid Relay"}`);

const user = { id: "userId", name: "userName" };

// This is the pre-production endpoint
const primaryKey = "-- REPLACE WITH YOUR PRIMARY KEY--"; // REPLACE WITH YOUR PRIMARY KEY
const rwTokenProvider = new InsecureTokenProvider(primaryKey, user);
const roTokenProvider = new InsecureTokenProvider(primaryKey, user, ["doc:read" as any]);
const ppServiceConnection = {
	tokenProvider: rwTokenProvider,
	tenantId: "16ca440f-d2e1-4c10-8854-f4cfd557b03c", // REPLACE WITH YOUR TENANT ID
	endpoint: "https://ppeus.fluidrelay.azure.com", // REPLACE WITH YOUR SERVICE ENDPOINT
	type: "remote",
} as const satisfies AzureClientProps["connection"] & TinyliciousConnectionConfig;
const canaryServiceConnection = {
	tokenProvider: rwTokenProvider,
	tenantId: "13867b73-856a-466e-aba0-feb5f74d4748", // REPLACE WITH YOUR TENANT ID
	endpoint: "https://eastus2euap.fluidrelay.azure.com", // REPLACE WITH YOUR SERVICE ENDPOINT
	type: "remote",
} as const satisfies AzureClientProps["connection"] & TinyliciousConnectionConfig;

function createClient(readonly = false): AzureClient | TinyliciousClient {
	const props = {
		connection: {
			...(useCanary ? canaryServiceConnection : ppServiceConnection),
			tokenProvider: readonly ? roTokenProvider : rwTokenProvider,
		},
	};
	if (useTinylicious) {
		return new TinyliciousClient(props);
	}
	return new AzureClient(props);
}

const primaryClient = createClient();

const containerSchema = {
	initialObjects: {
		// diceTree: SharedTree,
		// Container schema must have something - this deprecated object
		// is very lightweight (no content) and can be used when there is
		// no other data object in the container.
		fake: ExperimentalPresenceManager,
	},
} as const satisfies ContainerSchema;

const presenceSchema = {
	map: StateFactory.latestMap({ settings: { allowableUpdateLatencyMs: 0 } }),
} as const satisfies StatesWorkspaceSchema;

function acquirePresenceState(presence: Presence): LatestMapRaw<unknown> {
	return presence.states.getWorkspace("workspace:main", presenceSchema).states.map;
}

// // The string passed to the SchemaFactory should be unique
// const sf = new SchemaFactory("fluidScalePerformance");
// class Dice extends sf.object("Dice", {
// 	value: sf.number,
// }) {}

// const treeViewConfiguration = new TreeViewConfiguration({ schema: Dice });

async function timeoutPromise<T>(
	executor: (
		resolve: (value: T | PromiseLike<T>) => void,
		reject: (reason?: unknown) => void,
	) => void,
	options: { durationMs?: number; errorMsg?: () => string },
): Promise<T> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error(options.errorMsg?.() ?? "Operation timed out"));
		}, options.durationMs);

		executor(
			(value) => {
				clearTimeout(timeout);
				resolve(value);
			},
			(err) => {
				clearTimeout(timeout);
				reject(err);
			},
		);
	});
}

class ClientData {
	private readonly allAttendees: Presence["attendees"];
	private readonly presenceState?: LatestMapRaw<unknown>;
	public lastAttendeeCount: number;
	public ready?: Promise<void>;
	public updated?: Promise<void>;

	constructor(
		public readonly id: string | number,
		private readonly presence: Presence,
	) {
		if (onlyListenForWorkspace) {
			this.allAttendees = presence.attendees;
		} else {
			this.presenceState = acquirePresenceState(presence);
		}
		this.allAttendees = presence.attendees;
		this.lastAttendeeCount = presence.attendees.getAttendees().size;
	}

	public async setReadyPromise(
		timeoutMs: number,
		requiredAttendeeCount: number,
	): Promise<void> {
		const attendees = this.allAttendees;
		this.lastAttendeeCount = attendees.getAttendees().size;
		if (this.lastAttendeeCount === requiredAttendeeCount) {
			this.ready = Promise.resolve();
			return this.ready;
		}

		let stopListening: (() => void) | undefined;
		const ready = timeoutPromise<void>(
			(resolve) => {
				const stopConnected = attendees.events.on("attendeeConnected", () => {
					this.lastAttendeeCount = attendees.getAttendees().size;
					if (this.lastAttendeeCount >= requiredAttendeeCount) {
						if (this.lastAttendeeCount > requiredAttendeeCount) {
							console.warn(
								`Client ${this.id} saw more attendees than expected: ${this.lastAttendeeCount} vs ${requiredAttendeeCount}`,
							);
						}
						resolve();
					}
				});
				const stopDisconnected = attendees.events.on("attendeeDisconnected", () => {
					if (this.lastAttendeeCount !== attendees.getAttendees().size) {
						console.warn(
							`Client ${this.id} saw attendee count change from ${this.lastAttendeeCount} to ${attendees.getAttendees().size} during disconnect event`,
						);
					}
					console.warn(`Client ${this.id} saw disconnect at ${this.lastAttendeeCount}`);
				});
				stopListening = () => {
					stopConnected();
					stopDisconnected();
				};
			},
			{
				durationMs: timeoutMs,
				errorMsg: () =>
					`Client ${this.id} did not see all ${requiredAttendeeCount} joins - last count was ${this.lastAttendeeCount}`,
			},
		);

		if (stopListening === undefined) {
			throw new Error("stopListening was not set, this should never happen");
		}
		this.ready = ready.finally(stopListening);

		return this.ready.catch((error) => {
			console.warn(error.message); // Optional: log warning
			throw error;
		});
	}

	public async setUpdatePromise(timeoutMs: number, expectedKey: string): Promise<void> {
		this.updated = timeoutPromise<void>(
			(resolve) => {
				if (this.presenceState) {
					const off = this.presenceState.events.on("remoteItemUpdated", (update) => {
						if (update.key === expectedKey) {
							off();
							resolve();
						}
					});
				} else {
					const off = this.presence.events.on("workspaceActivated", (workspaceAddress) => {
						if (workspaceAddress === expectedKey) {
							off();
							resolve();
						}
					});
				}
			},
			{
				durationMs: timeoutMs,
				errorMsg: () => `Client ${this.id} did not receive remote update`,
			},
		);

		return this.updated.catch((error) => {
			console.warn(error.message); // Optional: log warning
			throw error;
		});
	}
}

function formatTime(time: number): string {
	return time.toFixed(2).padStart(8, " ");
}

async function runScaleTest(
	numberOfClients: number,
	stabilizeTimeoutMs: number,
): Promise<void> {
	const timeStart = performance.now();

	// Create a single document
	let containerId = "";
	// let creatorDice: TreeView<typeof Dice>;
	let primaryPresence: Presence;
	try {
		const { container } = await primaryClient.createContainer(containerSchema, "2");
		// creatorDice = container.initialObjects.diceTree.viewWith(treeViewConfiguration);
		// creatorDice.initialize(new Dice({ value: 0 }));
		containerId = await container.attach();
		primaryPresence = getPresence(container);
		if (!onlyListenForWorkspace) {
			// pre-create the workspace (creation is not the "update" notification)
			acquirePresenceState(primaryPresence);
		}
		console.log(`Generated container with id equal to ${containerId}`);
	} catch (error) {
		console.error(`Error generating container`, error);
		throw error;
	}
	const timePrimaryConnected = performance.now();
	console.log(
		`∆ ${formatTime(timePrimaryConnected - timeStart)}ms to generate container and connect primary client`,
	);

	// create as many client as needed and make sure they are connected to the same container
	const numberOfPassiveClients = numberOfClients - 1;
	const updatePasses = 5;
	const updateTimeoutMs = 10000;

	const clientPromises = Array.from({ length: numberOfPassiveClients }, async (_, i) => {
		let lastError: unknown;
		const client = createClient(usePassiveReadonly);
		for (let j = 0; j < 4; j++) {
			try {
				const { container } = await client.getContainer(containerId, containerSchema, "2");
				return container;
			} catch (error) {
				console.error(`❌ Client ${i + 1} failed to connect (attempt ${j + 1}):`, error);
				lastError = error;
			}
		}
		throw lastError;
	});

	const connectedClients = await Promise.all(clientPromises);
	const successfulClients = connectedClients.filter(Boolean);
	const timeAllConnected = performance.now();
	console.log(
		`∆ ${formatTime(timeAllConnected - timePrimaryConnected)}ms to connect additional ${successfulClients.length} ${usePassiveReadonly ? "readonly " : ""}clients`,
	);

	// For the connected clients setup presence and workspaces
	const presenceStates: ClientData[] = [];
	for (const [i, client] of connectedClients.entries()) {
		presenceStates.push(new ClientData(i, getPresence(client)));
	}

	// Setup remote updates for clients
	// Ready when all attendees are connected
	let readyCount = 0;
	const remoteReadyPromises = presenceStates.map(async (clientData) =>
		clientData.setReadyPromise(stabilizeTimeoutMs, numberOfClients).then(() => {
			readyCount++;
		}),
	);

	{
		const middleClientIndex = Math.floor(presenceStates.length / 2);
		let monitorCount = 0;
		let monitor: NodeJS.Timeout;
		const monitorCallback = (): void => {
			monitorCount++;
			console.log(
				`  ⏳ ${monitorCount}s Waiting for ${numberOfPassiveClients - readyCount}/${numberOfPassiveClients} clients to stabilize... (first, mid, last attendee counts: ${presenceStates[0]?.lastAttendeeCount}, ${presenceStates[middleClientIndex]?.lastAttendeeCount}, ${presenceStates[numberOfPassiveClients - 1]?.lastAttendeeCount})`,
			);
			monitor = setTimeout(monitorCallback, 1000);
		};
		monitor = setTimeout(monitorCallback, 1000);

		await Promise.all(remoteReadyPromises).finally(() => {
			clearTimeout(monitor);
			if (readyCount < numberOfPassiveClients) {
				console.error(
					`⚠️ Only ${readyCount} out of ${numberOfPassiveClients} clients are stabilized, ${numberOfPassiveClients - readyCount} are not ready.`,
				);
				const attendeeCounts = presenceStates
					.map((clientData) => clientData.lastAttendeeCount)
					.filter((count) => count !== numberOfClients);
				console.error(
					`⚠️ Attendee counts for unstabilized clients: ${attendeeCounts.join(", ")}`,
				);
			}
		});
	}

	const timeAllReady = performance.now();
	const msToGetReady = timeAllReady - timeAllConnected;
	console.log(`∆ ${formatTime(msToGetReady)}ms to join and stabilize all clients`);

	// While all are ready there are likely some messages in flight, so we wait a bit more
	const messagePropagationDelay = msToGetReady * extraWaitFactor;
	console.log(
		`⏳ Pausing ${formatTime(messagePropagationDelay)}ms for extraneous messages to propagate...`,
	);
	await new Promise<void>((resolve) => {
		setTimeout(resolve, messagePropagationDelay);
	});

	await runUpdateTests(primaryPresence, presenceStates, updatePasses, updateTimeoutMs);
}

async function runUpdateTests(
	primaryPresence: Presence,
	presenceStates: ClientData[],
	updatePasses: number,
	updateTimeoutMs: number,
): Promise<void> {
	console.log(`🏹 updating presence value (in series ${updatePasses} times)`);
	let updateDeltas = 0;
	let successfulUpdates = 0;
	let maxUpdateDelta = 0;
	for (let i = 0; i < updatePasses; i++) {
		const updateKey = `name:update-${i}` as const;
		let updatesCompleted = 0;
		const remoteUpdatePromises = presenceStates.map(async (clientData) =>
			clientData.setUpdatePromise(updateTimeoutMs, updateKey).then(() => {
				updatesCompleted++;
			}),
		);

		const timeUpdateStarted = performance.now();
		// Update the value after all clients are ready
		if (onlyListenForWorkspace) {
			primaryPresence.states.getWorkspace(updateKey, presenceSchema);
		} else {
			acquirePresenceState(primaryPresence).local.set(updateKey, "hello");
		}

		// Wait for propagation
		try {
			await Promise.all(remoteUpdatePromises);
		} catch (error) {
			console.error(`❌ Error during remote updates:`, error);
			console.log(
				`⚠️ Only ${updatesCompleted} out of ${remoteUpdatePromises.length} updates completed`,
			);
			continue; // Skip to the next update pass
		}
		const timeAllUpdated = performance.now();
		successfulUpdates++;
		const updateDelta = timeAllUpdated - timeUpdateStarted;
		updateDeltas += updateDelta;
		if (updateDelta > maxUpdateDelta) {
			maxUpdateDelta = updateDelta;
		}
		console.log(
			`∆ ${formatTime(updateDelta)}ms to propagate update to ${remoteUpdatePromises.length} clients`,
		);
	}

	console.log(
		`🎯 all ${updatePasses} updates completed ${successfulUpdates === updatePasses ? "successfully" : `but failed ${updatePasses - successfulUpdates} times`}`,
	);
	console.log(`⏱️ Average update time: ${formatTime(updateDeltas / successfulUpdates)}ms`);
	console.log(`⏱️     Max update time: ${formatTime(maxUpdateDelta)}ms`);
}

await runScaleTest(clientCount, stabilizeTimeoutSeconds * 1000);

// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
