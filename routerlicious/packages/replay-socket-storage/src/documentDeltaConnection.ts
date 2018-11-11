import {
    IDeltaStorageService,
    IDocumentDeltaConnection,
    IDocumentMessage,
    ISequencedDocumentMessage,
    ITokenProvider,
    IUser,
} from "@prague/runtime-definitions";
import * as messages from "@prague/socket-storage-shared";
import { EventEmitter } from "events";

// Simulated delay interval for emitting the ops
const DelayInterval = 50;

// Since the replay service never actually sends messages the size below is arbitrary
const ReplayMaxMessageSize = 16 * 1024;

export class ReplayDocumentDeltaConnection extends EventEmitter implements IDocumentDeltaConnection {
    public static async Create(
        tenantId: string,
        id: string,
        tokenProvider: ITokenProvider,
        storageService: IDeltaStorageService,
        replayFrom: number,
        replayTo: number,
       ): Promise<IDocumentDeltaConnection> {

        const connection = {
            clientId: "",
            existing: true,
            initialMessages: [],
            maxMessageSize: ReplayMaxMessageSize,
            parentBranch: null,
            user: null,
        };
        const deltaConnection = new ReplayDocumentDeltaConnection(id, connection);
        // tslint:disable-next-line:no-floating-promises
        this.FetchAndEmitOps(deltaConnection, tenantId, id, tokenProvider, storageService, replayFrom, replayTo);

        return deltaConnection;
    }

    private static async FetchAndEmitOps(
        deltaConnection: ReplayDocumentDeltaConnection,
        tenantId: string,
        id: string,
        tokenProvider: ITokenProvider,
        storageService: IDeltaStorageService,
        replayFrom: number,
        replayTo: number) {

        const fetchedOps = await storageService.get(tenantId, id, tokenProvider, 0, replayTo);
        let current = 0;
        let playbackOps: ISequencedDocumentMessage[] = [];
        if (fetchedOps.length > 0 && replayFrom > 0) {
            // If the requested playback range is not from 0, emit all the
            // ops from 0 to from immediately
            playbackOps.push(...fetchedOps.slice(current, replayFrom));
            current = replayFrom;
            deltaConnection.emit("op", id, playbackOps);
        }

        const intervalHandle = setInterval(
            () => {
                // Emit the ops from replay to the end every "deltainterval" milliseconds
                // to simulate the socket stream
                if (current < fetchedOps.length) {
                    playbackOps = [];
                    playbackOps.push(fetchedOps[current]);
                    current += 1;
                    deltaConnection.emit("op", id, playbackOps);
                } else {
                    clearInterval(intervalHandle);
                }
            },
            DelayInterval);
    }

    public get clientId(): string {
        return this.details.clientId;
    }

    public get existing(): boolean {
        return this.details.existing;
    }

    public get parentBranch(): string {
        return this.details.parentBranch;
    }

    public get user(): IUser {
        return this.details.user;
    }

    public get initialMessages(): ISequencedDocumentMessage[] {
        return this.details.initialMessages;
    }

    public readonly maxMessageSize = ReplayMaxMessageSize;

    constructor(
        public documentId: string,
        public details: messages.IConnected,
        ) {
        super();
    }

    public submit(message: IDocumentMessage): void {
        console.log("dropping the outbound message");
    }

    public async submitAsync(message: IDocumentMessage): Promise<void> {
        console.log("dropping the outbound message and wait for response");
    }

    public disconnect() {
        console.log("no implementation for disconnect...");
    }
}
