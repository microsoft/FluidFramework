/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Type from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

const indexSchema = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });

const revisionSchema = Type.Object({
	branchId: Type.String(),
	revision: Type.String(),
});

const nodeReferenceSchema = Type.Object({
	version: Type.Number(),
	revision: revisionSchema,
	path: Type.Array(Type.Tuple([Type.String(), indexSchema]), { minItems: 1 }),
	length: Type.Optional(indexSchema),
});

/**
 * Shape validation for a single location. Version and policy support are checked
 * independently so they remain enforced when schema validation is disabled.
 */
export const capturedTreeLocationSchema = Type.Union([
	Type.Object({
		kind: Type.Literal("node"),
		node: nodeReferenceSchema,
	}),
	Type.Object({
		// Retain the caller's node representation for resolution; both use "sequence" inputs publicly.
		kind: Type.Union([Type.Literal("sequence"), Type.Literal("text")]),
		node: nodeReferenceSchema,
		index: indexSchema,
		affinity: Type.Union([Type.Literal("before"), Type.Literal("after")]),
		movePolicy: Type.Optional(Type.Unknown()),
	}),
]);

/**
 * Validate the envelope separately to distinguish unavailable revisions from malformed locations.
 */
export const capturedTreeLocationEnvelopeSchema = Type.Object({
	revision: revisionSchema,
	location: Type.Unknown(),
});

/** Complete encoding schema; decoding validates the envelope and entries separately. */
export const capturedTreeLocationEncodingSchema = Type.Object({
	...capturedTreeLocationEnvelopeSchema.properties,
	location: capturedTreeLocationSchema,
});

/**
 * Private wire representation of the type-erased presence payload.
 * @remarks
 * References use sender-side paths in stored field keys, bound to the capture revision.
 * The representation stays as structured JSON data, not JSON-encoded strings.
 * Shape validation follows the configured FormatValidator, including its no-op option.
 * A malformed envelope is unavailable; malformed locations are rejected individually.
 * Version, revision binding, root path, policy support, and historical bounds remain semantic checks.
 * Captures do not authenticate historical existence or sender identity.
 */
export type CapturedTreeLocationInternal = Static<typeof capturedTreeLocationEncodingSchema>;
export type CapturedRevision = Static<typeof revisionSchema>;
export type CapturedNodeReference = Static<typeof nodeReferenceSchema>;
