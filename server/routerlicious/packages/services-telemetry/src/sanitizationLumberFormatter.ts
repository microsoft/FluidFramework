/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILumberFormatter } from "./resources";
import { Lumber } from "./lumber";

export class SanitizationLumberFormatter implements ILumberFormatter {
	private readonly sensitiveKeys = [
		/cookie/i,
		/passw(or)?d/i,
		/^pw$/,
		/^pass$/i,
		/secret/i,
		/token/i,
		/api[._-]?key/i,
		/session[._-]?id/i,
	];

	private readonly redactedStr = "[LUMBER_REDACTED]";

	public transform(lumber: Lumber<string>): void {
		if (lumber.exception) {
			const sensitiveKeys = new Set<string>();

			this.redactException(lumber.exception, sensitiveKeys);

			if (sensitiveKeys.size > 0) {
				lumber.setProperty("detectedSensitiveKeys", sensitiveKeys);
			}
		}
	}

	private redactException(exception: Error, sensitiveKeys: Set<string>): void {
		Object.keys(exception).forEach((keyStr, value) => {
			if (typeof value === "object" && value !== null) {
				this.redactException(value, sensitiveKeys);
			} else if (this.sensitiveKeys.some((regex) => regex.test(keyStr))) {
				exception[keyStr] = this.redactedStr;
				sensitiveKeys.add(keyStr);
			}
		});
	}
}
