import { core, MergeTree } from "../client-api";
import { CollaborativeStringExtension, SharedString } from "../shared-string";
import { BaseWork} from "./baseWork";
import { IWork} from "./definitions";
import { Spellcheker } from "./spellchecker";

export class SpellcheckerWork extends BaseWork implements IWork {

    private dict = new MergeTree.TST<number>();
    private spellchecker: Spellcheker;

    constructor(
        docId: string,
        private token: string,
        config: any,
        dictionary: MergeTree.TST<number>,
        private service: core.IDocumentService) {

        super(docId, config);
        this.dict = dictionary;
    }

    public async start(task: string): Promise<void> {
        await this.loadDocument(
            {
                blockUpdateMarkers: true,
                client: { type: "spell"},
                encrypted: undefined,
                localMinSeq: 0,
                token: this.token,
            },
            this.service,
            task);
        const eventHandler = (op: core.ISequencedDocumentMessage, object: core.ICollaborativeObject) => {
            if (op.type === core.ObjectOperation || op.type === core.AttachObject) {
                this.spellCheck(object);
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

    public async stop(task: string): Promise<void> {
        if (this.spellchecker) {
            this.spellchecker.stop();
        }
        await super.stop(task);
    }

    // Enable spell checking for the document
    // TODO will want to configure this as a pluggable insight
    private spellCheck(object: core.ICollaborativeObject) {
        if (object.type === CollaborativeStringExtension.Type && !this.spellchecker) {
            const sharedString = object as SharedString;
            this.spellchecker = new Spellcheker(sharedString, this.dict);
            this.spellchecker.run();
        }
    }
}
