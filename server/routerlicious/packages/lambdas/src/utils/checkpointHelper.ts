/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IQueuedMessage } from "@fluidframework/server-services-core";

export enum CheckpointReason {
	EveryMessage,
	IdleTime,
	MaxTime,
	MaxMessages,
	ClearCache,
	NoClients,
	MarkAsCorrupt,
}

// Used to control checkpoint logic
export interface ICheckpoint {
	currentCheckpointMessage?: IQueuedMessage;
	currentKafkaCheckpointMessage?: IQueuedMessage;

	// used for ensuring the lambda remains open while clients are connected
	nextKafkaCheckpointMessage?: IQueuedMessage;

	// time fired due that should kick off a checkpoint when scribe is idle
	idleTimer?: any;

	// raw messages since the last checkpoint
	rawMessagesSinceCheckpoint: number;

	// time in milliseconds since the last checkpoint
	lastCheckpointTime: number;
}
