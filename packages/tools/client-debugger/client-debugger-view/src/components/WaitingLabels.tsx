/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Type of {@link waitingLabels}.
 */
export type WaitingLabelsType = Record<string, string>;

/**
 * Record containing labels for {@link Waiting} component.
 */
export const waitingLabels: WaitingLabelsType = {
	containerError: "Waiting for container DDS data.",
	undefinedError: "Data undefined.",
	unknownDataError: "Unknown data format.",
	unkownFluidDataError: "Unknown Fluid SharedObject.",
};
