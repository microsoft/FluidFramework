/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IClient } from "@fluidframework/driver-definitions";
import type { IDocumentService } from "@fluidframework/driver-definitions/internal";
import {
	createChildLogger,
	type TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import { ConnectionManager } from "./connectionManager.js";
import { DeltaManager } from "./deltaManager.js";

export interface ICreateDeltaManagerProps {
	readonly serviceProvider: () => IDocumentService | undefined;
	readonly logger: TelemetryLoggerExt;
	readonly active: () => boolean;
	readonly containerDirty: () => boolean;
	readonly client: IClient;
	readonly reconnectAllowed: boolean;
	readonly maxInitialConnectionAttempts?: number;
}

/**
 * Creates the DeltaManager and ConnectionManager pair used by container loading.
 */
export function createDeltaManager({
	serviceProvider,
	logger,
	active,
	containerDirty,
	client,
	reconnectAllowed,
	maxInitialConnectionAttempts,
}: ICreateDeltaManagerProps): DeltaManager<ConnectionManager> {
	return new DeltaManager<ConnectionManager>(
		serviceProvider,
		createChildLogger({ logger, namespace: "DeltaManager" }),
		active,
		(props) =>
			new ConnectionManager(
				serviceProvider,
				containerDirty,
				client,
				reconnectAllowed,
				createChildLogger({ logger, namespace: "ConnectionManager" }),
				props,
				maxInitialConnectionAttempts,
			),
	);
}
