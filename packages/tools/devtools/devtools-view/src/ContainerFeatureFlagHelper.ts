/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ContainerDevtoolsFeatureFlags } from "@fluidframework/devtools-core/internal";
import { createContext, useContext } from "react";

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
export const ContainerFeatureFlagContext = createContext<
	ContainerFeatureFlagContextData | undefined
>(undefined);

/**
 * Used to get the context or throw an Error if not found
 */
export function useContainerFeaturesContext(): ContainerFeatureFlagContextData {
	const context = useContext(ContainerFeatureFlagContext);
	if (context === undefined) {
		throw new Error("ContainerFeatureFlagContext not found");
	}
	return context;
}
