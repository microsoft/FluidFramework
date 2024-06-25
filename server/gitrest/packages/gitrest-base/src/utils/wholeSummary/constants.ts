/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const Constants = Object.freeze({
	/**
	 * The special value used to point at the most recent summary version without knowing the actual sha.
	 */
	LatestSummarySha: "latest",
	/**
	 * The tree path name used for every {@link IFullGitTree} stored as a single blob.
	 */
	FullTreeBlobPath: ".fullTree",
	/**
	 * Sha256 hash of "initialsummarysha". Used to refer to the initial summary when using lazy git repo feature.
	 */
	InitialSummarySha: "8867f5f7386bad83b7a0fd49d4906046311cbe3c520bac21f225e86abd8055b6",
});
