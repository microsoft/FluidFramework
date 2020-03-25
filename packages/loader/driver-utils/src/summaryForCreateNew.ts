/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ISummaryTree,
    SummaryType,
    ISummaryBlob,
    ICommittedProposal,
    IDocumentAttributes,
} from "@microsoft/fluid-protocol-definitions";

export function combineAppAndProtocolSummary(
    appSummary: ISummaryTree,
    protocolSummary: ISummaryTree,
): ISummaryTree {
    const fullSummary: ISummaryTree = {
        type: SummaryType.Tree,
        tree: {
            ".protocol": protocolSummary,
            ".app": appSummary,
        },
    };
    return fullSummary;
}

export function getDocAttributesAndQuorumValuesFromProtocolSummary(
    protocolSummary: ISummaryTree,
): {documentAttributes: IDocumentAttributes, quorumValues: [string, ICommittedProposal][]} {
    const quorumValuesBlob = protocolSummary.tree.quorumValues as ISummaryBlob;
    const attributesBlob = protocolSummary.tree[".attributes"] as ISummaryBlob;
    const quorumValues = JSON.parse(quorumValuesBlob.content as string) as [string, ICommittedProposal][];
    const documentAttributes = JSON.parse(attributesBlob.content as string) as IDocumentAttributes;
    return {documentAttributes, quorumValues};
}
