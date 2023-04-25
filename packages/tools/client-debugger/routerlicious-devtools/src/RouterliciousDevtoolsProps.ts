/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DevtoolsLogger, VisualizeSharedObject } from "@fluid-tools/client-debugger";

import { RouterliciousContainerDevtoolsProps } from "./RouterliciousContainerDevtoolsProps";

/**
 * Properties for configuring an {@link IRouterliciousDevtools}.
 *
 * @public
 */
export interface RouterliciousDevtoolsProps {
	/**
	 * (optional) telemetry logger associated with the Fluid runtime.
	 *
	 * @remarks
	 *
	 * Note: {@link IRouterliciousDevtools} does not register this logger with the Fluid runtime; that must be done separately.
	 *
	 * This is provided to the Devtools instance strictly to enable communicating supported / desired functionality with
	 * external listeners.
	 */
	logger?: DevtoolsLogger;

	/**
	 * (optional) List of Containers to initialize the devtools with.
	 *
	 * @remarks Additional Containers can be registered with the Devtools via {@link IRouterliciousDevtools.registerContainerDevtools}.
	 */
	initialContainers?: RouterliciousContainerDevtoolsProps[];

	/**
	 * (optional) Configurations for generating visual representations of
	 * {@link @fluidframework/shared-object-base#ISharedObject}s under each Container's
	 * {@link @fluidframework/fluid-static#IFluidContainer.initialObjects}.
	 *
	 * @remarks
	 *
	 * If not specified, then only `SharedObject` types natively known by the system will be visualized, and using
	 * default visualization implementations.
	 *
	 * If a visualizer configuration is specified for a shared object type that has a default visualizer, the custom
	 * one will be used.
	 */
	dataVisualizers?: Record<string, VisualizeSharedObject>;
}
