/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IQueuedMessage } from "@fluidframework/server-services-core";
import { ICheckpoint } from "./checkpointHelper";

export interface IDocumentCheckpointManager {
	checkpointInfo: ICheckpoint;
	noActiveClients: boolean;
	useCheckpointIdleTimer: boolean;

	updateCheckpointMessages(message: IQueuedMessage);
	clearCheckpointIdleTimer(): void;
	resetCheckpointTimer(): void;
	updateCheckpointIdleTimer(
		timeout: number,
		idleTimeCheckpoint: (message: IQueuedMessage) => void,
		isDocumentCorrupt?: boolean,
	): void;
}

export class DocumentCheckpointManager implements IDocumentCheckpointManager {
	checkpointInfo: ICheckpoint = {
		lastCheckpointTime: Date.now(),
		rawMessagesSinceCheckpoint: 0,
	};
	noActiveClients: boolean = false;
	useCheckpointIdleTimer: boolean;

	constructor(createIdleTimer: boolean = true) {
		this.useCheckpointIdleTimer = createIdleTimer;
	}

	updateCheckpointMessages(message: IQueuedMessage) {
		// updates checkpoint message
		this.checkpointInfo.currentCheckpointMessage = message;

		if (this.noActiveClients) {
			this.checkpointInfo.nextKafkaCheckpointMessage = undefined;
			this.checkpointInfo.currentKafkaCheckpointMessage = message;
		} else {
			// Keeps Kafka checkpoint behind by 1 message
			const kafkaCheckpointMessage = this.checkpointInfo.nextKafkaCheckpointMessage;
			this.checkpointInfo.nextKafkaCheckpointMessage = message;
			this.checkpointInfo.currentKafkaCheckpointMessage = kafkaCheckpointMessage;
		}
	}

	clearCheckpointIdleTimer() {
		if (this.checkpointInfo.idleTimer !== undefined) {
			clearTimeout(this.checkpointInfo.idleTimer);
			this.checkpointInfo.idleTimer = undefined;
		}
	}

	public resetCheckpointTimer() {
		this.clearCheckpointIdleTimer();
		this.checkpointInfo.lastCheckpointTime = Date.now();
		this.checkpointInfo.rawMessagesSinceCheckpoint = 0;
	}

	public updateCheckpointIdleTimer(
		timeout: number,
		idleTimeCheckpoint: (message: IQueuedMessage) => void,
		isDocumentCorrupt: boolean = false,
	) {
		this.clearCheckpointIdleTimer();

		const initalCheckpointMessage = this.checkpointInfo.currentCheckpointMessage;

		this.checkpointInfo.idleTimer = setTimeout(() => {
			this.checkpointInfo.idleTimer = undefined;

			// verify that the current message matches the message that started this timer
			// original implementation from Deli
			if (
				initalCheckpointMessage === this.checkpointInfo.currentCheckpointMessage &&
				!isDocumentCorrupt
			) {
				this.resetCheckpointTimer();
				if (initalCheckpointMessage) {
					idleTimeCheckpoint(initalCheckpointMessage);
				}
			}
		}, timeout);
	}
}
