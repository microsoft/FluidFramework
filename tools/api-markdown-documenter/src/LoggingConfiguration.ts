/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Logger } from "./Logging.js";

/**
 * Common base interface for configurations that take a logger.
 *
 * @public
 */
export interface LoggingConfiguration {
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
