/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "@fluid-internal/client-utils";
import type { ReadOnlyInfo } from "@fluidframework/container-definitions/internal";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import type {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import type { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions/internal";
import type { IFluidSerializer } from "@fluidframework/shared-object-base/internal";
import {
	SharedObject,
	createSingleBlobSummary,
} from "@fluidframework/shared-object-base/internal";

import type { ITaskManager, ITaskManagerEvents } from "./interfaces.js";

/**
 * Description of a task manager operation
 */
type ITaskManagerOperation =
	| ITaskManagerVolunteerOperation
	| ITaskManagerAbandonOperation
	| ITaskManagerCompletedOperation;

interface ITaskManagerVolunteerOperation {
	type: "volunteer";
	taskId: string;
}

interface ITaskManagerAbandonOperation {
	type: "abandon";
	taskId: string;
}

interface ITaskManagerCompletedOperation {
	type: "complete";
	taskId: string;
}

interface IPendingOp {
	type: "volunteer" | "abandon" | "complete";
	messageId: number;
}

const snapshotFileName = "header";

/**
 * Placeholder clientId for detached scenarios.
 */
const placeholderClientId = "placeholder";

/**
 * {@inheritDoc ITaskManager}
 *
 * @sealed
 * @legacy @beta
 */
export class TaskManagerClass
	extends SharedObject<ITaskManagerEvents>
	implements ITaskManager
{
	/**
	 * Mapping of taskId to a queue of clientIds that are waiting on the task.  Maintains the consensus state of the
	 * queue, even if we know we've submitted an op that should eventually modify the queue.
	 */
	private readonly taskQueues = new Map<string, string[]>();

	// opWatcher emits for every op on this data store.  This is just a repackaging of processCore into events.
	private readonly opWatcher: EventEmitter = new EventEmitter();
	// queueWatcher emits an event whenever the consensus state of the task queues changes
	private readonly queueWatcher: EventEmitter = new EventEmitter();
	// abandonWatcher emits an event whenever the local client calls abandon() on a task.
	private readonly abandonWatcher: EventEmitter = new EventEmitter();
	// connectionWatcher emits an event whenever we get connected or disconnected.
	private readonly connectionWatcher: EventEmitter = new EventEmitter();
	// completedWatcher emits an event whenever the local client receives a completed op.
	private readonly completedWatcher: EventEmitter = new EventEmitter();

	private messageId: number = -1;
	/**
	 * Tracks the most recent pending op for a given task
	 */
	private readonly latestPendingOps = new Map<string, IPendingOp>();

	/**
	 * Tracks tasks that are this client is currently subscribed to.
	 */
	private readonly subscribedTasks = new Set<string>();

	/**
	 * Returns the clientId. Will return a placeholder if the runtime is detached and not yet assigned a clientId.
	 */
	private get clientId(): string | undefined {
		return this.isAttached() ? this.runtime.clientId : placeholderClientId;
	}

	/**
	 * Returns a ReadOnlyInfo object to determine current read/write permissions.
	 */
	private get readOnlyInfo(): ReadOnlyInfo {
		return this.deltaManager.readOnlyInfo;
	}

	/**
	 * Constructs a new task manager. If the object is non-local an id and service interfaces will
	 * be provided
	 *
	 * @param runtime - data store runtime the task queue belongs to
	 * @param id - optional name of the task queue
	 */
	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
	) {
		super(id, runtime, attributes, "fluid_taskManager_");

		this.opWatcher.on(
			"volunteer",
			(taskId: string, clientId: string, local: boolean, messageId: number) => {
				// We're tracking local ops from this connection. Filter out local ops during "connecting"
				// state since these were sent on the prior connection and were already cleared from the latestPendingOps.
				if (runtime.connected && local) {
					const pendingOp = this.latestPendingOps.get(taskId);
					assert(pendingOp !== undefined, 0x07b /* "Unexpected op" */);
					// Need to check the id, since it's possible to volunteer and abandon multiple times before the acks
					if (messageId === pendingOp.messageId) {
						assert(pendingOp.type === "volunteer", 0x07c /* "Unexpected op type" */);
						// Delete the pending, because we no longer have an outstanding op
						this.latestPendingOps.delete(taskId);
					}
				}

				this.addClientToQueue(taskId, clientId);
			},
		);

		this.opWatcher.on(
			"abandon",
			(taskId: string, clientId: string, local: boolean, messageId: number) => {
				if (runtime.connected && local) {
					const pendingOp = this.latestPendingOps.get(taskId);
					assert(pendingOp !== undefined, 0x07d /* "Unexpected op" */);
					// Need to check the id, since it's possible to abandon and volunteer multiple times before the acks
					if (messageId === pendingOp.messageId) {
						assert(pendingOp.type === "abandon", 0x07e /* "Unexpected op type" */);
						// Delete the pending, because we no longer have an outstanding op
						this.latestPendingOps.delete(taskId);
						this.abandonWatcher.emit("abandon", taskId);
					}
				}

				this.removeClientFromQueue(taskId, clientId);
			},
		);

		this.opWatcher.on(
			"complete",
			(taskId: string, clientId: string, local: boolean, messageId: number) => {
				if (runtime.connected && local) {
					const pendingOp = this.latestPendingOps.get(taskId);
					assert(pendingOp !== undefined, 0x400 /* Unexpected op */);
					// Need to check the id, since it's possible to complete multiple times before the acks
					if (messageId === pendingOp.messageId) {
						assert(pendingOp.type === "complete", 0x401 /* Unexpected op type */);
						// Delete the pending, because we no longer have an outstanding op
						this.latestPendingOps.delete(taskId);
					}
				}

				this.taskQueues.delete(taskId);
				this.completedWatcher.emit("completed", taskId);
				this.emit("completed", taskId);
			},
		);

		runtime.getQuorum().on("removeMember", (clientId: string) => {
			this.removeClientFromAllQueues(clientId);
		});

		this.queueWatcher.on(
			"queueChange",
			(taskId: string, oldLockHolder: string, newLockHolder: string) => {
				// If oldLockHolder is placeholderClientId we need to emit the task was lost during the attach process
				if (oldLockHolder === placeholderClientId) {
					this.emit("lost", taskId);
					return;
				}

				// Exit early if we are still catching up on reconnect -- we can't be the leader yet anyway.
				if (this.clientId === undefined) {
					return;
				}

				if (oldLockHolder !== this.clientId && newLockHolder === this.clientId) {
					this.emit("assigned", taskId);
				} else if (oldLockHolder === this.clientId && newLockHolder !== this.clientId) {
					this.emit("lost", taskId);
				}
			},
		);

		this.connectionWatcher.on("disconnect", () => {
			assert(this.clientId !== undefined, 0x1d3 /* "Missing client id on disconnect" */);

			// Emit "lost" for any tasks we were assigned to.
			for (const [taskId, clientQueue] of this.taskQueues.entries()) {
				if (this.isAttached() && clientQueue[0] === this.clientId) {
					this.emit("lost", taskId);
				}
			}

			// Remove this client from all queues to reflect the new state, since being disconnected automatically removes
			// this client from all queues.
			this.removeClientFromAllQueues(this.clientId);

			// All of our outstanding ops will be for the old clientId even if they get ack'd
			this.latestPendingOps.clear();
		});
	}

	private submitVolunteerOp(taskId: string): void {
		const op: ITaskManagerVolunteerOperation = {
			type: "volunteer",
			taskId,
		};
		const pendingOp: IPendingOp = {
			type: "volunteer",
			messageId: ++this.messageId,
		};
		this.submitLocalMessage(op, pendingOp.messageId);
		this.latestPendingOps.set(taskId, pendingOp);
	}

	private submitAbandonOp(taskId: string): void {
		const op: ITaskManagerAbandonOperation = {
			type: "abandon",
			taskId,
		};
		const pendingOp: IPendingOp = {
			type: "abandon",
			messageId: ++this.messageId,
		};
		this.submitLocalMessage(op, pendingOp.messageId);
		this.latestPendingOps.set(taskId, pendingOp);
	}

	private submitCompleteOp(taskId: string): void {
		const op: ITaskManagerCompletedOperation = {
			type: "complete",
			taskId,
		};
		const pendingOp: IPendingOp = {
			type: "complete",
			messageId: ++this.messageId,
		};

		this.submitLocalMessage(op, pendingOp.messageId);
		this.latestPendingOps.set(taskId, pendingOp);
	}

	/**
	 * {@inheritDoc ITaskManager.volunteerForTask}
	 */
	public async volunteerForTask(taskId: string): Promise<boolean> {
		// If we are both queued and assigned, then we have the lock and do not
		// have any pending abandon/complete ops. In this case we can resolve
		// true immediately.
		if (this.queuedOptimistically(taskId) && this.assigned(taskId)) {
			return true;
		}

		if (this.readOnlyInfo.readonly === true) {
			const error =
				this.readOnlyInfo.permissions === true
					? new Error("Attempted to volunteer with read-only permissions")
					: new Error("Attempted to volunteer in read-only state");
			throw error;
		}

		if (!this.isAttached()) {
			// Simulate auto-ack in detached scenario
			assert(this.clientId !== undefined, 0x472 /* clientId should not be undefined */);
			this.addClientToQueue(taskId, this.clientId);
			return true;
		}

		if (!this.connected) {
			throw new Error("Attempted to volunteer in disconnected state");
		}

		// This promise works even if we already have an outstanding volunteer op.
		const lockAcquireP = new Promise<boolean>((resolve, reject) => {
			const setupListeners = (): void => {
				this.queueWatcher.on("queueChange", checkIfAcquiredLock);
				this.abandonWatcher.on("abandon", checkIfAbandoned);
				this.connectionWatcher.on("disconnect", rejectOnDisconnect);
				this.completedWatcher.on("completed", checkIfCompleted);
			};
			const removeListeners = (): void => {
				this.queueWatcher.off("queueChange", checkIfAcquiredLock);
				this.abandonWatcher.off("abandon", checkIfAbandoned);
				this.connectionWatcher.off("disconnect", rejectOnDisconnect);
				this.completedWatcher.off("completed", checkIfCompleted);
			};

			const checkIfAcquiredLock = (eventTaskId: string): void => {
				if (eventTaskId !== taskId) {
					return;
				}
				// Also check pending ops here because it's possible we are currently in the queue from a previous
				// lock attempt, but have an outstanding abandon AND the outstanding volunteer for this lock attempt.
				// If we reach the head of the queue based on the previous lock attempt, we don't want to resolve.
				if (this.assigned(taskId)) {
					removeListeners();
					resolve(true);
				}
			};

			const checkIfAbandoned = (eventTaskId: string): void => {
				if (eventTaskId !== taskId) {
					return;
				}
				removeListeners();
				reject(new Error("Abandoned before acquiring task assignment"));
			};

			const rejectOnDisconnect = (): void => {
				removeListeners();
				reject(new Error("Disconnected before acquiring task assignment"));
			};

			const checkIfCompleted = (eventTaskId: string): void => {
				if (eventTaskId !== taskId) {
					return;
				}
				removeListeners();
				resolve(false);
			};

			setupListeners();
		});

		if (!this.queuedOptimistically(taskId)) {
			// Only send the volunteer op if we are not already queued.
			this.submitVolunteerOp(taskId);
		}
		return lockAcquireP;
	}

	/**
	 * {@inheritDoc ITaskManager.subscribeToTask}
	 */
	public subscribeToTask(taskId: string): void {
		if (this.subscribed(taskId)) {
			return;
		}

		if (this.readOnlyInfo.readonly === true && this.readOnlyInfo.permissions === true) {
			throw new Error("Attempted to subscribe with read-only permissions");
		}

		const submitVolunteerOp = (): void => {
			this.submitVolunteerOp(taskId);
		};

		const setupListeners = (): void => {
			this.abandonWatcher.on("abandon", checkIfAbandoned);
			this.connectionWatcher.on("disconnect", disconnectHandler);
			this.completedWatcher.on("completed", checkIfCompleted);
		};
		const removeListeners = (): void => {
			this.abandonWatcher.off("abandon", checkIfAbandoned);
			this.connectionWatcher.off("disconnect", disconnectHandler);
			this.connectionWatcher.off("connect", submitVolunteerOp);
			this.completedWatcher.off("completed", checkIfCompleted);
		};

		const disconnectHandler = (): void => {
			// Wait to be connected again and then re-submit volunteer op
			this.connectionWatcher.once("connect", submitVolunteerOp);
		};

		const checkIfAbandoned = (eventTaskId: string): void => {
			if (eventTaskId !== taskId) {
				return;
			}
			removeListeners();
			this.subscribedTasks.delete(taskId);
		};

		const checkIfCompleted = (eventTaskId: string): void => {
			if (eventTaskId !== taskId) {
				return;
			}
			removeListeners();
			this.subscribedTasks.delete(taskId);
		};

		setupListeners();

		if (!this.isAttached()) {
			// Simulate auto-ack in detached scenario
			assert(this.clientId !== undefined, 0x473 /* clientId should not be undefined */);
			this.addClientToQueue(taskId, this.clientId);
			// Because we volunteered with placeholderClientId, we need to wait for when we attach and are assigned
			// a real clientId. At that point we should re-enter the queue with a real volunteer op (assuming we are
			// connected).
			this.runtime.once("attached", () => {
				if (this.queuedOptimistically(taskId)) {
					// If we are already queued, then we were able to replace the placeholderClientId with our real
					// clientId and no action is required.
					return;
				} else if (this.connected) {
					submitVolunteerOp();
				} else {
					this.connectionWatcher.once("connect", () => {
						submitVolunteerOp();
					});
				}
			});
		} else if (!this.connected) {
			// If we are disconnected (and attached), wait to be connected and submit volunteer op
			disconnectHandler();
		} else if (!this.assigned(taskId) && !this.queuedOptimistically(taskId)) {
			const latestPendingOp = this.latestPendingOps.get(taskId);
			if (latestPendingOp?.type !== "volunteer") {
				// We don't need to send a second volunteer op if we just sent one.
				submitVolunteerOp();
			}
		}
		this.subscribedTasks.add(taskId);
	}

	/**
	 * {@inheritDoc ITaskManager.abandon}
	 */
	public abandon(taskId: string): void {
		// Always allow abandon if the client is subscribed to allow clients to unsubscribe while disconnected.
		// Otherwise, we should check to make sure the client is optimistically queued for the task before trying to abandon.
		if (!this.queuedOptimistically(taskId) && !this.subscribed(taskId)) {
			// Nothing to do
			return;
		}

		if (!this.isAttached()) {
			// Simulate auto-ack in detached scenario
			assert(this.clientId !== undefined, 0x474 /* clientId is undefined */);
			this.removeClientFromQueue(taskId, this.clientId);
			this.abandonWatcher.emit("abandon", taskId);
			return;
		}

		if (this.queuedOptimistically(taskId)) {
			this.submitAbandonOp(taskId);
			if (!this.assigned(taskId)) {
				// If we try to abandon when queued but not assigned then we should emit to the abandonWatcher
				// to ensure that the volunteer promise is rejected.
				this.abandonWatcher.emit("abandon", taskId);
			}
		} else if (this.subscribed(taskId) && !this.connected) {
			// If we are subscribed, not queued, and offline, then we should still submit the
			// abandon op/event to ensure we abandon the subscription when reconnecting.
			this.submitAbandonOp(taskId);
			this.abandonWatcher.emit("abandon", taskId);
		}
	}

	/**
	 * {@inheritDoc ITaskManager.assigned}
	 */
	public assigned(taskId: string): boolean {
		if (this.isAttached() && !this.connected) {
			return false;
		}

		const currentAssignee = this.taskQueues.get(taskId)?.[0];
		return currentAssignee !== undefined && currentAssignee === this.clientId;
	}

	/**
	 * {@inheritDoc ITaskManager.queued}
	 */
	public queued(taskId: string): boolean {
		if (this.isAttached() && !this.connected) {
			return false;
		}

		assert(this.clientId !== undefined, 0x07f /* "clientId undefined" */);
		return this.taskQueues.get(taskId)?.includes(this.clientId) ?? false;
	}

	/**
	 * {@inheritDoc ITaskManager.subscribed}
	 */
	public subscribed(taskId: string): boolean {
		return this.subscribedTasks.has(taskId);
	}

	/**
	 * {@inheritDoc ITaskManager.complete}
	 */
	public complete(taskId: string): void {
		if (!this.assigned(taskId)) {
			throw new Error("Attempted to mark task as complete while not being assigned");
		}

		// If we are detached we will simulate auto-ack for the complete op. Therefore we only need to send the op if
		// we are attached. Additionally, we don't need to check if we are connected while detached.
		if (!this.isAttached()) {
			this.taskQueues.delete(taskId);
			this.completedWatcher.emit("completed", taskId);
			this.emit("completed", taskId);
			return;
		}

		if (!this.connected) {
			throw new Error("Attempted to complete task in disconnected state");
		}
		this.submitCompleteOp(taskId);
	}

	/**
	 * {@inheritDoc ITaskManager.canVolunteer}
	 */
	public canVolunteer(): boolean {
		// A client can volunteer for a task if it's both connected to the delta stream and in write mode.
		// this.connected reflects that condition, but is unintuitive and may be changed in the future. This API allows
		// us to make changes to this.connected without affecting our guidance on how to check if a client is eligible
		// to volunteer for a task.
		return this.connected;
	}

	/**
	 * Create a summary for the task manager
	 *
	 * @returns the summary of the current state of the task manager
	 */
	protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		if (this.runtime.clientId === undefined) {
			// If the runtime has still not been assigned a clientId, we should not summarize with the placeholder
			// clientIds and instead remove them from the queues and require the client to re-volunteer when assigned
			// a new clientId.
			this.removeClientFromAllQueues(placeholderClientId);
		} else {
			// If the runtime has been assigned an actual clientId by now, we can replace the placeholder clientIds
			// and maintain the task assignment.
			this.replacePlaceholderInAllQueues();
		}

		// Only include tasks if there are clients in the queue.
		const filteredMap = new Map<string, string[]>();
		for (const [taskId, queue] of this.taskQueues) {
			if (queue.length > 0) {
				filteredMap.set(taskId, queue);
			}
		}
		const content = [...filteredMap.entries()];
		return createSingleBlobSummary(snapshotFileName, JSON.stringify(content));
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const content = await readAndParse<[string, string[]][]>(storage, snapshotFileName);
		for (const [taskId, clientIdQueue] of content) {
			this.taskQueues.set(taskId, clientIdQueue);
		}
		this.scrubClientsNotInQuorum();
	}

	/***/
	protected initializeLocalCore(): void {}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.onDisconnect}
	 */
	protected onDisconnect(): void {
		this.connectionWatcher.emit("disconnect");
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.onConnect}
	 */
	protected onConnect(): void {
		this.connectionWatcher.emit("connect");
	}

	//
	/**
	 * Override resubmit core to avoid resubmission on reconnect.  On disconnect we accept our removal from the
	 * queues, and leave it up to the user to decide whether they want to attempt to re-enter a queue on reconnect.
	 */
	protected reSubmitCore(): void {}

	/**
	 * Process a task manager operation
	 *
	 * @param message - the message to prepare
	 * @param local - whether the message was sent by the local client
	 * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
	 * For messages from a remote client, this will be undefined.
	 */
	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
		if (message.type === MessageType.Operation) {
			const op = message.contents as ITaskManagerOperation;
			const messageId = localOpMetadata as number;

			switch (op.type) {
				case "volunteer": {
					this.opWatcher.emit("volunteer", op.taskId, message.clientId, local, messageId);
					break;
				}

				case "abandon": {
					this.opWatcher.emit("abandon", op.taskId, message.clientId, local, messageId);
					break;
				}

				case "complete": {
					this.opWatcher.emit("complete", op.taskId, message.clientId, local, messageId);
					break;
				}

				default: {
					throw new Error("Unknown operation");
				}
			}
		}
	}

	private addClientToQueue(taskId: string, clientId: string): void {
		// Ensure that the clientId exists in the quorum, or it is placeholderClientId (detached scenario)
		if (
			this.runtime.getQuorum().getMembers().has(clientId) ||
			this.clientId === placeholderClientId
		) {
			// Create the queue if it doesn't exist, and push the client on the back.
			let clientQueue = this.taskQueues.get(taskId);
			if (clientQueue === undefined) {
				clientQueue = [];
				this.taskQueues.set(taskId, clientQueue);
			}

			if (clientQueue.includes(clientId)) {
				// We shouldn't re-add the client if it's already in the queue.
				// This may be possible in scenarios where a client was added in
				// while detached.
				return;
			}

			const oldLockHolder = clientQueue[0];
			clientQueue.push(clientId);
			const newLockHolder = clientQueue[0];
			if (newLockHolder !== oldLockHolder) {
				this.queueWatcher.emit("queueChange", taskId, oldLockHolder, newLockHolder);
			}
		}
	}

	private removeClientFromQueue(taskId: string, clientId: string): void {
		const clientQueue = this.taskQueues.get(taskId);
		if (clientQueue === undefined) {
			return;
		}

		const oldLockHolder =
			clientId === placeholderClientId ? placeholderClientId : clientQueue[0];
		const clientIdIndex = clientQueue.indexOf(clientId);
		if (clientIdIndex !== -1) {
			clientQueue.splice(clientIdIndex, 1);
			// Clean up the queue if there are no more clients in it.
			if (clientQueue.length === 0) {
				this.taskQueues.delete(taskId);
			}
		}
		const newLockHolder = clientQueue[0];
		if (newLockHolder !== oldLockHolder) {
			this.queueWatcher.emit("queueChange", taskId, oldLockHolder, newLockHolder);
		}
	}

	private removeClientFromAllQueues(clientId: string): void {
		for (const taskId of this.taskQueues.keys()) {
			this.removeClientFromQueue(taskId, clientId);
		}
	}

	/**
	 * Will replace all instances of the placeholderClientId with the current clientId. This should only be called when
	 * transitioning from detached to attached and this.runtime.clientId is defined.
	 */
	private replacePlaceholderInAllQueues(): void {
		assert(
			this.runtime.clientId !== undefined,
			0x475 /* this.runtime.clientId should be defined */,
		);
		for (const clientQueue of this.taskQueues.values()) {
			const clientIdIndex = clientQueue.indexOf(placeholderClientId);
			if (clientIdIndex !== -1) {
				if (clientQueue.includes(this.runtime.clientId)) {
					// If the real clientId is already in the queue, just remove the placeholder.
					clientQueue.splice(clientIdIndex, 1);
				} else {
					clientQueue[clientIdIndex] = this.runtime.clientId;
				}
			}
		}
	}

	// This seems like it should be unnecessary if we can trust to receive the join/leave messages and
	// also have an accurate snapshot.
	private scrubClientsNotInQuorum(): void {
		const quorum = this.runtime.getQuorum();
		for (const [taskId, clientQueue] of this.taskQueues) {
			const filteredClientQueue = clientQueue.filter(
				(clientId) => quorum.getMember(clientId) !== undefined,
			);
			if (clientQueue.length !== filteredClientQueue.length) {
				if (filteredClientQueue.length === 0) {
					this.taskQueues.delete(taskId);
				} else {
					this.taskQueues.set(taskId, filteredClientQueue);
				}
				this.queueWatcher.emit("queueChange", taskId);
			}
		}
	}

	/**
	 * Checks whether this client is currently assigned or in queue to become assigned, while also accounting
	 * for the latest pending ops.
	 */
	private queuedOptimistically(taskId: string): boolean {
		if (this.isAttached() && !this.connected) {
			return false;
		}

		assert(this.clientId !== undefined, 0x07f /* "clientId undefined" */);

		const inQueue = this.taskQueues.get(taskId)?.includes(this.clientId) ?? false;
		const latestPendingOp = this.latestPendingOps.get(taskId);
		const isPendingVolunteer = latestPendingOp?.type === "volunteer";
		const isPendingAbandonOrComplete =
			latestPendingOp?.type === "abandon" || latestPendingOp?.type === "complete";
		// We return true if the client is either in queue already or the latest pending op for this task is a volunteer op.
		// But we should always return false if the latest pending op is an abandon or complete op.
		return (inQueue && !isPendingAbandonOrComplete) || isPendingVolunteer;
	}

	protected applyStashedOp(content: unknown): void {
		const taskOp: ITaskManagerOperation = content as ITaskManagerOperation;
		switch (taskOp.type) {
			case "abandon": {
				this.abandon(taskOp.taskId);
				break;
			}
			case "complete": {
				this.complete(taskOp.taskId);
				break;
			}
			case "volunteer": {
				this.subscribeToTask(taskOp.taskId);
				break;
			}
			default: {
				unreachableCase(taskOp);
			}
		}
	}
}
