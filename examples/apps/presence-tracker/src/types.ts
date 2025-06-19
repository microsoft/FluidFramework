/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { StateSchemaValidator } from "@fluidframework/presence/beta";
import { type Static, Type } from "@sinclair/typebox";
// eslint-disable-next-line import/no-internal-modules -- this is the correct module. See https://github.com/sinclairzx81/typebox#values
import { Value } from "@sinclair/typebox/value";

export const MousePosition = Type.Object({
	x: Type.Readonly(Type.Number()),
	y: Type.Readonly(Type.Number()),
});

/**
 * MousePosition is the data that individual session clients share via presence.
 */
export type MousePosition = Static<typeof MousePosition>;

export const MousePositionValidator: StateSchemaValidator<MousePosition> = (
	maybeValid,
): MousePosition | undefined => {
	console.debug(`Validator called with`, maybeValid);

	// Value matches type expectations
	if (Value.Check(MousePosition, maybeValid)) {
		return maybeValid;
	}

	return undefined;
};
