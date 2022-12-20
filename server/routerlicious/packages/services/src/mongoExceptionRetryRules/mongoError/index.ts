/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseMongoExceptionRetryRule, IMongoExceptionRetryRule } from "../IMongoExceptionRetryRule";
class InternalErrorRule extends BaseMongoExceptionRetryRule {
    private static readonly codeName = "InternalError";
    protected defaultRetryDecision: boolean = false;

    constructor(retryRuleOverride: Map<string, boolean>) {
        super("InternalErrorRule", retryRuleOverride);
    }

    public match(error: any): boolean {
        return error.code === 1
            && error.codeName
            && (error.codeName as string) === InternalErrorRule.codeName;
    }
}

// This handles the requested queued on client side buffer overflow. Should relies on reconnect instead of retry?
class NoConnectionAvailableRule extends BaseMongoExceptionRetryRule {
    private static readonly messagePrefix = "no connection available for operation and number of stored operation";
    protected defaultRetryDecision: boolean = false;

    constructor(retryRuleOverride: Map<string, boolean>) {
        super("NoConnectionAvailableRule", retryRuleOverride);
    }

    public match(error: any): boolean {
        // TODO: This timed out actually included two different messages:
        // 1. Retries due to rate limiting: False.
        // 2. Retries due to rate limiting: True.
        // We might need to split this into two different rules after consult with DB team.
        return error.message
            && (error.message as string).startsWith(NoConnectionAvailableRule.messagePrefix);
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
        return error.message
            && (error.message as string) === NoPrimaryInReplicasetRule.message;
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

    public match(error: any): boolean {
        return error.code === 16
            && error.message
            && ((error.message as string) === PoolDestroyedRule.message1
                || (error.message as string) === PoolDestroyedRule.message2);
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

    public match(error: any): boolean {
        return error.code === 16
            && error.errmsg
            && (error.errmsg as string).startsWith(RequestSizeLargeRule.errorMsgPrefix);
    }
}

// This handles request timeout from server without additional rate limit info.
class RequestTimedNoRateLimitInfo extends BaseMongoExceptionRetryRule {
    private static readonly errmsg = "Request timed out.";
    protected defaultRetryDecision: boolean = true;

    constructor(retryRuleOverride: Map<string, boolean>) {
        super("RequestTimedNoRateLimitInfo", retryRuleOverride);
    }

    public match(error: any): boolean {
        return error.code === 50
            && error.errmsg
            && (error.errmsg as string) === RequestTimedNoRateLimitInfo.errmsg;
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

    public match(error: any): boolean {
        return error.code === 50
            && error.errmsg
            && (error.errmsg as string).startsWith(RequestTimedOutWithHttpInfo.errmsgPrefix);
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

    public match(error: any): boolean {
        return error.code === 50
            && error.errmsg
            && (error.codeName as string) === RequestTimedOutWithRateLimitTrue.codeName
            && (error.errmsg as string) === RequestTimedOutWithRateLimitTrue.errorMsg;
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

    public match(error: any): boolean {
        return error.code === 50
            && error.errmsg
            && (error.codeName as string) === RequestTimedOutWithRateLimitFalse.codeName
            && (error.errmsg as string) === RequestTimedOutWithRateLimitFalse.errorMsg;
    }
}

// This handles server side temporary 503 issue
class ServiceUnavailableRule extends BaseMongoExceptionRetryRule {
    private static readonly errorDetails = "Response status code does not indicate success: ServiceUnavailable (503)";
    protected defaultRetryDecision: boolean = true;

    constructor(retryRuleOverride: Map<string, boolean>) {
        super("ServiceUnavailableRule", retryRuleOverride);
    }

    public match(error: any): boolean {
        return error.code === 1
            && error.errorDetails
            && (error.errorDetails as string).includes(ServiceUnavailableRule.errorDetails);
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

    public match(error: any): boolean {
        return error.message
            && (error.message as string).toLowerCase() === TopologyDestroyed.message;
    }
}

// this handles the incorrect credentials set. Should not retry
class UnauthorizedRule extends BaseMongoExceptionRetryRule {
    private static readonly codeName = "Unauthorized";
    protected defaultRetryDecision: boolean = false;

    constructor(retryRuleOverride: Map<string, boolean>) {
        super("UnauthorizedRule", retryRuleOverride);
    }

    public match(error: any): boolean {
        return error.code === 13
            && error.codeName
            && (error.codeName as string) === UnauthorizedRule.codeName;
    }
}

// Maintain the list from more strick faster comparison to less strict slower comparison
export function createMongoErrorRetryRuleset(
    retryRuleOverride: Map<string, boolean>,
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

        // The rules are using multiple compare
        new PoolDestroyedRule(retryRuleOverride),

        // The rules are using string startWith
        new NoConnectionAvailableRule(retryRuleOverride),
        new RequestSizeLargeRule(retryRuleOverride),
        new RequestTimedOutWithHttpInfo(retryRuleOverride),

        // The rules are using string contains
        new ServiceUnavailableRule(retryRuleOverride),
    ];
    return mongoErrorRetryRuleset;
}