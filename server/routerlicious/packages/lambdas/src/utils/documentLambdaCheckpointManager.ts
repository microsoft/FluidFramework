/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IQueuedMessage } from "@fluidframework/server-services-core";

import { ICheckpoint } from "./checkpointHelper";

interface IDocumentCheckpointManager {
	updateCheckpointMessages(message: IQueuedMessage);
	clearCheckpointIdleTimer(): void;
	resetCheckpointTimer(): void;
	updateCheckpointIdleTimer(
		timeout: number,
		idleTimeCheckpoint: (message: IQueuedMessage) => void,
		isDocumentCorrupt?: boolean,
	): void;
	incrementRawMessageCounter(): void;
	resetRawMessageCounter(): void;
	getNoActiveClients(): boolean;
	setNoActiveClients(noActiveClients: boolean): void;
	getCheckpointInfo(): ICheckpoint;
}

export class DocumentCheckpointManager implements IDocumentCheckpointManager {
	private readonly checkpointInfo: ICheckpoint = {
		lastCheckpointTime: Date.now(),
		rawMessagesSinceCheckpoint: 0,
	};

	private noActiveClients: boolean = false;

	constructor() {}

	public updateCheckpointMessages(message: IQueuedMessage): void {
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

	public clearCheckpointIdleTimer(): void {
		if (this.checkpointInfo.idleTimer !== undefined) {
			clearTimeout(this.checkpointInfo.idleTimer);
			this.checkpointInfo.idleTimer = undefined;
		}
	}

	public resetCheckpointTimer(): void {
		this.clearCheckpointIdleTimer();
		this.checkpointInfo.lastCheckpointTime = Date.now();
		this.checkpointInfo.rawMessagesSinceCheckpoint = 0;
	}

	public updateCheckpointIdleTimer(
		timeout: number,
		idleTimeCheckpoint: (message: IQueuedMessage) => void,
		isDocumentCorrupt: boolean = false,
	): void {
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

	public incrementRawMessageCounter(): void {
		this.checkpointInfo.rawMessagesSinceCheckpoint++;
	}

	public resetRawMessageCounter(): void {
		this.checkpointInfo.rawMessagesSinceCheckpoint = 0;
	}

	public getNoActiveClients(): boolean {
		return this.noActiveClients;
	}

	public setNoActiveClients(noActiveClients: boolean): void {
		this.noActiveClients = noActiveClients;
	}

	public getCheckpointInfo(): ICheckpoint {
		return this.checkpointInfo;
	}

	public setLastCheckpointTime(timestamp: number): void {
		this.checkpointInfo.lastCheckpointTime = timestamp;
	}

	public getLastCheckpointTime(): number {
		return this.checkpointInfo.lastCheckpointTime;
	}
}
