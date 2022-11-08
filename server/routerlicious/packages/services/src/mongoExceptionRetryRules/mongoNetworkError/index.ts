/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IMongoExceptionRetryRule } from "../IMongoExceptionRetryRule";

class MongoNetworkTransientTransactionError implements IMongoExceptionRetryRule {
    match(error: any): boolean {
        return error.errorLabels?.length && (error.errorLabels as string[]).includes("TransientTransactionError");
    }

    shouldRetry: boolean = false;
}

// Maintain the list from more strick faster comparison to less strict slower comparison
export const mongoNetworkErrorRetryRuleset: IMongoExceptionRetryRule[] = [
    new MongoNetworkTransientTransactionError(),
];
