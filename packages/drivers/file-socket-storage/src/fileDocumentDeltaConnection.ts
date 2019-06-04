import {
    IContentMessage,
    IDocumentDeltaConnection,
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISignalMessage,
} from "@prague/container-definitions";
import * as messages from "@prague/socket-storage-shared";
import { EventEmitter } from "events";
import { debug } from "./debug";
import { FileDeltaStorageService } from "./fileDeltaStorageService";

// Simulated delay interval for emitting the ops
const DelayInterval = 50;
const MaxBatchDeltas = 2000;

// Since the replay service never actually sends messages the size below is arbitrary
const ReplayMaxMessageSize = 16 * 1024;

const fileProtocolVersion = "^0.1.0";

/**
 * Replay service used to play ops using the delta connection.
 */
export class Replayer {
    private currentReplayOp = 0;

    constructor(
        private deltaConnection: ReplayFileDeltaConnection,
        private documentStorageService: FileDeltaStorageService) {
    }

    public get currentReplayedOp() {
        return this.currentReplayOp;
    }

    public set currentReplayedOp(op: number) {
        this.currentReplayOp = op;
    }

    public async start() {
        let done: boolean;
        do {
            const fetchedOps = await this.documentStorageService.getFromWebSocket(
                this.currentReplayOp,
                this.currentReplayOp + 1);
            if (fetchedOps.length <= 0) {
                break;
            } else {
                await this.replayCore(fetchedOps);
                this.currentReplayOp += fetchedOps.length;
                done = fetchedOps[0].type === "op" ? true : false;
            }
        } while (!done);
    }

    /**
     * Replay the ops upto a certain number.
     * @param replayTo - The last op number to be replayed.
     */
    public async replay(replayTo: number) {
        let totalReplayedOps = 0;
        let done: boolean;
        do {
            const fetchToBatch = this.currentReplayOp + MaxBatchDeltas;
            const fetchTo = Math.min(fetchToBatch, replayTo);

            const fetchedOps = await this.documentStorageService.getFromWebSocket(this.currentReplayOp, fetchTo);

            if (fetchedOps.length <= 0) {
                break;
            } else {
                this.emit(fetchedOps);
                totalReplayedOps += fetchedOps.length;
                this.currentReplayOp += fetchedOps.length;
                done = this.isDoneFetch(replayTo);
            }
        } while (!done);
        return totalReplayedOps;
    }

    private isDoneFetch(replayTo: number) {
        if (replayTo >= 0) {
            return this.currentReplayOp < replayTo;
        }
        return false;
    }

    private emit(ops: ISequencedDocumentMessage[]) {
        ops.map((op) => this.deltaConnection.emit("op", op.clientId, op));
    }

    private async replayCore(fetchedOps: ISequencedDocumentMessage[]) {
        let current = 0;

        const replayNextOps = () => {
            const currentOp = fetchedOps[current];
            const playbackOps = [currentOp];
            const nextInterval = DelayInterval;
            current += 1;

            scheduleNext(nextInterval);
            this.emit(playbackOps);
        };
        const scheduleNext = (nextInterval: number) => {
            if (nextInterval >= 0 && current < fetchedOps.length) {
                setTimeout(replayNextOps, nextInterval);
            } else {
                // this.replayCurrent += current;
            }
        };
        scheduleNext(DelayInterval);
    }
}

export class ReplayFileDeltaConnection extends EventEmitter implements IDocumentDeltaConnection {

    /**
     * Mimic the delta connection to replay ops on it.
     *
     * @param documentDeltaStorageService - The delta storage service to get ops from.
     * @returns Document delta connection.
     */
    public static async Create(documentDeltaStorageService: FileDeltaStorageService)
    : Promise<IDocumentDeltaConnection> {

        const connection = {
            clientId: "",
            existing: true,
            initialContents: [],
            initialMessages: [],
            initialSignals: [],
            maxMessageSize: ReplayMaxMessageSize,
            parentBranch: null,
            supportedVersions: [fileProtocolVersion],
            user: null,
            version: fileProtocolVersion,
        };
        const deltaConnection = new ReplayFileDeltaConnection(connection);
        // tslint:disable-next-line: no-floating-promises
        await this.CreateReplayer(documentDeltaStorageService, deltaConnection);

        return deltaConnection;
    }

    /**
     * Creates the replay service to replay ops.
     *
     * @param documentDeltaStorageService - The delta storage service to get ops from.
     * @param deltaConnection - Delta connection to be used to fire ops.
     */
    public static async CreateReplayer(
        documentDeltaStorageService: FileDeltaStorageService,
        deltaConnection: ReplayFileDeltaConnection,
    ) {
        this.replayer =  new Replayer(
            deltaConnection,
            documentDeltaStorageService);

        // tslint:disable-next-line: no-floating-promises
        this.replayer.start();
    }

    public static getReplayer() {
        return this.replayer;
    }

    private static replayer: Replayer;

    public get clientId(): string {
        return this.details.clientId;
    }

    public get existing(): boolean {
        return this.details.existing;
    }

    public get parentBranch(): string | null {
        return this.details.parentBranch;
    }

    public get initialContents(): IContentMessage[] | undefined {
        return this.details.initialContents;
    }

    public get initialMessages(): ISequencedDocumentMessage[] | undefined {
        return this.details.initialMessages;
    }

    public get initialSignals(): ISignalMessage[] | undefined {
        return this.details.initialSignals;
    }

    public readonly maxMessageSize = ReplayMaxMessageSize;

    constructor(
        public details: messages.IConnected,
    ) {
        super();
    }

    public submit(message: IDocumentMessage): void {
        debug("dropping the outbound message");
    }

    public async submitAsync(message: IDocumentMessage): Promise<void> {
        debug("dropping the outbound message and wait for response");
    }

    public async submitSignal(message: any) {
        debug("dropping the outbound signal and wait for response");
    }

    public disconnect() {
        debug("no implementation for disconnect...");
    }
}
