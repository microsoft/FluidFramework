/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Defines scope access for a Container/Document.
 * @alpha
 */
export enum ScopeType {
	/**
	 * Read access is supported on the Container/Document
	 */
	DocRead = "doc:read",

	/**
	 * Write access is supported on the Container/Document
	 */
	DocWrite = "doc:write",

	/**
	 * User can generate new summaries operations
	 */
	SummaryWrite = "summary:write",
}
