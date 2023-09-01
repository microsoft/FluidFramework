/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IDocumentKeyRetriever {
	getKeyCosmos<T>(
		keyName: string,
		tenantId: string,
		documentId: string,
		useCachedDocument?: boolean,
	): Promise<T>;

	getKeyRedis<T>(keyName: string): Promise<T>;

	getKeyRedisFallback<T>(
		keyNameBase: string,
		tenantId: string,
		documentId: string,
		useCachedDocument?: boolean,
	): Promise<T>;
}
