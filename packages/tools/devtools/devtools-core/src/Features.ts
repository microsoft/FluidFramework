/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Describes features supported by {@link IFluidDevtools}.
 *
 * @internal
 */
export enum DevtoolsFeature {
	/**
	 * Indicates that the {@link IFluidDevtools} instance is capable of providing Fluid telemetry events.
	 */
	Telemetry = "telemetry",
}

/**
 * Describes the set of {@link DevtoolsFeature | features} supported by a {@link IFluidDevtools} instance.
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
export type DevtoolsFeatureFlags = {
	/**
	 * Indicates whether or not a given {@link DevtoolsFeature} is supported by an instance of the Devtools.
	 */
	[Feature in DevtoolsFeature]?: boolean;
};

/**
 * Describes features supported by the Devtools for a specific Container instance.
 *
 * @internal
 */
export enum ContainerDevtoolsFeature {
	/**
	 * Indicates that the Container Devtools supports editing the data associated with the Container.
	 */
	ContainerData = "container-data",

	/**
	 * Indicates that editing of values is available in the Devtools View.
	 */
	ContainerDataEditing = "container-data-editing",
}

/**
 * Describes the set of {@link ContainerDevtoolsFeature | container-related features} supported by the Devtools.
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
export type ContainerDevtoolsFeatureFlags = {
	/**
	 * Indicates whether or not a given {@link ContainerDevtoolsFeature} is supported by an instance of Devtools.
	 */
	[Feature in ContainerDevtoolsFeature]?: boolean;
};
