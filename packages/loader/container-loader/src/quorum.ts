/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/common-utils";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { ICommittedProposal } from "@fluidframework/protocol-definitions";

export function getCodeDetailsFromQuorumValues(
	quorumValues: [string, ICommittedProposal][],
): IFluidCodeDetails {
	const qValuesMap = new Map(quorumValues);
	const proposal = qValuesMap.get("code");
	assert(proposal !== undefined, 0x2dc /* "Cannot find code proposal" */);
	return proposal?.value as IFluidCodeDetails;
}

export function initQuorumValuesFromCodeDetails(
	source: IFluidCodeDetails,
): [string, ICommittedProposal][] {
	// Seed the base quorum to be an empty list with a code quorum set
	const committedCodeProposal: ICommittedProposal = {
		key: "code",
		value: source,
		approvalSequenceNumber: 0,
		commitSequenceNumber: 0,
		sequenceNumber: 0,
	};
	return [["code", committedCodeProposal]];
}
