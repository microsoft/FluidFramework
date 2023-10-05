/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ConnectionState } from "@fluidframework/container-loader";

/**
 * Some common utilities used by the components.
 * @remarks These are considered package-internal and should not be exported as a part of the API.
 */

/**
 * Creates a string representation of an {@link @fluidframework/container-loader#ConnectionState}.
 *
 * @internal
 */
export function connectionStateToString(connectionState: ConnectionState): string {
	switch (connectionState) {
		case ConnectionState.CatchingUp: {
			return "Catching up";
		}
		case ConnectionState.Connected: {
			return "Connected";
		}
		case ConnectionState.Disconnected: {
			return "Disconnected";
		}
		case ConnectionState.EstablishingConnection: {
			return "Establishing connection";
		}
		default: {
			throw new TypeError(`Unrecognized ConnectionState value: "${connectionState}".`);
		}
	}
}
