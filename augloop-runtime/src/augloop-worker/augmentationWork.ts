import * as agent from "@prague/routerlicious/dist/agent";
import { core } from "@prague/routerlicious/dist/client-api";
import { CollaborativeStringExtension, SharedString } from "@prague/routerlicious/dist/shared-string";

export class AugmentationWork extends agent.BaseWork implements agent.IWork {

    private spellcheckInvoked: boolean = false;

    constructor(
        docId: string,
        private token: string,
        config: any,
        private service: core.IDocumentService) {

        super(docId, config);
    }

    public async start(): Promise<void> {
        await this.loadDocument(
            { blockUpdateMarkers: true, localMinSeq: 0, encrypted: undefined, token: this.token },
            this.service);
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
        if (object.type === CollaborativeStringExtension.Type && !this.spellcheckInvoked) {
            this.spellcheckInvoked = true;
            const sharedString = object as SharedString;
            console.log(sharedString.sequenceNumber);
            console.log(`Start running augmentation`);
        }
    }
}
