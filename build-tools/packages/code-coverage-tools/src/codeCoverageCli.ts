/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { postCodeCoverageSummary } from "./codeCoveragePr";

/**
 * Interface that reflects the type of object returned by the coverage summary method
 */
export interface CodeCoverageSummary {
	// Message to be put in the comment
	commentMessage: string;

	// Whether to fail the build or not
	failBuild: boolean;
}

/**
 * Entrypoint for posting the code coverage summary on the PRs
 * @param adoToken - adoToken ADO token
 * @param coverageReportsFolder - The path to where the coverage reports exist
 */
export async function codeCoverageCli(
	adoToken: string,
	coverageReportsFolder: string,
): Promise<CodeCoverageSummary> {
	return postCodeCoverageSummary(adoToken, coverageReportsFolder);
}
