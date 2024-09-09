/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { postCodeCoverageSummary } from "./codeCoveragePr";

// Interface that reflects the type of object returned by the coverage summary method
export interface CodeCoverageSummary {
	// Message to be put in the comment
	commentMessage: string;

	// Whether to fail the build or not
	failBuild: boolean;
}

export async function codeCoverageCli(
	adoToken: string,
	adoPrId: number,
	adoBuildId: number,
	coverageReportsFolder: string,
): Promise<CodeCoverageSummary> {
	return postCodeCoverageSummary(adoToken, adoPrId, adoBuildId, coverageReportsFolder);
}
