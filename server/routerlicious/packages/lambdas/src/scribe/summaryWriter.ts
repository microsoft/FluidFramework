/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromBase64ToUtf8 } from "@fluidframework/common-utils";
import { ICreateCommitParams, ICreateTreeEntry } from "@fluidframework/gitresources";
import {
	ISequencedDocumentMessage,
	ISummaryContent,
	ITreeEntry,
	TreeEntry,
	FileMode,
	ISequencedDocumentAugmentedMessage,
	SummaryObject,
	SummaryType,
} from "@fluidframework/protocol-definitions";
import {
	buildTreePath,
	IGitManager,
	ISummaryTree,
	NetworkError,
	WholeSummaryUploadManager,
	getQuorumTreeEntries,
	generateServiceProtocolEntries,
	mergeAppAndProtocolTree,
	mergeSortedArrays,
	dedupeSortedArray,
	mergeKArrays,
	convertSortedNumberArrayToRanges,
} from "@fluidframework/server-services-client";
import {
	ICollection,
	IDeltaService,
	IScribe,
	ISequencedOperationMessage,
	requestWithRetry,
	shouldRetryNetworkError,
} from "@fluidframework/server-services-core";
import {
	CommonProperties,
	getLumberBaseProperties,
	Lumber,
	LumberEventName,
	Lumberjack,
} from "@fluidframework/server-services-telemetry";
import safeStringify from "json-stringify-safe";
import { ISummaryWriteResponse, ISummaryWriter } from "./interfaces";

/**
 * Git specific implementation of ISummaryWriter
 * @internal
 */
export class SummaryWriter implements ISummaryWriter {
	private readonly lumberProperties: Record<string, any>;
	constructor(
		private readonly tenantId: string,
		private readonly documentId: string,
		private readonly summaryStorage: IGitManager,
		private readonly deltaService: IDeltaService | undefined,
		private readonly opStorage: ICollection<ISequencedOperationMessage> | undefined,
		private readonly enableWholeSummaryUpload: boolean,
		private readonly lastSummaryMessages: ISequencedDocumentMessage[],
		private readonly getDeltasViaAlfred: boolean,
		private readonly maxRetriesOnError: number = 6,
		private readonly maxLogtailLength: number = 2000,
	) {
		this.lumberProperties = getLumberBaseProperties(this.documentId, this.tenantId);
	}

	/**
	 * The flag indicates whether the actual storing process happens locally or externally. As writing to external
	 * storage is an expensive process, a service provider may choose to use asynchronous out of process solution
	 * such as a job queue. If set to 'true', the return value of writeClientSummary/writeServiceSummary will not
	 * be used by the lambda. The external process will be responsible for sending the updates to the op stream.
	 */
	// eslint-disable-next-line @typescript-eslint/class-literal-property-style
	public get isExternal(): boolean {
		return false;
	}

	/**
	 * Helper function that finalizes the summary sent by client. After validating the summary op,
	 * it appends .protocol, .serviceProtocol, and .logTail to the summary. Once done, it creates
	 * a git summary, commits the change, and finalizes the ref.
	 * @param op - Operation that triggered the write
	 * @param lastSummaryHead - Points to the last summary head if available
	 * @param checkpoint - State of the scribe service at current sequence number
	 * @param pendingOps - List of unprocessed ops currently present in memory
	 * @returns ISummaryWriteResponse; that represents the success or failure of the write, along with an
	 * Ack or Nack message
	 */
	public async writeClientSummary(
		op: ISequencedDocumentAugmentedMessage,
		lastSummaryHead: string | undefined,
		checkpoint: IScribe,
		pendingOps: ISequencedOperationMessage[],
		isEphemeralContainer?: boolean,
	): Promise<ISummaryWriteResponse> {
		const clientSummaryMetric = Lumberjack.newLumberMetric(LumberEventName.ClientSummary);
		this.setSummaryProperties(clientSummaryMetric, op, isEphemeralContainer);
		const content = JSON.parse(op.contents as string) as ISummaryContent;
		try {
			// The summary must reference the existing summary to be valid. This guards against accidental sends of
			// two summaries at the same time. In this case the first one wins.
			const existingRef = await requestWithRetry(
				async () => this.summaryStorage.getRef(encodeURIComponent(this.documentId)),
				"writeClientSummary_getRef",
				this.lumberProperties,
				shouldRetryNetworkError,
				this.maxRetriesOnError,
			);

			if (content.head) {
				// In usual case, client always refers to last summaryAck so lastClientSummaryHead should always match.
				// However, the ack itself might be lost If scribe dies right after creating the summary. In that case,
				// the client code just fetches the last summary which should be the same as existingRef sha.
				if (
					!existingRef ||
					(lastSummaryHead !== content.head && existingRef.object.sha !== content.head)
				) {
					// In some edge cases, the client loads a latest summary while a service summary is being written.
					// Service summaries do not submit any "summarize ack" ops, so the client cannot know that a new summary was written.
					// However, summaries based off the latest client summary, or any service summary following that client summary,
					// are still valid summaries, even if the parent is no longer latest due to an un-acked service summary.
					// This check makes sure we don't reject valid summaries just because a service summary was written behind the scenes.
					const isValidParentSummary =
						checkpoint.validParentSummaries?.includes(content.head) ?? false;
					if (!isValidParentSummary) {
						clientSummaryMetric.error(
							`Proposed parent summary does not match actual parent summary`,
						);
						return {
							message: {
								message: `Proposed parent summary "${
									content.head
								}" does not match actual parent summary "${
									existingRef ? existingRef.object.sha : "n/a"
								}" nor other valid parent summaries "[${
									checkpoint.validParentSummaries?.join(",") ?? ""
								}] nor the last known client summary "${lastSummaryHead}".`,
								summaryProposal: {
									summarySequenceNumber: op.sequenceNumber,
								},
							},
							status: false,
						};
					}
				}
			} else if (existingRef) {
				clientSummaryMetric.error(
					`Proposed parent summary does not match actual parent summary`,
				);
				return {
					message: {
						message: `Proposed parent summary "${content.head}" does not match actual parent summary "${existingRef.object.sha}".`,
						summaryProposal: {
							summarySequenceNumber: op.sequenceNumber,
						},
					},
					status: false,
				};
			}

			// When using git, we also validate whether the parent summary is valid
			if (!this.enableWholeSummaryUpload) {
				try {
					await requestWithRetry(
						async () =>
							Promise.all(
								content.parents.map(async (parentSummary) =>
									this.summaryStorage.getCommit(parentSummary),
								),
							),
						"writeClientSummary_validateParentSummary",
						this.lumberProperties,
						shouldRetryNetworkError,
						this.maxRetriesOnError,
					);
				} catch (error) {
					clientSummaryMetric.error(`One or more parent summaries are invalid`, error);
					return {
						message: {
							message: "One or more parent summaries are invalid",
							summaryProposal: {
								summarySequenceNumber: op.sequenceNumber,
							},
						},
						status: false,
					};
				}
			}

			// We should not accept this summary if it is less than current protocol sequence number
			if (op.referenceSequenceNumber < checkpoint.protocolState.sequenceNumber) {
				clientSummaryMetric.error(
					`Proposed summary reference sequence number less than current sequence number`,
				);
				return {
					message: {
						message: `Proposed summary reference sequence number ${op.referenceSequenceNumber} is less than current sequence number ${checkpoint.protocolState.sequenceNumber}`,
						summaryProposal: {
							summarySequenceNumber: op.sequenceNumber,
						},
					},
					status: false,
				};
			}

			// At this point the summary op and its data are all valid and we can perform the write to history
			const protocolEntries: ITreeEntry[] = getQuorumTreeEntries(
				checkpoint.protocolState.minimumSequenceNumber,
				checkpoint.protocolState.sequenceNumber,
				checkpoint.protocolState,
			);

			// Generate a tree of logTail starting from protocol sequence number to summarySequenceNumber
			const logTailEntries = await requestWithRetry(
				async () =>
					this.generateLogtailEntries(
						checkpoint.protocolState.sequenceNumber,
						op.sequenceNumber + 1,
						pendingOps,
					),
				"writeClientSummary_generateLogtailEntries",
				this.lumberProperties,
				shouldRetryNetworkError,
				this.maxRetriesOnError,
			);

			// Create service protocol entries combining scribe and deli states.
			const serviceProtocolEntries = generateServiceProtocolEntries(
				op.additionalContent,
				JSON.stringify(checkpoint),
			);

			let uploadHandle: string = "";

			if (this.enableWholeSummaryUpload) {
				uploadHandle = await requestWithRetry(
					async () =>
						this.updateWholeSummary(
							content.head,
							content.handle,
							protocolEntries,
							logTailEntries,
							serviceProtocolEntries,
							checkpoint.protocolState.sequenceNumber,
							content.details?.includesProtocolTree,
						),
					"writeClientSummary_updateWholeSummary",
					this.lumberProperties,
					shouldRetryNetworkError,
					this.maxRetriesOnError,
				);
			} else {
				const [logTailTree, protocolTree, serviceProtocolTree, appSummaryTree] =
					await Promise.all([
						requestWithRetry(
							async () => this.summaryStorage.createTree({ entries: logTailEntries }),
							"writeClientSummary_createLogTailTree",
							this.lumberProperties,
							shouldRetryNetworkError,
							this.maxRetriesOnError,
						),
						requestWithRetry(
							async () =>
								this.summaryStorage.createTree({ entries: protocolEntries }),
							"writeClientSummary_createProtocolTree",
							this.lumberProperties,
							shouldRetryNetworkError,
							this.maxRetriesOnError,
						),
						requestWithRetry(
							async () =>
								this.summaryStorage.createTree({ entries: serviceProtocolEntries }),
							"writeClientSummary_createServiceProtocolTree",
							this.lumberProperties,
							shouldRetryNetworkError,
							this.maxRetriesOnError,
						),
						requestWithRetry(
							async () => this.summaryStorage.getTree(content.handle, false),
							"writeClientSummary_getAppSummaryTree",
							this.lumberProperties,
							shouldRetryNetworkError,
							this.maxRetriesOnError,
						),
					]);

				// Combine the app summary with .protocol
				const newTreeEntries = mergeAppAndProtocolTree(appSummaryTree, protocolTree);

				// Now combine with .logtail and .serviceProtocol
				newTreeEntries.push(
					{
						mode: FileMode.Directory,
						path: ".logTail",
						sha: logTailTree.sha,
						type: "tree",
					},
					{
						mode: FileMode.Directory,
						path: ".serviceProtocol",
						sha: serviceProtocolTree.sha,
						type: "tree",
					},
				);

				// Finally perform the write to git
				const gitTree = await requestWithRetry(
					async () => this.summaryStorage.createGitTree({ tree: newTreeEntries }),
					"writeClientSummary_createGitTree",
					this.lumberProperties,
					shouldRetryNetworkError,
					this.maxRetriesOnError,
				);

				const commitParams: ICreateCommitParams = {
					author: {
						date: new Date().toISOString(),
						email: "praguertdev@microsoft.com",
						name: "Routerlicious Service",
					},
					message: content.message,
					parents: content.parents,
					tree: gitTree.sha,
				};

				const commit = await requestWithRetry(
					async () => this.summaryStorage.createCommit(commitParams),
					"writeClientSummary_createCommit",
					this.lumberProperties,
					shouldRetryNetworkError,
					this.maxRetriesOnError,
				);
				uploadHandle = commit.sha;

				await (existingRef
					? requestWithRetry(
							async () =>
								this.summaryStorage.upsertRef(this.documentId, uploadHandle),
							"writeClientSummary_upsertRef",
							this.lumberProperties,
							shouldRetryNetworkError,
							this.maxRetriesOnError,
					  )
					: requestWithRetry(
							async () =>
								this.summaryStorage.createRef(this.documentId, uploadHandle),
							"writeClientSummary_createRef",
							this.lumberProperties,
							shouldRetryNetworkError,
							this.maxRetriesOnError,
					  ));
			}
			clientSummaryMetric.success(`Client summary success`);
			return {
				message: {
					handle: uploadHandle,
					summaryProposal: {
						summarySequenceNumber: op.sequenceNumber,
					},
				},
				status: true,
			};
		} catch (error: any) {
			clientSummaryMetric.error(`Client summary failed`, error);

			if (error instanceof Error && error?.name === "NetworkError") {
				const networkError = error as NetworkError;
				if (!networkError.isFatal) {
					return {
						message: {
							message: `A non-fatal error happened when trying to write client summary. Error: ${safeStringify(
								networkError.details,
							)}`,
							summaryProposal: {
								summarySequenceNumber: op.sequenceNumber,
							},
						},
						status: false,
					};
				}
			}
			throw error;
		}
	}

	/**
	 * Helper function that writes a new summary. Unlike client summaries, service summaries can be
	 * triggered at any point in time. At first it fetches the last summary written by client. Once done,
	 * it appends .protocol, .serviceProtocol, and .logTail to that summary. Finally it creates
	 * a git summary, commits the change, and finalizes the ref.
	 * @param op - Operation that triggered the write
	 * @param currentProtocolHead - Protocol head of the last client summary.
	 * @param checkpoint - State of the scribe service at current sequence number
	 * @param pendingOps - List of unprocessed ops currently present in memory
	 * @returns a boolean, which represents the success or failure of the write
	 */
	public async writeServiceSummary(
		op: ISequencedDocumentAugmentedMessage,
		currentProtocolHead: number,
		checkpoint: IScribe,
		pendingOps: ISequencedOperationMessage[],
		isEphemeralContainer?: boolean,
	): Promise<string | false> {
		const serviceSummaryMetric = Lumberjack.newLumberMetric(LumberEventName.ServiceSummary);
		this.setSummaryProperties(serviceSummaryMetric, op, isEphemeralContainer);
		try {
			const existingRef = await requestWithRetry(
				async () => this.summaryStorage.getRef(encodeURIComponent(this.documentId)),
				"writeServiceSummary_getRef",
				this.lumberProperties,
				shouldRetryNetworkError,
				this.maxRetriesOnError,
			);

			// Client assumes at least one app generated summary. To keep compatibility
			// for now, service summary requires at least one prior client generated summary.
			// TODO: With default createNew() flow, we can remove this check.
			if (!existingRef) {
				serviceSummaryMetric.error(`No prior summaries found`);
				return false;
			}

			if (!op.additionalContent) {
				// this is a mixed mode edge case that can occur if the "generateServiceSummary" config
				// was disabled in a previous deployment and is now enabled in the next one
				serviceSummaryMetric.error(`Additional content is not defined`);
				return false;
			}

			// Generate a tree of logTail starting from the last protocol state.
			const logTailEntries = await requestWithRetry(
				async () =>
					this.generateLogtailEntries(
						currentProtocolHead,
						op.sequenceNumber + 1,
						pendingOps,
					),
				"writeServiceSummary_generateLogtailEntries",
				this.lumberProperties,
				shouldRetryNetworkError,
				this.maxRetriesOnError,
			);

			// Create service protocol entries combining scribe and deli states.
			const serviceProtocolEntries = generateServiceProtocolEntries(
				op.additionalContent,
				JSON.stringify(checkpoint),
			);

			let uploadedSummaryHandle: string;
			if (this.enableWholeSummaryUpload) {
				uploadedSummaryHandle = await requestWithRetry(
					async () =>
						this.createWholeServiceSummary(
							existingRef.object.sha,
							logTailEntries,
							serviceProtocolEntries,
							op.sequenceNumber,
						),
					"writeServiceSummary_createWholeServiceSummary",
					this.lumberProperties,
					shouldRetryNetworkError,
					this.maxRetriesOnError,
				);
			} else {
				// Fetch the last commit and summary tree. Create new trees with logTail and serviceProtocol.
				const lastCommit = await requestWithRetry(
					async () => this.summaryStorage.getCommit(existingRef.object.sha),
					"writeServiceSummary_getCommit",
					this.lumberProperties,
					shouldRetryNetworkError,
					this.maxRetriesOnError,
				);
				const [logTailTree, serviceProtocolTree, lastSummaryTree] = await Promise.all([
					requestWithRetry(
						async () => this.summaryStorage.createTree({ entries: logTailEntries }),
						"writeServiceSummary_createLogTailTree",
						this.lumberProperties,
						shouldRetryNetworkError,
						this.maxRetriesOnError,
					),
					requestWithRetry(
						async () =>
							this.summaryStorage.createTree({ entries: serviceProtocolEntries }),
						"writeServiceSummary_createServiceProtocolTree",
						this.lumberProperties,
						shouldRetryNetworkError,
						this.maxRetriesOnError,
					),
					requestWithRetry(
						async () => this.summaryStorage.getTree(lastCommit.tree.sha, false),
						"writeServiceSummary_getLastSummaryTree",
						this.lumberProperties,
						shouldRetryNetworkError,
						this.maxRetriesOnError,
					),
				]);

				// Combine the last summary tree with .logTail and .serviceProtocol
				const newTreeEntries = lastSummaryTree.tree.map((value) => {
					const createTreeEntry: ICreateTreeEntry = {
						mode: value.mode,
						path: value.path,
						sha: value.sha,
						type: value.type,
					};
					return createTreeEntry;
				});
				newTreeEntries.push(
					{
						mode: FileMode.Directory,
						path: ".logTail",
						sha: logTailTree.sha,
						type: "tree",
					},
					{
						mode: FileMode.Directory,
						path: ".serviceProtocol",
						sha: serviceProtocolTree.sha,
						type: "tree",
					},
				);

				// Finally perform the write to git
				const gitTree = await requestWithRetry(
					async () => this.summaryStorage.createGitTree({ tree: newTreeEntries }),
					"writeServiceSummary_createGitTree",
					this.lumberProperties,
					shouldRetryNetworkError,
					this.maxRetriesOnError,
				);
				const commitParams: ICreateCommitParams = {
					author: {
						date: new Date().toISOString(),
						email: "praguertdev@microsoft.com",
						name: "Routerlicious Service",
					},
					message: `Service Summary @${op.sequenceNumber}`,
					parents: [lastCommit.sha],
					tree: gitTree.sha,
				};

				// Finally commit the service summary and update the ref.
				const commit = await requestWithRetry(
					async () => this.summaryStorage.createCommit(commitParams),
					"writeServiceSummary_createCommit",
					this.lumberProperties,
					shouldRetryNetworkError,
					this.maxRetriesOnError,
				);
				await requestWithRetry(
					async () => this.summaryStorage.upsertRef(this.documentId, commit.sha),
					"writeServiceSummary_upsertRef",
					this.lumberProperties,
					shouldRetryNetworkError,
					this.maxRetriesOnError,
				);
				uploadedSummaryHandle = commit.sha;
			}
			serviceSummaryMetric.success(`Service summary success`);
			// Return the summary handle (commit sha) for the new service summary so that
			// it can be added to validParentSummaries.
			return uploadedSummaryHandle;
		} catch (error) {
			serviceSummaryMetric.error(`Service summary failed`, error);
			if (
				error instanceof Error &&
				error?.name === "NetworkError" &&
				!(error as NetworkError).isFatal
			) {
				return false;
			}
			throw error;
		}
	}

	private setSummaryProperties(
		summaryMetric: Lumber<LumberEventName.ClientSummary | LumberEventName.ServiceSummary>,
		op: ISequencedDocumentAugmentedMessage,
		isEphemeralContainer?: boolean,
	): void {
		summaryMetric.setProperties(getLumberBaseProperties(this.documentId, this.tenantId));
		summaryMetric.setProperties({
			[CommonProperties.clientId]: op.clientId,
			[CommonProperties.sequenceNumber]: op.sequenceNumber,
			[CommonProperties.minSequenceNumber]: op.minimumSequenceNumber,
			[CommonProperties.isEphemeralContainer]: isEphemeralContainer ?? false,
		});
	}

	private async generateLogtailEntries(
		gt: number,
		lt: number,
		pending: ISequencedOperationMessage[],
	): Promise<ITreeEntry[]> {
		let to = lt;
		const from = gt;
		const LogtailRequestedLength = to - from - 1;

		if (LogtailRequestedLength > this.maxLogtailLength) {
			Lumberjack.warning(`Limiting logtail length`, this.lumberProperties);
			to = from + this.maxLogtailLength + 1;
		}

		const logTail = await this.getLogTail(from, to, pending);

		return [
			{
				mode: FileMode.File,
				path: "logTail",
				type: TreeEntry.Blob,
				value: {
					contents: JSON.stringify(logTail),
					encoding: "utf-8",
				},
			},
		];
	}

	private async getLogTail(
		gt: number,
		lt: number,
		pending: ISequencedOperationMessage[],
	): Promise<ISequencedDocumentMessage[]> {
		if (lt - gt <= 1) {
			return [];
		}

		// Define these for the finally block, these should be used as const
		let logTailFromLastSummary: ISequencedDocumentMessage[] = [];
		let logTailFromPending: ISequencedDocumentMessage[] = [];
		let logtailFromMemory: ISequencedDocumentMessage[] = [];
		let logtailGaps: number[][] = [];
		let retrievedGaps: ISequencedDocumentMessage[][] = [];
		let finalLogTail: ISequencedDocumentMessage[] = [];

		try {
			// Read from last summary logtail first, which is in memory
			logTailFromLastSummary =
				this.lastSummaryMessages?.filter(
					(ms) => ms.sequenceNumber > gt && ms.sequenceNumber < lt,
				) ?? [];

			logTailFromPending = pending
				.filter(
					(op) => op.operation.sequenceNumber > gt && op.operation.sequenceNumber < lt,
				)
				.map((op) => op.operation);

			logtailFromMemory = dedupeSortedArray(
				mergeSortedArrays(
					logTailFromLastSummary,
					logTailFromPending,
					(opS, opP) => opS.sequenceNumber - opP.sequenceNumber,
				),
				(op) => op.sequenceNumber,
			);

			logtailGaps = this.findMissingGapsInLogtail(logtailFromMemory, gt + 1, lt - 1);
			if (logtailGaps.length === 0) {
				finalLogTail = logtailFromMemory;
				return finalLogTail;
			}

			retrievedGaps = await Promise.all(
				logtailGaps.map(async ([gapBeginInclusive, gapEndInclusive]) => {
					return this.retrieveOps(gapBeginInclusive - 1, gapEndInclusive + 1);
				}),
			);

			const nonEmptyRetrievedGaps = retrievedGaps.filter((gap) => gap.length > 0);

			if (nonEmptyRetrievedGaps.length === 0) {
				finalLogTail = logtailFromMemory;
				return finalLogTail;
			}

			const minHeapComparator = (
				a: ISequencedDocumentMessage,
				b: ISequencedDocumentMessage,
			): 1 | 0 | -1 => {
				if (a.sequenceNumber < b.sequenceNumber) {
					return -1;
				}
				if (a.sequenceNumber > b.sequenceNumber) {
					return 1;
				}
				return 0;
			};

			finalLogTail = dedupeSortedArray(
				mergeKArrays<ISequencedDocumentMessage>(
					[...nonEmptyRetrievedGaps, logtailFromMemory],
					minHeapComparator,
				),
				(op) => op.sequenceNumber,
			);
			return finalLogTail;
		} finally {
			const logtailRangeFromLastSummary = convertSortedNumberArrayToRanges(
				logTailFromLastSummary.map((op) => op.sequenceNumber),
			);
			const logtailRangeFromPending = convertSortedNumberArrayToRanges(
				logTailFromPending.map((op) => op.sequenceNumber),
			);
			const logtailRangeFromMemory = convertSortedNumberArrayToRanges(
				logtailFromMemory.map((op) => op.sequenceNumber),
			);
			const retrievedGapsRange = retrievedGaps.map((retrievedGap) =>
				convertSortedNumberArrayToRanges(retrievedGap.map((op) => op.sequenceNumber)),
			);
			const finalLogtailRange = convertSortedNumberArrayToRanges(
				finalLogTail.map((op) => op.sequenceNumber),
			);
			Lumberjack.info(
				`LogTail of length ${finalLogTail.length} fetched from seq no ${gt} to ${lt}`,
				{
					...this.lumberProperties,
					logtailRangeFromLastSummary,
					logtailRangeFromPending,
					logtailRangeFromMemory,
					logtailGaps,
					retrievedGapsRange,
					finalLogtailRange,
				},
			);
		}
	}

	private async retrieveOps(gt: number, lt: number): Promise<ISequencedDocumentMessage[]> {
		if (this.getDeltasViaAlfred && this.deltaService !== undefined) {
			return this.deltaService.getDeltas(
				"",
				this.tenantId,
				this.documentId,
				gt,
				lt,
				"scribe",
			);
		}

		if (this.opStorage === undefined) {
			return [];
		}

		const query = {
			"documentId": this.documentId,
			"tenantId": this.tenantId,
			"operation.sequenceNumber": {
				$gt: gt,
				$lt: lt,
			},
		};

		// Fetching ops from the local db
		// False positive: `this.opStorage` is not a plain array, the second argument to `find()` is not "thisArg".
		// eslint-disable-next-line unicorn/no-array-method-this-argument
		const logTailOpMessage = await this.opStorage.find(query, {
			"operation.sequenceNumber": 1,
		});
		return logTailOpMessage.map((log) => log.operation);
	}

	private findMissingGapsInLogtail(
		existingTail: ISequencedDocumentMessage[],
		fromInclusive: number,
		toInclusive: number,
	): number[][] {
		const gaps: number[][] = [];
		let next = fromInclusive;
		const existingTailWithInRange = existingTail.filter(
			(op) => op.sequenceNumber >= fromInclusive && op.sequenceNumber <= toInclusive,
		);
		for (const op of existingTailWithInRange) {
			if (op.sequenceNumber > next) {
				gaps.push([next, op.sequenceNumber - 1]);
			}
			next = op.sequenceNumber + 1;
		}

		if (next <= toInclusive) {
			gaps.push([next, toInclusive]);
		}
		return gaps;
	}

	// When 'includesProtocolTree' is set, client uploads two top level nodes: '.app' and '.protocol'.
	// For now, we are ignoring '.protocol' node and uploading our own version (TODO: validate what client uploads)
	// However, we still need to refer to '.app' node, which is done by pointing to 'handle/.app'.
	private async updateWholeSummary(
		parentHandle: string,
		appSummaryHandle: string,
		protocolEntries: ITreeEntry[],
		logTailEntries: ITreeEntry[],
		serviceProtocolEntries: ITreeEntry[],
		sequenceNumber: number,
		includesProtocolTree: boolean | undefined,
	): Promise<string> {
		const fullTree: ISummaryTree = {
			type: SummaryType.Tree,
			tree: {
				".protocol": this.createSummaryTreeFromEntry(protocolEntries),
				".logTail": this.createSummaryTreeFromEntry(logTailEntries),
				".serviceProtocol": this.createSummaryTreeFromEntry(serviceProtocolEntries),
				".app": {
					type: SummaryType.Handle,
					handle: includesProtocolTree
						? buildTreePath(appSummaryHandle, ".app")
						: appSummaryHandle,
					handleType: SummaryType.Tree,
					embedded: true,
				},
			},
		};
		const uploadManager = new WholeSummaryUploadManager(this.summaryStorage);
		const uploadHandle = await uploadManager.writeSummaryTree(
			fullTree,
			parentHandle,
			"container",
			sequenceNumber,
		);
		return uploadHandle;
	}

	private async createWholeServiceSummary(
		parentHandle: string,
		logTailEntries: ITreeEntry[],
		serviceProtocolEntries: ITreeEntry[],
		sequenceNumber: number,
	): Promise<string> {
		const fullTree: ISummaryTree = {
			type: SummaryType.Tree,
			tree: {
				".logTail": this.createSummaryTreeFromEntry(logTailEntries),
				".serviceProtocol": this.createSummaryTreeFromEntry(serviceProtocolEntries),
				".protocol": {
					type: SummaryType.Handle,
					handle: ".protocol",
					handleType: SummaryType.Tree,
				},
				".app": { type: SummaryType.Handle, handle: ".app", handleType: SummaryType.Tree },
			},
		};
		const uploadManager = new WholeSummaryUploadManager(this.summaryStorage);
		const uploadHandle = await uploadManager.writeSummaryTree(
			fullTree,
			parentHandle,
			"container",
			sequenceNumber,
		);
		return uploadHandle;
	}

	// We should optimize our API so that we don't have to do this conversion.
	private createSummaryTreeFromEntry(treeEntries: ITreeEntry[]): ISummaryTree {
		const tree = this.createSummaryTreeFromEntryCore(treeEntries);
		return {
			tree,
			type: SummaryType.Tree,
		};
	}

	private createSummaryTreeFromEntryCore(treeEntries: ITreeEntry[]): {
		[path: string]: SummaryObject;
	} {
		const tree: { [path: string]: SummaryObject } = {};
		for (const treeEntry of treeEntries) {
			let summaryObject: SummaryObject;
			switch (treeEntry.type) {
				case TreeEntry.Attachment: {
					summaryObject = {
						type: SummaryType.Attachment,
						id: treeEntry.value.id,
					};
					break;
				}
				case TreeEntry.Blob: {
					summaryObject = {
						type: SummaryType.Blob,
						content:
							treeEntry.value.encoding === "base64"
								? fromBase64ToUtf8(treeEntry.value.contents)
								: treeEntry.value.contents,
					};
					break;
				}
				case TreeEntry.Tree: {
					summaryObject = {
						type: SummaryType.Tree,
						unreferenced: treeEntry.value.unreferenced,
						tree: this.createSummaryTreeFromEntryCore(treeEntry.value.entries),
					};
					break;
				}
				default: {
					throw new Error(`Unexpected TreeEntry type when converting ITreeEntry.`);
				}
			}

			tree[treeEntry.path] = summaryObject;
		}

		return tree;
	}
}
