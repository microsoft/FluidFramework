/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseMongoExceptionRetryRule } from "./IMongoExceptionRetryRule";

export class DefaultExceptionRule extends BaseMongoExceptionRetryRule {
    protected defaultRetryDecision: boolean = false;

    constructor(retryRuleOverride: Map<string, boolean>) {
        super("DefaultExceptionRule", retryRuleOverride);
    }

    public match(error: any): boolean {
        return true;
    };
}
