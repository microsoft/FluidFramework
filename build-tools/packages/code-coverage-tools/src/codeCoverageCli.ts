/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IADOCodeCoverageConstants } from "./ADO";
import { postCodeCoverageSummary } from "./codeCoveragePr";

/**
 * Interface that reflects the type of object returned by the coverage summary method
 */
export interface CodeCoverageSummary {
	/**
	 * Message to be put in the comment
	 */
	commentMessage: string;

	/**
	 * Whether to fail the build or not
	 */
	failBuild: boolean;
}

/**
 * Entrypoint for posting the code coverage summary on the PRs
 * @param adoToken - adoToken ADO token
 * @param coverageReportsFolder - The path to where the coverage reports exist
 * @param codeCoverageConstants - The code coverage constants required for the code coverage analysis
 */
export async function codeCoverageCli(
	adoToken: string,
	coverageReportsFolder: string,
	codeCoverageConstants: IADOCodeCoverageConstants,
): Promise<CodeCoverageSummary> {
	return postCodeCoverageSummary(adoToken, coverageReportsFolder, codeCoverageConstants);
}
