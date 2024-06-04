/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "@fluid-internal/client-utils";
import { ReadOnlyInfo } from "@fluidframework/container-definitions/internal";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions/internal";
import {
	IFluidSerializer,
	SharedObject,
	createSingleBlobSummary,
} from "@fluidframework/shared-object-base/internal";

import { ITaskManager, ITaskManagerEvents } from "./interfaces.js";

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
 * @alpha
 */
export class TaskManagerClass extends SharedObject<ITaskManagerEvents> implements ITaskManager {
	/**
	 * Mapping of taskId to a queue of clientIds that are waiting on the task.  Maintains the consensus state of the
	 * queue, even if we know we've submitted an op that should eventually modify the queue.
	 */
	private readonly taskQueues: Map<string, string[]> = new Map();

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
	private readonly latestPendingOps: Map<string, IPendingOp> = new Map();

	/**
	 * Tracks tasks that are this client is currently subscribed to.
	 */
	private readonly subscribedTasks: Set<string> = new Set();

	/**
	 * Map to track tasks that have pending complete ops.
	 */
	private readonly pendingCompletedTasks: Map<string, number[]> = new Map();

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
	constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes) {
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

					// Remove complete op from this.pendingCompletedTasks
					const pendingIds = this.pendingCompletedTasks.get(taskId);
					assert(
						pendingIds !== undefined && pendingIds.length > 0,
						0x402 /* pendingIds is empty */,
					);
					const removed = pendingIds.shift();
					assert(
						removed === messageId,
						0x403 /* Removed complete op id does not match */,
					);
				}

				// For clients in queue, we need to remove them from the queue and raise the proper events.
				if (!local) {
					this.taskQueues.delete(taskId);
					this.completedWatcher.emit("completed", taskId);
					this.emit("completed", taskId);
				}
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

			// We don't modify the taskQueues on disconnect (they still reflect the latest known consensus state).
			// After reconnect these will get cleaned up by observing the clientLeaves.
			// However we do need to recognize that we lost the lock if we had it.  Calls to .queued() and
			// .assigned() are also connection-state-aware to be consistent.
			for (const [taskId, clientQueue] of this.taskQueues.entries()) {
				if (this.isAttached() && clientQueue[0] === this.clientId) {
					this.emit("lost", taskId);
				}
			}

			// All of our outstanding ops will be for the old clientId even if they get ack'd
			this.latestPendingOps.clear();
		});
	}

	private submitVolunteerOp(taskId: string) {
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

	private submitAbandonOp(taskId: string) {
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

	private submitCompleteOp(taskId: string) {
		const op: ITaskManagerCompletedOperation = {
			type: "complete",
			taskId,
		};
		const pendingOp: IPendingOp = {
			type: "complete",
			messageId: ++this.messageId,
		};

		if (this.pendingCompletedTasks.has(taskId)) {
			this.pendingCompletedTasks.get(taskId)?.push(pendingOp.messageId);
		} else {
			this.pendingCompletedTasks.set(taskId, [pendingOp.messageId]);
		}

		this.submitLocalMessage(op, pendingOp.messageId);
		this.latestPendingOps.set(taskId, pendingOp);
	}

	/**
	 * {@inheritDoc ITaskManager.volunteerForTask}
	 */
	public async volunteerForTask(taskId: string) {
		// If we have the lock, resolve immediately
		if (this.assigned(taskId)) {
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
			const checkIfAcquiredLock = (eventTaskId: string) => {
				if (eventTaskId !== taskId) {
					return;
				}

				// Also check pending ops here because it's possible we are currently in the queue from a previous
				// lock attempt, but have an outstanding abandon AND the outstanding volunteer for this lock attempt.
				// If we reach the head of the queue based on the previous lock attempt, we don't want to resolve.
				if (this.assigned(taskId) && !this.latestPendingOps.has(taskId)) {
					this.queueWatcher.off("queueChange", checkIfAcquiredLock);
					this.abandonWatcher.off("abandon", checkIfAbandoned);
					this.connectionWatcher.off("disconnect", rejectOnDisconnect);
					this.completedWatcher.off("completed", checkIfCompleted);
					resolve(true);
				}
			};

			const checkIfAbandoned = (eventTaskId: string) => {
				if (eventTaskId !== taskId) {
					return;
				}

				this.queueWatcher.off("queueChange", checkIfAcquiredLock);
				this.abandonWatcher.off("abandon", checkIfAbandoned);
				this.connectionWatcher.off("disconnect", rejectOnDisconnect);
				this.completedWatcher.off("completed", checkIfCompleted);
				reject(new Error("Abandoned before acquiring task assignment"));
			};

			const rejectOnDisconnect = () => {
				this.queueWatcher.off("queueChange", checkIfAcquiredLock);
				this.abandonWatcher.off("abandon", checkIfAbandoned);
				this.connectionWatcher.off("disconnect", rejectOnDisconnect);
				this.completedWatcher.off("completed", checkIfCompleted);
				reject(new Error("Disconnected before acquiring task assignment"));
			};

			const checkIfCompleted = (eventTaskId: string) => {
				if (eventTaskId !== taskId) {
					return;
				}

				this.queueWatcher.off("queueChange", checkIfAcquiredLock);
				this.abandonWatcher.off("abandon", checkIfAbandoned);
				this.connectionWatcher.off("disconnect", rejectOnDisconnect);
				this.completedWatcher.off("completed", checkIfCompleted);
				resolve(false);
			};

			this.queueWatcher.on("queueChange", checkIfAcquiredLock);
			this.abandonWatcher.on("abandon", checkIfAbandoned);
			this.connectionWatcher.on("disconnect", rejectOnDisconnect);
			this.completedWatcher.on("completed", checkIfCompleted);
		});

		if (!this.queued(taskId)) {
			this.submitVolunteerOp(taskId);
		}
		return lockAcquireP;
	}

	/**
	 * {@inheritDoc ITaskManager.subscribeToTask}
	 */
	public subscribeToTask(taskId: string) {
		if (this.subscribed(taskId)) {
			return;
		}

		if (this.readOnlyInfo.readonly === true && this.readOnlyInfo.permissions === true) {
			throw new Error("Attempted to subscribe with read-only permissions");
		}

		const submitVolunteerOp = () => {
			this.submitVolunteerOp(taskId);
		};

		const disconnectHandler = () => {
			// Wait to be connected again and then re-submit volunteer op
			this.connectionWatcher.once("connect", submitVolunteerOp);
		};

		const checkIfAbandoned = (eventTaskId: string) => {
			if (eventTaskId !== taskId) {
				return;
			}

			this.abandonWatcher.off("abandon", checkIfAbandoned);
			this.connectionWatcher.off("disconnect", disconnectHandler);
			this.connectionWatcher.off("connect", submitVolunteerOp);
			this.completedWatcher.off("completed", checkIfCompleted);

			this.subscribedTasks.delete(taskId);
		};

		const checkIfCompleted = (eventTaskId: string) => {
			if (eventTaskId !== taskId) {
				return;
			}

			this.abandonWatcher.off("abandon", checkIfAbandoned);
			this.connectionWatcher.off("disconnect", disconnectHandler);
			this.connectionWatcher.off("connect", submitVolunteerOp);
			this.completedWatcher.off("completed", checkIfCompleted);

			this.subscribedTasks.delete(taskId);
		};

		this.abandonWatcher.on("abandon", checkIfAbandoned);
		this.connectionWatcher.on("disconnect", disconnectHandler);
		this.completedWatcher.on("completed", checkIfCompleted);

		if (!this.isAttached()) {
			// Simulate auto-ack in detached scenario
			assert(this.clientId !== undefined, 0x473 /* clientId should not be undefined */);
			this.addClientToQueue(taskId, this.clientId);
			// Because we volunteered with placeholderClientId, we need to wait for when we attach and are assigned
			// a real clientId. At that point we should re-enter the queue with a real volunteer op (assuming we are
			// connected).
			this.runtime.once("attached", () => {
				if (this.queued(taskId)) {
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
		} else if (!this.assigned(taskId) && !this.queued(taskId)) {
			submitVolunteerOp();
		}
		this.subscribedTasks.add(taskId);
	}

	/**
	 * {@inheritDoc ITaskManager.abandon}
	 */
	public abandon(taskId: string) {
		// Always allow abandon if the client is subscribed to allow clients to unsubscribe while disconnected.
		// Otherwise, we should check to make sure the client is both connected queued for the task before sending an
		// abandon op.
		if (!this.subscribed(taskId) && !this.queued(taskId)) {
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

		// If we're subscribed but not queued, we don't need to submit an abandon op (probably offline)
		if (this.queued(taskId)) {
			this.submitAbandonOp(taskId);
		}
		this.abandonWatcher.emit("abandon", taskId);
	}

	/**
	 * {@inheritDoc ITaskManager.assigned}
	 */
	public assigned(taskId: string) {
		if (this.isAttached() && !this.connected) {
			return false;
		}

		const currentAssignee = this.taskQueues.get(taskId)?.[0];
		return (
			currentAssignee !== undefined &&
			currentAssignee === this.clientId &&
			!this.latestPendingOps.has(taskId)
		);
	}

	/**
	 * {@inheritDoc ITaskManager.queued}
	 */
	public queued(taskId: string) {
		if (this.isAttached() && !this.connected) {
			return false;
		}

		assert(this.clientId !== undefined, 0x07f /* "clientId undefined" */);

		const clientQueue = this.taskQueues.get(taskId);
		// If we have no queue for the taskId, then no one has signed up for it.
		return (
			((clientQueue?.includes(this.clientId) ?? false) &&
				!this.latestPendingOps.has(taskId)) ||
			this.latestPendingOps.get(taskId)?.type === "volunteer"
		);
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
		if (this.isAttached()) {
			if (!this.connected) {
				throw new Error("Attempted to complete task in disconnected state");
			}
			this.submitCompleteOp(taskId);
		}

		this.taskQueues.delete(taskId);
		this.completedWatcher.emit("completed", taskId);
		this.emit("completed", taskId);
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
		if (this.runtime.clientId !== undefined) {
			// If the runtime has been assigned an actual clientId by now, we can replace the placeholder clientIds
			// and maintain the task assignment.
			this.replacePlaceholderInAllQueues();
		} else {
			// If the runtime has still not been assigned a clientId, we should not summarize with the placeholder
			// clientIds and instead remove them from the queues and require the client to re-volunteer when assigned
			// a new clientId.
			this.removeClientFromAllQueues(placeholderClientId);
		}

		// Only include tasks if there are clients in the queue.
		const filteredMap = new Map<string, string[]>();
		this.taskQueues.forEach((queue: string[], taskId: string) => {
			if (queue.length > 0) {
				filteredMap.set(taskId, queue);
			}
		});
		const content = [...filteredMap.entries()];
		return createSingleBlobSummary(snapshotFileName, JSON.stringify(content));
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const content = await readAndParse<[string, string[]][]>(storage, snapshotFileName);
		content.forEach(([taskId, clientIdQueue]) => {
			this.taskQueues.set(taskId, clientIdQueue);
		});
		this.scrubClientsNotInQuorum();
	}

	/***/
	protected initializeLocalCore() {}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.onDisconnect}
	 */
	protected onDisconnect() {
		this.connectionWatcher.emit("disconnect");
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.onConnect}
	 */
	protected onConnect() {
		this.connectionWatcher.emit("connect");
	}

	//
	/**
	 * Override resubmit core to avoid resubmission on reconnect.  On disconnect we accept our removal from the
	 * queues, and leave it up to the user to decide whether they want to attempt to re-enter a queue on reconnect.
	 */
	protected reSubmitCore() {}

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
	) {
		if (message.type === MessageType.Operation) {
			const op = message.contents as ITaskManagerOperation;
			const messageId = localOpMetadata as number;

			switch (op.type) {
				case "volunteer":
					this.opWatcher.emit("volunteer", op.taskId, message.clientId, local, messageId);
					break;

				case "abandon":
					this.opWatcher.emit("abandon", op.taskId, message.clientId, local, messageId);
					break;

				case "complete":
					this.opWatcher.emit("complete", op.taskId, message.clientId, local, messageId);
					break;

				default:
					throw new Error("Unknown operation");
			}
		}
	}

	private addClientToQueue(taskId: string, clientId: string) {
		const pendingIds = this.pendingCompletedTasks.get(taskId);
		if (pendingIds !== undefined && pendingIds.length > 0) {
			// Ignore the volunteer op if we know this task is about to be completed
			return;
		}

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

			const oldLockHolder = clientQueue[0];
			clientQueue.push(clientId);
			const newLockHolder = clientQueue[0];
			if (newLockHolder !== oldLockHolder) {
				this.queueWatcher.emit("queueChange", taskId, oldLockHolder, newLockHolder);
			}
		}
	}

	private removeClientFromQueue(taskId: string, clientId: string) {
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

	private removeClientFromAllQueues(clientId: string) {
		for (const taskId of this.taskQueues.keys()) {
			this.removeClientFromQueue(taskId, clientId);
		}
	}

	/**
	 * Will replace all instances of the placeholderClientId with the current clientId. This should only be called when
	 * transitioning from detached to attached and this.runtime.clientId is defined.
	 */
	private replacePlaceholderInAllQueues() {
		assert(
			this.runtime.clientId !== undefined,
			0x475 /* this.runtime.clientId should be defined */,
		);
		for (const clientQueue of this.taskQueues.values()) {
			const clientIdIndex = clientQueue.indexOf(placeholderClientId);
			if (clientIdIndex !== -1) {
				clientQueue[clientIdIndex] = this.runtime.clientId;
			}
		}
	}

	// This seems like it should be unnecessary if we can trust to receive the join/leave messages and
	// also have an accurate snapshot.
	private scrubClientsNotInQuorum() {
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

	protected applyStashedOp(content: any): void {
		const taskOp: ITaskManagerOperation = content;
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
			default:
				unreachableCase(taskOp);
		}
	}
}
