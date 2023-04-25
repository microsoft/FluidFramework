/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable } from "@fluidframework/common-definitions";
import { RouterliciousContainerDevtoolsProps } from "./RouterliciousContainerDevtoolsProps";

/**
 * TODO
 *
 * @public
 */
export interface IRouterliciousDevtools extends IDisposable {
	/**
	 * TODO
	 */
	registerContainerDevtools(containerProps: RouterliciousContainerDevtoolsProps): void;
}
