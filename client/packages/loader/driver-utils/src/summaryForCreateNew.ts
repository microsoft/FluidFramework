/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ISummaryTree,
    SummaryType,
    ISummaryBlob,
    ICommittedProposal,
    IDocumentAttributes,
} from "@fluidframework/protocol-definitions";

/**
 * Combine the app summary and protocol summary in 1 tree.
 * @param appSummary - Summary of the app.
 * @param protocolSummary - Summary of the protocol.
 */
export function combineAppAndProtocolSummary(
    appSummary: ISummaryTree,
    protocolSummary: ISummaryTree,
): ISummaryTree {
    const createNewSummary: ISummaryTree = {
        type: SummaryType.Tree,
        tree: {
            ".protocol": protocolSummary,
            ".app": appSummary,
        },
    };
    return createNewSummary;
}

/**
 * Extract the attributes from the protocol summary.
 * @param protocolSummary - protocol summary from which the values are to be extracted.
 */
export function getDocAttributesFromProtocolSummary(
    protocolSummary: ISummaryTree,
): IDocumentAttributes {
    const attributesBlob = protocolSummary.tree.attributes as ISummaryBlob;
    const documentAttributes = JSON.parse(attributesBlob.content as string) as IDocumentAttributes;
    documentAttributes.term = documentAttributes.term ?? 1;
    return documentAttributes;
}

/**
 * Extract quorum values from the protocol summary.
 * @param protocolSummary - protocol summary from which the values are to be extracted.
 */
export function getQuorumValuesFromProtocolSummary(
    protocolSummary: ISummaryTree,
): [string, ICommittedProposal][] {
    const quorumValuesBlob = protocolSummary.tree.quorumValues as ISummaryBlob;
    const quorumValues = JSON.parse(quorumValuesBlob.content as string) as [string, ICommittedProposal][];
    return quorumValues;
}
