/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Describes the result of a transaction. Transactions may either succeed and commit, or fail and abort.
 * @alpha
 */
export enum TransactionResult {
	/**
	 * Indicates the transaction succeeded. This value is falsy.
	 */
	Commit = 0,
	/**
	 * Indicates the transaction failed. This value is truthy.
	 */
	Abort = 1,
}
