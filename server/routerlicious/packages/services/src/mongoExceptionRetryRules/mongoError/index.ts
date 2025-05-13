/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { ConnectionNotAvailableMode } from "../../mongodb";
import { BaseMongoExceptionRetryRule, IMongoExceptionRetryRule } from "../IMongoExceptionRetryRule";
class InternalErrorRule extends BaseMongoExceptionRetryRule {
	private static readonly codeName = "InternalError";
	protected defaultRetryDecision: boolean = true;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("InternalErrorRule", retryRuleOverride);
	}

	public match(error: unknown): boolean {
		return (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === 1 &&
			"codeName" in error &&
			typeof error.codeName === "string" &&
			error.codeName === InternalErrorRule.codeName
		);
	}
}

class InternalBulkWriteErrorRule extends BaseMongoExceptionRetryRule {
	private static readonly errorName = "BulkWriteError";
	protected defaultRetryDecision: boolean = true;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("InternalBulkWriteErrorRule", retryRuleOverride);
	}

	public match(error: unknown): boolean {
		return (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === 1 &&
			"name" in error &&
			typeof error.name === "string" &&
			error.name.includes(InternalBulkWriteErrorRule.errorName)
		);
	}
}

class DuplicateKeyErrorRule extends BaseMongoExceptionRetryRule {
	private static readonly errorMsg = "E11000 duplicate key";
	protected defaultRetryDecision: boolean = false;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("DuplicateKeyErrorRule", retryRuleOverride);
	}

	public match(error: any): boolean {
		return (
			error.code === 11000 ||
			error.message?.toString()?.indexOf(DuplicateKeyErrorRule.errorMsg) >= 0
		);
	}
}

// This handles the requested queued on client side buffer overflow. Should relies on reconnect instead of retry?
class NoConnectionAvailableRule extends BaseMongoExceptionRetryRule {
	private static readonly messagePrefix =
		"no connection available for operation and number of stored operation";
	protected defaultRetryDecision: boolean = false;

	constructor(
		retryRuleOverride: Map<string, boolean>,
		private readonly connectionNotAvailableMode: ConnectionNotAvailableMode,
	) {
		super("NoConnectionAvailableRule", retryRuleOverride);
	}

	public match(error: unknown): boolean {
		// TODO: This timed out actually included two different messages:
		// 1. Retries due to rate limiting: False.
		// 2. Retries due to rate limiting: True.
		// We might need to split this into two different rules after consult with DB team.
		return (
			typeof error === "object" &&
			error !== null &&
			"message" in error &&
			typeof error.message === "string" &&
			error.message.startsWith(NoConnectionAvailableRule.messagePrefix)
		);
	}

	public shouldRetry(): boolean {
		if (this.connectionNotAvailableMode === "stop") {
			// This logic is to automate the process of handling a pod with death note on it, so
			// kubernetes would automatically handle the restart process.
			Lumberjack.warning(`${this.ruleName} will terminate the process`);
			process.kill(process.pid, "SIGTERM");
		}

		return super.shouldRetry();
	}
}

// This handles the no primary found in replicaset or invalid replica set name from client
// Should not retry but relays on reconnect.
class NoPrimaryInReplicasetRule extends BaseMongoExceptionRetryRule {
	private static readonly message = "no primary found in replicaset or invalid replica set name";
	protected defaultRetryDecision: boolean = false;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("NoPrimaryInReplicasetRule", retryRuleOverride);
	}

	public match(error: any): boolean {
		// TODO: This timed out actually included two different messages:
		// 1. Retries due to rate limiting: False.
		// 2. Retries due to rate limiting: True.
		// We might need to split this into two different rules after consult with DB team.
		return (
			typeof error === "object" &&
			error !== null &&
			"message" in error &&
			typeof error.message === "string" &&
			error.message === NoPrimaryInReplicasetRule.message
		);
	}
}

// this handles the pool destroyed error from client side. Should relies on reconnect instead of retry?
class PoolDestroyedRule extends BaseMongoExceptionRetryRule {
	private static readonly message1 = "pool destroyed";
	private static readonly message2 = "server instance pool was destroyed";
	protected defaultRetryDecision: boolean = false;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("PoolDestroyedRule", retryRuleOverride);
	}

	public match(error: unknown): boolean {
		return (
			typeof error === "object" &&
			error !== null &&
			"message" in error &&
			typeof error.message === "string" &&
			(error.message === PoolDestroyedRule.message1 ||
				error.message === PoolDestroyedRule.message2)
		);
	}
}

// this handles the case where the request payload is too large from server.
class RequestSizeLargeRule extends BaseMongoExceptionRetryRule {
	private static readonly errorMsgPrefix =
		"Error=16, Details='Response status code does not indicate success: RequestEntityTooLarge (413)";
	protected defaultRetryDecision: boolean = false;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("RequestSizeLargeRule", retryRuleOverride);
	}

	public match(error: unknown): boolean {
		return (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === 16 &&
			"errmsg" in error &&
			typeof error.errmsg === "string" &&
			error.errmsg.startsWith(RequestSizeLargeRule.errorMsgPrefix)
		);
	}
}

// This handles request timeout from server without additional rate limit info.
class RequestTimedNoRateLimitInfo extends BaseMongoExceptionRetryRule {
	private static readonly errmsg = "Request timed out.";
	protected defaultRetryDecision: boolean = true;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("RequestTimedNoRateLimitInfo", retryRuleOverride);
	}

	public match(error: unknown): boolean {
		return (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === 50 &&
			"errmsg" in error &&
			typeof error.errmsg === "string" &&
			error.errmsg === RequestTimedNoRateLimitInfo.errmsg
		);
	}
}

// This handles request timeout from server with http info.
class RequestTimedOutWithHttpInfo extends BaseMongoExceptionRetryRule {
	private static readonly errmsgPrefix =
		"Error=50, Details='Response status code does not indicate success: RequestTimeout (408);";
	protected defaultRetryDecision: boolean = true;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("RequestTimedOutWithHttpInfo", retryRuleOverride);
	}

	public match(error: unknown): boolean {
		return (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === 50 &&
			"errmsg" in error &&
			typeof error.errmsg === "string" &&
			error.errmsg.startsWith(RequestTimedOutWithHttpInfo.errmsgPrefix)
		);
	}
}

// This handles request timeout from server with additional rate limit info.
class RequestTimedOutWithRateLimitTrue extends BaseMongoExceptionRetryRule {
	private static readonly codeName = "ExceededTimeLimit";
	private static readonly errorMsg = "Request timed out. Retries due to rate limiting: True.";
	protected defaultRetryDecision: boolean = false;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("RequestTimedOutWithRateLimitTrue", retryRuleOverride);
	}

	public match(error: unknown): boolean {
		return (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === 50 &&
			"errmsg" in error &&
			typeof error.errmsg === "string" &&
			error.errmsg === RequestTimedOutWithRateLimitTrue.errorMsg &&
			"codeName" in error &&
			typeof error.codeName === "string" &&
			error.codeName === RequestTimedOutWithRateLimitTrue.codeName
		);
	}
}

// This handles request timeout from server with additional rate limit info.
class RequestTimedOutWithRateLimitFalse extends BaseMongoExceptionRetryRule {
	private static readonly codeName = "ExceededTimeLimit";
	private static readonly errorMsg = "Request timed out. Retries due to rate limiting: False.";
	protected defaultRetryDecision: boolean = true;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("RequestTimedOutWithRateLimitFalse", retryRuleOverride);
	}

	public match(error: unknown): boolean {
		return (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === 50 &&
			"errmsg" in error &&
			typeof error.errmsg === "string" &&
			"codeName" in error &&
			typeof error.codeName === "string" &&
			error.codeName === RequestTimedOutWithRateLimitFalse.codeName &&
			error.errmsg === RequestTimedOutWithRateLimitFalse.errorMsg
		);
	}
}

class RequestTimedOutBulkWriteErrorRule extends BaseMongoExceptionRetryRule {
	private static readonly errorName = "BulkWriteError";
	protected defaultRetryDecision: boolean = true;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("RequestTimedOutBulkWriteErrorRule", retryRuleOverride);
	}

	public match(error: unknown): boolean {
		return (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === 50 &&
			"name" in error &&
			typeof error.name === "string" &&
			error.name.includes(RequestTimedOutBulkWriteErrorRule.errorName)
		);
	}
}

class ConnectionPoolClearedErrorRule extends BaseMongoExceptionRetryRule {
	private static readonly errorName = "MongoPoolClearedError";
	protected defaultRetryDecision: boolean = true;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("ConnectionPoolClearedErrorRule", retryRuleOverride);
	}

	public match(error: unknown): boolean {
		return (
			typeof error === "object" &&
			error !== null &&
			"name" in error &&
			typeof error.name === "string" &&
			error.name === ConnectionPoolClearedErrorRule.errorName
		);
	}
}

// This handles server side temporary 503 issue
class ServiceUnavailableRule extends BaseMongoExceptionRetryRule {
	private static readonly errorDetails =
		"Response status code does not indicate success: ServiceUnavailable (503)";
	protected defaultRetryDecision: boolean = true;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("ServiceUnavailableRule", retryRuleOverride);
	}

	public match(error: unknown): boolean {
		return (
			typeof error === "object" &&
			error !== null &&
			(("code" in error &&
				error.code === 1 &&
				"errorDetails" in error &&
				typeof error.errorDetails === "string" &&
				error.errorDetails.includes(ServiceUnavailableRule.errorDetails)) ||
				("errmsg" in error &&
					typeof error.errmsg === "string" &&
					error.errmsg.includes(ServiceUnavailableRule.errorDetails)))
		);
	}
}

// this handles the pool destroyed error from client side. Should relies on reconnect instead of retry?
class TopologyDestroyed extends BaseMongoExceptionRetryRule {
	// We see messages with both "Topology was destroyed" and "topology was destroyed" on prod. So need to handle both cases.
	private static readonly message = "topology was destroyed";
	protected defaultRetryDecision: boolean = false;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("TopologyDestroyed", retryRuleOverride);
	}

	public match(error: unknown): boolean {
		return (
			typeof error === "object" &&
			error !== null &&
			"message" in error &&
			typeof error.message === "string" &&
			error.message.toLowerCase() === TopologyDestroyed.message
		);
	}
}

// this handles the incorrect credentials set. Should not retry
class UnauthorizedRule extends BaseMongoExceptionRetryRule {
	private static readonly codeName = "Unauthorized";
	protected defaultRetryDecision: boolean = false;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("UnauthorizedRule", retryRuleOverride);
	}

	public match(error: unknown): boolean {
		return (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === 13 &&
			"codeName" in error &&
			typeof error.codeName == "string" &&
			error.codeName === UnauthorizedRule.codeName
		);
	}
}

// handles transient connection closed errors, eg: connection 1 to <mongo-name>.mongo.cosmos.azure.com:<port> closed
// this is also handled by MongoNetworkError retry rule but this handles the case when errorName is MongoError instead of MongoNetworkError
class ConnectionClosedMongoErrorRule extends BaseMongoExceptionRetryRule {
	protected defaultRetryDecision: boolean = true;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("ConnectionClosedMongoErrorRule", retryRuleOverride);
	}

	public match(error: unknown): boolean {
		return (
			typeof error === "object" &&
			error !== null &&
			"message" in error &&
			typeof error.message === "string" &&
			/^connection .+ closed$/.test(error.message) === true // matches any message of format "connection <some-info> closed"
		);
	}
}

class ConnectionTimedOutBulkWriteErrorRule extends BaseMongoExceptionRetryRule {
	private static readonly errorName = "MongoBulkWriteError";
	protected defaultRetryDecision: boolean = true;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("ConnectionTimedOutBulkWriteErrorRule", retryRuleOverride);
	}

	public match(error: unknown): boolean {
		return (
			typeof error === "object" &&
			error !== null &&
			"name" in error &&
			typeof error.name === "string" &&
			error.name === ConnectionTimedOutBulkWriteErrorRule.errorName &&
			"message" in error &&
			typeof error.message === "string" &&
			/^connection .*timed out$/.test(error.message) === true
		);
	}
}

class NetworkTimedOutErrorRule extends BaseMongoExceptionRetryRule {
	private static readonly errorName = "MongoNetworkTimeoutError";
	protected defaultRetryDecision: boolean = true;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("NetworkTimedOutErrorRule", retryRuleOverride);
	}

	public match(error: unknown): boolean {
		return (
			typeof error === "object" &&
			error !== null &&
			"name" in error &&
			typeof error.name === "string" &&
			error.name === NetworkTimedOutErrorRule.errorName &&
			"message" in error &&
			typeof error.message === "string" &&
			/^connection .*timed out$/.test(error.message) === true
		);
	}
}

class MongoServerSelectionErrorRule extends BaseMongoExceptionRetryRule {
	private static readonly errorName = "MongoServerSelectionError";
	protected defaultRetryDecision: boolean = true;

	constructor(retryRuleOverride: Map<string, boolean>) {
		super("MongoServerSelectionErrorRule", retryRuleOverride);
	}

	public match(error: unknown): boolean {
		return (
			typeof error === "object" &&
			error !== null &&
			"name" in error &&
			typeof error.name === "string" &&
			error.name === MongoServerSelectionErrorRule.errorName &&
			"message" in error &&
			typeof error.message === "string" &&
			/^connection .*closed$/.test(error.message) === true
		);
	}
}

// Maintain the list from more strick faster comparison to less strict slower comparison
export function createMongoErrorRetryRuleset(
	retryRuleOverride: Map<string, boolean>,
	connectionNotAvailableMode: ConnectionNotAvailableMode,
): IMongoExceptionRetryRule[] {
	const mongoErrorRetryRuleset: IMongoExceptionRetryRule[] = [
		// The rules are using exactly equal
		new InternalErrorRule(retryRuleOverride),
		new NoPrimaryInReplicasetRule(retryRuleOverride),
		new RequestTimedNoRateLimitInfo(retryRuleOverride),
		new RequestTimedOutWithRateLimitTrue(retryRuleOverride),
		new RequestTimedOutWithRateLimitFalse(retryRuleOverride),
		new TopologyDestroyed(retryRuleOverride),
		new UnauthorizedRule(retryRuleOverride),
		new ConnectionPoolClearedErrorRule(retryRuleOverride),

		// The rules are using multiple compare
		new PoolDestroyedRule(retryRuleOverride),
		new DuplicateKeyErrorRule(retryRuleOverride),

		// The rules are using string startWith
		new NoConnectionAvailableRule(retryRuleOverride, connectionNotAvailableMode),
		new RequestSizeLargeRule(retryRuleOverride),
		new RequestTimedOutWithHttpInfo(retryRuleOverride),

		// The rules are using string contains
		new ServiceUnavailableRule(retryRuleOverride),
		new RequestTimedOutBulkWriteErrorRule(retryRuleOverride),
		new InternalBulkWriteErrorRule(retryRuleOverride),

		// The rules are using regex
		new ConnectionClosedMongoErrorRule(retryRuleOverride),
		new ConnectionTimedOutBulkWriteErrorRule(retryRuleOverride),
		new MongoServerSelectionErrorRule(retryRuleOverride),
		new NetworkTimedOutErrorRule(retryRuleOverride),
	];
	return mongoErrorRetryRuleset;
}
