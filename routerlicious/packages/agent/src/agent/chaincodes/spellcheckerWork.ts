import * as core from "@prague/api-definitions";
import * as MergeTree from "@prague/merge-tree";
import {
    ICodeLoader,
    IDocumentService,
    IPlatformFactory,
    ISequencedDocumentMessage,
    ITokenProvider,
    MessageType,
} from "@prague/runtime-definitions";
import * as Sequence from "@prague/sequence";
import { IWork} from "../definitions";
import { Spellcheker } from "../spellchecker";
import { ChaincodeWork } from "./chaincodeWork";

export class SpellcheckerWork extends ChaincodeWork implements IWork {

    private dict = new MergeTree.TST<number>();
    private spellchecker: Spellcheker;

    constructor(
        docId: string,
        tenantId: string,
        tokenProvider: ITokenProvider,
        service: IDocumentService,
        codeLoader: ICodeLoader,
        platformFactory: IPlatformFactory,
        task: string,
        dictionary: MergeTree.TST<number>) {

        super(docId, tenantId, tokenProvider, service, codeLoader, platformFactory, task);
        this.dict = dictionary;
    }

    public async start(): Promise<void> {
        await this.loadChaincode(
            {
                blockUpdateMarkers: true,
                client: { type: "spell"},
                encrypted: undefined,
                localMinSeq: 0,
            });
        const eventHandler = (op: ISequencedDocumentMessage, object: core.ICollaborativeObject) => {
            if (op.type === MessageType.Operation || op.type === MessageType.Attach) {
                this.spellCheck(object);
            }
        };

        // Temporary workaround: Currently annotations are not being added to the pending op list when the document
        // is not connected. Making sure that the document is fully connected before starting the spellchecker.
        if (this.document.connected) {
            this.document.on("op", eventHandler);
        } else {
            console.log(`Waiting for the document to fully connected before running spellcheck!`);
            this.document.on("connected", () => {
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
        if (object.type === Sequence.CollaborativeStringExtension.Type && !this.spellchecker) {
            const sharedString = object as Sequence.SharedString;
            this.spellchecker = new Spellcheker(sharedString, this.dict);
            this.spellchecker.run();
        }
    }
}
