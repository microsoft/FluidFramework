/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type {
	TreeContextAlpha,
	TreeBranchAlpha,
	RunTransactionParams,
	TransactionResult,
	TransactionResultExt,
	WithValue,
} from "../simple-tree/index.js";

import { assertValidConstraint } from "./schematizingTreeView.js";

/**
 * A {@link TreeContextAlpha | tree context} that can be used for e.g. unhydrated nodes.
 */
export class UnhydratedTreeContext implements TreeContextAlpha {
	public static instance = new UnhydratedTreeContext();
	private transactionCount = 0;
	private constructor() {}

	public isBranch(): this is TreeBranchAlpha {
		return false;
	}

	public runTransaction<TValue>(
		t: () => WithValue<TValue>,
		params?: RunTransactionParams,
	): TransactionResultExt<TValue, TValue>;
	public runTransaction(t: () => void, _params?: RunTransactionParams): TransactionResult;
	public runTransaction(
		t: () => WithValue<unknown> | void,
		params?: RunTransactionParams,
	): TransactionResultExt<unknown, unknown> | TransactionResult {
		for (const constraint of params?.preconditions ?? []) {
			assertValidConstraint(constraint, false);
		}
		this.transactionCount += 1;
		const result = t();
		this.transactionCount -= 1;
		return UnhydratedTreeContext.wrapTransactionResult(result);
	}

	public runTransactionAsync<TValue>(
		t: () => Promise<WithValue<TValue>>,
		params?: RunTransactionParams,
	): Promise<TransactionResultExt<TValue, TValue>>;
	public runTransactionAsync(
		t: () => Promise<void>,
		params?: RunTransactionParams,
	): Promise<TransactionResult>;
	public async runTransactionAsync(
		t: () => Promise<WithValue<unknown> | void>,
		params?: RunTransactionParams,
	): Promise<TransactionResultExt<unknown, unknown> | TransactionResult> {
		if (this.transactionCount > 0) {
			throw new UsageError(
				"An asynchronous transaction cannot be started while another transaction is already in progress.",
			);
		}
		for (const constraint of params?.preconditions ?? []) {
			assertValidConstraint(constraint, false);
		}
		this.transactionCount += 1;
		const result = await t();
		this.transactionCount -= 1;
		return UnhydratedTreeContext.wrapTransactionResult(result);
	}

	private static wrapTransactionResult<TValue>(
		value: WithValue<TValue> | void,
	): TransactionResultExt<TValue, TValue> | TransactionResult {
		if (value?.value !== undefined) {
			return { success: true, value: value.value };
		}
		return { success: true };
	}
}
