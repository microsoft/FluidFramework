import { core, MergeTree } from "../client-api";
import * as intelligence from "../intelligence";
import { CollaboritiveStringExtension, SharedString } from "../shared-string";
import { BaseWork} from "./baseWork";
import { Spellcheker } from "./spellchecker";
import { IWork} from "./work";

export class SpellcheckerWork extends BaseWork implements IWork {

    private dict = new MergeTree.TST<number>();
    private spellcheckInvoked: boolean = false;

    constructor(
        docId: string,
        private token: string,
        config: any,
        dictionary: MergeTree.TST<number>,
        private service: core.IDocumentService) {

        super(docId, config);
        this.dict = dictionary;
    }

    public async start(): Promise<void> {
        await this.loadDocument(
            { blockUpdateMarkers: true, localMinSeq: 0, encrypted: undefined, token: this.token },
            this.service);
        const eventHandler = (op: core.ISequencedDocumentMessage, object: core.ICollaborativeObject) => {
            if (op.type === core.ObjectOperation) {
                this.spellCheck(object);
            } else if (op.type === core.AttachObject) {
                this.spellCheck(object);
            }
        };
        this.operation = eventHandler;
        this.document.on("op", eventHandler);
        return Promise.resolve();
    }

    private spellCheck(object: core.ICollaborativeObject) {
        if (object.type === CollaboritiveStringExtension.Type && !this.spellcheckInvoked) {
            this.spellcheckInvoked = true;
            const sharedString = object as SharedString;
            // Enable spell checking for the document
            // TODO will want to configure this as a pluggable insight
            const spellcheckerClient = intelligence.spellcheckerService.factory.create(
                this.config.intelligence.spellchecker);
            const spellchecker = new Spellcheker(sharedString, this.dict, spellcheckerClient);
            spellchecker.run();
        }
    }
}
