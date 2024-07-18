/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ContainerDevtoolsFeatureFlags } from "@fluidframework/devtools-core/internal";
import React from "react";

/**
 * Interface for {@link ContainerFeatureFlagContext} data
 */
export interface ContainerFeatureFlagContextData {
	/**
	 * {@inheritDoc @fluidframework/devtools-core#ContainerDevtoolsFeatureFlags}
	 */
	containerFeatureFlags: ContainerDevtoolsFeatureFlags;
}

/**
 * Creates the context for container feature flags
 */
export const ContainerFeatureFlagContext = React.createContext<
	ContainerFeatureFlagContextData | undefined
>(undefined);

/**
 * Used to get the context or throw an Error if not found
 */
export function useContainerFeaturesContext(): ContainerFeatureFlagContextData {
	const context = React.useContext(ContainerFeatureFlagContext);
	if (context === undefined) {
		throw new Error("TODO");
	}
	return context;
}
