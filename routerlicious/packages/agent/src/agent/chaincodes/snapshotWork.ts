import {
    ICodeLoader,
    IDocumentService,
    IPlatformFactory,
    ISequencedDocumentMessage,
    ITokenProvider,
} from "@prague/runtime-definitions";
import { IWork} from "../definitions";
import { Serializer } from "../serializer";
import { runAfterWait } from "../utils";
import { ChaincodeWork } from "./chaincodeWork";

// Consider idle 5s of no activity. And snapshot if a minute has gone by with no snapshot.
const IdleDetectionTime = 5000;
const MaxTimeWithoutSnapshot = IdleDetectionTime * 12;
const SnapshotRetryTime = 1000;

// Snapshot if 1000 ops received since last snapshot.
const MaxOpCountWithoutSnapshot = 1000;

export class SnapshotWork extends ChaincodeWork implements IWork {
    private serializer: Serializer;

    constructor(
        docId: string,
        tenantId: string,
        tokenProvider: ITokenProvider,
        service: IDocumentService,
        codeLoader: ICodeLoader,
        platformFactory: IPlatformFactory,
        task: string) {
        super(docId, tenantId, tokenProvider, service, codeLoader, platformFactory, task);
    }

    public async start(): Promise<void> {
        await this.loadChaincode(
            { encrypted: undefined, localMinSeq: 0, client: { type: "snapshot"} });
        this.serializer = new Serializer(
            this.document,
            IdleDetectionTime,
            MaxTimeWithoutSnapshot,
            SnapshotRetryTime,
            MaxOpCountWithoutSnapshot);
        const eventHandler = (op: ISequencedDocumentMessage) => {
            this.serializer.run(op);
        };
        this.document.on("op", eventHandler);

        return Promise.resolve();
    }

    public async stop(): Promise<void> {
        if (this.serializer) {
            await runAfterWait(
                this.serializer.isSnapshotting,
                this.serializer,
                "snapshotted",
                async () => {
                    this.serializer.stop();
                });
        }
        await super.stop();
    }
}
