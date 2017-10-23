import * as api from "../api-core";
import * as intelligence from "../intelligence";
import * as mergeTree from "../merge-tree";
import * as Collections from "../merge-tree/collections";
import { Spellcheker } from "./";
import { BaseWork} from "./baseWork";
import { IWork} from "./work";

export class SpellcheckerWork extends BaseWork implements IWork {

    private dict = new Collections.TST<number>();
    private spellcheckInvoked: boolean = false;

    constructor(docId: string, config: any, dictionary: Collections.TST<number>) {
        super(docId, config);
        this.dict = dictionary;
    }

    public async start(): Promise<void> {
        await this.loadDocument({ blockUpdateMarkers: true, localMinSeq: 0, encrypted: undefined });
        const eventHandler = (op: api.ISequencedDocumentMessage) => {
            if (op.type === api.ObjectOperation) {
                const objectId = op.contents.address;
                const object = this.document.get(objectId);
                this.spellCheck(object);
            } else if (op.type === api.AttachObject) {
                const object = this.document.get(op.contents.id);
                this.spellCheck(object);
            }
        };
        this.operation = eventHandler;
        this.document.on("op", eventHandler);
        return Promise.resolve();
    }

    private spellCheck(object: api.ICollaborativeObject) {
        if (object.type === mergeTree.CollaboritiveStringExtension.Type && !this.spellcheckInvoked) {
            this.spellcheckInvoked = true;
            const sharedString = object as mergeTree.SharedString;
            // Enable spell checking for the document
            // TODO will want to configure this as a pluggable insight
            const spellcheckerClient = intelligence.spellcheckerService.factory.create(
                this.config.intelligence.spellchecker);
            const spellchecker = new Spellcheker(sharedString, this.dict, spellcheckerClient);
            spellchecker.run();
        }
    }
}
