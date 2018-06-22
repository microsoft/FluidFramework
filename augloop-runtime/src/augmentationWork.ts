import * as agent from "@prague/routerlicious/dist/agent";
import { core } from "@prague/routerlicious/dist/client-api";
import { CollaborativeStringExtension, SharedString } from "@prague/routerlicious/dist/shared-string";
import { AugLoopRuntime } from "./augloop-runtime";
import { ProofingManager } from "./augloop-worker/proofingManager";

export class AugmentationWork extends agent.BaseWork implements agent.IWork {

    private augmentationInvoked: boolean = false;
    private fullId: string;

    constructor(
        private tenantId: string,
        private docId: string,
        private token: string,
        config: any,
        private service: core.IDocumentService,
        private augRuntime: AugLoopRuntime) {
        super(docId, config);
        this.fullId = `${this.tenantId}/${this.docId}`;
    }

    public async start(task: string): Promise<void> {
        await this.loadDocument(
            {
                blockUpdateMarkers: true,
                client: { type: "robot"},
                encrypted: undefined,
                localMinSeq: 0,
                token: this.token,
            },
            this.service,
            task);
        const eventHandler = (op: core.ISequencedDocumentMessage, object: core.ICollaborativeObject) => {
            if (op.type === core.ObjectOperation || op.type === core.AttachObject) {
                this.runAugmentation(this.fullId, object);
            }
        };
        this.operation = eventHandler;
        this.document.on("op", eventHandler);
        return Promise.resolve();
    }

    public async stop(task: string): Promise<void> {
        this.augRuntime.removeDocument(this.fullId);
        await super.stop(task);
    }

    private runAugmentation(fullId: string, object: core.ICollaborativeObject) {
        if (object.type === CollaborativeStringExtension.Type && !this.augmentationInvoked) {
            this.augmentationInvoked = true;
            const sharedString = object as SharedString;
            const proofingManager = new ProofingManager(fullId, sharedString, this.augRuntime);
            proofingManager.run();
        }
    }
}
