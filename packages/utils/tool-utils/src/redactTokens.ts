/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IOdspTokens } from "@fluidframework/odsp-doclib-utils/internal";

const describeSecret = (secret: string | undefined): string =>
	secret === undefined ? "absent" : `present(len=${secret.length})`;

/**
 * Produce a log-safe, non-secret description of an {@link IOdspTokens} object.
 *
 * Emits only the presence, length, and timing of the token fields — never the token values
 * themselves — so it is safe to embed in error messages and logs (which flow verbatim to telemetry).
 */
export function redactTokens(tokens: Partial<IOdspTokens> | undefined): string {
	if (tokens === undefined) {
		return "tokens=undefined";
	}
	return (
		`tokens={ accessToken:${describeSecret(tokens.accessToken)}, ` +
		`refreshToken:${describeSecret(tokens.refreshToken)}, ` +
		`receivedAt:${tokens.receivedAt ?? "undefined"}, ` +
		`expiresIn:${tokens.expiresIn ?? "undefined"} }`
	);
}
