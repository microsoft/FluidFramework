/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISerializedHandle } from "@fluidframework/core-interfaces";
import { IDocumentAttributes, ISnapshotTree } from "@fluidframework/protocol-definitions";

export const isSerializedHandle = (value: any): value is ISerializedHandle =>
    value?.type === "__fluid_handle__";

/** Reads a blob from storage and parses it from JSON. */
export type ReadAndParseBlob = <T>(id: string) => Promise<T>;

/**
 * Fetches the sequence number of the snapshot tree by examining the protocol.
 * @param tree - snapshot tree to examine
 * @param readAndParseBlob - function to read blob contents from storage
 * and parse the result from JSON.
 */
 export async function seqFromTree(
    tree: ISnapshotTree,
    readAndParseBlob: ReadAndParseBlob,
): Promise<number> {
    const attributesHash = tree.trees[".protocol"].blobs.attributes;
    const attrib = await readAndParseBlob<IDocumentAttributes>(attributesHash);
    return attrib.sequenceNumber;
}
