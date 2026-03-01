/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * An error thrown when a path is not within a Git repository.
 */
export class NotInGitRepository extends Error {
	constructor(
		/**
		 * The path that was checked and found to be outside a Git repository.
		 */
		public readonly path: string,
	) {
		super(`Path is not in a Git repository: ${path}`);
	}
}
