/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import { IDocumentDeltaStorageService, IStream } from "@fluidframework/driver-definitions/internal";
import { emptyMessageStream } from "@fluidframework/driver-utils/internal";

export class EmptyDeltaStorageService implements IDocumentDeltaStorageService {
	/**
	 * Returns ops from the list of ops generated till now.
	 * @param from - Ops are returned from + 1.
	 * @param to - Op are returned from to - 1.
	 * @returns Array of ops requested by the user.
	 */
	public fetchMessages(
		from: number,
		to: number | undefined,
		abortSignal?: AbortSignal,
		cachedOnly?: boolean,
	): IStream<ISequencedDocumentMessage[]> {
		return emptyMessageStream;
	}
}
