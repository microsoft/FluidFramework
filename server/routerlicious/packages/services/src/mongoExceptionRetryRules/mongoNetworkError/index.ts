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
        return error.errorLabels?.length && (error.errorLabels as string[]).includes("TransientTransactionError");
    }
}

// Maintain the list from more strick faster comparison to less strict slower comparison
export function createMongoNetworkErrorRetryRuleset(
    retryRuleOverride: Map<string, boolean>,
): IMongoExceptionRetryRule[] {
    const mongoNetworkErrorRetryRuleset: IMongoExceptionRetryRule[] = [
        new MongoNetworkTransientTransactionError(retryRuleOverride),
    ];

    return mongoNetworkErrorRetryRuleset;
}
