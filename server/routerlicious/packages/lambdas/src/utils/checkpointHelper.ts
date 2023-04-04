/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICheckpointRepository, IDeliState, IDocument, IQueuedMessage } from "@fluidframework/server-services-core";
import { BaseTelemetryProperties, getLumberBaseProperties, LumberEventName, Lumberjack } from "@fluidframework/server-services-telemetry";

export enum CheckpointReason {
	EveryMessage,
	IdleTime,
	MaxTime,
	MaxMessages,
	ClearCache,
	NoClients,
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

export async function restoreFromCheckpoint(documentId: string, tenantId:string, service: string, localCheckpointEnabled: boolean, checkpointRepository: ICheckpointRepository, document: IDocument): Promise<any> {
    let checkpoint;
    let lastCheckpoint: IDeliState;
    let isLocalCheckpoint = false;
    const restoreFromCheckpointMetric = Lumberjack.newLumberMetric(LumberEventName.RestoreFromCheckpoint);
    let checkpointSource = "defaultGlobalCollection";

    if (!localCheckpointEnabled || !checkpointRepository){
        // If we cannot checkpoint locally, use document
        lastCheckpoint = JSON.parse(document[service]);
    } else {
        // Search checkpoints collection for checkpoint
        checkpoint = await checkpointRepository.getCheckpoint(documentId, tenantId)
        .catch((error) => {
            Lumberjack.error(`Error retrieving local checkpoint`, getLumberBaseProperties(documentId, tenantId));
            checkpointSource = "notFoundInLocalCollection";
        });

        if(checkpoint?.deli) {
            lastCheckpoint = JSON.parse(checkpoint[service]);
            checkpointSource = "foundInLocalCollection";
            isLocalCheckpoint = true;
        } else {
            // If checkpoint does not exist, use document
            checkpointSource = "notFoundInLocalCollection";
            lastCheckpoint = JSON.parse(document[service]);
        }

    }

    restoreFromCheckpointMetric.setProperties({
        [BaseTelemetryProperties.tenantId]: tenantId,
        [BaseTelemetryProperties.documentId]: documentId,
        service,
        checkpointSource,
        retrievedFromLocalDatabase: isLocalCheckpoint,
    });

    if (lastCheckpoint) {
        restoreFromCheckpointMetric.success(`Restored checkpoint from database.`);
        return lastCheckpoint;
    } else {
        restoreFromCheckpointMetric.error(`Error restoring checkpoint from database. Last checkpoint not found.`);
        return;
    }

}

