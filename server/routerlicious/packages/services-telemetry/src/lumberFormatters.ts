/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack } from "./lumberjack";
import { ILumberFormatter, LogLevel } from "./resources";
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
		if (lumber.logLevel === LogLevel.Error && lumber.exception) {
			Object.keys(lumber.exception).forEach((keyStr, value) => {
				if (typeof value === "object" && value !== null) {
					this.transform(value);
				} else if (this.sensitiveKeys.some((regex) => regex.test(keyStr))) {
					lumber[keyStr] = this.redactedStr;
					Lumberjack.warning(
						"Detected sensitve data in logs",
						{ DetectedSecret: keyStr },
						null,
					);
				}
			});
		}
	}
}
