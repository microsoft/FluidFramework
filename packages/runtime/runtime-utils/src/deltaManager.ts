/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDeltaManager } from "@fluidframework/container-definitions/internal";
import type { IDeltaManagerErased } from "@fluidframework/datastore-definitions/internal";
import type {
	IDocumentMessage,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";

/**
 * Casts the public API for delta manager into the internal one,
 * exposing access to APIs needed by the implementation of Fluid Framework but not its users.
 * @legacy
 * @alpha
 */
export function toDeltaManagerInternal(
	deltaManager: IDeltaManagerErased,
): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
	// Type assertion is safe as IDeltaManagerErased is specifically designed to be a type-erased version of IDeltaManager
	return deltaManager as unknown as IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
}

/**
 * Casts the the internal API for delta manager into the public type erased API for returning from public APIs that should not have access to any of its members.
 * @internal
 */
export function toDeltaManagerErased(
	deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
): IDeltaManagerErased {
	// Type assertion is safe as we're intentionally erasing the type information for public API safety
	return deltaManager as unknown as IDeltaManagerErased;
}
