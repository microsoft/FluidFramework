/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IMongoExceptionRetryRule } from "../IMongoExceptionRetryRule";
class InternalErrorRule implements IMongoExceptionRetryRule {
    private static readonly codeName = "InternalError";
    match(error: any): boolean {
        return error.code === 1
            && error.codeName
            && (error.codeName as string) === InternalErrorRule.codeName;
    }

    shouldRetry: boolean = false;
}

// This handles the requested queued on client side buffer overflow. Should relies on reconnect instead of retry?
class NoConnectionAvailableRule implements IMongoExceptionRetryRule {
    private static readonly messagePrefix = "no connection available for operation and number of stored operation";
    match(error: any): boolean {
        // TODO: This timed out actually included two different messages:
        // 1. Retries due to rate limiting: False.
        // 2. Retries due to rate limiting: True.
        // We might need to split this into two different rules after consult with DB team.
        return error.message
            && (error.message as string).startsWith(NoConnectionAvailableRule.messagePrefix);
    }

    shouldRetry: boolean = false;
}

// This handles the no primary found in replicaset or invalid replica set name from client
// Should not retry but relays on reconnect.
class NoPrimaryInReplicasetRule implements IMongoExceptionRetryRule {
    private static readonly message = "no primary found in replicaset or invalid replica set name";
    match(error: any): boolean {
        // TODO: This timed out actually included two different messages:
        // 1. Retries due to rate limiting: False.
        // 2. Retries due to rate limiting: True.
        // We might need to split this into two different rules after consult with DB team.
        return error.message
            && (error.message as string) === NoPrimaryInReplicasetRule.message;
    }

    shouldRetry: boolean = false;
}

// this handles the pool destroyed error from client side. Should relies on reconnect instead of retry?
class PoolDestroyedRule implements IMongoExceptionRetryRule {
    private static readonly message1 = "pool destroyed";
    private static readonly message2 = "server instance pool was destroyed";
    match(error: any): boolean {
        return error.code === 16
            && error.message
            && ((error.message as string) === PoolDestroyedRule.message1
                || (error.message as string) === PoolDestroyedRule.message2);
    }

    shouldRetry: boolean = false;
}

// this handles the case where the request payload is too large from server.
class RequestSizeLargeRule implements IMongoExceptionRetryRule {
    private static readonly errorMsgPrefix =
        "Error=16, Details='Response status code does not indicate success: RequestEntityTooLarge (413)";
    match(error: any): boolean {
        return error.code === 16
            && error.errmsg
            && (error.errmsg as string).startsWith(RequestSizeLargeRule.errorMsgPrefix);
    }

    shouldRetry: boolean = false;
}

// This handles request timeout from server without additional rate limit info.
class RequestTimedNoRateLimitInfo implements IMongoExceptionRetryRule {
    private static readonly errmsg = "Request timed out.";
    match(error: any): boolean {
        return error.code === 50
            && error.errmsg
            && (error.errmsg as string) === RequestTimedNoRateLimitInfo.errmsg;
    }

    shouldRetry: boolean = true;
}

// This handles request timeout from server with http info.
class RequestTimedOutWithHttpInfo implements IMongoExceptionRetryRule {
    private static readonly errmsgPrefix =
        "Error=50, Details='Response status code does not indicate success: RequestTimeout (408);";
    match(error: any): boolean {
        return error.code === 50
            && error.errmsg
            && (error.errmsg as string).startsWith(RequestTimedOutWithHttpInfo.errmsgPrefix);
    }

    shouldRetry: boolean = true;
}

// This handles request timeout from server with additional rate limit info.
class RequestTimedOutWithRateLimit implements IMongoExceptionRetryRule {
    private static readonly codeName = "ExceededTimeLimit";
    match(error: any): boolean {
        // TODO: This timed out actually included two different messages:
        // 1. Retries due to rate limiting: False.
        // 2. Retries due to rate limiting: True.
        // We might need to split this into two different rules after consult with DB team.
        return error.code === 50
            && error.errmsg
            && (error.errmsg as string) === RequestTimedOutWithRateLimit.codeName;
    }
    shouldRetry: boolean = true;
}

// This handles server side temporary 503 issue
class ServiceUnavailableRule implements IMongoExceptionRetryRule {
    private static readonly errorDetails = "Response status code does not indicate success: ServiceUnavailable (503)";
    match(error: any): boolean {
        return error.code === 50
            && error.errorDetails
            && (error.errorDetails as string).includes(ServiceUnavailableRule.errorDetails);
    }

    shouldRetry: boolean = true;
}

// this handles the pool destroyed error from client side. Should relies on reconnect instead of retry?
class TopologyDestroyed implements IMongoExceptionRetryRule {
    private static readonly message = "Topology was destroyed";
    match(error: any): boolean {
        return error.code === 16
            && error.message
            && (error.message as string) === TopologyDestroyed.message;
    }

    shouldRetry: boolean = false;
}

// this handles the incorrect credentials set. Should not retry
class UnUnauthorizedRule implements IMongoExceptionRetryRule {
    private static readonly codeName = "Unauthorized";
    match(error: any): boolean {
        return error.code === 13
            && error.codeName
            && (error.codeName as string) === UnUnauthorizedRule.codeName;
    }

    shouldRetry: boolean = false;
}

// Maintain the list from more strick faster comparison to less strict slower comparison
export const mongoErrorRetryRuleset: IMongoExceptionRetryRule[] = [
    // The rules are using exactly equal
    new InternalErrorRule(),
    new NoPrimaryInReplicasetRule(),
    new RequestTimedNoRateLimitInfo(),
    new RequestTimedOutWithRateLimit(),
    new TopologyDestroyed(),
    new UnUnauthorizedRule(),

    // The rules are using multiple compare
    new PoolDestroyedRule(),

    // The rules are using string startWith
    new NoConnectionAvailableRule(),
    new RequestSizeLargeRule(),
    new RequestTimedOutWithHttpInfo(),

    // The rules are using string contains
    new ServiceUnavailableRule(),
];
