/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISummaryBlob, ISummaryTree, SummaryType } from "@fluidframework/driver-definitions";
import {
	ICommittedProposal,
	IDocumentAttributes,
} from "@fluidframework/driver-definitions/internal";

/**
 * Defines the current layout of an .app + .protocol summary tree
 * this is used internally for create new, and single commit summary
 * @internal
 */
export interface CombinedAppAndProtocolSummary extends ISummaryTree {
	tree: {
		[".app"]: ISummaryTree;
		[".protocol"]: ISummaryTree;
	};
}

/**
 * Validates the current layout of an .app + .protocol summary tree
 * this is used internally for create new, and single commit summary
 * @internal
 */
export function isCombinedAppAndProtocolSummary(
	summary: ISummaryTree | undefined,
	...optionalRootTrees: string[]
): summary is CombinedAppAndProtocolSummary {
	if (
		summary?.tree === undefined ||
		summary.tree?.[".app"]?.type !== SummaryType.Tree ||
		summary.tree?.[".protocol"]?.type !== SummaryType.Tree
	) {
		return false;
	}
	const treeKeys = Object.keys(summary.tree).filter((t) => !optionalRootTrees.includes(t));
	if (treeKeys.length !== 2) {
		return false;
	}
	return true;
}

/**
 * Extract the attributes from the protocol summary.
 * @param protocolSummary - protocol summary from which the values are to be extracted.
 * @internal
 */
export function getDocAttributesFromProtocolSummary(
	protocolSummary: ISummaryTree,
): IDocumentAttributes {
	const attributesBlob = protocolSummary.tree.attributes as ISummaryBlob;
	return JSON.parse(attributesBlob.content as string) as IDocumentAttributes;
}

/**
 * Extract quorum values from the protocol summary.
 * @param protocolSummary - protocol summary from which the values are to be extracted.
 * @internal
 */
export function getQuorumValuesFromProtocolSummary(
	protocolSummary: ISummaryTree,
): [string, ICommittedProposal][] {
	const quorumValuesBlob = protocolSummary.tree.quorumValues as ISummaryBlob;
	const quorumValues = JSON.parse(quorumValuesBlob.content as string) as [
		string,
		ICommittedProposal,
	][];
	return quorumValues;
}
