/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Describes the result of a transaction.
 * Transactions may either succeed and commit, or fail and abort.
 */
export enum TransactionResult {
	/**
	 * Indicates the transaction failed.
	 */
	Abort,
	/**
	 * Indicates the transaction succeeded.
	 */
	Commit,
}
