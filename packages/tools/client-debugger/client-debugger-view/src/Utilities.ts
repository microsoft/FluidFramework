/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ConnectionState } from "@fluidframework/container-loader";
import { IResolvedUrl } from "@fluidframework/driver-definitions";

/**
 * Some common utilities used by the components.
 * @remarks These are considered package-internal and should not be exported as a part of the API.
 */

/**
 * Creates a string representation of an {@link @fluidframework/driver-definitions#IResolvedUrl}.
 *
 * @internal
 */
export function resolvedUrlToString(resolvedUrl: IResolvedUrl): string {
	switch (resolvedUrl.type) {
		case "fluid":
			return resolvedUrl.url;
		case "web":
			return resolvedUrl.data;
		default:
			throw new Error("Unrecognized IResolvedUrl type.");
	}
}

/**
 * Creates a string representation of an {@link @fluidframework/container-loader#ConnectionState}.
 *
 * @internal
 */
export function connectionStateToString(connectionState: ConnectionState): string {
	switch (connectionState) {
		case ConnectionState.CatchingUp:
			return "Catching up";
		case ConnectionState.Connected:
			return "Connected";
		case ConnectionState.Disconnected:
			return "Disconnected";
		case ConnectionState.EstablishingConnection:
			return "Establishing connection";
		default:
			throw new TypeError(`Unrecognized ConnectionState value: "${connectionState}".`);
	}
}
