import { MergeTree } from "@prague/routerlicious/dist/client-api";
import { SharedString } from "@prague/routerlicious/dist/shared-string";
import { EventEmitter } from "events";
import {AugLoopRuntime, IAugResult, IDocTile, inputSchemaName } from "../augloop-runtime";
import { LocalRefManager } from "./localRefManager";

export interface ILocalRefText {

    beginPos: number;

    endPos: number;

    content: string;
}

export class SliceManager extends EventEmitter {
    private requestId: number = 0;
    private docId: string;
    private refMap: Map<string, LocalRefManager> = new Map<string, LocalRefManager>();

    constructor(
        private root: SharedString,
        private runtime: AugLoopRuntime,
        private applyInsight: (result: IAugResult) => void) {
        super();
        this.docId = this.root.id;
        this.handleAugLoopResponse();
    }

    public submit(begin: number, end: number, content: string) {
        const ref = new LocalRefManager(this.root, begin, end);
        const refId = `${begin}-${end}`;
        this.refMap.set(refId, ref);
        const input: IDocTile = {
            begin,
            content,
            documentId: this.docId,
            end,
            reqOrd: ++this.requestId,
            requestTime: Date.now(),
        };
        this.runtime.submit(input, inputSchemaName);
    }

    private handleAugLoopResponse() {
        this.runtime.on("error", (error) => {
            this.emit("error", error);
        });
        this.runtime.on("result", (result: IAugResult) => {
            if (result.input.documentId !== this.docId) {
                return;
            }
            const refId = `${result.input.begin}-${result.input.end}`;
            const localRef = this.refMap.get(refId);
            const localRefText = this.getTextFromLocalRef(localRef);
            const textBefore = result.input.content;
            const textNow = localRefText.content;
            // Only apply insight if text did not change inbetween calls. Otherwise resubmit.
            if (textBefore.length === textNow.length && textBefore === textNow) {
                this.applyInsight(result);
            } else {
                this.submit(localRefText.beginPos, localRefText.endPos, localRefText.content);
            }
            // Always remove references. Resubmission will create a new one.
            localRef.removeReferences();
        });
    }

    private getTextFromLocalRef(localRef: LocalRefManager): ILocalRefText {
        const beginPos = localRef.getBeginRef().toPosition(
            this.root.client.mergeTree,
            MergeTree.UniversalSequenceNumber,
            this.root.client.getClientId());
        const endPos = localRef.getEndRef().toPosition(
            this.root.client.mergeTree,
            MergeTree.UniversalSequenceNumber,
            this.root.client.getClientId());
        const content =  this.root.client.mergeTree.getText(
            MergeTree.UniversalSequenceNumber,
            this.root.client.getClientId(),
            "",
            beginPos,
            endPos);
        return {
            beginPos,
            content,
            endPos,
        };
    }
}
