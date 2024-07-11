/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDeltaManager } from "@fluidframework/container-definitions/internal";
import type {
	IDocumentMessage,
	ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";

/**
 * Casts the public API for delta manager into the internal one,
 * exposing access to APIs needed by the implementation of Fluid Framework but not its users.
 * @alpha
 */
export function toDeltaManagerInternal(
	deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
	return deltaManager;
}
