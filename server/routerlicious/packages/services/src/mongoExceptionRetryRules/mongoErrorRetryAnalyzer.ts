/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { DefaultExceptionRule } from "./defaultExceptionRule";
import { IMongoExceptionRetryRule } from "./IMongoExceptionRetryRule";
import { mongoErrorRetryRuleset } from "./mongoError";
import { mongoNetworkErrorRetryRuleset } from "./mongoNetworkError";

export const MongoErrorRetryAnalyzer = {
    shouldRetry(error: Error): boolean {
        const rule = MongoErrorRetryAnalyzer.getRetryRule(error);
        if (!rule) {
            // This should not happen.
            Lumberjack.error("MongoErrorRetryAnalyzer.shouldRetry() didn't get a rule", undefined, error);
            return false;
        }

        return rule.shouldRetry;
    },

    getRetryRule(error: Error): IMongoExceptionRetryRule {
        if (error.name === "MongoNetworkError") {
            return MongoErrorRetryAnalyzer.getRetryRuleFromSet(error, mongoNetworkErrorRetryRuleset);
        }

        if (error.name === "MongoError") {
            return MongoErrorRetryAnalyzer.getRetryRuleFromSet(error, mongoErrorRetryRuleset);
        }

        return new DefaultExceptionRule();
    },

    getRetryRuleFromSet(error: any, ruleSet: IMongoExceptionRetryRule[]): IMongoExceptionRetryRule {
        const resultRule = ruleSet.find((rule) => rule.match(error)) || new DefaultExceptionRule();
        Lumberjack.info(`Error rule used ${resultRule.constructor.name}, shouldRetry: ${resultRule.shouldRetry}`);
        return ruleSet.find((rule) => rule.match(error)) || new DefaultExceptionRule();
    },
};
