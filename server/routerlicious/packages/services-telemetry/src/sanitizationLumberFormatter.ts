/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumber } from "./lumber";
import { ILumberFormatter } from "./resources";

/**
 * @internal
 */
export class BaseSanitizationLumberFormatter implements ILumberFormatter {
	readonly redactedStr = "[LUMBER_REDACTED]";

	public transform(lumber: Lumber<string>): void {
		if (lumber.exception) {
			this.sanitizeCommonCases(lumber.exception);
		}
	}

	private sanitizeCommonCases(error: any): void {
		if (error?.command?.args) {
			error.command.args = [this.redactedStr];
		}
		this.handleHeadersSanitization(error);
	}

	private handleHeadersSanitization(error: any): void {
		if (error?.request?.headers?.authorization || error?.request?.headers?.Authorization) {
			delete error.request.headers.authorization;
			delete error.request.headers.Authorization;
			error.request.headers.authorization = this.redactedStr;
		}
		if (
			error?.response?.request?.headers?.authorization ||
			error?.response?.request?.headers?.Authorization
		) {
			delete error.response.request.headers.authorization;
			delete error.response.request.headers.Authorization;
			error.response.request.headers.authorization = this.redactedStr;
		}
		if (error?.config?.headers?.authorization || error?.config?.headers?.Authorization) {
			delete error.config.headers.authorization;
			delete error.config.headers.Authorization;
			error.config.headers.authorization = this.redactedStr;
		}
	}
}

/**
 * @internal
 */
export class SanitizationLumberFormatter extends BaseSanitizationLumberFormatter {
	private readonly sensitiveKeys = [
		/cookie/i,
		/passw(or)?d/i,
		/^pw$/,
		/^pass$/i,
		/secret/i,
		/token/i,
		/api[._-]?key/i,
		/session[._-]?id/i,
		/^auth/i,
	];

	public transform(lumber: Lumber<string>): void {
		super.transform(lumber);

		if (lumber.exception) {
			const sensitiveKeys = new Set<string>();
			this.redactException(lumber.exception, sensitiveKeys, "");

			if (sensitiveKeys.size > 0) {
				lumber.setProperty("detectedSensitiveKeys", sensitiveKeys);
			}
		}
	}

	private redactException(exception: Error, sensitiveKeys: Set<string>, keyPath: string): void {
		Object.keys(exception).forEach((keyStr) => {
			if (typeof exception[keyStr] === "object" && exception[keyStr] !== null) {
				this.redactException(exception[keyStr], sensitiveKeys, `${keyPath}.${keyStr}`);
			} else if (this.sensitiveKeys.some((regex) => regex.test(keyStr))) {
				exception[keyStr] = this.redactedStr;
				sensitiveKeys.add(`${keyPath}.${keyStr}`);
			}
		});
	}
}
