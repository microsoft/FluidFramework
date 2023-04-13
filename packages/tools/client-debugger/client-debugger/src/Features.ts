/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Describes features supported by {@link FluidDevtools}.
 *
 * @public
 */
export enum DevtoolsFeature {
	/**
	 * Indicates that the {@link FluidDevtools} instance is capable of providing Fluid telemetry events.
	 */
	Telemetry = "telemetry",
}

/**
 * Describes the set of {@link DevtoolsFeature | features} supported by a {@link FluidDevtools} instance.
 *
 * @remarks
 *
 * This has two primary purposes:
 *
 * 1. It can be used to signal to consumers of the Devtools what kinds of functionality are supported (at runtime)
 * by a {@link FluidDevtools} instance.
 *
 * 2. It can be used to make backwards compatible changes easier to make.
 * By adding a flag to this object for new features, consumers can easily verify whether or not that feature
 * is supported by the {@link FluidDevtools} instance before attempting to use it.
 *
 * @public
 */
export type DevtoolsFeatureFlags = {
	/**
	 * Indicates whether or not a given {@link DevtoolsFeature} is supported by an instance of the Devtools.
	 */
	[Feature in DevtoolsFeature]?: boolean;
};

/**
 * Describes features supported by {@link ContainerDevtools}.
 *
 * @public
 */
export enum ContainerDevtoolsFeature {
	/**
	 * Indicates that the Container Devtools is capable of generating visual summaries of application data associated with
	 * the Container.
	 */
	ContainerData = "container-data",
}

/**
 * Describes the set of {@link ContainerDevtoolsFeature | container-related features} supported by a
 * {@link ContainerDevtools} instance.
 *
 * @remarks
 *
 * This has two primary purposes:
 *
 * 1. It can be used to signal to consumers of the Devtools what kinds of functionality are supported (at runtime)
 * by a {@link ContainerDevtools} instance.
 *
 * 2. It can be used to make backwards compatible changes easier to make.
 * By adding a flag to this object for new features, consumers can easily verify whether or not that feature
 * is supported by the corresponding {@link ContainerDevtools} instance before attempting to use it.
 *
 * @public
 */
export type ContainerDevtoolsFeatureFlags = {
	/**
	 * Indicates whether or not a given {@link ContainerDevtoolsFeature} is supported by an instance of Devtools.
	 */
	[Feature in ContainerDevtoolsFeature]?: boolean;
};
