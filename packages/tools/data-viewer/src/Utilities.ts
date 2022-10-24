/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { IFluidContainer } from "@fluidframework/fluid-static";

/**
 * Some common utilities used by the components.
 * @remarks These are considered package-internal and should not be exported as a part of the API.
 */

/**
 * Gets the inner IContainer from within the {@link @fluidframework/fluid-static#IFluidContainer} via some hackery.
 *
 * @privateRemarks
 *
 * TODO: expose more details as internal only on the IFluidContainer, or expose the inner
 * container as internal only?
 *
 * @internal
 */
export function getInnerContainer(container: IFluidContainer): IContainer {
    // Hack to get at container internals
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const innerContainer = (container as any).container as IContainer;
    if (innerContainer === undefined) {
        throw new Error("Could not find inner IContainer under IFluidContainer.");
    }
    return innerContainer;
}

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
