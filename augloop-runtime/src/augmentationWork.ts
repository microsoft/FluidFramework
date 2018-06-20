import * as agent from "@prague/routerlicious/dist/agent";
import { core } from "@prague/routerlicious/dist/client-api";
import { CollaborativeStringExtension, SharedString } from "@prague/routerlicious/dist/shared-string";
import { AugLoopRuntime } from "./augloop-runtime";
import { ProofingManager } from "./augloop-worker/proofingManager";

export class AugmentationWork extends agent.BaseWork implements agent.IWork {

    private augmentationInvoked: boolean = false;

    constructor(
        docId: string,
        private token: string,
        config: any,
        private service: core.IDocumentService,
        private augRuntime: AugLoopRuntime) {

        super(docId, config);
    }

    public async start(task: string): Promise<void> {
        await this.loadDocument(
            { blockUpdateMarkers: true, localMinSeq: 0, encrypted: undefined, token: this.token },
            this.service,
            task);
        const eventHandler = (op: core.ISequencedDocumentMessage, object: core.ICollaborativeObject) => {
            if (op.type === core.ObjectOperation || op.type === core.AttachObject) {
                this.runAugmentation(object);
            }
        };
        this.operation = eventHandler;
        this.document.on("op", eventHandler);
        return Promise.resolve();
    }

    private runAugmentation(object: core.ICollaborativeObject) {
        if (object.type === CollaborativeStringExtension.Type && !this.augmentationInvoked) {
            this.augmentationInvoked = true;
            const sharedString = object as SharedString;
            const proofingManager = new ProofingManager(sharedString, this.augRuntime);
            proofingManager.run();
        }
    }
}
