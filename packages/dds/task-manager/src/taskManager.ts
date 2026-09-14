/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "@fluid-internal/client-utils";
import {
	AttachState,
	type ReadOnlyInfo,
} from "@fluidframework/container-definitions/internal";
import { DoublyLinkedList, type ListNode, assert } from "@fluidframework/core-utils/internal";
import type {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import type {
	ISummaryTreeWithStats,
	IRuntimeMessageCollection,
	IRuntimeMessagesContent,
	ISequencedMessageEnvelope,
} from "@fluidframework/runtime-definitions/internal";
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

function assertIsTaskManagerOperation(op: unknown): asserts op is ITaskManagerOperation {
	assert(
		typeof op === "object" &&
			op !== null &&
			"taskId" in op &&
			typeof op.taskId === "string" &&
			"type" in op &&
			(op.type === "volunteer" || op.type === "abandon" || op.type === "complete"),
		0xc3b /* Not a TaskManager operation */,
	);
}

/**
 * Encapsulates a {@link DoublyLinkedList} together with a side-index `Map<K, ListNode<V>>` so that
 * mutations to the list and the index cannot drift out of sync. The two structures were previously
 * stored independently on {@link TaskManagerClass} and had to be kept byte-symmetric at every
 * mutation site — an invariant only enforced by runtime asserts. By bundling them behind this
 * private wrapper the invariant becomes unrepresentable.
 *
 * The wrapper exposes just the operations the call sites in this file actually need; iteration of
 * nodes is delegated straight through to the inner list.
 *
 * @param keyOf - Extracts the index key from a value. Used by {@link IndexedList.shift} and
 * {@link IndexedList.pop} to keep the index consistent with the list when a node is removed by
 * position rather than by key.
 */
class IndexedList<K, V> implements Iterable<ListNode<V>> {
	private readonly list = new DoublyLinkedList<V>();
	private readonly index = new Map<K, ListNode<V>>();

	public constructor(private readonly keyOf: (value: V) => K) {}

	public get length(): number {
		return this.list.length;
	}

	public get first(): ListNode<V> | undefined {
		return this.list.first;
	}

	public get last(): ListNode<V> | undefined {
		return this.list.last;
	}

	public has(key: K): boolean {
		return this.index.has(key);
	}

	public getNode(key: K): ListNode<V> | undefined {
		return this.index.get(key);
	}

	/**
	 * Appends a value to the end of the list and indexes it under `key`.
	 * @returns The newly inserted node.
	 */
	public push(key: K, value: V): ListNode<V> {
		const { first } = this.list.push(value);
		this.index.set(key, first);
		return first;
	}

	/**
	 * Inserts `value` immediately after `after` and indexes it under `key`.
	 * @returns The newly inserted node.
	 */
	public insertAfter(after: ListNode<V>, key: K, value: V): ListNode<V> {
		const { first } = this.list.insertAfter(after, value);
		this.index.set(key, first);
		return first;
	}

	/**
	 * Removes the entry at the given key from both the list and the index.
	 * @returns True if an entry was removed; false if the key was not present.
	 */
	public deleteByKey(key: K): boolean {
		const node = this.index.get(key);
		if (node === undefined) {
			return false;
		}
		this.list.remove(node);
		this.index.delete(key);
		return true;
	}

	/**
	 * Removes the given node from both the list and the index. Caller must have obtained `node`
	 * from this list (e.g. via iteration or {@link IndexedList.getNode}).
	 */
	public removeNode(node: ListNode<V>): void {
		this.list.remove(node);
		this.index.delete(this.keyOf(node.data));
	}

	/**
	 * Removes and returns the first node, also removing its index entry.
	 */
	public shift(): ListNode<V> | undefined {
		const node = this.list.shift();
		if (node !== undefined) {
			this.index.delete(this.keyOf(node.data));
		}
		return node;
	}

	/**
	 * Removes and returns the last node, also removing its index entry.
	 */
	public pop(): ListNode<V> | undefined {
		const node = this.list.pop();
		if (node !== undefined) {
			this.index.delete(this.keyOf(node.data));
		}
		return node;
	}

	/**
	 * Iterates the values' nodes in list order. Delegates straight through to the inner list.
	 */
	public [Symbol.iterator](): IterableIterator<ListNode<V>> {
		return this.list[Symbol.iterator]();
	}

	/**
	 * Maps each node to a new value, in list order. Delegates straight through to the inner list.
	 */
	public map<U>(callbackfn: (value: ListNode<V>) => U): Iterable<U> {
		return this.list.map(callbackfn);
	}
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
	 * Mapping of taskId to a queue of clientIds that are waiting on the task. Maintains the consensus state of the
	 * queue, even if we know we've submitted an op that should eventually modify the queue.
	 *
	 * The {@link IndexedList} wrapper bundles the queue with a clientId -\> ListNode index, enabling O(1) lookup
	 * and removal of a client without scanning the list while keeping the two structures inherently in sync.
	 */
	private readonly taskQueues = new Map<string, IndexedList<string, string>>();

	// opWatcher emits for every op on this data store.  This is just a repackaging of processMessagesCore into events.
	private readonly opWatcher: EventEmitter = new EventEmitter();
	// queueWatcher emits an event whenever the consensus state of the task queues changes
	private readonly queueWatcher: EventEmitter = new EventEmitter();
	// abandonWatcher emits an event whenever the local client calls abandon() on a task.
	private readonly abandonWatcher: EventEmitter = new EventEmitter();
	// connectionWatcher emits an event whenever we get connected or disconnected.
	private readonly connectionWatcher: EventEmitter = new EventEmitter();
	// completedWatcher emits an event whenever the local client receives a completed op.
	private readonly completedWatcher: EventEmitter = new EventEmitter();
	// rollbackWatcher emits an event whenever a pending op is rolled back.
	private readonly rollbackWatcher: EventEmitter = new EventEmitter();
	// attachedWatcher emits an event whenever the client becomes attached.
	private readonly attachedWatcher: EventEmitter = new EventEmitter();

	private nextPendingMessageId: number = 0;
	/**
	 * Tracks the most recent pending op for a given task. The {@link IndexedList} wrapper indexes the
	 * queue of pending ops by their messageId, which simplifies {@link TaskManagerClass.reSubmitCore}'s
	 * lookup of a specific pending op from O(n) `find` to O(1) `getNode`.
	 */
	private readonly latestPendingOps = new Map<string, IndexedList<number, IPendingOp>>();

	/**
	 * Tracks tasks that are this client is currently subscribed to.
	 */
	private readonly subscribedTasks = new Set<string>();

	/**
	 * Returns the clientId. Will return a placeholder if the runtime is detached and not yet assigned a clientId.
	 */
	private get clientId(): string {
		return this.runtime.clientId ?? placeholderClientId;
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
			(taskId: string, clientId: string, local: boolean, messageId: number | undefined) => {
				if (local) {
					const latestPendingOps = this.latestPendingOps.get(taskId);
					assert(latestPendingOps !== undefined, 0xc3c /* No pending ops for task */);
					const pendingOpNode = latestPendingOps.shift();
					assert(
						pendingOpNode !== undefined && pendingOpNode.data.messageId === messageId,
						0xc3d /* Unexpected op */,
					);
					assert(pendingOpNode.data.type === "volunteer", 0x07c /* "Unexpected op type" */);
					if (latestPendingOps.length === 0) {
						this.latestPendingOps.delete(taskId);
					}
				}

				this.addClientToQueue(taskId, clientId);
			},
		);

		this.opWatcher.on(
			"abandon",
			(taskId: string, clientId: string, local: boolean, messageId: number | undefined) => {
				if (local) {
					const latestPendingOps = this.latestPendingOps.get(taskId);
					assert(latestPendingOps !== undefined, 0xc3e /* No pending ops for task */);
					const pendingOpNode = latestPendingOps.shift();
					assert(
						pendingOpNode !== undefined && pendingOpNode.data.messageId === messageId,
						0xc3f /* Unexpected op */,
					);
					assert(pendingOpNode.data.type === "abandon", 0x07e /* "Unexpected op type" */);
					if (latestPendingOps.length === 0) {
						this.latestPendingOps.delete(taskId);
					}
					this.abandonWatcher.emit("abandon", taskId, messageId);
				}

				this.removeClientFromQueue(taskId, clientId);
			},
		);

		this.opWatcher.on(
			"complete",
			(taskId: string, clientId: string, local: boolean, messageId: number | undefined) => {
				if (local) {
					const latestPendingOps = this.latestPendingOps.get(taskId);
					assert(latestPendingOps !== undefined, 0xc40 /* No pending ops for task */);
					const pendingOpNode = latestPendingOps.shift();
					assert(
						pendingOpNode !== undefined && pendingOpNode.data.messageId === messageId,
						0xc41 /* Unexpected op */,
					);
					assert(pendingOpNode.data.type === "complete", 0x401 /* Unexpected op type */);
					if (latestPendingOps.length === 0) {
						this.latestPendingOps.delete(taskId);
					}
				}

				this.taskQueues.delete(taskId);
				this.completedWatcher.emit("completed", taskId, messageId);
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

				if (oldLockHolder !== this.clientId && newLockHolder === this.clientId) {
					this.emit("assigned", taskId);
				} else if (oldLockHolder === this.clientId && newLockHolder !== this.clientId) {
					this.emit("lost", taskId);
				}
			},
		);

		this.connectionWatcher.on("disconnect", () => {
			// Emit "lost" for any tasks we were assigned to.
			for (const [taskId, clientQueue] of this.taskQueues.entries()) {
				if (this.isAttached() && clientQueue.first?.data === this.clientId) {
					this.emit("lost", taskId);
				}
			}

			// Remove this client from all queues to reflect the new state, since being disconnected automatically removes
			// this client from all queues.
			this.removeClientFromAllQueues(this.clientId);
		});
	}

	private submitVolunteerOp(taskId: string): void {
		const op: ITaskManagerVolunteerOperation = {
			type: "volunteer",
			taskId,
		};
		const pendingOp: IPendingOp = {
			type: "volunteer",
			messageId: this.nextPendingMessageId++,
		};
		this.submitLocalMessage(op, pendingOp.messageId);
		this.appendPendingOp(taskId, pendingOp);
	}

	private submitAbandonOp(taskId: string): void {
		const op: ITaskManagerAbandonOperation = {
			type: "abandon",
			taskId,
		};
		const pendingOp: IPendingOp = {
			type: "abandon",
			messageId: this.nextPendingMessageId++,
		};
		this.submitLocalMessage(op, pendingOp.messageId);
		this.appendPendingOp(taskId, pendingOp);
	}

	private submitCompleteOp(taskId: string): void {
		const op: ITaskManagerCompletedOperation = {
			type: "complete",
			taskId,
		};
		const pendingOp: IPendingOp = {
			type: "complete",
			messageId: this.nextPendingMessageId++,
		};

		this.submitLocalMessage(op, pendingOp.messageId);
		this.appendPendingOp(taskId, pendingOp);
	}

	private appendPendingOp(taskId: string, pendingOp: IPendingOp): void {
		let latestPendingOps = this.latestPendingOps.get(taskId);
		if (latestPendingOps === undefined) {
			latestPendingOps = new IndexedList<number, IPendingOp>((op) => op.messageId);
			this.latestPendingOps.set(taskId, latestPendingOps);
		}
		latestPendingOps.push(pendingOp.messageId, pendingOp);
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

		if (this.isDetached()) {
			// Simulate auto-ack in detached scenario
			this.addClientToQueue(taskId, this.clientId);
			return true;
		}

		if (!this.connected) {
			throw new Error("Attempted to volunteer in disconnected state");
		}

		// This promise works even if we already have an outstanding volunteer op.
		const lockAcquireP = new Promise<boolean>((resolve, reject) => {
			// If we don't send an op (meaning the latest pending op is "volunteer"), nextPendingMessageId
			// will be greater than that prior "volunteer" op's messageId.  This is OK because
			// we only use it to filter stale abandon/complete, and not when determining if we
			// acquired the lock.
			const nextPendingMessageId = this.nextPendingMessageId;
			const setupListeners = (): void => {
				this.queueWatcher.on("queueChange", checkIfAcquiredLock);
				this.abandonWatcher.on("abandon", checkIfAbandoned);
				this.connectionWatcher.on("disconnect", rejectOnDisconnect);
				this.completedWatcher.on("completed", checkIfCompleted);
				this.rollbackWatcher.on("rollback", checkIfRolledBack);
			};
			const removeListeners = (): void => {
				this.queueWatcher.off("queueChange", checkIfAcquiredLock);
				this.abandonWatcher.off("abandon", checkIfAbandoned);
				this.connectionWatcher.off("disconnect", rejectOnDisconnect);
				this.completedWatcher.off("completed", checkIfCompleted);
				this.rollbackWatcher.off("rollback", checkIfRolledBack);
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

			const checkIfAbandoned = (eventTaskId: string, messageId: number | undefined): void => {
				if (eventTaskId !== taskId) {
					return;
				}
				if (messageId !== undefined && messageId <= nextPendingMessageId) {
					// Ignore abandon events that were for abandon ops that were sent prior to our current volunteer attempt.
					return;
				}
				removeListeners();
				reject(new Error("Abandoned before acquiring task assignment"));
			};

			const rejectOnDisconnect = (): void => {
				this.abandon(taskId);
				removeListeners();
				reject(new Error("Disconnected before acquiring task assignment"));
			};

			const checkIfCompleted = (eventTaskId: string, messageId: number | undefined): void => {
				if (eventTaskId !== taskId) {
					return;
				}
				if (messageId !== undefined && messageId <= nextPendingMessageId) {
					// Ignore abandon events that were for abandon ops that were sent prior to our current volunteer attempt.
					return;
				}
				removeListeners();
				resolve(false);
			};

			const checkIfRolledBack = (eventTaskId: string): void => {
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

		let volunteerOpMessageId: number | undefined;
		let abandoned = false;

		const submitVolunteerOp = (): void => {
			volunteerOpMessageId = this.nextPendingMessageId;
			this.submitVolunteerOp(taskId);
		};

		const setupListeners = (): void => {
			this.abandonWatcher.on("abandon", checkIfAbandoned);
			this.connectionWatcher.on("disconnect", disconnectHandler);
			this.completedWatcher.on("completed", checkIfCompleted);
			this.rollbackWatcher.on("rollback", checkIfRolledBack);
		};
		const removeListeners = (): void => {
			this.abandonWatcher.off("abandon", checkIfAbandoned);
			this.connectionWatcher.off("disconnect", disconnectHandler);
			this.completedWatcher.off("completed", checkIfCompleted);
			this.rollbackWatcher.off("rollback", checkIfRolledBack);
		};
		const disconnectHandler = (): void => {
			// If we are disconnected and have not already sent a volunteer op, then we should
			// submit another volunteer op while disconnected. This will allow the op to be
			// picked up by resubmitCore() and resubmitted when we reconnect.
			if (!this.queuedOptimistically(taskId)) {
				submitVolunteerOp();
			}
		};

		const checkIfAbandoned = (eventTaskId: string, messageId: number | undefined): void => {
			if (eventTaskId !== taskId) {
				return;
			}
			// abandonWatcher emits twice for a local abandon() call. When initially called it
			// will emit with undefined messageId. It will emit a second time when the op is
			// ack'd and processed, this time with the messageId for the ack.
			// This condition accounts ensures we don't ignore the initial abandon() emit and
			// only ignore emits associated with ack'd abandon ops that were sent prior to the
			// current volunteer attempt.
			if (
				messageId !== undefined &&
				volunteerOpMessageId !== undefined &&
				messageId <= volunteerOpMessageId
			) {
				// Ignore abandon events that were for abandon ops that were sent prior to our current volunteer attempt.
				return;
			}
			removeListeners();
			this.subscribedTasks.delete(taskId);
			abandoned = true;
		};

		const checkIfCompleted = (eventTaskId: string, messageId: number | undefined): void => {
			if (eventTaskId !== taskId) {
				return;
			}
			if (
				messageId !== undefined &&
				volunteerOpMessageId !== undefined &&
				messageId <= volunteerOpMessageId
			) {
				// Ignore abandon events that were for abandon ops that were sent prior to our current volunteer attempt.
				return;
			}
			removeListeners();
			this.subscribedTasks.delete(taskId);
			abandoned = true;
		};

		const checkIfRolledBack = (eventTaskId: string): void => {
			if (eventTaskId !== taskId) {
				return;
			}

			removeListeners();
			this.subscribedTasks.delete(taskId);
			abandoned = true;
		};

		setupListeners();

		if (this.isDetached()) {
			// Simulate auto-ack in detached scenario
			this.addClientToQueue(taskId, this.clientId);
			// Because we volunteered with placeholderClientId, we need to wait for when we attach and are assigned
			// a real clientId. At that point we should re-enter the queue with a real volunteer op (assuming we are
			// connected).
			this.attachedWatcher.once("attached", () => {
				// We call scrubClientsNotInQuorum() in case our clientId changed during the attach process.
				this.scrubClientsNotInQuorum();
				// Make sure abandon() was not called while we were detached.
				if (!abandoned) {
					submitVolunteerOp();
				}
			});
		} else if (!this.queuedOptimistically(taskId)) {
			// We don't need to send a second volunteer op if we just sent one.
			submitVolunteerOp();
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

		if (this.isDetached()) {
			// Simulate auto-ack in detached scenario
			this.removeClientFromQueue(taskId, this.clientId);
			this.abandonWatcher.emit("abandon", taskId);
			return;
		}

		this.submitAbandonOp(taskId);
		this.abandonWatcher.emit("abandon", taskId);
	}

	/**
	 * {@inheritDoc ITaskManager.assigned}
	 */
	public assigned(taskId: string): boolean {
		if (this.isAttached() && !this.connected) {
			return false;
		}

		const currentAssignee = this.taskQueues.get(taskId)?.first?.data;
		return currentAssignee !== undefined && currentAssignee === this.clientId;
	}

	/**
	 * {@inheritDoc ITaskManager.queued}
	 */
	public queued(taskId: string): boolean {
		if (this.isAttached() && !this.connected) {
			return false;
		}

		return this.taskQueues.get(taskId)?.has(this.clientId) ?? false;
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
		if (this.isDetached()) {
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
		if (this.clientId === placeholderClientId) {
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
		const content: [string, string[]][] = [];
		for (const [taskId, queue] of this.taskQueues) {
			if (queue.length > 0) {
				content.push([taskId, [...queue.map((node) => node.data)]]);
			}
		}
		return createSingleBlobSummary(snapshotFileName, JSON.stringify(content));
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const content = await readAndParse<[string, string[]][]>(storage, snapshotFileName);
		for (const [taskId, clientIdQueue] of content) {
			const list = new IndexedList<string, string>((clientId) => clientId);
			for (const clientId of clientIdQueue) {
				list.push(clientId, clientId);
			}
			this.taskQueues.set(taskId, list);
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

	/**
	 * Override resubmit core to avoid resubmission on reconnect.  On disconnect we accept our removal from the
	 * queues, and leave it up to the user to decide whether they want to attempt to re-enter a queue on reconnect.
	 * However, we do need to update latestPendingOps to account for the ops we will no longer be processing.
	 */
	protected reSubmitCore(content: unknown, localOpMetadata: number): void {
		assertIsTaskManagerOperation(content);
		const pendingOps = this.latestPendingOps.get(content.taskId);
		assert(pendingOps !== undefined, 0xc42 /* No pending ops for task on resubmit attempt */);
		const pendingOpNode = pendingOps.getNode(localOpMetadata);
		assert(
			pendingOpNode?.data.type === content.type,
			0xc43 /* Could not match pending op on resubmit attempt */,
		);
		pendingOps.removeNode(pendingOpNode);
		if (content.type === "volunteer" && pendingOps.last?.data.type !== "abandon") {
			this.submitVolunteerOp(content.taskId);
		}
		if (pendingOps.length === 0) {
			this.latestPendingOps.delete(content.taskId);
		}
	}

	protected override processMessagesCore(messagesCollection: IRuntimeMessageCollection): void {
		const { envelope, local, messagesContent } = messagesCollection;
		for (const messageContent of messagesContent) {
			this.processMessage(envelope, messageContent, local);
		}
	}

	private processMessage(
		messageEnvelope: ISequencedMessageEnvelope,
		messageContent: IRuntimeMessagesContent,
		local: boolean,
	): void {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
		if (messageEnvelope.type === MessageType.Operation) {
			const op = messageContent.contents as ITaskManagerOperation;
			const messageId = messageContent.localOpMetadata;

			switch (op.type) {
				case "volunteer": {
					this.opWatcher.emit(
						"volunteer",
						op.taskId,
						messageEnvelope.clientId,
						local,
						messageId,
					);
					break;
				}

				case "abandon": {
					this.opWatcher.emit(
						"abandon",
						op.taskId,
						messageEnvelope.clientId,
						local,
						messageId,
					);
					break;
				}

				case "complete": {
					this.opWatcher.emit(
						"complete",
						op.taskId,
						messageEnvelope.clientId,
						local,
						messageId,
					);
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
				clientQueue = new IndexedList<string, string>((cid) => cid);
				this.taskQueues.set(taskId, clientQueue);
			}

			if (clientQueue.has(clientId)) {
				// We shouldn't re-add the client if it's already in the queue.
				// This may be possible in scenarios where a client was added in
				// while detached.
				return;
			}

			const oldLockHolder = clientQueue.first?.data;
			clientQueue.push(clientId, clientId);
			const newLockHolder = clientQueue.first?.data;
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
			clientId === placeholderClientId ? placeholderClientId : clientQueue.first?.data;
		// Clean up the queue if the removal leaves it empty.
		if (clientQueue.deleteByKey(clientId) && clientQueue.length === 0) {
			this.taskQueues.delete(taskId);
		}
		const newLockHolder = clientQueue.first?.data;
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
		const realClientId = this.runtime.clientId;
		for (const clientQueue of this.taskQueues.values()) {
			const placeholderNode = clientQueue.getNode(placeholderClientId);
			if (placeholderNode !== undefined) {
				if (!clientQueue.has(realClientId)) {
					// Insert the real clientId at the placeholder's position before we remove the placeholder.
					clientQueue.insertAfter(placeholderNode, realClientId, realClientId);
				}
				// Remove the placeholder; if the real clientId was already present we just drop the placeholder.
				clientQueue.deleteByKey(placeholderClientId);
			}
		}
	}

	// This seems like it should be unnecessary if we can trust to receive the join/leave messages and
	// also have an accurate snapshot.
	private scrubClientsNotInQuorum(): void {
		const quorum = this.runtime.getQuorum();
		for (const [taskId, clientQueue] of this.taskQueues) {
			// Walk by collecting removable nodes first to avoid mutating during iteration.
			const toRemove: ListNode<string>[] = [];
			for (const node of clientQueue) {
				if (quorum.getMember(node.data) === undefined) {
					toRemove.push(node);
				}
			}
			if (toRemove.length === 0) {
				continue;
			}
			for (const node of toRemove) {
				clientQueue.removeNode(node);
			}
			if (clientQueue.length === 0) {
				this.taskQueues.delete(taskId);
			}
			this.queueWatcher.emit("queueChange", taskId);
		}
	}

	/**
	 * Checks whether this client is currently assigned or in queue to become assigned, while also accounting
	 * for the latest pending ops.
	 */
	private queuedOptimistically(taskId: string): boolean {
		const inQueue = this.taskQueues.get(taskId)?.has(this.clientId) ?? false;
		const latestPendingOps = this.latestPendingOps.get(taskId);

		const latestPendingOp = latestPendingOps?.last?.data;
		const isPendingVolunteer = latestPendingOp?.type === "volunteer";
		const isPendingAbandonOrComplete =
			latestPendingOp?.type === "abandon" || latestPendingOp?.type === "complete";
		// We return true if the client is either in queue already or the latest pending op for this task is a volunteer op.
		// But we should always return false if the latest pending op is an abandon or complete op.
		return (inQueue && !isPendingAbandonOrComplete) || isPendingVolunteer;
	}

	/**
	 * Returns true if the client is detached.
	 * This is distinct from !this.isAttached() because `isAttached()` also checks if `this._isBoundToContext`
	 * is true. We use `isDetached()` to determine if we should simulate auto-ack behavior for ops, which is
	 * mainly concerned with if we have been assigned a real clientId yet.
	 */
	private isDetached(): boolean {
		return this.runtime.attachState === AttachState.Detached;
	}

	protected applyStashedOp(content: unknown): void {
		// We don't apply any stashed ops since during the rehydration process. Since we lose any assigned tasks
		// during rehydration we cannot be assigned any tasks. Additionally, without the in-memory state of the
		// previous dds, we also cannot re-volunteer based on a previous subscribeToTask() call. Since we are
		// unable to be assigned to any tasks, there is no reason to process abandon/complete ops either.
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.rollback}
	 */
	protected rollback(content: unknown, localOpMetadata: unknown): void {
		assert(
			typeof localOpMetadata === "number",
			0xc45 /* Expect localOpMetadata to be a number */,
		);
		assertIsTaskManagerOperation(content);
		const latestPendingOps = this.latestPendingOps.get(content.taskId);
		assert(latestPendingOps !== undefined, 0xc46 /* No pending ops when trying to rollback */);
		const pendingOpToRollback = latestPendingOps.pop();
		assert(
			// eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- using ?. could change behavior
			pendingOpToRollback !== undefined &&
				pendingOpToRollback.data.messageId === localOpMetadata,
			0xc47 /* pending op mismatch */,
		);
		if (latestPendingOps.length === 0) {
			this.latestPendingOps.delete(content.taskId);
		}
		this.rollbackWatcher.emit("rollback", content.taskId);
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.didAttach}
	 */
	protected didAttach(): void {
		this.attachedWatcher.emit("attached");
	}
}
