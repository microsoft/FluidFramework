/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentAttributes, ITreeEntry, FileMode, TreeEntry } from "@fluidframework/protocol-definitions";
import { ICreateTreeEntry, ITree } from "@fluidframework/gitresources";
import { IQuorumSnapshot } from "./quorum";

export function getQuorumTreeEntries(
    documentId: string,
    minimumSequenceNumber: number,
    sequenceNumber: number,
    term: number,
    quorumSnapshot: IQuorumSnapshot,
): ITreeEntry[] {
    const documentAttributes: IDocumentAttributes = {
        minimumSequenceNumber,
        sequenceNumber,
        term,
    };

    const entries: ITreeEntry[] = [
        {
            mode: FileMode.File,
            path: "quorumMembers",
            type: TreeEntry.Blob,
            value: {
                contents: JSON.stringify(quorumSnapshot.members),
                encoding: "utf-8",
            },
        },
        {
            mode: FileMode.File,
            path: "quorumProposals",
            type: TreeEntry.Blob,
            value: {
                contents: JSON.stringify(quorumSnapshot.proposals),
                encoding: "utf-8",
            },
        },
        {
            mode: FileMode.File,
            path: "quorumValues",
            type: TreeEntry.Blob,
            value: {
                contents: JSON.stringify(quorumSnapshot.values),
                encoding: "utf-8",
            },
        },
        {
            mode: FileMode.File,
            path: "attributes",
            type: TreeEntry.Blob,
            value: {
                contents: JSON.stringify(documentAttributes),
                encoding: "utf-8",
            },
        },
    ];
    return entries;
}

export function mergeAppAndProtocolTree(
    appSummaryTree: ITree,
    protocolTree: ITree): ICreateTreeEntry[] {
    const newTreeEntries = appSummaryTree.tree
    .filter((value) => !isInvalidPath(value.path))
    .map((value) => {
        const createTreeEntry: ICreateTreeEntry = {
            mode: value.mode,
            path: value.path,
            sha: value.sha,
            type: value.type,
        };
        return createTreeEntry;
    });
    newTreeEntries.push({
        mode: FileMode.Directory,
        path: ".protocol",
        sha: protocolTree.sha,
        type: "tree",
    });
    return newTreeEntries;
}

export function generateServiceProtocolEntries(deli: string, scribe: string): ITreeEntry[] {
    const serviceProtocolEntries: ITreeEntry[] = [
        {
            mode: FileMode.File,
            path: "deli",
            type: TreeEntry.Blob,
            value: {
                contents: deli,
                encoding: "utf-8",
            },
        },
    ];

    serviceProtocolEntries.push(
        {
            mode: FileMode.File,
            path: "scribe",
            type: TreeEntry.Blob,
            value: {
                contents: scribe,
                encoding: "utf-8",
            },
        },
    );
    return serviceProtocolEntries;
}

const isInvalidPath = (path: string) => (
    path === ".protocol" ||
    path === ".logTail" ||
    path === ".serviceProtocol");
