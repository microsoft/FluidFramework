/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";

/**
 * Context for accessing a shared logger for usage telemetry.
 *
 * TODO: how to make it so different files in the package can log with different namespaces?
 */
// eslint-disable-next-line unicorn/no-useless-undefined
export const LoggerContext = React.createContext<ITelemetryBaseLogger | undefined>(undefined);

/**
 * Gets the {@link @fluidframework/common-definitions#ITelemetryBaseLogger} from the local {@link LoggerContext}.
 *
 * @returns
 * The logger from the context, or undefined is no logger was provided.
 */
export function useLogger(): ITelemetryBaseLogger | undefined {
	return React.useContext(LoggerContext);
}
