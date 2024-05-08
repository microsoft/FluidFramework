/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDeltaManager } from "@fluidframework/container-definitions/internal";
import type { IDeltaManagerErased } from "@fluidframework/datastore-definitions";
import type {
	IDocumentMessage,
	ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";

/**
 * Manages the transmission of ops between the runtime and storage.
 * @alpha
 */
export function toDeltaManagerInternal(
	deltaManager: IDeltaManagerErased,
): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
	return deltaManager as unknown as IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
}

/**
 * Manages the transmission of ops between the runtime and storage.
 * @internal
 */
export function toDeltaManagerErased(
	deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
): IDeltaManagerErased {
	return deltaManager as unknown as IDeltaManagerErased;
}
