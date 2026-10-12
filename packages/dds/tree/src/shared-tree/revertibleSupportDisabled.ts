/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { toRevertibleSupport, type RevertibleSupportController } from "./revertibleSupport.js";

const disabledController: RevertibleSupportController = {
	createFactory: () => undefined,
	cloneRevertible: () => {
		throw new UsageError("History recovery is disabled for this SharedTree.");
	},
	disposeRevertibleForRemovedCommit: () => {},
	getRevertTo: () => undefined,
	revertTo: () => {
		throw new UsageError("History recovery is disabled for this SharedTree.");
	},
	dispose: () => {},
};

/**
 * Disables creation and application of revertibles.
 *
 * @alpha
 */
export const RevertibleSupportDisabled = toRevertibleSupport(() => disabledController);
