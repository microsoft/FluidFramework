/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { ISummaryContext } from "@fluidframework/driver-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import { IDocumentAttributes, ISnapshotTree, ISummaryTree } from "@fluidframework/protocol-definitions";
import { ContainerStorageAdapter } from "./containerStorageAdapter";
import { IDetachedBlobStorage } from "./loader";

/**
 * TODO: Should we separate this out into its own adapter class instead of extending?
 */
export class VirtualContainerStorageAdapter extends ContainerStorageAdapter {
    constructor(
        private readonly getRealSequenceNumber: (virtualSequenceNumber: number) => number,
        private readonly getVirtualSequenceNumber: (sequenceNumber: number) => number,
        detachedBlobStorage: IDetachedBlobStorage | undefined,
        logger: ITelemetryLogger,
        captureProtocolSummary?: () => ISummaryTree,
    ) {
        super(detachedBlobStorage, logger, captureProtocolSummary);
    }

    public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        const newContext: ISummaryContext = {
            ...context,
            referenceSequenceNumber: this.getRealSequenceNumber(context.referenceSequenceNumber),
        }
        return super.uploadSummaryWithContext(summary, newContext);
    }

    /**
     * TODO: moving method somewhere else might make more sense (changing IDocumentService affects a lot)
     * - could create new interface for context that will include IDocumentService along with some other methods
     */
    public async getSequenceNumberFromTree(tree: ISnapshotTree): Promise<number> {
        const attributesHash = tree.trees[".protocol"].blobs.attributes;
        const attrib = await readAndParse<IDocumentAttributes>(this, attributesHash);
        return this.getVirtualSequenceNumber(attrib.sequenceNumber);
    }
}
