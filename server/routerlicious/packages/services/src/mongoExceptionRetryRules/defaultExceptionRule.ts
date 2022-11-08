/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { IMongoExceptionRetryRule } from "./IMongoExceptionRetryRule";

export class DefaultExceptionRule implements IMongoExceptionRetryRule {
	match(error: any): boolean {
		Lumberjack.error("DefaultRule.match() called for unknown error", undefined, error);
		return true;
	}

	shouldRetry: boolean = false;
}
