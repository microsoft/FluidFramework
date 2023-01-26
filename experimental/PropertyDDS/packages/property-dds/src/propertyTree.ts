/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */
import isEmpty from "lodash/isEmpty";
import findIndex from "lodash/findIndex";
import range from "lodash/range";
import { copy as cloneDeep } from "fastest-json-copy";
import { Packr } from "msgpackr";

import { AttachState } from "@fluidframework/container-definitions";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelStorageService,
	IChannelFactory,
} from "@fluidframework/datastore-definitions";

import { bufferToString, stringToBuffer } from "@fluidframework/common-utils";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { IFluidSerializer, SharedObject } from "@fluidframework/shared-object-base";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils";

import {
	ChangeSet,
	Utils as ChangeSetUtils,
	rebaseToRemoteChanges,
} from "@fluid-experimental/property-changeset";

import { PropertyFactory, BaseProperty, NodeProperty } from "@fluid-experimental/property-properties";

import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { PropertyTreeFactory } from "./propertyTreeFactory";

export type SerializedChangeSet = any;

export type Metadata = any;

type FetchUnrebasedChangeFn = (guid: string) => IRemotePropertyTreeMessage;
type FetchRebasedChangesFn = (startGuid: string, endGuid?: string) => IPropertyTreeMessage[];

export const enum OpKind {
	// eslint-disable-next-line @typescript-eslint/no-shadow
	ChangeSet = 0,
}

export interface IPropertyTreeMessage {
	op: OpKind;
	changeSet: SerializedChangeSet;
	metadata: Metadata;
	guid: string;
	referenceGuid: string;
	remoteHeadGuid: string;
	localBranchStart: string | undefined;
	rebaseMetaInformation?: Map<any, any>;
	useMH?: boolean;
}

export interface IRemotePropertyTreeMessage extends IPropertyTreeMessage {
	sequenceNumber: number;
}
interface ISnapshot {
	branchGuid: string;
	summaryMinimumSequenceNumber: number;
	useMH: boolean;
	numChunks: number;
}
export interface ISnapshotSummary {
	remoteTipView?: SerializedChangeSet;
	remoteChanges?: IPropertyTreeMessage[];
	unrebasedRemoteChanges?: Record<string, IRemotePropertyTreeMessage>;
	remoteHeadGuid: string;
}

export interface SharedPropertyTreeOptions {
	paths?: string[];
	clientFiltering?: boolean;
	useMH?: boolean;
}

export interface ISharedPropertyTreeEncDec {
	messageEncoder: { encode: (IPropertyTreeMessage) => IPropertyTreeMessage;
		decode: (IPropertyTreeMessage) => IPropertyTreeMessage; };
	summaryEncoder: { encode: (ISnapshotSummary) => Buffer; decode: (Buffer) => ISnapshotSummary; };
}

export interface IPropertyTreeConfig {
	encDec: ISharedPropertyTreeEncDec;
}

const defaultEncDec: ISharedPropertyTreeEncDec = {
	messageEncoder: { encode: (msg: IPropertyTreeMessage) => msg,
		decode: (msg: IPropertyTreeMessage) => msg },
	summaryEncoder: {
		encode: (summary: ISnapshotSummary) => {
			const packr = new Packr();
			const serializedSummary = packr.pack(summary);
			return serializedSummary;
		},
		decode: (serializedSummary) => {
			const packr = new Packr();
			const snapshotSummary = packr.unpack(serializedSummary);
			return snapshotSummary as ISnapshotSummary;
		},
	},
};

/**
 * Silly DDS example that models a six sided die.
 *
 * Unlike the typical 'Dice Roller' example where clients clobber each other's last roll in a
 * SharedMap, this 'SharedDie' DDS works by advancing an internal PRNG each time it sees a 'roll'
 * operation.
 *
 * Because all clients are using the same PRNG starting in the same state, they arrive at
 * consensus by simply applying the same number of rolls.  (A fun addition would be logging
 * who received which roll, which would need to change as clients learn how races are resolved
 * in the total order)
 */
export class SharedPropertyTree extends SharedObject {
	tipView: SerializedChangeSet = {};
	remoteTipView: SerializedChangeSet = {};
	localChanges: IPropertyTreeMessage[] = [];
	remoteChanges: IPropertyTreeMessage[] = [];
	unrebasedRemoteChanges: Record<string, IRemotePropertyTreeMessage> = {};
	transmissionsHaveBeenStopped = false;
	enqueuedMessages: IPropertyTreeMessage[] = [];
	notificationDelayScope: number = 0;
	_root: any = PropertyFactory.create("NodeProperty");
	options: SharedPropertyTreeOptions;
	skipSequenceNumber: number = -1;
	headCommitGuid: string = "";
	useMH: boolean = false;
	propertyTreeConfig: IPropertyTreeConfig;

	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		options: SharedPropertyTreeOptions,
		propertyTreeConfig: IPropertyTreeConfig = { encDec: defaultEncDec },
	) {
		super(id, runtime, attributes, "fluid_propertyTree_");

		this.options = options;
		// Quick hack to let the root be aware of the DDS hosting it.
		this._root._tree = this;

		// By default, we currently don't use the MH
		this.useMH = options.useMH ?? false;
		this.propertyTreeConfig = propertyTreeConfig;
	}

	/**
	 * Create a new shared cell
	 *
	 * @param runtime - data store runtime the new shared map belongs to
	 * @param id - optional name of the shared map
	 * @returns newly create shared map (but not attached yet)
	 */
	public static create(runtime: IFluidDataStoreRuntime, id?: string, queryString?: string) {
		return runtime.createChannel(id, PropertyTreeFactory.Type) as SharedPropertyTree;
	}

	/**
	 * Get a factory for SharedDie to register with the data store.
	 *
	 * @returns a factory that creates and load SharedDie
	 */
	public static getFactory(): IChannelFactory {
		return new PropertyTreeFactory();
	}

	/**
	 * in case of partial checkout we want to send the paths we are interested in once we are connected
	 */
	protected onConnect() {
		// on connect we scope all deltas such that we only get relevant changes
		// since we know the paths already at constuction time this is okay
		this.scopeFutureDeltasToPaths(this.options.paths);
	}

	private scopeFutureDeltasToPaths(paths?: string[]) {
		const socket = (this.runtime.deltaManager as any).deltaManager.connectionManager.connection.socket;
		socket.emit("partial_checkout", { paths });
	}

	public _reportDirtinessToView() {
		// Check whether anybody is listening. If not, we don't want to pay the price
		// for the serialization of the data structure
		if (this.listenerCount("localModification") > 0) {
			const changes = this._root._serialize(true, false, BaseProperty.MODIFIED_STATE_FLAGS.DIRTY);
			this._root.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY);
			const _changeSet = new ChangeSet(changes);
			if (!isEmpty(_changeSet.getSerializedChangeSet())) {
				this.emit("localModification", _changeSet);
			}
		} else {
			this._root.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY);
		}
	}

	public get changeSet(): SerializedChangeSet {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return this.tipView;
	}

	public get activeCommit(): IPropertyTreeMessage {
		return this.localChanges.length > 0
			? this.localChanges[this.localChanges.length - 1]
			: this.remoteChanges[this.remoteChanges.length - 1];
	}
	public get root(): NodeProperty {
		return this._root as NodeProperty;
	}

	public commit(metadata?: Metadata, submitEmptyChange?: boolean) {
		const changes = this._root._serialize(true, false, BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);

		let doSubmit = !!submitEmptyChange;

		// if no override provided dont submit unless metadata are provided
		if (submitEmptyChange === undefined) {
			doSubmit = metadata !== undefined;
		}

		if (doSubmit || !isEmpty(changes)) {
			this.applyChangeSet(changes, metadata || {});
			this.root.cleanDirty();
		}
	}

	/**
	 * This method encodes the given message to the transfer form
	 * @param change - The message to be encoded.
 	 */
	private encodeMessage(change: IPropertyTreeMessage): IPropertyTreeMessage {
		return this.propertyTreeConfig.encDec.messageEncoder.encode(change);
	}

	/**
 	 * This method decodes message from the transfer form.
	 * @param transferChange - The message to be decoded.
	 	 */
	private decodeMessage(transferChange: IPropertyTreeMessage): IPropertyTreeMessage {
		return this.propertyTreeConfig.encDec.messageEncoder.decode(transferChange);
	}

	private applyChangeSet(changeSet: SerializedChangeSet, metadata: Metadata) {
		const _changeSet = new ChangeSet(changeSet);
		_changeSet._toReversibleChangeSet(this.tipView);

		this.updateRemoteHeadGuid();

		const change = {
			op: OpKind.ChangeSet,
			changeSet,
			metadata,
			guid: uuidv4(),
			remoteHeadGuid: this.headCommitGuid,
			referenceGuid:
				this.localChanges.length > 0
				? this.localChanges[this.localChanges.length - 1].guid
				: this.headCommitGuid,
			localBranchStart: this.localChanges.length > 0 ? this.localChanges[0].guid : undefined,
			useMH: this.useMH,
		};
		this._applyLocalChangeSet(change);
		// Queue the op for transmission to the Fluid service.
		const transferChange = this.encodeMessage(cloneDeep(change));
		if (this.transmissionsHaveBeenStopped) {
			this.enqueuedMessages.push(transferChange);
		} else {
			this.submitLocalMessage(transferChange);
		}
	}

	stopTransmission(stop: boolean) {
		this.transmissionsHaveBeenStopped = stop;
		if (stop === false) {
			for (const message of this.enqueuedMessages) {
				this.submitLocalMessage(message);
			}
			this.enqueuedMessages = [];
		}
	}
	/**
	 * Delays notifications until popNotificationDelayScope has been called the same number of times as
	 * pushNotificationDelayScope.
	 */
	public pushNotificationDelayScope() {
		// set the scope counter
		this.notificationDelayScope++;

		// If we reach 0, we have to report unreported changes
		if (this.notificationDelayScope === 0) {
			this._root._reportDirtinessToView();
		}
	}

	/**
	 * Re-enables notifications when popNotificationDelayScope has been called the same number of times as
	 * pushNotificationDelayScope.
	 */
	public popNotificationDelayScope() {
		if (this.notificationDelayScope === 0) {
			console.error("Unbalanced push/pop calls.");
		}
		this.notificationDelayScope--;
		this._root._reportDirtinessToView();
	}

	/**
	 * Process an operation
	 *
	 * @param message - the message to prepare
	 * @param local - whether the message was sent by the local client
	 * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
	 * For messages from a remote client, this will be undefined.
	 */
	protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
		if (message.type === MessageType.Operation && message.sequenceNumber > this.skipSequenceNumber) {
			const change: IPropertyTreeMessage = this.decodeMessage(cloneDeep(message.contents));
			const content: IRemotePropertyTreeMessage = { ...change, sequenceNumber: message.sequenceNumber };
			switch (content.op) {
				case OpKind.ChangeSet:
					// If the op originated locally from this client, we've already accounted for it
					// by advancing the state.  Otherwise, advance the PRNG now.
					this._applyRemoteChangeSet(cloneDeep(content));
					break;
				default:
					break;
			}
		}
	}

	private addRemoteChange(change: IPropertyTreeMessage) {
		this.remoteChanges.push(change);
		this.updateRemoteHeadGuid();
	}


	private updateRemoteHeadGuid() {
		this.headCommitGuid = this.remoteChanges.length > 0
				? this.remoteChanges[this.remoteChanges.length - 1].guid
				: this.headCommitGuid;
	}

	public static prune(
		minimumSequenceNumber: number,
		remoteChanges: IPropertyTreeMessage[],
		unrebasedRemoteChanges: Record<string, IRemotePropertyTreeMessage>,
	) {
		// for faster lookup of remote change guids
		const remoteChangeMap = new Map<string, number>();
		remoteChanges.forEach((change, index) => {
			remoteChangeMap.set(change.guid, index);
		});

		// we will track visited nodes
		const visitedUnrebasedRemoteChanges = new Set<string>();
		const visitedRemoteChanges = new Set<string>();

		for (const id of Object.keys(unrebasedRemoteChanges)) {
			const unrebasedChange = unrebasedRemoteChanges[id];

			// we are only interested in changes that are newer than the sequence number
			// and that were not yet visited previously
			if (
				unrebasedChange.sequenceNumber >= minimumSequenceNumber &&
				!visitedUnrebasedRemoteChanges.has(unrebasedChange.guid)
			) {
				// we visited that unrebased change and mark it as visited
				visitedUnrebasedRemoteChanges.add(unrebasedChange.guid);

				let visitor = unrebasedChange;
				// we will walk along the commit chain until we hit a remote change or a visited unrebased commit
				// at that point we can skip since we already traced the rest of the commit chain
				while (
					visitor.remoteHeadGuid !== visitor.referenceGuid ||
					visitedUnrebasedRemoteChanges.has(visitor.referenceGuid)
				) {
					const guid = visitor.referenceGuid;
					if (guid === "") {
						break;
					}
					// since the change is not in remote it must be in unrebased
					visitor = unrebasedRemoteChanges[visitor.referenceGuid];
					if (!visitor) {
						throw new Error(`no visitor found for guid "${guid}"`);
					}

					visitedUnrebasedRemoteChanges.add(visitor.guid);
				}
				// if we exited the loop because we hit a remote change than add it as visited
				if (visitor.remoteHeadGuid === visitor.referenceGuid && remoteChangeMap.has(visitor.referenceGuid)) {
					visitedRemoteChanges.add(visitor.referenceGuid);
				}

				// If we have a change that refers to the start of the history (remoteHeadGuid === ""), we have to
				// keep all remote Changes until this change has been processed
				if (visitor.remoteHeadGuid === "") {
					visitedRemoteChanges.add(remoteChanges[0].guid);
				}
			}
		}
		let pruned = 0;
		// we can now filter the unrebased changes by removing any changes
		// we have not visited at all during our traversal
		const prunedUnrebasedRemoteChanges: Record<string, IRemotePropertyTreeMessage> = {};
		for (const key of Object.keys(unrebasedRemoteChanges)) {
			if (visitedUnrebasedRemoteChanges.has(key)) {
				prunedUnrebasedRemoteChanges[key] = unrebasedRemoteChanges[key];
			} else {
				pruned++;
			}
		}

		// find minimum index
		const minIndex = Math.min(...[...visitedRemoteChanges].map((key) => remoteChangeMap.get(key) as number));

		const prunedRemoteChanges = remoteChanges.slice(minIndex);
		pruned += minIndex;

		return {
			remoteChanges: prunedRemoteChanges,
			unrebasedRemoteChanges: prunedUnrebasedRemoteChanges,
			prunedCount: pruned,
		};
	}
	public pruneHistory() {
		const msn = this.runtime.deltaManager.minimumSequenceNumber;

		const { remoteChanges, unrebasedRemoteChanges } = SharedPropertyTree.prune(
			msn,
			this.remoteChanges,
			this.unrebasedRemoteChanges,
		);

		this.remoteChanges = remoteChanges;
		this.unrebasedRemoteChanges = unrebasedRemoteChanges;
	}

	/**
	 * This method encodes the local summary (snapshot) object into the serialized form.
	 * @param summary - The local summary (snapshot)representation.
	 * @returns The serialized summary representation.
	 */
	private encodeSummary(summary: ISnapshotSummary) {
		return this.propertyTreeConfig.encDec.summaryEncoder.encode(summary);
	}

	/**
	 * This method decodes the serialized form of the summary into the local summary (snapshot) object.
	 * @param serializedSummary - The serialized summary representation.
	 * @returns The local summary (snapshot)representation.
 	 */
	private decodeSummary(serializedSummary): ISnapshotSummary {
		return this.propertyTreeConfig.encDec.summaryEncoder.decode(serializedSummary);
	}

	/**
 	 * This method writes the log message if the logging is enabled in the extended DDS.
	 * The logging is not enabled in the default Property DDS
	 * @param message - The message to be logged.
	 */
	protected logIfEnabled(message) {}

	/**
 	 * This method encodes the binary representation of the
 	 * blob.
	 * @param blob - The binary representation of the blob.
	 * @returns The encoded representation of the blob.
 	 */
	private encodeSummaryBlob(blob: ArrayBuffer): any {
		return bufferToString(blob, "base64");
	}

	/**
 	 * This method decodes the encoded representation of the
	 * blob.
 	 * @param blob - The encoded representation of the blob.
	 * @returns The binary representation of the blob.
	 */
	private decodeSummaryBlob(encoded: any): ArrayBuffer {
		const buffer = bufferToString(encoded, "utf8");
		return stringToBuffer(buffer, "base64");
	}

	public summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		this.pruneHistory();
		const snapshot: ISnapshot = {
			branchGuid: this.handle.absolutePath.split("/").pop() as string,
			summaryMinimumSequenceNumber: this.runtime.deltaManager.minimumSequenceNumber,
			useMH: this.useMH,
			numChunks: 0,
		};

		const builder = new SummaryTreeBuilder();
		if (!this.useMH) {
			// If the MH is not used, we have to include the tip view, the remote changes and the received
			// deltas to the summary
			const summary: ISnapshotSummary = {
				remoteTipView: this.remoteTipView,
				remoteChanges: this.remoteChanges,
				remoteHeadGuid: this.headCommitGuid,
				unrebasedRemoteChanges: this.unrebasedRemoteChanges,
			};

			const chunkSize = 5000 * 1024; // Default limit seems to be 5MB
			let totalBlobsSize = 0;
			const serializedSummary = this.encodeSummary(summary);
			for (let pos = 0, i = 0; pos < serializedSummary.length; pos += chunkSize, i++) {
				const summaryBlob = this.encodeSummaryBlob(serializedSummary.slice(pos, pos + chunkSize));
				// eslint-disable-next-line @typescript-eslint/dot-notation
				totalBlobsSize += summaryBlob["length"];
				builder.addBlob(`summaryChunk_${i}`, summaryBlob);
				snapshot.numChunks++;
			}
			this.logIfEnabled(`Total blobs transfer size: ${totalBlobsSize}`);
		}

		builder.addBlob("properties", serializer !== undefined
			? serializer.stringify(snapshot, this.handle)
			: JSON.stringify(snapshot));
		return builder.getSummaryTree();
	}

	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const runtime = this.runtime;
		const handleTableChunk = await storage.readBlob("properties");
		const utf8 = bufferToString(handleTableChunk, "utf8");

		const snapshot: ISnapshot = this.serializer.parse(utf8);
		this.useMH = snapshot.useMH;

		try {
			if (!snapshot.useMH) {
				// We load all chunks
				const chunks: ArrayBufferLike[] = await Promise.all(
					range(snapshot.numChunks).map(async (i) => {
						return this.decodeSummaryBlob(await storage.readBlob(`summaryChunk_${i}`));
					}),
				);

				const totalLength = chunks.reduce((a, b) => a + b.byteLength, 0);
				const serializedSummary = new Uint8Array(totalLength);
				chunks.reduce((offset, chunk) => {
					serializedSummary.set(new Uint8Array(chunk), offset);
					return offset + chunk.byteLength;
				}, 0);
				const snapshotSummary = this.decodeSummary(serializedSummary);
				if (
					snapshotSummary.remoteChanges === undefined ||
					snapshotSummary.remoteTipView === undefined ||
					snapshotSummary.unrebasedRemoteChanges === undefined
				) {
					throw new Error("Invalid Snapshot.");
				}

				if (snapshotSummary.remoteHeadGuid === undefined) {
					// The summary does not contain a remoteHeadGuid. This means the summary has
					// been created by an old version of PropertyDDS, that did not yet have this patch.
					snapshotSummary.remoteHeadGuid = (snapshotSummary.remoteChanges.length > 0) ?
							// If there are remote changes in the
							// summary we can deduce the head GUID from these changes.
							snapshotSummary.remoteChanges[snapshotSummary.remoteChanges.length - 1].guid :

							// If no remote head GUID is available, we will fall back to the old behaviour,
							// where the head GUID was set to an empty string. However, this could lead to
							// divergence between the clients, if there is still a client in the session
							// that is using a version of this library without this patch and which
							// has started the session at a different summary.
							"";
				}

				this.remoteTipView = snapshotSummary.remoteTipView;
				this.remoteChanges = snapshotSummary.remoteChanges;
				this.unrebasedRemoteChanges = snapshotSummary.unrebasedRemoteChanges;
				this.headCommitGuid = snapshotSummary.remoteHeadGuid;
				const isPartialCheckoutActive = !!(this.options.clientFiltering && this.options.paths);
				if (isPartialCheckoutActive && this.options.paths) {
					this.remoteTipView = ChangeSetUtils.getFilteredChangeSetByPaths(
						this.remoteTipView,
						this.options.paths,
					);
				}
				this.tipView = cloneDeep(this.remoteTipView);

				this.skipSequenceNumber = 0;
			} else {
				const { branchGuid, summaryMinimumSequenceNumber } = snapshot;
				const branchResponse = await axios.get(`http://localhost:3000/branch/${branchGuid}`);
				this.headCommitGuid = branchResponse.data.headCommitGuid;
				const {
					commit: { meta: commitMetadata },
				} = (await axios.get(`http://localhost:3000/branch/${branchGuid}/commit/${this.headCommitGuid}`)).data;
				let { changeSet: materializedView } = (
					await axios.get(
						`http://localhost:3000/branch/${branchGuid}/commit/${this.headCommitGuid}/materializedView`,
					)
				).data;

				const isPartialCheckoutActive = this.options.clientFiltering && this.options.paths;

				if (isPartialCheckoutActive && this.options.paths) {
					materializedView = ChangeSetUtils.getFilteredChangeSetByPaths(materializedView, this.options.paths);
				}

				this.tipView = materializedView;
				this.remoteTipView = cloneDeep(this.tipView);
				this.remoteChanges = [];

				let missingDeltas: ISequencedDocumentMessage[] = [];
				const firstDelta = Math.min(commitMetadata.minimumSequenceNumber, summaryMinimumSequenceNumber);
				const lastDelta = commitMetadata.sequenceNumber;

				const dm = (this.runtime.deltaManager as any).deltaManager;
				await dm.getDeltas("DocumentOpen", firstDelta, lastDelta, (messages: ISequencedDocumentMessage[]) => {
					missingDeltas = messages.filter((x) => x.type === "op");
				});

				// eslint-disable-next-line @typescript-eslint/prefer-for-of
				for (let i = 0; i < missingDeltas.length; i++) {
					if (missingDeltas[i].sequenceNumber < commitMetadata.sequenceNumber) {
						const remoteChange: IPropertyTreeMessage
							= JSON.parse(missingDeltas[i].contents).contents.contents.content.contents;
						const { changeSet } = (
							await axios.get(
								`http://localhost:3000/branch/${branchGuid}/commit/${remoteChange.guid}/changeSet`,
							)
						).data;
						remoteChange.changeSet = changeSet;

						if (remoteChange) {
							if (isPartialCheckoutActive && this.options.paths) {
								remoteChange.changeSet = ChangeSetUtils.getFilteredChangeSetByPaths(
									remoteChange.changeSet,
									this.options.paths,
								);
							}
							this.addRemoteChange(remoteChange);
						}
					} else {
						this.processCore(missingDeltas[i], false, {});
					}
				}

				this.skipSequenceNumber = lastDelta ?? -1;
			}
		} catch (e) {
			this.tipView = {};
			this.remoteTipView = {};
			this.remoteChanges = [];
		} finally {
			this._root.deserialize(this.tipView, undefined, false, false);
			const _changeSet = new ChangeSet(this.tipView);
			if (!isEmpty(_changeSet.getSerializedChangeSet())) {
				this.emit("localModification", _changeSet);
			}
			this.root.cleanDirty();
		}
	}

	protected onDisconnect() { }

	private _applyLocalChangeSet(change: IPropertyTreeMessage) {
		const changeSetWrapper = new ChangeSet(this.tipView);
		changeSetWrapper.applyChangeSet(change.changeSet);

		if (this.runtime.attachState === AttachState.Detached) {
			const remoteChangeSetWrapper = new ChangeSet(this.remoteTipView);
			remoteChangeSetWrapper.applyChangeSet(change.changeSet);
		} else {
			this.localChanges.push(change);
		}
	}

	private _applyRemoteChangeSet(change: IRemotePropertyTreeMessage) {
		this.unrebasedRemoteChanges[change.guid] = cloneDeep(change);

		// This is the first message in the history of the document.
		if (this.remoteChanges.length !== 0) {
			rebaseToRemoteChanges(
				change,
				this.getUnrebasedChange.bind(this),
				this.getRebasedChanges.bind(this),
			);
		}

		this.addRemoteChange(change);
		// Apply the remote change set to the remote tip view
		const remoteChangeSetWrapper = new ChangeSet(this.remoteTipView);
		remoteChangeSetWrapper.applyChangeSet(change.changeSet);

		// Rebase the local changes
		const pendingChanges = this._root._serialize(true, false, BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
		new ChangeSet(pendingChanges)._toReversibleChangeSet(this.tipView);

		const changesToTip: SerializedChangeSet = {};
		const changesNeeded = this.rebaseLocalChanges(change, pendingChanges, changesToTip);

		if (changesNeeded) {
			this.pushNotificationDelayScope();
			// Checkout the new tip
			this._root.applyChangeSet(changesToTip);
			this._root.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
			this._root.applyChangeSet(pendingChanges);
			this.popNotificationDelayScope();
		}

		// This is disabled for performance reasons. Only used during debugging
		// assert(JSON.stringify(this.root.serialize()) === JSON.stringify(this.tipView));
	}

	getUnrebasedChange(guid: string) {
		return this.unrebasedRemoteChanges[guid];
	}

	getRebasedChanges(startGuid: string, endGuid?: string) {
		const startIndex = findIndex(this.remoteChanges, (c) => c.guid === startGuid);
		if (endGuid !== undefined) {
			const endIndex = findIndex(this.remoteChanges, (c) => c.guid === endGuid);
			return this.remoteChanges.slice(startIndex + 1, endIndex + 1);
		}
		return this.remoteChanges.slice(startIndex + 1);
	}

	private rebaseLocalChanges(
		change: IPropertyTreeMessage,
		pendingChanges: SerializedChangeSet,
		newTipDelta: SerializedChangeSet,
	): boolean {
		let rebaseBaseChangeSet = cloneDeep(change.changeSet);

		const accumulatedChanges: SerializedChangeSet = {};
		const conflicts = [] as any[];

		if (this.localChanges.length > 0 && this.localChanges[0].guid === change.guid) {
			// This is disabled for performance reasons. Only used during debugging
			// assert(JSON.stringify(this.localChanges[0].changeSet) === JSON.stringify(change.changeSet),
			//        "Local change different than rebased remote change.");

			// If we got a confirmation of the commit on the tip of the localChanges array,
			// there will be no update of the tip view at all. We just move it from local changes
			// to remote changes
			this.localChanges.shift();

			return false;
		}

		// eslint-disable-next-line @typescript-eslint/prefer-for-of
		for (let i = 0; i < this.localChanges.length; i++) {
			// Make sure we never receive changes out of order
			console.assert(this.localChanges[i].guid !== change.guid);

			const rebaseMetaInformation = new Map();

			const copiedChangeSet = new ChangeSet(cloneDeep(this.localChanges[i].changeSet));
			new ChangeSet(rebaseBaseChangeSet)._rebaseChangeSet(this.localChanges[i].changeSet, conflicts, {
				applyAfterMetaInformation: rebaseMetaInformation,
			});

			copiedChangeSet.toInverseChangeSet();
			copiedChangeSet.applyChangeSet(rebaseBaseChangeSet);
			copiedChangeSet.applyChangeSet(this.localChanges[i].changeSet, {
				applyAfterMetaInformation: rebaseMetaInformation,
			});
			rebaseBaseChangeSet = copiedChangeSet.getSerializedChangeSet();

			new ChangeSet(accumulatedChanges).applyChangeSet(this.localChanges[i].changeSet);
		}

		// Compute the inverse of the pending changes and store the result in newTipDelta
		const pendingChangesRebaseMetaInformation = new Map();
		const deltaToTipCS = new ChangeSet(newTipDelta);
		deltaToTipCS.applyChangeSet(pendingChanges);
		deltaToTipCS.toInverseChangeSet();

		// Perform a rebase of the pending changes
		new ChangeSet(rebaseBaseChangeSet)._rebaseChangeSet(pendingChanges, conflicts, {
			applyAfterMetaInformation: pendingChangesRebaseMetaInformation,
		});

		// Compute the delta between the old tip (including pending changes)
		// and the new tip (not including the rebased pending changes)
		deltaToTipCS.applyChangeSet(rebaseBaseChangeSet);

		// Update the tip view
		if (!this.tipView) {
			this.tipView = cloneDeep(this.remoteTipView);
			const changeSet = new ChangeSet(this.tipView);
			changeSet.applyChangeSet(accumulatedChanges);
		} else {
			new ChangeSet(this.tipView).applyChangeSet(newTipDelta);
		}

		return true;
	}

	protected applyStashedOp() {
		throw new Error("not implemented");
	}
}
