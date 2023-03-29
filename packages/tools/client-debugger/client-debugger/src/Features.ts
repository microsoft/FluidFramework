/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Describes features supported by the debugger.
 *
 * @public
 */
export enum DebuggerFeature {
	/**
	 * Indicates that the debugger is capable of generating visual summaries of application data associated with
	 * the Container.
	 */
	ContainerData = "containerData",

	/**
	 * Indicates that the debugger is capable of providing Fluid telemetry logs.
	 */
	Telemetry = "telemetry",
}

/**
 * Describes the set of {@link DebuggerFeature | features} supported by a debugger instance.
 *
 * @remarks
 *
 * This has two primary purposes:
 *
 * 1. It can be used to signal to consumers of the debugger what kinds of functionality are supported (at runtime)
 * by a debugger instance.
 *
 * 2. It can be used to make backwards compatible changes easier to make.
 * By adding a flag to this object for new features, consumers can easily verify whether or not that feature
 * is supported by the corresponding debugger instance before attempting to use it.
 *
 * @public
 */
export type DebuggerFeatures = {
	/**
	 * Indicates whether or not a given {@link DebuggerFeature} is supported by an instance of the debugger.
	 */
	[Feature in DebuggerFeature]?: boolean;
};
