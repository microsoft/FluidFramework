/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IDeltaQueue,
	IContainer,
	type IHostLoader,
} from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-loader";
import {
	IContainerCreateProps,
	IContainerLoadProps,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/container-loader/internal/test/container";
import { assert } from "@fluidframework/core-utils/internal";
import {
	IDocumentMessage,
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { canBeCoalescedByService } from "@fluidframework/driver-utils/internal";

import { toIDeltaManagerFull, waitForContainerConnection } from "./containerUtils.js";
import { debug } from "./debug.js";
import { IOpProcessingController } from "./testObjectProvider.js";
import { timeoutAwait, timeoutPromise } from "./timeoutUtils.js";

const debugOp = debug.extend("ops");
const debugWait = debug.extend("wait");

interface ContainerRecord {
	// A short number for debug output
	index: number;

	// LoaderContainerTracker paused state
	paused: boolean;
	pauseP?: Promise<void>; // promise for for the pause that is in progress

	// Tracking trailing no-op that may or may be acked by the server so we can discount them
	// See issue #5629
	startTrailingNoOps: number;
	trailingNoOps: number;

	// Track last proposal to ensure no unresolved proposal
	lastProposal: number;
}

/**
 * @legacy
 * @alpha
 */
export class LoaderContainerTracker implements IOpProcessingController {
	private readonly containers = new Map<IContainer, ContainerRecord>();
	private lastProposalSeqNum: number = 0;

	constructor(private readonly syncSummarizerClients: boolean = false) {}

	/**
	 * Add a loader to start to track any container created from them
	 * @param loader - loader to start tracking any container created.
	 */
	public add<LoaderType extends IHostLoader>(loader: LoaderType) {
		// TODO: Expose Loader API to able to intercept container creation (See issue #5114)
		const patch = <T, C extends IContainer>(fn: (...args) => Promise<C>) => {
			const boundFn = fn.bind(loader);
			return async (...args: T[]) => {
				const container = await boundFn(...args);
				this.addContainer(container);
				return container;
			};
		};
		/* eslint-disable @typescript-eslint/unbound-method */
		loader.resolve = patch(loader.resolve);
		loader.createDetachedContainer = patch(loader.createDetachedContainer);
		loader.rehydrateDetachedContainerFromSnapshot = patch(
			loader.rehydrateDetachedContainerFromSnapshot,
		);
		/* eslint-enable @typescript-eslint/unbound-method */
	}

	/**
	 * Utility function to add container to be tracked.
	 *
	 * @param container - container to add
	 */
	public addContainer(container: IContainer) {
		// don't add container that is already tracked
		if (this.containers.has(container)) {
			return;
		}

		// Container has a `clone` method that can be used to create another container without going through
		// the Loader. Such containers won't be added by the `add` method so do it here. For example, summarizer
		// containers are created via the `clone` method.
		// Created a type with clone (which is not on IContainer and is readonly) rather than typing to any.
		type ContainerWithClone = IContainer & {
			clone: (
				loadProps: IContainerLoadProps,
				createParamOverrides: Partial<IContainerCreateProps>,
			) => Promise<IContainer>;
		};
		const containerWithClone = container as ContainerWithClone;

		// back-compat: Check for undefined because this function was added recently and older containers won't have it.
		if (containerWithClone.clone !== undefined) {
			const patch = <T, C extends IContainer>(fn: (...args) => Promise<C>) => {
				const boundFn = fn.bind(containerWithClone);
				return async (...args: T[]) => {
					const newContainer = await boundFn(...args);
					this.addContainer(newContainer);
					return newContainer;
				};
			};
			containerWithClone.clone = patch(containerWithClone.clone);
		}

		// ignore summarizer
		if (
			!container.deltaManager.clientDetails.capabilities.interactive &&
			!this.syncSummarizerClients
		) {
			return;
		}

		const record = {
			index: this.containers.size,
			paused: false,
			startTrailingNoOps: 0,
			trailingNoOps: 0,
			lastProposal: 0,
		};
		this.containers.set(container, record);
		this.trackTrailingNoOps(container, record);
		this.trackLastProposal(container);
		this.setupTrace(container, record.index);
	}

	/**
	 * Keep track of the trailing NoOp that was sent so we can discount them in the clientSequenceNumber tracking.
	 * The server might coalesce them with other ops, or a single NoOp, or delay it if it don't think it is necessary.
	 *
	 * @param container - the container to track
	 * @param record - the record to update the trailing op information
	 */
	private trackTrailingNoOps(container: IContainer, record: ContainerRecord) {
		const deltaManagerFull = toIDeltaManagerFull(container.deltaManager);
		deltaManagerFull.outbound.on("op", (messages) => {
			for (const msg of messages) {
				if (canBeCoalescedByService(msg)) {
					// Track the NoOp that was sent.
					if (record.trailingNoOps === 0) {
						// record the starting sequence number of the trailing no ops if we haven't been tracking yet.
						record.startTrailingNoOps = msg.clientSequenceNumber;
					}
					record.trailingNoOps++;
				} else {
					// Other ops has been sent. We would like to see those ack'ed, so no more need to track NoOps
					record.trailingNoOps = 0;
				}
			}
		});

		deltaManagerFull.inbound.on("push", (message) => {
			// Received the no op back, update the record if we are tracking
			if (
				canBeCoalescedByService(message) &&
				message.clientId === container.clientId &&
				record.trailingNoOps !== 0 &&
				record.startTrailingNoOps <= message.clientSequenceNumber
			) {
				// NoOp might have coalesced and skipped ahead some sequence number
				// update the record and skip ahead as well
				const oldStartTrailingNoOps = record.startTrailingNoOps;
				record.startTrailingNoOps = message.clientSequenceNumber + 1;
				record.trailingNoOps -= record.startTrailingNoOps - oldStartTrailingNoOps;
			}
		});

		container.on("disconnected", () => {
			// reset on disconnect.
			record.trailingNoOps = 0;
		});
	}

	private trackLastProposal(container: IContainer) {
		container.on("codeDetailsProposed", (value, proposal) => {
			if (proposal.sequenceNumber > this.lastProposalSeqNum) {
				this.lastProposalSeqNum = proposal.sequenceNumber;
			}
		});
	}

	/**
	 * Reset the tracker, closing all containers and stop tracking them.
	 */
	public reset() {
		this.lastProposalSeqNum = 0;
		for (const container of this.containers.keys()) {
			container.close();
		}
		this.containers.clear();

		// REVIEW: do we need to unpatch the loaders?
	}

	/**
	 * Make sure all the tracked containers are synchronized.
	 *
	 * No isDirty (non-readonly) containers
	 * No extra clientId in quorum of any container that is not tracked and still opened.
	 * - i.e. no pending Join/Leave message.
	 * No unresolved proposal (minSeqNum \>= lastProposalSeqNum)
	 * lastSequenceNumber of all container is the same
	 * clientSequenceNumberObserved is the same as clientSequenceNumber sent
	 * - this overlaps with !isDirty, but include task scheduler ops.
	 * - Trailing NoOp is tracked and don't count as pending ops.
	 *
	 * Containers that are already pause will resume process and paused again once
	 * everything is synchronized.  Containers that aren't paused will remain unpaused when this
	 * function returns.
	 */
	public async ensureSynchronized(...containers: IContainer[]): Promise<void> {
		const resumed = this.resumeProcessing(...containers);

		let waitingSequenceNumberSynchronized: string | undefined;
		// eslint-disable-next-line no-constant-condition
		while (true) {
			// yield a turn to allow side effect of resuming or the ops we just processed execute before we check
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 0);
			});

			const containersToApply = this.getContainers(containers);
			if (containersToApply.length === 0) {
				break;
			}

			// Ignore readonly dirty containers, because it can't sent ops and nothing can be done about it being dirty
			const dirtyContainers = containersToApply.filter((c) => {
				const { deltaManager, isDirty } = c;
				return deltaManager.readOnlyInfo.readonly !== true && isDirty;
			});
			if (dirtyContainers.length === 0) {
				// Wait for all the leave messages
				const pendingClients = this.getPendingClients(containersToApply);
				if (pendingClients.length === 0) {
					const needSync = this.needSequenceNumberSynchronize(containersToApply);
					if (needSync === undefined) {
						// done, we are in sync
						break;
					}
					if (waitingSequenceNumberSynchronized !== needSync.reason) {
						// Don't repeat writing to console if it is the same reason
						waitingSequenceNumberSynchronized = needSync.reason;
						debugWait(needSync.message);
					}
					// Wait for one inbounds ops which might change the state of things
					await timeoutAwait(this.waitForAnyInboundOps(containersToApply), {
						errorMsg: `Timeout on ${needSync.message}`,
					});
				} else {
					waitingSequenceNumberSynchronized = undefined;
					await timeoutAwait(this.waitForPendingClients(pendingClients), {
						errorMsg: "Timeout on waiting for pending join or leave op",
					});
				}
			} else {
				// Wait for all the containers to be saved
				debugWait(
					`Waiting container to be saved ${this.containerIndexStrings(dirtyContainers)}`,
				);
				waitingSequenceNumberSynchronized = undefined;
				await Promise.all(
					dirtyContainers.map(async (c) =>
						Promise.race([
							timeoutPromise((resolve) => c.once("saved", () => resolve()), {
								errorMsg: "Timeout on waiting a container to be saved",
							}),
							new Promise((resolve) => c.once("closed", resolve)),
						]),
					),
				);
			}
		}

		// Pause all container that was resumed
		// don't call pause if resumed is empty and pause everything, which is not what we want
		if (resumed.length !== 0) {
			await timeoutAwait(this.pauseProcessing(...resumed), {
				errorMsg: "Timeout on waiting for pausing all resumed containers",
			});
		}

		debugWait("Synchronized");
	}

	/**
	 * Utility to calculate the set of clientId per container in quorum that is NOT associated with
	 * any container we tracked, indicating there is a pending join or leave op that we need to wait.
	 *
	 * @param containersToApply - the set of containers to check
	 */
	private getPendingClients(containersToApply: IContainer[]) {
		// All the clientId we track should be a superset of the quorum, otherwise, we are missing
		// leave messages
		const openedDocuments = Array.from(this.containers.keys()).filter((c) => !c.closed);
		const openedClientId = openedDocuments.map((container) => container.clientId);

		const pendingClients: [IContainer, Set<string>][] = [];
		containersToApply.forEach((container) => {
			const pendingClientId = new Set<string>();
			const quorum = container.getQuorum();
			quorum.getMembers().forEach((client, clientId) => {
				// ignore summarizer
				if (!client.client.details.capabilities.interactive && !this.syncSummarizerClients) {
					return;
				}
				if (!openedClientId.includes(clientId)) {
					pendingClientId.add(clientId);
				}
			});

			if (pendingClientId.size !== 0) {
				pendingClients.push([container, pendingClientId]);
			}
		});
		return pendingClients;
	}

	/**
	 * Utility to check synchronization based on sequence number
	 * See ensureSynchronized for more detail
	 *
	 * @param containersToApply - the set of containers to check
	 */
	private needSequenceNumberSynchronize(containersToApply: IContainer[]) {
		// If there is a pending proposal, wait for it to be accepted
		const firstContainerToApply = containersToApply[0];
		if (firstContainerToApply === undefined) {
			throw new Error("There should always be at least one container to apply");
		}

		const minSeqNum = firstContainerToApply.deltaManager.minimumSequenceNumber;
		if (minSeqNum < this.lastProposalSeqNum) {
			return {
				reason: "Proposal",
				message: `waiting for MSN to advance to proposal at sequence number ${this.lastProposalSeqNum}`,
			};
		}

		// clientSequenceNumber check detects ops in flight, both on the wire and in the outbound queue
		// We need both client sequence number and isDirty check because:
		// - Currently isDirty flag ignores ops for task scheduler, so we need the client sequence number check
		// - But isDirty flags include ops during forceReadonly and disconnected, because we don't submit
		//   the ops in the first place, clientSequenceNumber is not assigned

		const containerWithInflightOps = containersToApply.filter((container) => {
			if (container.deltaManager.readOnlyInfo.readonly === true) {
				// Ignore readonly container. the clientSeqNum and clientSeqNumObserved might be out of sync
				// because we transition to readonly when outbound is not empty or the in transit op got lost
				return false;
			}
			// Note that in read only mode, the op won't be submitted
			let deltaManager = container.deltaManager as any;
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const { trailingNoOps } = this.containers.get(container)!;
			// Back-compat: lastSubmittedClientId/clientSequenceNumber/clientSequenceNumberObserved moved to ConnectionManager in 0.53
			if (!("clientSequenceNumber" in deltaManager)) {
				deltaManager = deltaManager.connectionManager;
			}
			assert("clientSequenceNumber" in deltaManager, "no clientSequenceNumber");
			assert("clientSequenceNumberObserved" in deltaManager, "no clientSequenceNumber");
			// If last submittedClientId isn't the current clientId, then we haven't send any ops
			return (
				deltaManager.lastSubmittedClientId === container.clientId &&
				deltaManager.clientSequenceNumber !==
					(deltaManager.clientSequenceNumberObserved as number) + trailingNoOps
			);
		});

		if (containerWithInflightOps.length !== 0) {
			return {
				reason: "InflightOps",
				message: `waiting for containers with inflight ops: ${this.containerIndexStrings(
					containerWithInflightOps,
				)}`,
			};
		}

		// Check to see if all the container has process the same number of ops.
		const maxSeqNum = Math.max(
			...containersToApply.map((c) => c.deltaManager.lastSequenceNumber),
		);
		const containerWithPendingIncoming = containersToApply.filter(
			(c) => c.deltaManager.lastSequenceNumber !== maxSeqNum,
		);
		if (containerWithPendingIncoming.length !== 0) {
			return {
				reason: "Pending",
				message: `waiting for containers with pending incoming ops up to sequence number ${maxSeqNum}: ${this.containerIndexStrings(
					containerWithPendingIncoming,
				)}`,
			};
		}
		return undefined;
	}

	private containerIndexStrings(containers: IContainer[]) {
		return containers.map(
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			(c) => this.containers.get(c)!.index,
		);
	}

	/**
	 * Utility to wait for any clientId in quorum that is NOT associated with any container we
	 * tracked, indicating there is a pending join or leave op that we need to wait.
	 *
	 * Note that this function doesn't account for container that got added after we started waiting
	 *
	 * @param containersToApply - the set of containers to wait for any inbound ops for
	 */
	private async waitForPendingClients(pendingClients: [IContainer, Set<string>][]) {
		const unconnectedClients = Array.from(this.containers.keys()).filter(
			(c) => !c.closed && c.connectionState !== ConnectionState.Connected,
		);
		return Promise.all(
			pendingClients.map(async ([container, pendingClientId]) => {
				return new Promise<void>((resolve) => {
					const cleanup = () => {
						unconnectedClients.forEach((c) => c.off("connected", handler));
						container.getQuorum().off("removeMember", handler);
					};
					const handler = (clientId: string) => {
						pendingClientId.delete(clientId);
						if (pendingClientId.size === 0) {
							cleanup();
							resolve();
						}
					};
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const index = this.containers.get(container)!.index;
					debugWait(
						`${index}: Waiting for pending clients ${Array.from(pendingClientId.keys())}`,
					);
					unconnectedClients.forEach((c) => c.on("connected", handler));
					container.getQuorum().on("removeMember", handler);
					container.on("closed", () => {
						cleanup();
						resolve();
					});
				});
			}),
		);
	}

	/**
	 * Utility to wait for any inbound ops from a set of containers
	 * @param containersToApply - the set of containers to wait for any inbound ops for
	 */
	private async waitForAnyInboundOps(containersToApply: IContainer[]) {
		return new Promise<void>((resolve) => {
			const handler = () => {
				containersToApply.map((c) => {
					toIDeltaManagerFull(c.deltaManager).inbound.off("push", handler);
				});
				resolve();
			};
			containersToApply.map((c) => {
				toIDeltaManagerFull(c.deltaManager).inbound.on("push", handler);
			});
		});
	}

	/**
	 * Resume all queue activities on all paused tracked containers and return them
	 */
	public resumeProcessing(...containers: IContainer[]) {
		const resumed: IContainer[] = [];
		const containersToApply = this.getContainers(containers);
		for (const container of containersToApply) {
			const record = this.containers.get(container);
			assert(
				record?.pauseP === undefined,
				"Cannot resume container while pausing is in progress",
			);
			if (record?.paused === true) {
				debugWait(`${record.index}: container resumed`);
				const deltaManagerFull = toIDeltaManagerFull(container.deltaManager);
				deltaManagerFull.inbound.resume();
				deltaManagerFull.outbound.resume();
				resumed.push(container);
				record.paused = false;
			}
		}
		return resumed;
	}

	/**
	 * Pause all queue activities on the containers given, or all tracked containers
	 * Any containers given that is not tracked will be ignored.
	 *
	 * When a container is paused, it is assumed that we want fine grain control over op
	 * sequencing.  This function will prepare the container and force it into write mode to
	 * avoid missing join messages or change the sequence of event when switching from read to
	 * write mode.
	 */
	public async pauseProcessing(...containers: IContainer[]) {
		const waitP: Promise<void>[] = [];
		const containersToApply = this.getContainers(containers);
		for (const container of containersToApply) {
			const record = this.containers.get(container);
			if (record !== undefined && !record.paused) {
				if (record.pauseP === undefined) {
					record.pauseP = this.pauseContainer(container, record);
				}
				waitP.push(record.pauseP);
			}
		}
		await Promise.all(waitP);
	}

	/**
	 * When a container is paused, it is assumed that we want fine grain control over op
	 * sequencing.  This function will prepare the container and force it into write mode to
	 * avoid missing join messages or change the sequence of event when switching from read to
	 * write mode.
	 *
	 * @param container - the container to pause
	 * @param record - the record for the container
	 */
	private async pauseContainer(container: IContainer, record: ContainerRecord) {
		debugWait(`${record.index}: pausing container`);
		const deltaManagerFull = toIDeltaManagerFull(container.deltaManager);
		assert(!deltaManagerFull.outbound.paused, "Container should not be paused yet");
		assert(!deltaManagerFull.inbound.paused, "Container should not be paused yet");

		// Pause outbound
		debugWait(`${record.index}: pausing container outbound queues`);
		await deltaManagerFull.outbound.pause();

		// Ensure the container is connected first.
		if (container.connectionState !== ConnectionState.Connected) {
			debugWait(`${record.index}: Wait for container connection`);
			await waitForContainerConnection(container);
		}

		// Check if the container is in write mode
		if (!container.deltaManager.active) {
			let proposalP: Promise<boolean> | undefined;
			if (deltaManagerFull.outbound.idle) {
				// Need to generate an op to force write mode
				debugWait(`${record.index}: container force write connection`);
				const maybeContainer = container as Partial<IContainer>;
				const codeProposal = maybeContainer.getLoadedCodeDetails
					? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						container.getLoadedCodeDetails()!
					: (container as any).chaincodePackage;

				proposalP = container.proposeCodeDetails(codeProposal);
			}

			// Wait for nack
			debugWait(`${record.index}: Wait for container disconnect`);
			deltaManagerFull.outbound.resume();
			await new Promise<void>((resolve) => container.once("disconnected", resolve));
			const accepted = proposalP ? await proposalP : false;
			assert(!accepted, "A proposal in read mode should be rejected");
			await deltaManagerFull.outbound.pause();

			// Ensure the container is reconnect.
			if (container.connectionState !== ConnectionState.Connected) {
				debugWait(`${record.index}: Wait for container reconnection`);
				await waitForContainerConnection(container);
			}
		}

		debugWait(`${record.index}: pausing container inbound queues`);

		// Pause inbound
		await deltaManagerFull.inbound.pause();

		debugWait(`${record.index}: container paused`);

		record.pauseP = undefined;
		record.paused = true;
	}

	/**
	 * Pause all queue activities on all tracked containers, and resume only
	 * inbound to process ops until it is idle. All queues are left in the paused state
	 * after the function.
	 *
	 * Pausing will switch the container to write mode. See `pauseProcessing`
	 */
	public async processIncoming(...containers: IContainer[]) {
		return this.processQueue(
			containers,
			(container) => toIDeltaManagerFull(container.deltaManager).inbound,
		);
	}

	/**
	 * Pause all queue activities on all tracked containers, and resume only
	 * outbound to process ops until it is idle. All queues are left in the paused state
	 * after the function.
	 *
	 * Pausing will switch the container to write mode. See `pauseProcessing`
	 */
	public async processOutgoing(...containers: IContainer[]) {
		return this.processQueue(
			containers,
			(container) => toIDeltaManagerFull(container.deltaManager).outbound,
		);
	}

	/**
	 * Implementation of processIncoming and processOutgoing
	 */
	private async processQueue<U>(
		containers: IContainer[],
		getQueue: (container: IContainer) => IDeltaQueue<U>,
	) {
		await this.pauseProcessing(...containers);
		const resumed: IDeltaQueue<U>[] = [];

		const containersToApply = this.getContainers(containers);

		const inflightTracker = new Map<IContainer, number>();
		const cleanup: (() => void)[] = [];
		for (const container of containersToApply) {
			assert(
				container.deltaManager.active,
				"Container should be connected in write mode already",
			);

			const queue = getQueue(container);

			// track the outgoing ops (if any) to make sure they make the round trip to at least to the same client
			// to make sure they are sequenced.
			cleanup.push(this.setupInOutTracker(container, inflightTracker));
			queue.resume();
			resumed.push(queue);
		}

		while (resumed.some((queue) => !queue.idle)) {
			debugWait("Wait until queue is idle");
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 0);
			});
		}

		// Make sure all the op that we sent out are acked first
		// This is no op if we are processing incoming
		if (inflightTracker.size) {
			debugWait("Wait for inflight ops");
			do {
				await this.waitForAnyInboundOps(containersToApply);
			} while (inflightTracker.size);
		}

		// remove the handlers
		cleanup.forEach((clean) => clean());

		await Promise.all(resumed.map(async (queue) => queue.pause()));
	}

	/**
	 * Utility to set up listener to track the outbound ops until it round trip back
	 * Returns a function to remove the handler after it is done.
	 *
	 * @param container - the container to setup
	 * @param inflightTracker - a map to track the clientSequenceNumber per container it expect to get ops back
	 */
	private setupInOutTracker(container: IContainer, inflightTracker: Map<IContainer, number>) {
		const outHandler = (messages: IDocumentMessage[]) => {
			for (const message of messages) {
				if (!canBeCoalescedByService(message)) {
					inflightTracker.set(container, message.clientSequenceNumber);
				}
			}
		};
		const inHandler = (message: ISequencedDocumentMessage) => {
			if (
				!canBeCoalescedByService(message) &&
				message.clientId === container.clientId &&
				inflightTracker.get(container) === message.clientSequenceNumber
			) {
				inflightTracker.delete(container);
			}
		};

		const deltaManagerFull = toIDeltaManagerFull(container.deltaManager);
		deltaManagerFull.outbound.on("op", outHandler);
		deltaManagerFull.inbound.on("push", inHandler);

		return () => {
			deltaManagerFull.outbound.off("op", outHandler);
			deltaManagerFull.inbound.off("push", inHandler);
		};
	}

	/**
	 * Setup debug traces for connection and ops
	 */
	private setupTrace(container: IContainer, index: number) {
		if (debugOp.enabled) {
			const getContentsString = (type: string, msgContents: any) => {
				try {
					if (type !== MessageType.Operation) {
						if (typeof msgContents === "string") {
							return msgContents;
						}
						return JSON.stringify(msgContents);
					}
					let address = "";

					// contents comes in the wire as JSON string ("push" event)
					// But already parsed when apply ("op" event)
					let contents =
						typeof msgContents === "string" ? JSON.parse(msgContents) : msgContents;
					while (contents !== undefined && contents !== null) {
						if (contents.contents?.address !== undefined) {
							address += `/${contents.contents.address}`;
							contents = contents.contents.contents;
						} else if (contents.content?.address !== undefined) {
							address += `/${contents.content.address}`;
							contents = contents.content.contents;
						} else {
							break;
						}
					}
					if (address) {
						return `${address} ${JSON.stringify(contents)}`;
					}
					return JSON.stringify(contents);
				} catch (e: any) {
					return `${e.message}: ${e.stack}`;
				}
			};
			debugOp(`${index}: ADD: clientId: ${container.clientId}`);
			const deltaManagerFull = toIDeltaManagerFull(container.deltaManager);
			deltaManagerFull.outbound.on("op", (messages) => {
				for (const msg of messages) {
					debugOp(
						`${index}: OUT:          ` +
							`cli: ${msg.clientSequenceNumber.toString().padStart(3)} ` +
							`rsq: ${msg.referenceSequenceNumber.toString().padStart(3)} ` +
							`${msg.type} ${getContentsString(msg.type, msg.contents)}`,
					);
				}
			});
			const getInboundHandler = (type: string) => {
				return (msg: ISequencedDocumentMessage) => {
					const clientSeq =
						msg.clientId === container.clientId
							? `cli: ${msg.clientSequenceNumber.toString().padStart(3)}`
							: "        ";
					debugOp(
						`${index}: ${type}: seq: ${msg.sequenceNumber.toString().padStart(3)} ` +
							`${clientSeq} min: ${msg.minimumSequenceNumber.toString().padStart(3)} ` +
							`${msg.type} ${getContentsString(msg.type, msg.contents)}`,
					);
				};
			};
			deltaManagerFull.inbound.on("push", getInboundHandler("IN "));
			deltaManagerFull.inbound.on("op", getInboundHandler("OP "));
			container.deltaManager.on("connect", (details) => {
				debugOp(`${index}: CON: clientId: ${details.clientId}`);
			});
			container.deltaManager.on("disconnect", (reason) => {
				debugOp(`${index}: DIS: ${reason}`);
			});
		}
	}

	/**
	 * Filter out the opened containers based on param.
	 * @param containers - The container to filter to.  If the array is empty, it means don't filter and return
	 * all open containers.
	 */
	private getContainers(containers: IContainer[]) {
		const containersToApply =
			containers.length === 0 ? Array.from(this.containers.keys()) : containers;
		return containersToApply.filter((container) => !container.closed);
	}
}
