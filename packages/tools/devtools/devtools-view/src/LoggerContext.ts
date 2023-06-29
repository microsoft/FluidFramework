/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";

/**
 * Context that optionally provides a logger implementation to process usage telemetry.
 *
 * @remarks
 * This is not intended to be used (define a provider for this context) by the package that defines it, but by the
 * Fluid DevTools browser extension, to provide a logger that will process the usage telemetry.
 * It's also not supposed to be used in other places where we render the Devtools view, such as when we display it
 * inline in a sample application.
 */
export const LoggerContext = React.createContext<ITelemetryBaseLogger | undefined>(undefined);

/**
 * Gets the {@link @fluidframework/common-definitions#ITelemetryBaseLogger} provided through a {@link LoggerContext}.
 *
 * @returns
 * The logger from the context, or undefined is no logger was provided.
 */
export function useExternalLogger(): ITelemetryBaseLogger | undefined {
	return React.useContext(LoggerContext);
}
