import * as core from "@prague/api-definitions";
import * as MergeTree from "@prague/merge-tree";
import {
    IDocumentService,
    ISequencedDocumentMessage,
    ITokenProvider,
    IUser,
    MessageType,
} from "@prague/runtime-definitions";
import * as SharedString from "@prague/shared-string";
import { BaseWork} from "./baseWork";
import { IWork} from "./definitions";
import { Spellcheker } from "./spellchecker";

export class SpellcheckerWork extends BaseWork implements IWork {

    private dict = new MergeTree.TST<number>();
    private spellchecker: Spellcheker;

    constructor(
        docId: string,
        tenantId: string,
        user: IUser,
        tokenProvider: ITokenProvider,
        config: any,
        dictionary: MergeTree.TST<number>,
        private service: IDocumentService) {

        super(docId, tenantId, user, tokenProvider, config);
        this.dict = dictionary;
    }

    public async start(task: string): Promise<void> {
        await this.loadDocument(
            {
                blockUpdateMarkers: true,
                client: { type: "spell"},
                encrypted: undefined,
                localMinSeq: 0,
            },
            this.service,
            task);
        const eventHandler = (op: ISequencedDocumentMessage, object: core.ICollaborativeObject) => {
            if (op.type === MessageType.Operation || op.type === MessageType.Attach) {
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

    public async stop(): Promise<void> {
        if (this.spellchecker) {
            this.spellchecker.stop();
        }
        await super.stop();
    }

    // Enable spell checking for the document
    // TODO will want to configure this as a pluggable insight
    private spellCheck(object: core.ICollaborativeObject) {
        if (object.type === SharedString.CollaborativeStringExtension.Type && !this.spellchecker) {
            const sharedString = object as SharedString.SharedString;
            this.spellchecker = new Spellcheker(sharedString, this.dict);
            this.spellchecker.run();
        }
    }
}
