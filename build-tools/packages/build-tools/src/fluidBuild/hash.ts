/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import crypto from "crypto";

/**
 * Computes the sha256 hex digest of the given data.
 *
 * @remarks
 * Accepts a string as well as a `Buffer` because the TypeScript compiler internals that this is
 * handed to (see `createGetSourceFileVersion` in tscUtils.ts) hash the file text directly.
 */
export const sha256 = (buffer: Buffer | string): string => {
	return crypto.createHash("sha256").update(buffer).digest("hex");
};
