/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseMongoExceptionRetryRule, IMongoExceptionRetryRule } from "../IMongoExceptionRetryRule";

class MongoNetworkTransientTransactionError extends BaseMongoExceptionRetryRule {
	protected defaultRetryDecision: boolean = true;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("MongoNetworkTransientTransactionError", retryRuleOverride);
	}

	public match(error: any): boolean {
		return (
			error.errorLabels?.length &&
			(error.errorLabels as string[]).includes("TransientTransactionError")
		);
	}
}

class MongoNetworkConnectionClosedError extends BaseMongoExceptionRetryRule {
	protected defaultRetryDecision: boolean = true;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("MongoNetworkConnectionClosedError", retryRuleOverride);
	}

	public match(error: any): boolean {
		return (
			error.message && /^connection .+ closed$/.test(error.message as string) === true // matches any message of format "connection <some-info> closed"
		);
	}
}

class MongoNetworkSocketDisconnectedError extends BaseMongoExceptionRetryRule {
	private static readonly errorMessage =
		"Client network socket disconnected before secure TLS connection was established";
	protected defaultRetryDecision: boolean = true;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("MongoNetworkSocketDisconnectedError", retryRuleOverride);
	}

	public match(error: any): boolean {
		return (
			error.message &&
			(error.message as string) === MongoNetworkSocketDisconnectedError.errorMessage
		);
	}
}

// Maintain the list from more strick faster comparison to less strict slower comparison
export function createMongoNetworkErrorRetryRuleset(
	retryRuleOverride: Map<string, boolean>,
): IMongoExceptionRetryRule[] {
	const mongoNetworkErrorRetryRuleset: IMongoExceptionRetryRule[] = [
		new MongoNetworkTransientTransactionError(retryRuleOverride),
		new MongoNetworkConnectionClosedError(retryRuleOverride),
		new MongoNetworkSocketDisconnectedError(retryRuleOverride),
	];

	return mongoNetworkErrorRetryRuleset;
}
