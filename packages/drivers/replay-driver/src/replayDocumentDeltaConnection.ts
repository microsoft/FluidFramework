/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { IDisposable } from "@fluidframework/core-interfaces";
import { delay } from "@fluidframework/core-utils/internal";
import {
	ConnectionMode,
	ISequencedDocumentMessage,
	ISignalMessage,
} from "@fluidframework/driver-definitions";
import {
	IDocumentDeltaConnection,
	IDocumentDeltaConnectionEvents,
	IDocumentDeltaStorageService,
	IDocumentService,
	IClientConfiguration,
	IConnected,
	IDocumentMessage,
	ISignalClient,
	ITokenClaims,
	IVersion,
	ScopeType,
} from "@fluidframework/driver-definitions/internal";

import { ReplayController } from "./replayController.js";

const ReplayDocumentId = "documentId";

export class ReplayControllerStatic extends ReplayController {
	private static readonly DelayInterval = 50;
	private static readonly ReplayResolution = 15;

	private firstTimeStamp: number | undefined;
	private replayCurrent = 0;
	// Simulated delay interval for emitting the ops

	/**
	 * Helper class
	 *
	 * @param replayFrom - First op to be played on socket.
	 * @param replayTo - Last op number to be played on socket.
	 * @param unitIsTime - True is user want to play ops that are within a replay resolution window.
	 */
	public constructor(
		public readonly replayFrom: number,
		public readonly replayTo: number,
		public readonly unitIsTime?: boolean,
	) {
		super();
		if (unitIsTime !== true) {
			// There is no code in here to start with snapshot, thus we have to start with op #0.
			this.replayTo = 0;
		}
	}

	public async initStorage(documentService: IDocumentService) {
		return true;
	}

	public async getVersions(versionId: string | null, count: number): Promise<IVersion[]> {
		return [];
	}

	public async getSnapshotTree(version?: IVersion) {
		return version ? Promise.reject(new Error("Invalid operation")) : null;
	}

	public async readBlob(blobId: string): Promise<ArrayBufferLike> {
		throw new Error("Invalid operation");
	}

	public async getStartingOpSequence(): Promise<number> {
		return 0;
	}

	public fetchTo(currentOp: number) {
		if (!(this.unitIsTime !== true && this.replayTo >= 0)) {
			return undefined;
		}
		return this.replayTo;
	}

	public isDoneFetch(currentOp: number, lastTimeStamp?: number) {
		if (this.replayTo >= 0) {
			if (this.unitIsTime === true) {
				return (
					lastTimeStamp !== undefined &&
					this.firstTimeStamp !== undefined &&
					lastTimeStamp - this.firstTimeStamp >= this.replayTo
				);
			}
			return currentOp >= this.replayTo;
		}
		return lastTimeStamp === undefined; // No more ops
	}

	public skipToIndex(fetchedOps: ISequencedDocumentMessage[]) {
		if (this.replayFrom <= 0) {
			return 0;
		}
		if (this.unitIsTime === true) {
			for (let i = 0; i < fetchedOps.length; i += 1) {
				const timeStamp = fetchedOps[i].timestamp;
				if (timeStamp !== undefined) {
					if (this.firstTimeStamp === undefined) {
						this.firstTimeStamp = timeStamp;
					}
					if (timeStamp - this.firstTimeStamp >= this.replayFrom) {
						return i;
					}
				}
			}
		} else if (this.replayFrom > this.replayCurrent) {
			return this.replayFrom - this.replayCurrent;
		}
		return 0;
	}

	public async replay(
		emitter: (op: ISequencedDocumentMessage[]) => void,
		fetchedOps: ISequencedDocumentMessage[],
	): Promise<void> {
		let current = this.skipToIndex(fetchedOps);

		return new Promise((resolve) => {
			const replayNextOps = () => {
				// Emit the ops from replay to the end every "deltainterval" milliseconds
				// to simulate the socket stream
				const currentOp = fetchedOps[current];
				const playbackOps = [currentOp];
				let nextInterval = ReplayControllerStatic.DelayInterval;
				current += 1;

				if (this.unitIsTime === true) {
					const currentTimeStamp = currentOp.timestamp;
					if (currentTimeStamp !== undefined) {
						// Emit more ops that is in the ReplayResolution window

						while (current < fetchedOps.length) {
							const op = fetchedOps[current];
							if (op.timestamp === undefined) {
								// Missing timestamp, just delay the standard amount of time
								break;
							}
							const timeDiff = op.timestamp - currentTimeStamp;
							if (timeDiff >= ReplayControllerStatic.ReplayResolution) {
								// Time exceeded the resolution window, break out the loop
								// and delay for the time difference.
								nextInterval = timeDiff;
								break;
							}
							if (timeDiff < 0) {
								// Time have regressed, just delay the standard amount of time
								break;
							}

							// The op is within the ReplayResolution emit it now
							playbackOps.push(op);
							current += 1;
						}

						if (
							this.firstTimeStamp !== undefined &&
							this.replayTo >= 0 &&
							currentTimeStamp + nextInterval - this.firstTimeStamp > this.replayTo
						) {
							nextInterval = -1;
						}
					}
				}
				scheduleNext(nextInterval);
				emitter(playbackOps);
			};
			const scheduleNext = (nextInterval: number) => {
				if (nextInterval >= 0 && current < fetchedOps.length) {
					setTimeout(replayNextOps, nextInterval);
				} else {
					this.replayCurrent += current;
					resolve();
				}
			};
			scheduleNext(ReplayControllerStatic.DelayInterval);
		});
	}
}

export class ReplayDocumentDeltaConnection
	extends TypedEventEmitter<IDocumentDeltaConnectionEvents>
	implements IDocumentDeltaConnection, IDisposable
{
	/**
	 * Creates a new delta connection and mimics the delta connection to replay ops on it.
	 * @param documentService - The document service to be used to get underlying endpoints.
	 */
	public static create(
		documentStorageService: IDocumentDeltaStorageService,
		controller: ReplayController,
	): IDocumentDeltaConnection {
		const connection: IConnected = {
			claims: ReplayDocumentDeltaConnection.claims,
			clientId: "PseudoClientId",
			existing: true,
			initialMessages: [],
			initialSignals: [],
			initialClients: [],
			maxMessageSize: ReplayDocumentDeltaConnection.ReplayMaxMessageSize,
			mode: "read",
			serviceConfiguration: {
				blockSize: 64436,
				maxMessageSize: ReplayDocumentDeltaConnection.ReplayMaxMessageSize,
			},
			supportedVersions: [ReplayDocumentDeltaConnection.replayProtocolVersion],
			version: ReplayDocumentDeltaConnection.replayProtocolVersion,
		};
		const deltaConnection = new ReplayDocumentDeltaConnection(connection);
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		deltaConnection.fetchAndEmitOps(documentStorageService, controller);

		return deltaConnection;
	}

	private static readonly replayProtocolVersion = "^0.1.0";
	// Since the replay service never actually sends messages the size below is arbitrary
	private static readonly ReplayMaxMessageSize = 16 * 1024;

	private static readonly claims: ITokenClaims = {
		documentId: ReplayDocumentId,
		scopes: [ScopeType.DocRead],
		tenantId: "",
		user: {
			id: "",
		},
		iat: Math.round(new Date().getTime() / 1000),
		exp: Math.round(new Date().getTime() / 1000) + 60 * 60, // 1 hour expiration
		ver: "1.0",
	};

	public get clientId(): string {
		return this.details.clientId;
	}

	public get mode(): ConnectionMode {
		return this.details.mode;
	}

	public get claims(): ITokenClaims {
		return this.details.claims;
	}

	public get existing(): boolean {
		return this.details.existing;
	}

	public get version(): string {
		return this.details.version;
	}

	public get initialMessages(): ISequencedDocumentMessage[] {
		return this.details.initialMessages;
	}

	public get initialSignals(): ISignalMessage[] {
		return this.details.initialSignals;
	}

	public get initialClients(): ISignalClient[] {
		return this.details.initialClients;
	}

	public get serviceConfiguration(): IClientConfiguration {
		return this.details.serviceConfiguration;
	}

	public readonly maxMessageSize = ReplayDocumentDeltaConnection.ReplayMaxMessageSize;

	constructor(public details: IConnected) {
		super();
	}

	public submit(documentMessage: IDocumentMessage[]): void {
		// ReplayDocumentDeltaConnection.submit() can't be called - client never sees its own join on,
		// and thus can never move to sending ops.
		throw new Error("ReplayDocumentDeltaConnection.submit() can't be called");
	}

	public async submitSignal(message: any) {}

	private _disposed = false;
	public get disposed() {
		return this._disposed;
	}
	public dispose() {
		this._disposed = true;
	}

	/**
	 * This gets the specified ops from the delta storage endpoint and replays them in the replayer.
	 */
	private async fetchAndEmitOps(
		documentStorageService: IDocumentDeltaStorageService,
		controller: ReplayController,
	): Promise<void> {
		let done;
		let replayPromiseChain = Promise.resolve();

		let currentOp = await controller.getStartingOpSequence();

		do {
			const fetchTo = controller.fetchTo(currentOp);

			const abortController = new AbortController();
			const stream = documentStorageService.fetchMessages(
				currentOp + 1,
				fetchTo,
				abortController.signal,
			);
			do {
				const result = await stream.read();

				if (result.done) {
					// No more ops. But, they can show up later, either because document was just created,
					// or because another client keeps submitting new ops.
					done = controller.isDoneFetch(currentOp, undefined);
					if (!done) {
						await delay(2000);
					}
					break;
				}
				replayPromiseChain = replayPromiseChain.then(async () =>
					controller.replay((ops) => this.emit("op", ReplayDocumentId, ops), messages),
				);

				const messages = result.value;
				currentOp += messages.length;
				done = controller.isDoneFetch(currentOp, messages[messages.length - 1].timestamp);
			} while (!done);

			abortController.abort();
		} while (!done);
		return replayPromiseChain;
	}
}
