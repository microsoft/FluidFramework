/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Describes the set of features supported by a {@link IFluidDevtools} instance.
 *
 * @remarks
 *
 * This has two primary purposes:
 *
 * 1. It can be used to signal to consumers of the Devtools what kinds of functionality are supported (at runtime)
 * by a {@link IFluidDevtools} instance.
 *
 * 2. It can be used to make backwards compatible changes easier to make.
 * By adding a flag to this object for new features, consumers can easily verify whether or not that feature
 * is supported by the {@link IFluidDevtools} instance before attempting to use it.
 *
 * @internal
 */
export interface DevtoolsFeatureFlags {
	/**
	 * Indicates that the {@link IFluidDevtools} instance is capable of providing Fluid telemetry events.
	 */
	telemetry?: boolean;
	/**
	 * Indicates that the {@link IFluidDevtools} instance is capable of providing Fluid Op Latency telemetry events
	 */
	opLatencyTelemetry?: boolean;
}

/**
 * Describes the set of container-related features supported by the Devtools.
 *
 * @remarks
 *
 * This has two primary purposes:
 *
 * 1. It can be used to signal to consumers of the Devtools what kinds of functionality are supported (at runtime)
 * by the Devtools for a specific Container instance.
 *
 * 2. It can be used to make backwards compatible changes easier to make.
 * By adding a flag to this object for new features, consumers can easily verify whether or not that feature
 * is supported by the Devtools for a specific Container instance.
 *
 * @internal
 */
export interface ContainerDevtoolsFeatureFlags {
	/**
	 * Indicates that the Container Devtools supports visualizing the data associated with the Container.
	 */
	containerDataVisualization?: boolean;
}
