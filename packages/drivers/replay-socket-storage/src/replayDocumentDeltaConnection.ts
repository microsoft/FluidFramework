/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentStorageService,
} from "@fluidframework/driver-definitions";
import {
    ConnectionMode,
    IConnected,
    IContentMessage,
    IDocumentMessage,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISignalClient,
    ISignalMessage,
    ITokenClaims,
    IVersion,
    ScopeType,
} from "@fluidframework/protocol-definitions";
import { debug } from "./debug";
import { ReplayController } from "./replayController";

const MaxBatchDeltas = 2000;

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
        public readonly unitIsTime?: boolean) {
        super();
        if (unitIsTime !== true) {
            // There is no code in here to start with snapshot, thus we have to start with op #0.
            this.replayTo = 0;
        }
    }

    public async initStorage(storage: IDocumentStorageService) {
        return true;
    }

    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        return [];
    }

    public async getSnapshotTree(version?: IVersion) {
        return version ? Promise.reject("Invalid operation") : null;
    }

    public async read(blobId: string): Promise<string> {
        return Promise.reject("Invalid operation");
    }

    public async getStartingOpSequence(): Promise<number> {
        return 0;
    }

    public fetchTo(currentOp: number) {
        const useFetchToBatch = !(this.unitIsTime !== true && this.replayTo >= 0);
        const fetchToBatch = currentOp + MaxBatchDeltas;
        return useFetchToBatch ? fetchToBatch : Math.min(fetchToBatch, this.replayTo);
    }

    public isDoneFetch(currentOp: number, lastTimeStamp?: number) {
        if (this.replayTo >= 0) {
            if (this.unitIsTime === true) {
                return (
                    lastTimeStamp !== undefined
                    && this.firstTimeStamp !== undefined
                    && lastTimeStamp - this.firstTimeStamp >= this.replayTo);
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
        fetchedOps: ISequencedDocumentMessage[]): Promise<void> {
        let current = this.skipToIndex(fetchedOps);

        return new Promise((resolve) => {
            const replayNextOps = () => {
                // Emit the ops from replay to the end every "deltainterval" milliseconds
                // to simulate the socket stream
                const currentOp = fetchedOps[current];
                const playbackOps = [currentOp];
                let nextInterval = ReplayControllerStatic.DelayInterval;
                current += 1;

                debug(`Replay next ${this.replayCurrent + current}`);
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

                        if (this.firstTimeStamp !== undefined
                            && this.replayTo >= 0
                            && currentTimeStamp + nextInterval - this.firstTimeStamp > this.replayTo) {
                            nextInterval = -1;
                        }
                    }
                }
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
                scheduleNext(nextInterval);
                emitter(playbackOps);
            };
            const scheduleNext = (nextInterval: number) => {
                if (nextInterval >= 0 && current < fetchedOps.length) {
                    setTimeout(replayNextOps, nextInterval);
                    debug(`Replay scheduled ${this.replayCurrent + current} ${nextInterval}`);
                } else {
                    debug(`Replay done ${this.replayCurrent + current}`);
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
    implements IDocumentDeltaConnection  {
    /**
     * Creates a new delta connection and mimics the delta connection to replay ops on it.
     * @param documentService - The document service to be used to get underlying endpoints.
     */
    public static create(
        documentStorageService: IDocumentDeltaStorageService,
        controller: ReplayController): IDocumentDeltaConnection {
        const connection: IConnected = {
            claims: ReplayDocumentDeltaConnection.claims,
            clientId: "",
            existing: true,
            initialContents: [],
            initialMessages: [],
            initialSignals: [],
            initialClients: [],
            maxMessageSize: ReplayDocumentDeltaConnection.ReplayMaxMessageSize,
            mode: "write",
            parentBranch: null,
            serviceConfiguration: {
                blockSize: 64436,
                maxMessageSize: 16 * 1024,
                summary: {
                    idleTime: 5000,
                    maxOps: 1000,
                    maxTime: 5000 * 12,
                    maxAckWaitTime: 600000,
                },
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
        scopes: [ScopeType.DocRead, ScopeType.DocWrite],
        tenantId: "",
        user: {
            id: "",
        },
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

    public get parentBranch(): string | null {
        return this.details.parentBranch;
    }

    public get version(): string {
        return this.details.version;
    }

    public get initialContents(): IContentMessage[] {
        return this.details.initialContents;
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

    public get serviceConfiguration(): IServiceConfiguration {
        return this.details.serviceConfiguration;
    }

    public readonly maxMessageSize = ReplayDocumentDeltaConnection.ReplayMaxMessageSize;

    constructor(
        public details: IConnected,
    ) {
        super();
    }

    public submit(documentMessage: IDocumentMessage[]): void {
        debug("dropping the outbound message");
    }

    public async submitAsync(documentMessage: IDocumentMessage[]): Promise<void> {
        debug("dropping the outbound message and wait for response");
    }

    public async submitSignal(message: any) {
        debug("dropping the outbound signal and wait for response");
    }

    public disconnect() {
        debug("no implementation for disconnect...");
    }

    /**
     * This gets the specified ops from the delta storage endpoint and replays them in the replayer.
     */
    private async fetchAndEmitOps(
        documentStorageService: IDocumentDeltaStorageService,
        controller: ReplayController,
    ): Promise<void> {
        const delay = async (ms?: number) => new Promise((res) => setTimeout(res, ms));
        let done;
        let replayPromiseChain = Promise.resolve();

        let currentOp = await controller.getStartingOpSequence();

        do {
            const fetchTo = controller.fetchTo(currentOp);

            const fetchedOps = await documentStorageService.get(currentOp, fetchTo);

            if (fetchedOps.length === 0) {
                // No more ops. But, they can show up later, either because document was just created,
                // or because another client keeps submitting new ops.
                if (controller.isDoneFetch(currentOp, undefined)) {
                    break;
                }
                await delay(2000);
                continue;
            }

            replayPromiseChain = replayPromiseChain.then(
                async () => controller.replay((ops) => this.emit("op", ReplayDocumentId, ops), fetchedOps));

            currentOp += fetchedOps.length;
            done = controller.isDoneFetch(currentOp, fetchedOps[fetchedOps.length - 1].timestamp);
        } while (!done);

        return replayPromiseChain;
    }
}
