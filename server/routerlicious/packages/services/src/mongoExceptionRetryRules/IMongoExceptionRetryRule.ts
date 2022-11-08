/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IMongoExceptionRetryRule {
	match: (error: any) => boolean;
	shouldRetry: boolean;
}
