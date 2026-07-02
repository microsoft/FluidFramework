/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type {
	TreeContextAlpha,
	TreeBranchAlpha,
	RunTransactionParamsAlpha,
	TransactionVoidResult,
	TransactionValueResult,
	WithValue,
} from "../simple-tree/index.js";

import { assertValidConstraint } from "./treeCheckout.js";

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
		params?: RunTransactionParamsAlpha,
	): TransactionValueResult<TValue, TValue>;
	public runTransaction(
		t: () => void,
		_params?: RunTransactionParamsAlpha,
	): TransactionVoidResult;
	public runTransaction(
		t: () => WithValue<unknown> | void,
		params?: RunTransactionParamsAlpha,
	): TransactionValueResult<unknown, unknown> | TransactionVoidResult {
		for (const constraint of params?.preconditions ?? []) {
			assertValidConstraint(constraint, false);
		}
		this.transactionCount += 1;
		try {
			return UnhydratedTreeContext.wrapTransactionResult(t());
		} finally {
			this.transactionCount -= 1;
		}
	}

	public runTransactionAsync<TValue>(
		t: () => Promise<WithValue<TValue>>,
		params?: RunTransactionParamsAlpha,
	): Promise<TransactionValueResult<TValue, TValue>>;
	public runTransactionAsync(
		t: () => Promise<void>,
		params?: RunTransactionParamsAlpha,
	): Promise<TransactionVoidResult>;
	public async runTransactionAsync(
		t: () => Promise<WithValue<unknown> | void>,
		params?: RunTransactionParamsAlpha,
	): Promise<TransactionValueResult<unknown, unknown> | TransactionVoidResult> {
		if (this.transactionCount > 0) {
			throw new UsageError(
				"An asynchronous transaction cannot be started while another transaction is already in progress.",
			);
		}
		for (const constraint of params?.preconditions ?? []) {
			assertValidConstraint(constraint, false);
		}
		this.transactionCount += 1;
		try {
			return UnhydratedTreeContext.wrapTransactionResult(await t());
		} finally {
			this.transactionCount -= 1;
		}
	}

	private static wrapTransactionResult<TValue>(
		value: WithValue<TValue> | void,
	): TransactionValueResult<TValue, TValue> | TransactionVoidResult {
		if (value?.value !== undefined) {
			return { success: true, value: value.value };
		}
		return { success: true };
	}
}
