/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IMongoExceptionRetryRule {
	ruleName: string;
	match: (error: any) => boolean;
	shouldRetry(): boolean;
}

export abstract class BaseMongoExceptionRetryRule implements IMongoExceptionRetryRule {
	public abstract match(error: any): boolean;
	protected abstract defaultRetryDecision: boolean;

	public shouldRetry(): boolean {
		return this.overrideRetryDecision ?? this.defaultRetryDecision;
	}

	private readonly overrideRetryDecision?: boolean;
	constructor(
		public readonly ruleName: string,
		retryRuleOverride: Map<string, boolean>,
	) {
		this.overrideRetryDecision = retryRuleOverride.get(ruleName);
	}
}
