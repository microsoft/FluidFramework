/*
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    SummaryType,
    ISummaryTree,
    SummaryObject,
} from "@fluidframework/protocol-definitions";

export class SummaryTreeAssembler {
    private attachmentCounter: number = 0;
    private readonly summaryTree: { [path: string]: SummaryObject } = {};

    public get summary(): ISummaryTree {
        return {
            type: SummaryType.Tree,
            tree: { ...this.summaryTree },
        };
    }

    public addBlob(key: string, content: string | Uint8Array): void {
        this.summaryTree.tree[key] = {
            type: SummaryType.Blob,
            content,
        };
    }

    public addHandle(
        key: string,
        handleType: SummaryType.Tree | SummaryType.Blob | SummaryType.Attachment,
        handle: string): void
    {
        this.summaryTree[key] = {
            type: SummaryType.Handle,
            handleType,
            handle,
        };
    }

    public addTree(key: string, summary: ISummaryTree): void {
        this.summaryTree[key] = summary;
    }

    public addAttachment(id: string) {
        this.summaryTree[this.attachmentCounter++] = { id, type: SummaryType.Attachment };
    }
}
