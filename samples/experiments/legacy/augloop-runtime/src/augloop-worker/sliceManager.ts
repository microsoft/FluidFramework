/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { MergeTree } from "@prague/routerlicious/dist/client-api";
import { SharedString } from "@prague/routerlicious/dist/shared-string";
import {AugLoopRuntime, IAugResult, IDocTile, inputSchemaName } from "../augloop-runtime";
import { LocalRefManager } from "./localRefManager";

export interface ILocalRefText {

    beginPos: number;

    endPos: number;

    content: string;
}

export class SliceManager {
    private requestId: number = 0;
    private refMap: Map<string, LocalRefManager> = new Map<string, LocalRefManager>();

    constructor(
        private fullId: string,
        private root: SharedString,
        private runtime: AugLoopRuntime,
        private applyInsight: (result: IAugResult) => void) {
    }

    public submit(begin: number, end: number, content: string) {
        const ref = new LocalRefManager(this.root, begin, end);
        if (ref.prepare()) {
            const refId = `${begin}:${end}`;
            this.refMap.set(refId, ref);
            const input: IDocTile = {
                begin,
                content,
                documentId: this.fullId,
                end,
                reqOrd: ++this.requestId,
                requestTime: Date.now(),
            };
            this.runtime.submit(this.fullId, input, inputSchemaName, this);
        }
    }

    public onResult(result: IAugResult) {
        const refId = `${result.input.begin}:${result.input.end}`;
        if (this.refMap.has(refId)) {
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
            this.refMap.delete(refId);
        }
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
        const content =  this.root.getText(beginPos, endPos);
        return {
            beginPos,
            content,
            endPos,
        };
    }
}
