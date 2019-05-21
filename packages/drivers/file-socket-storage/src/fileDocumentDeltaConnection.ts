import {
    IContentMessage,
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISignalMessage,
} from "@prague/container-definitions";
import * as messages from "@prague/socket-storage-shared";
import { EventEmitter } from "events";
import { debug } from "./debug";

// Simulated delay interval for emitting the ops
const DelayInterval = 50;
const MaxBatchDeltas = 2000;

// Since the replay service never actually sends messages the size below is arbitrary
const ReplayMaxMessageSize = 16 * 1024;

export class Replayer {
    public static isReplayDone = false;
    private static currentReplayOp = 0;
    // private replayP = Promise.resolve();
    constructor(
        private deltaConnection: ReplayFileDeltaConnection,
        private documentStorageService: IDocumentDeltaStorageService) {
    }

    public get currentReplayedOp() {
        return Replayer.currentReplayOp;
    }

    public async start() {
        let done: boolean;
        do {
            const fetchedOps = await this.documentStorageService.get(
                Replayer.currentReplayOp,
                Replayer.currentReplayOp + 1);
            if (fetchedOps.length <= 0) {
                break;
            } else {
                // this.replayP = this.replayP.then(() => {
                //     const p = this.replayCore(fetchedOps);
                //     return p;
                // });
                await this.replayCore(fetchedOps);
                Replayer.currentReplayOp += fetchedOps.length;
                done = fetchedOps[0].type === "op" ? true : false;
            }
        } while (!done);
    }

    public async replay(replayTo: number) {
        let totalReplayedOps = 0;
        Replayer.isReplayDone = false;
        let done: boolean;
        do {
            const fetchToBatch = Replayer.currentReplayOp + MaxBatchDeltas;
            const fetchTo = Math.min(fetchToBatch, replayTo);

            const fetchedOps = await this.documentStorageService.get(Replayer.currentReplayOp, fetchTo);

            if (fetchedOps.length <= 0) {
                break;
            } else {
                // this.replayP = this.replayP.then(() => {
                //     const p = this.replayCore(fetchedOps);
                //     return p;
                // });
                this.emit(fetchedOps);
            }
            totalReplayedOps += fetchedOps.length;
            Replayer.currentReplayOp += fetchedOps.length;
            done = this.isDoneFetch(fetchedOps, replayTo);
        } while (!done);
        return totalReplayedOps;
    }

    private isDoneFetch(fetchedOps: ISequencedDocumentMessage[], replayTo: number) {
        if (replayTo >= 0) {
            return Replayer.currentReplayOp < replayTo;
        }
        return false;
    }

    private emit(ops: ISequencedDocumentMessage[]) {
        debug("emitting", ops.length);
        ops.map((op) => this.deltaConnection.emit("op", op.clientId, op));
    }

    private async replayCore(fetchedOps: ISequencedDocumentMessage[]) {
        let current = 0;

        const replayNextOps = () => {
            // Emit the ops from replay to the end every "deltainterval" milliseconds
            // to simulate the socket stream
            const currentOp = fetchedOps[current];
            const playbackOps = [currentOp];
            const nextInterval = DelayInterval;
            current += 1;

            // debug(`Replay next ${this.replayCurrent + current}`);
            scheduleNext(nextInterval);
            this.emit(playbackOps);
        };
        const scheduleNext = (nextInterval: number) => {
            if (nextInterval >= 0 && current < fetchedOps.length) {
                setTimeout(replayNextOps, nextInterval);
                // debug(`Replay scheduled ${this.replayCurrent + current} ${nextInterval}`);
            } else {
                // debug(`Replay done ${this.replayCurrent + current}`);
                // this.replayCurrent += current;
            }
        };
        scheduleNext(DelayInterval);

        // tslint:disable-next-line:promise-must-complete
        // return new Promise((resolve, reject) => {
        //     const replayNextOps = () => {
        //         // Emit the ops from replay to the end every "deltainterval" milliseconds
        //         // to simulate the socket stream
        //         const currentOp = fetchedOps[current];
        //         const playbackOps = [currentOp];
        //         const nextInterval = DelayInterval;
        //         current += 1;

        //         // debug(`Replay next ${this.replayCurrent + current}`);
        //         scheduleNext(nextInterval);
        //         this.emit(playbackOps);
        //     };
        //     const scheduleNext = (nextInterval: number) => {
        //         if (nextInterval >= 0 && current < fetchedOps.length) {
        //             setTimeout(replayNextOps, nextInterval);
        //             // debug(`Replay scheduled ${this.replayCurrent + current} ${nextInterval}`);
        //         } else {
        //             // debug(`Replay done ${this.replayCurrent + current}`);
        //             // this.replayCurrent += current;
        //             Replayer.isReplayDone = true;
        //             resolve();
        //         }
        //     };
        //     scheduleNext(DelayInterval);
        // });
    }
}

export class ReplayFileDeltaConnection extends EventEmitter implements IDocumentDeltaConnection {

    public static replayer: Replayer;
    public static async Create(documentStorageService: IDocumentDeltaStorageService)
    : Promise<IDocumentDeltaConnection> {

        const connection = {
            clientId: "",
            existing: true,
            initialContents: [],
            initialMessages: [],
            initialSignals: [],
            maxMessageSize: ReplayMaxMessageSize,
            parentBranch: null,
            user: null,
        };
        const deltaConnection = new ReplayFileDeltaConnection(connection);
        this.fileDocumentStorageService = documentStorageService;
        this.deltaConnection = deltaConnection;
// tslint:disable-next-line: no-floating-promises
        await this.createReplayer();

        return deltaConnection;
    }

    public static async createReplayer() {
        this.replayer =  new Replayer(
            this.deltaConnection,
            this.fileDocumentStorageService);
// tslint:disable-next-line: no-floating-promises
// tslint:disable-next-line: no-string-based-set-timeout
        // setTimeout(this.replayer.start, 1000);
// tslint:disable-next-line: no-floating-promises
        this.replayer.start();
    }

    public static getReplayer() {
        return this.replayer;
    }

    private static fileDocumentStorageService: IDocumentDeltaStorageService;
    private static deltaConnection: ReplayFileDeltaConnection;

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
