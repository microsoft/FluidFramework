import {
	ISequencedDocumentMessage,
	ITree,
	MessageType,
	FileMode,
	TreeEntry,
	ITreeEntry,
} from "@fluidframework/protocol-definitions";
import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelStorageService,
	IChannelFactory,
} from "@fluidframework/datastore-definitions";

import { fromBase64ToUtf8, assert } from "@fluidframework/common-utils";
import { SharedObject } from "@fluidframework/shared-object-base";
import { IFluidSerializer } from "@fluidframework/core-interfaces";

import { ChangeSet, Utils as ChangeSetUtils } from "@fluid-experimental/property-changeset";

import { PropertyFactory, BaseProperty, NodeProperty } from "@fluid-experimental/property-properties";

import { v4 as uuidv4 } from "uuid";
import _ from "lodash";
import axios from "axios";
import { PropertyTreeFactory } from "./propertyTreeFactory";

export type SerializedChangeSet = any;

export const enum OpKind {
	// eslint-disable-next-line @typescript-eslint/no-shadow
	ChangeSet = 0,
}

export interface IPropertyTreeMessage {
	op: OpKind;
	changeSet: SerializedChangeSet;
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
interface ISnapshotSummary {
	remoteTipView?: SerializedChangeSet;
	remoteChanges?: IPropertyTreeMessage[];
	unrebasedRemoteChanges?: Record<string, IRemotePropertyTreeMessage>;
}

export interface SharedPropertyTreeOptions {
	paths?: string[];
	clientFiltering?: boolean;
	useMH?: boolean;
}

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
	// Initial state of the PRNG.  Must not be zero.  (See `advance()` below for details.)
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

	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		options: SharedPropertyTreeOptions,
	) {
		super(id, runtime, attributes);

		this.root.getWorkspace = () => this;
		// this.root._getCheckoutView = () => undefined;

		this.options = options;
		// Quick hack to let HFDM root be aware of the DDS hosting it.
		this._root._tree = this;

		// By default, we currently don't use the MH
		this.useMH = options.useMH ?? false;
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
		const socket = (this.runtime.deltaManager as any).deltaManager.connection.socket;
		socket.emit("partial_checkout", { paths });
	}

	public _reportDirtinessToView() {
		const changes = this._root._serialize(true, false, BaseProperty.MODIFIED_STATE_FLAGS.DIRTY);
		const _changeSet = new ChangeSet(changes);
		if (!_.isEmpty(_changeSet.getSerializedChangeSet())) {
			this.emit("localModification", _changeSet);
		}
		this._root.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY);
	}

	public get changeSet() {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return this.tipView;
	}
	public get root(): NodeProperty {
		return this._root as NodeProperty;
	}

	public commit() {
		const changes = this._root._serialize(true, false, BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
		this.applyChangeSet(changes);
		this.root.cleanDirty();
	}

	private applyChangeSet(changeSet: SerializedChangeSet) {
		const _changeSet = new ChangeSet(changeSet);
		_changeSet._toReversibleChangeSet(this.tipView);

		const remoteHeadGuid =
			this.remoteChanges.length > 0
				? this.remoteChanges[this.remoteChanges.length - 1].guid
				: this.headCommitGuid;
		const change = {
			op: OpKind.ChangeSet,
			changeSet,
			guid: uuidv4(),
			remoteHeadGuid,
			referenceGuid:
				this.localChanges.length > 0 ? this.localChanges[this.localChanges.length - 1].guid : remoteHeadGuid,
			localBranchStart: this.localChanges.length > 0 ? this.localChanges[0].guid : undefined,
			useMH: this.useMH,
		};
		this._applyLocalChangeSet(change);

		// Queue the op for transmission to the Fluid service.
		if (this.transmissionsHaveBeenStopped) {
			this.enqueuedMessages.push(_.cloneDeep(change));
		} else {
			this.submitLocalMessage(change);
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
			const content: IRemotePropertyTreeMessage = { ...message.contents, sequenceNumber: message.sequenceNumber };
			switch (content.op) {
				case OpKind.ChangeSet:
					// If the op originated locally from this client, we've already accounted for it
					// by advancing the state.  Otherwise, advance the PRNG now.
					this._applyRemoteChangeSet(_.cloneDeep(content));
					break;
				default:
					break;
			}
		}
	}

	public static prune(
		minimumSequenceNumber: number,
		remoteChanges: IPropertyTreeMessage[],
		unrebasedRemoteChanges: Record<string, IRemotePropertyTreeMessage>,
	) {
		// for faster lookup of remote chage guids
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
	public snapshotCore(serializer: IFluidSerializer): ITree {
		this.pruneHistory();
		const snapshot: ISnapshot = {
			branchGuid: this.handle.absolutePath.split("/").pop() as string,
			summaryMinimumSequenceNumber: this.runtime.deltaManager.minimumSequenceNumber,
			useMH: this.useMH,
			numChunks: 0,
		};

		const chunks: ITreeEntry[] = [];
		if (!this.useMH) {
			// If the MH is not used, we have to include the tip view, the remote changes and the received
			// deltas to the summary
			const summary: ISnapshotSummary = {
				remoteTipView: this.remoteTipView,
				remoteChanges: this.remoteChanges,
				unrebasedRemoteChanges: this.unrebasedRemoteChanges,
			};
			const chunkSize = 64 * 1024; // Default limit seems to be 100k
			let serializedSummary =
				serializer !== undefined ? serializer.stringify(summary, this.handle) : JSON.stringify(summary);

			// JSON.stringify does not escape unicode characters. As a consequence,
			// the chunking code below could create chunks which are bigger than the
			// allowed limit after encoding the JSON via UTF8 encoding. To make sure
			// the encoded string stays within the size limit, we replace unicode characters
			// with the cooresponding escapes. This way, it won't change size when encoded as
			// utf8
			serializedSummary = serializedSummary.replace(
				/[\u007F-\uFFFF]/g,
				// eslint-disable-next-line prefer-template
				(c) => `\\u${("0000" + c.charCodeAt(0).toString(16)).substr(-4)}`,
			);

			for (let pos = 0, i = 0; pos < serializedSummary.length; pos += chunkSize, i++) {
				chunks.push({
					path: `summaryChunk_${i}`,
					mode: FileMode.File,
					type: TreeEntry.Blob,
					value: {
						contents: serializedSummary.substr(pos, chunkSize),
						encoding: "utf-8",
					},
				});
			}
			snapshot.numChunks = chunks.length;
		}

		return {
			entries: [
				{
					path: "properties",
					mode: FileMode.File,
					type: TreeEntry.Blob,
					value: {
						contents:
							serializer !== undefined
								? serializer.stringify(snapshot, this.handle)
								: JSON.stringify(snapshot),
						encoding: "utf-8",
					},
				},
				...chunks,
			],
			id: undefined,
		};
	}

	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const runtime = this.runtime;
		const handleTableChunk = await storage.read("properties");
		const utf8 = fromBase64ToUtf8(handleTableChunk);

		const serializer = runtime.IFluidSerializer;
		const snapshot: ISnapshot = serializer !== undefined ? serializer.parse(utf8) : JSON.parse(utf8);
		this.useMH = snapshot.useMH;

		try {
			if (!snapshot.useMH) {
				// We load all chunks
				const chunks = await Promise.all(
					_.range(snapshot.numChunks).map(async (i) => {
						return fromBase64ToUtf8(await storage.read(`summaryChunk_${i}`));
					}),
				);

				const serializedSummary = _.reduce(chunks, (a, b) => a + b, "");
				const snapshotSummary: ISnapshotSummary =
					serializer !== undefined ? serializer.parse(serializedSummary) : JSON.parse(serializedSummary);
				if (
					snapshotSummary.remoteChanges === undefined ||
					snapshotSummary.remoteTipView === undefined ||
					snapshotSummary.unrebasedRemoteChanges === undefined
				) {
					throw new Error("Invalid Snapshot.");
				}

				this.remoteTipView = snapshotSummary.remoteTipView;
				this.remoteChanges = snapshotSummary.remoteChanges;
				this.unrebasedRemoteChanges = snapshotSummary.unrebasedRemoteChanges;

				const isPartialCheckoutActive = !!(this.options.clientFiltering && this.options.paths);
				if (isPartialCheckoutActive && this.options.paths) {
					this.remoteTipView = ChangeSetUtils.getFilteredChangeSetByPaths(
						this.remoteTipView,
						this.options.paths,
					);
				}
				this.tipView = _.cloneDeep(this.remoteTipView);

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
				this.remoteTipView = _.cloneDeep(this.tipView);
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
						const remoteChange = JSON.parse(missingDeltas[i].contents).contents.contents.content.contents;
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
							this.remoteChanges.push(remoteChange);
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
			this._root.deserialize(this.tipView);
			this.root.cleanDirty();
		}
	}

	protected registerCore() {}
	protected onDisconnect() {}

	private _applyLocalChangeSet(change: IPropertyTreeMessage) {
		const changeSetWrapper = new ChangeSet(this.tipView);
		changeSetWrapper.applyChangeSet(change.changeSet);

		this.localChanges.push(change);
	}

	private _applyRemoteChangeSet(change: IRemotePropertyTreeMessage) {
		// Rebase the commit with respect to the remote changes
		this.rebaseToRemoteChanges(change);

		this.remoteChanges.push(change);

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
	private rebaseToRemoteChanges(change: IRemotePropertyTreeMessage) {
		this.unrebasedRemoteChanges[change.guid] = _.cloneDeep(change);

		// This is the first message in the history of the document.
		if (this.remoteChanges.length === 0) {
			return;
		}

		const commitsOnOtherLocalBranch: Record<string, IPropertyTreeMessage> = {};
        let rebaseBaseChangeSet = new ChangeSet({});
        const changesOnOtherLocalBranch: IPropertyTreeMessage[] = [];
		if (change.referenceGuid !== change.remoteHeadGuid) {
			// Extract all changes inbetween the remoteHeadGuid and the referenceGuid
			let currentGuid = change.referenceGuid;
			for (;;) {
				const currentChange = this.unrebasedRemoteChanges[currentGuid];
				if (currentChange === undefined) {
					throw new Error("Received change that references a non-existing parent change");
				}
				changesOnOtherLocalBranch.unshift(currentChange);
				commitsOnOtherLocalBranch[currentGuid] = currentChange;
				if (currentGuid === change.localBranchStart) {
					break;
				}
				currentGuid = currentChange.referenceGuid;
			}

			// Now we extract all changes until we arrive at a change that is relative to a remote change
			const alreadyRebasedChanges: IPropertyTreeMessage[] = [];
			let currentRebasedChange = this.unrebasedRemoteChanges[change.localBranchStart];
			while (currentRebasedChange.remoteHeadGuid !== currentRebasedChange.referenceGuid) {
				currentGuid = currentRebasedChange.referenceGuid;
				currentRebasedChange = this.unrebasedRemoteChanges[currentGuid];
				alreadyRebasedChanges.unshift(currentRebasedChange);
				if (currentRebasedChange === undefined) {
					throw new Error("Received change that references a non-existing parent change");
				}
			}

			// Compute the base Changeset to rebase the changes on the branch that was still the local branch
			// when the incoming change was created

			// First invert all changes on the previous local branch
			let startIndex: number;
			if (alreadyRebasedChanges.length > 0) {
				startIndex = _.findIndex(this.remoteChanges, (c) => c.guid === alreadyRebasedChanges[0].referenceGuid);
			} else {
				startIndex = _.findIndex(
					this.remoteChanges,
					(c) => c.guid === changesOnOtherLocalBranch[0].referenceGuid,
				);
			}

			// Then apply all changes on the local remote branch
			const endIndex = _.findIndex(this.remoteChanges, (c) => c.guid === change.remoteHeadGuid);
			const relevantRemoteChanges = this.remoteChanges.slice(startIndex + 1, endIndex + 1);
            let rebaseBaseChangeSetForAlreadyRebasedChanges = new ChangeSet({});

            for (const c of relevantRemoteChanges) {
                let changeset = c.changeSet;
                let applyAfterMetaInformation: Map<any,any>|undefined;

                if (alreadyRebasedChanges[0]?.guid === c.guid) {
                    const invertedChange = new ChangeSet(_.cloneDeep(alreadyRebasedChanges[0].changeSet));
                    invertedChange._toInverseChangeSet();
                    invertedChange.applyChangeSet(rebaseBaseChangeSetForAlreadyRebasedChanges);
                    applyAfterMetaInformation = new Map();
                    const conflicts2 = [];
                    changeset = _.cloneDeep(alreadyRebasedChanges[0].changeSet);
                    rebaseBaseChangeSetForAlreadyRebasedChanges._rebaseChangeSet(changeset,
                                                    conflicts2, {applyAfterMetaInformation});

                    rebaseBaseChangeSetForAlreadyRebasedChanges = invertedChange;
                    alreadyRebasedChanges.shift();
                }
                rebaseBaseChangeSetForAlreadyRebasedChanges.applyChangeSet(changeset, {applyAfterMetaInformation});
            }

			// Now we have to rebase all changes from the remote local branch with respect to this base changeset
			this.rebaseChangeArrays(rebaseBaseChangeSetForAlreadyRebasedChanges, changesOnOtherLocalBranch);

			// Update the reference for the rebased changes to indicate that they are now with respect to the
			// new remoteHeadGuid
			if (changesOnOtherLocalBranch.length > 0) {
				changesOnOtherLocalBranch[0].remoteHeadGuid = change.remoteHeadGuid;
				changesOnOtherLocalBranch[0].referenceGuid = change.remoteHeadGuid;
			}
		}

		const baseCommitID = _.findIndex(this.remoteChanges, (c) => c.guid === change.remoteHeadGuid);

        const conflicts = [] as any[];
		for (let i = baseCommitID + 1; i < this.remoteChanges.length; i++) {
            let applyAfterMetaInformation = commitsOnOtherLocalBranch[this.remoteChanges[i].guid] !== undefined
						? this.remoteChanges[i].rebaseMetaInformation
                        : undefined;

            let changeset = this.remoteChanges[i].changeSet;
            if (changesOnOtherLocalBranch[0]?.guid === this.remoteChanges[i].guid) {
                const invertedChange = new ChangeSet(_.cloneDeep(changesOnOtherLocalBranch[0].changeSet));
                invertedChange._toInverseChangeSet();
                invertedChange.applyChangeSet(rebaseBaseChangeSet);

                applyAfterMetaInformation = new Map();
                changeset = _.cloneDeep(changesOnOtherLocalBranch[0].changeSet);
                rebaseBaseChangeSet._rebaseChangeSet(changeset,
                                                     conflicts, {applyAfterMetaInformation});

                // This is disabled for performance reasons. Only used during debugging
                // assert(_.isEqual(changeset,this.remoteChanges[i].changeSet),
                //                 "Failed Rebase in rebaseToRemoteChanges");
                rebaseBaseChangeSet = invertedChange;
                changesOnOtherLocalBranch.shift();
            }

            rebaseBaseChangeSet.applyChangeSet(changeset, {
                applyAfterMetaInformation,
			});
		}

		change.rebaseMetaInformation = new Map();
		rebaseBaseChangeSet._rebaseChangeSet(change.changeSet, conflicts, {
            applyAfterMetaInformation: change.rebaseMetaInformation,
		});
	}

	private rebaseChangeArrays(baseChangeSet: ChangeSet, changesToRebase: IPropertyTreeMessage[]) {
		let rebaseBaseChangeSet = baseChangeSet;
		for (const change of changesToRebase) {
			const copiedChangeSet = new ChangeSet(_.cloneDeep(change.changeSet));
			copiedChangeSet._toInverseChangeSet();

			const conflicts = [] as any[];
            change.rebaseMetaInformation = new Map();
			rebaseBaseChangeSet._rebaseChangeSet(change.changeSet, conflicts, {
                applyAfterMetaInformation: change.rebaseMetaInformation,
			});

			copiedChangeSet.applyChangeSet(rebaseBaseChangeSet);
			copiedChangeSet.applyChangeSet(change.changeSet, {
                applyAfterMetaInformation: change.rebaseMetaInformation,
			});
			rebaseBaseChangeSet = copiedChangeSet;
		}
	}

	private rebaseLocalChanges(
		change: IPropertyTreeMessage,
		pendingChanges: SerializedChangeSet,
		newTipDelta: SerializedChangeSet,
	): boolean {
		let rebaseBaseChangeSet = _.cloneDeep(change.changeSet);

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

			const copiedChangeSet = new ChangeSet(_.cloneDeep(this.localChanges[i].changeSet));
			new ChangeSet(rebaseBaseChangeSet)._rebaseChangeSet(this.localChanges[i].changeSet, conflicts, {
				applyAfterMetaInformation: rebaseMetaInformation,
			});

			copiedChangeSet._toInverseChangeSet();
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
		deltaToTipCS._toInverseChangeSet();

		// Perform a rebase of the pending changes
		new ChangeSet(rebaseBaseChangeSet)._rebaseChangeSet(pendingChanges, conflicts, {
			applyAfterMetaInformation: pendingChangesRebaseMetaInformation,
		});

		// Compute the delta between the old tip (including pending changes)
		// and the new tip (not including the rebased pending changes)
		deltaToTipCS.applyChangeSet(rebaseBaseChangeSet);
		deltaToTipCS.applyChangeSet(pendingChanges, {
			applyAfterMetaInformation: pendingChangesRebaseMetaInformation,
		});

		// Udate the the tip view
		this.tipView = _.cloneDeep(this.remoteTipView);
		const changeSet = new ChangeSet(this.tipView);
		changeSet.applyChangeSet(accumulatedChanges);

		return true;
	}
}
