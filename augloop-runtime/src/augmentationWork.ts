import * as agent from "@prague/routerlicious/dist/agent";
import { core } from "@prague/routerlicious/dist/client-api";
import { CollaborativeStringExtension, SharedString } from "@prague/routerlicious/dist/shared-string";
import { AugLoopRuntime } from "./augloop-runtime";
import { ProofingManager } from "./augloop-worker/proofingManager";

export class AugmentationWork extends agent.BaseWork implements agent.IWork {

    private augmentationInvoked: boolean = false;
    private fullId: string;
    private proofingManager: ProofingManager;

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
                client: { type: "augmentation"},
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

        // Temporary workaround: Currently annotations are not being added to the pending op list when the document
        // is not connected. Making sure that the document is fully connected before starting the spellchecker.
        if (this.document.isConnected) {
            this.opHandler = eventHandler;
            this.document.on("op", eventHandler);
        } else {
            console.log(`Waiting for the document to fully connected before running spellcheck!`);
            this.document.on("connected", () => {
                this.opHandler = eventHandler;
                this.document.on("op", eventHandler);
            });
        }
    }

    public async stop(): Promise<void> {
        if (this.proofingManager) {
            this.proofingManager.stop();
        }
        this.augRuntime.removeDocument(this.fullId);
        await super.stop();
    }

    private runAugmentation(fullId: string, object: core.ICollaborativeObject) {
        if (object.type === CollaborativeStringExtension.Type && !this.augmentationInvoked) {
            this.augmentationInvoked = true;
            const sharedString = object as SharedString;
            this.proofingManager = new ProofingManager(fullId, sharedString, this.augRuntime);
            this.proofingManager.run();
        }
    }
}
