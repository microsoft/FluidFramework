/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidCodeDetails } from "@fluidframework/container-definitions/internal";
import type { ICommittedProposal } from "@fluidframework/driver-definitions/internal";

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
