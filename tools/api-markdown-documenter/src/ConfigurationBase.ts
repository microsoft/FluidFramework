/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Logger } from "./Logging";

/**
 * Common base interface for configuration interfaces.
 */
export interface ConfigurationBase {
	/**
	 * Optional receiver of system log data.
	 *
	 * @defaultValue {@link defaultConsoleLogger}
	 *
	 * @remarks
	 *
	 * A custom logger can be provided for customized policy, or for a target other than the console.
	 *
	 * If you wish to enable `verbose` logging, consider using {@link verboseConsoleLogger}.
	 */
	readonly logger?: Logger;
}
