/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "./idCompressor.js";

/**
 * A compressed ID that has been normalized into "session space" (see `IdCompressor` for more).
 * Consumer-facing APIs and data structures should use session-space IDs as their lifetime and equality is stable and tied to
 * the scope of the session (i.e. compressor) that produced them.
 * @public
 */
export type SessionSpaceCompressedId = number & {
	readonly SessionUnique: "cea55054-6b82-4cbf-ad19-1fa645ea3b3e";
};

/**
 * A compressed ID that has been normalized into "op space".
 * @remarks
 * Use {@link IIdCompressor.normalizeToOpSpace} to encode IDs for serialized/persisted structures (e.g. ops), and
 * {@link IIdCompressor.normalizeToSessionSpace} to decode them for local use.
 * Note that {@link IIdCompressor.normalizeToSessionSpace} requires additional information to be able to decode the ID: see its documentation for details.
 *
 * Op-space IDs are the compressed representation intended for serialization.
 * Consumer-facing APIs and runtime data structures should generally use {@link SessionSpaceCompressedId},
 * or {@link StableId}.
 * @privateRemarks
 * Session relative IDs are encoded as negative numbers while final IDs are encoded as positive ones.
 * @public
 */
export type OpSpaceCompressedId = number & {
	readonly OpNormalized: "9209432d-a959-4df7-b2ad-767ead4dbcae";
};

/**
 * A {@link https://datatracker.ietf.org/doc/html/rfc4122 | version 4, variant 1 uuid}.
 * A 128-bit Universally Unique IDentifier. Represented here
 * with a string of the form xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx,
 * where x is a lowercase hex digit.
 * @public
 */
export type StableId = string & { readonly StableId: "53172b0d-a3d5-41ea-bd75-b43839c97f5a" };

/**
 * A StableId which is suitable for use as a session identifier
 * @public
 */
export type SessionId = StableId & {
	readonly SessionId: "4498f850-e14e-4be9-8db0-89ec00997e58";
};
