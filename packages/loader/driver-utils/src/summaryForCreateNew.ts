/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	ISummaryTree,
	SummaryType,
	ISummaryBlob,
	ICommittedProposal,
	IDocumentAttributes,
} from "@fluidframework/protocol-definitions";

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
): summary is CombinedAppAndProtocolSummary {
	if (
		summary?.tree === undefined ||
		summary.tree?.[".app"]?.type !== SummaryType.Tree ||
		summary.tree?.[".protocol"]?.type !== SummaryType.Tree
	) {
		return false;
	}
	const treeKeys = Object.keys(summary.tree);
	if (treeKeys.length !== 2) {
		return false;
	}
	return true;
}

/**
 * Combine the app summary and protocol summary in 1 tree.
 * @param appSummary - Summary of the app.
 * @param protocolSummary - Summary of the protocol.
 * @internal
 *
 * @deprecated 2.0.0-internal.3.4.0 - Not intended for public use.  Will be moved to container-loader and no longer exported in an upcoming release.
 */
export function combineAppAndProtocolSummary(
	appSummary: ISummaryTree,
	protocolSummary: ISummaryTree,
): CombinedAppAndProtocolSummary {
	assert(
		!isCombinedAppAndProtocolSummary(appSummary),
		0x5a8 /* app summary is already a combined tree! */,
	);
	assert(
		!isCombinedAppAndProtocolSummary(protocolSummary),
		0x5a9 /* protocol summary is already a combined tree! */,
	);
	const createNewSummary: CombinedAppAndProtocolSummary = {
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
	return JSON.parse(attributesBlob.content as string) as IDocumentAttributes;
}

/**
 * Extract quorum values from the protocol summary.
 * @param protocolSummary - protocol summary from which the values are to be extracted.
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
