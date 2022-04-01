/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ISummaryTree,
    SummaryType,
    ISummaryBlob,
} from "@fluidframework/protocol-definitions";

import { assert, bufferToString } from "@fluidframework/common-utils";

function readBlobContent(content: ISummaryBlob["content"]): any {
    const json =
        typeof content === "string" ? content : bufferToString(content, "utf8");
    return JSON.parse(json);
}

function validateKeyPresence(
    keys: string[],
    srcTree: ISummaryTree,
): boolean {
    const filtered = Object.keys(srcTree.tree).filter((i) =>
        keys.includes(i),
    );
    return filtered.length === keys.length;
}

function createBlobItem(content: any): ISummaryBlob {
    return {
        content: JSON.stringify(content),
        type: SummaryType.Blob,
    };
}

function validateTree(liveSummary: ISummaryTree): boolean {
    for (const key of Object.keys(liveSummary.tree)) {
        const o = liveSummary.tree[key];
        if (o.type === SummaryType.Handle) {
            return false;
        } else if (o.type === SummaryType.Tree && !validateTree(o)) {
            return false;
        }
    }
    return true;
}

class LiveV1SummarySanitizer {
    private readonly quorumKeyIdx = 0;
    private readonly quorumValIdx = 1;
    private readonly emptySummaryBlob: ISummaryBlob = {
        content: JSON.stringify([]),
        type: SummaryType.Blob,
    };

    constructor(private readonly srcSummary: ISummaryTree) {}

    public get sanitizedCopy(): ISummaryTree {
        const appTree = this.sanitizeAppTree(this.srcSummary);
        const protocolTree = this.sanitizeProtocolTree(this.srcSummary);
        return {
            type: SummaryType.Tree,
            tree: {
                ".app": appTree,
                ".protocol": protocolTree,
            },
        };
    }

    /**
     * Sanitize app tree
     * @param srcSummary - summary to transform
     */
    private sanitizeAppTree(srcSummary: ISummaryTree): ISummaryTree {
        const keys = [".channels", ".electedSummarizer", ".metadata"];
        assert(
            validateKeyPresence(keys, srcSummary),
            "Valid app tree keys should be present",
        );

        const parentTree = srcSummary.tree;
        const meta = readBlobContent(
            (parentTree[".metadata"] as ISummaryBlob).content,
        );
        assert(meta !== undefined, "Invalid app metadata");

        return {
            type: SummaryType.Tree,
            tree: {
                [".channels"]: parentTree[".channels"],
                [".electedSummarizer"]: createBlobItem({
                    electionSequenceNumber: 0,
                }),
                [".metadata"]: createBlobItem({
                    createContainerRuntimeVersion:
                        meta.createContainerRuntimeVersion,
                    createContainerTimestamp: meta.createContainerTimestamp,
                    summaryFormatVersion: meta.summaryFormatVersion,
                }),
            },
        };
    }

    /**
     * Sanitize protocol tree
     * @param srcSummary - summary to transform
     */
    private sanitizeProtocolTree(srcSummary: ISummaryTree): ISummaryTree {
        const protocolSummary = srcSummary.tree[".protocol"];
        assert(
            protocolSummary.type === SummaryType.Tree,
            "Invalid object type",
        );

        const keys = [
            "attributes",
            "quorumMembers",
            "quorumProposals",
            "quorumValues",
        ];

        assert(
            validateKeyPresence(keys, protocolSummary),
            "Valid protocol tree keys should be present",
        );

        const parentTree = protocolSummary.tree;
        const quorumValues = readBlobContent(
            (parentTree.quorumValues as ISummaryBlob).content,
        );

        assert(Array.isArray(quorumValues), "Invalid quorum values");
        const firstQuorumValue = quorumValues[0];
        assert(
            firstQuorumValue !== undefined && firstQuorumValue.length >= 2,
            "First quorum value not valid",
        );

        const codeProposal = firstQuorumValue[this.quorumValIdx];
        const committedCodeProposal = {
            key: codeProposal.key,
            value: codeProposal.value,
            approvalSequenceNumber: 0,
            commitSequenceNumber: 0,
            sequenceNumber: 0,
        };

        return {
            type: SummaryType.Tree,
            tree: {
                attributes: createBlobItem({
                    sequenceNumber: 0,
                    term: 1,
                    minimumSequenceNumber: 0,
                }),
                quorumMembers: { ...this.emptySummaryBlob },
                quorumProposals: { ...this.emptySummaryBlob },
                quorumValues: createBlobItem([
                    [firstQuorumValue[this.quorumKeyIdx], committedCodeProposal],
                ]),
            },
        };
    }
}

/**
 * Extracts ISummaryTree retreived from attached document that can be used to hydrate new (detached) container
 * @param liveSummary - summary
 */
export function getSanitizedCopy(liveSummary: ISummaryTree): ISummaryTree {
    assert(validateTree(liveSummary), "Summary tree is not valid");

    const meta = liveSummary.tree[".metadata"];
    assert(meta !== undefined, "Missing summary metadata");
    assert(meta.type === SummaryType.Blob, "Summary metadata is not valid");

    const metaContent = readBlobContent(meta.content) as Record<
        string,
        unknown
    >;
    assert(
        metaContent.summaryFormatVersion === 1,
        "We can only recover through v1 summaries",
    );

    const v1sanitizer = new LiveV1SummarySanitizer(liveSummary);
    return v1sanitizer.sanitizedCopy;
}
