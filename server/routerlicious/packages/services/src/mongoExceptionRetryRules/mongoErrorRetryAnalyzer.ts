/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack } from "@fluidframework/server-services-telemetry";

import { ConnectionNotAvailableMode } from "../mongodb";

import { IMongoExceptionRetryRule } from "./IMongoExceptionRetryRule";
import { DefaultExceptionRule } from "./defaultExceptionRule";
import { createMongoErrorRetryRuleset } from "./mongoError";
import { createMongoNetworkErrorRetryRuleset } from "./mongoNetworkError";

export class MongoErrorRetryAnalyzer {
	private static instance: MongoErrorRetryAnalyzer;
	private readonly mongoNetworkErrorRetryRuleset: IMongoExceptionRetryRule[];
	private readonly mongoErrorRetryRuleset: IMongoExceptionRetryRule[];
	private readonly defaultRule: IMongoExceptionRetryRule;

	public static getInstance(
		retryRuleOverride: Map<string, boolean>,
		connectionNotAvailableMode: ConnectionNotAvailableMode,
	): MongoErrorRetryAnalyzer {
		if (!this.instance) {
			this.instance = new MongoErrorRetryAnalyzer(
				retryRuleOverride,
				connectionNotAvailableMode,
			);
		}
		return this.instance;
	}

	private constructor(
		retryRuleOverride: Map<string, boolean>,
		connectionNotAvailableMode: ConnectionNotAvailableMode,
	) {
		this.mongoNetworkErrorRetryRuleset = createMongoNetworkErrorRetryRuleset(retryRuleOverride);
		this.mongoErrorRetryRuleset = createMongoErrorRetryRuleset(
			retryRuleOverride,
			connectionNotAvailableMode,
		);
		this.defaultRule = new DefaultExceptionRule(retryRuleOverride);
	}

	public shouldRetry(error: Error): boolean {
		const rule = this.getRetryRule(error);
		if (!rule) {
			// This should not happen.
			Lumberjack.error(
				"MongoErrorRetryAnalyzer.shouldRetry() didn't get a rule",
				undefined,
				error,
			);
			return false;
		}
		const ruleName = rule.ruleName;
		const decision = rule.shouldRetry();
		const properties = {
			ruleName,
			decision,
		};

		Lumberjack.warning(
			`Error rule used ${rule.ruleName}, shouldRetry: ${decision}`,
			properties,
			error,
		);
		return decision;
	}

	private getRetryRule(error: Error): IMongoExceptionRetryRule {
		if (error.name === "MongoNetworkError") {
			return this.getRetryRuleFromSet(error, this.mongoNetworkErrorRetryRuleset);
		}

		return this.getRetryRuleFromSet(error, this.mongoErrorRetryRuleset);
	}

	private getRetryRuleFromSet(
		error: any,
		ruleSet: IMongoExceptionRetryRule[],
	): IMongoExceptionRetryRule {
		return ruleSet.find((rule) => rule.match(error)) || this.defaultRule;
	}
}
