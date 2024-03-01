/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
	type IMockContainerRuntimeOptions,
	MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	createChildLogger,
	raiseConnectedEvent,
	type ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils";
import {
	MessageType,
	type ISequencedDocumentMessage,
	type ISummaryContent,
	SummaryType,
	type ISummaryNack,
	type IDocumentMessage,
} from "@fluidframework/protocol-definitions";
import { mergeStats } from "@fluidframework/runtime-utils";
import { type ISummaryConfiguration } from "../../index.js";
import {
	IConnectableRuntime,
	Summarizer,
	ISummarizerClientElectionEvents,
	SummaryManager,
	ISummarizerClientElection,
	type IConnectedState,
	type IConnectedEvents,
	SummaryCollection,
	type ISummarizerRuntime,
	type ISummarizerInternalsProvider,
	type ISubmitSummaryOptions,
	type SubmitSummaryResult,
	type IRefreshSummaryAckOptions,
	RunWhileConnectedCoordinator,
	type IGeneratedSummaryStats,
} from "../../summary/index.js";
import type { IThrottler } from "../../throttler.js";

export class MockContainerRuntimeFactoryForSummarizer extends MockContainerRuntimeFactoryForReconnection {
	override createContainerRuntime(
		dataStoreRuntime: MockFluidDataStoreRuntime,
		overrides?: { minimumSequenceNumber?: number },
	): MockContainerRuntimeForSummarizer {
		const containerRuntime = new MockContainerRuntimeForSummarizer(
			dataStoreRuntime,
			this,
			this.runtimeOptions,
			overrides,
		);
		this.runtimes.add(containerRuntime);
		return containerRuntime;
	}
}

export interface IMockContainerRuntimeForSummarizerOptions extends IMockContainerRuntimeOptions {
	summaryConfiguration?: ISummaryConfiguration;
}

const DefaultSummaryConfiguration: ISummaryConfiguration = {
	state: "disableHeuristics",
	maxAckWaitTime: 3 * 60 * 1000, // 3 mins.
	maxOpsSinceLastSummary: 7000,
	initialSummarizerDelayMs: 5 * 1000, // 5 secs.
};

export class MockContainerRuntimeForSummarizer
	extends MockContainerRuntimeForReconnection
	implements ISummarizerRuntime, ISummarizerInternalsProvider
{
	public readonly logger = createChildLogger();
	public readonly summarizerClientId: string | undefined;
	public readonly summarizer: Summarizer;

	private readonly summaryManager: SummaryManager;
	private readonly connectedState: MockConnectedState;
	private readonly summaryCollection: SummaryCollection;
	private readonly summarizerClientElection: MockSummarizerClientElection;

	constructor(
		dataStoreRuntime: MockFluidDataStoreRuntime,
		factory: MockContainerRuntimeFactoryForSummarizer,
		runtimeOptions: IMockContainerRuntimeForSummarizerOptions = {},
		overrides?: { minimumSequenceNumber?: number },
	) {
		super(dataStoreRuntime, factory, runtimeOptions, overrides);

		this.deltaManager.on("op", (message: ISequencedDocumentMessage) => {
			this.emit("op", message);
		});

		this.summarizerClientElection = new MockSummarizerClientElection(this.clientId);
		this.connectedState = new MockConnectedState(this.logger, this.clientId);
		this.summaryCollection = new SummaryCollection(this.deltaManager, this.logger);

		const summaryConfiguration: ISummaryConfiguration = {
			...DefaultSummaryConfiguration,
			...runtimeOptions.summaryConfiguration,
		};

		this.summarizer = new Summarizer(
			this /* summarizerRuntime */,
			() => summaryConfiguration /* configurationGetter */,
			this /* ISummarizerInternalsProvider */,
			{} as any /* handleContext */,
			this.summaryCollection,
			async (runtime: IConnectableRuntime) =>
				RunWhileConnectedCoordinator.create(runtime, () => this.deltaManager.active),
		);

		this.summaryManager = new SummaryManager(
			this.summarizerClientElection,
			this.connectedState,
			this.summaryCollection,
			this.logger,
			async () => this.summarizer,
			new MockThrottler(),
		);
		this.summaryManager.start();
	}

	/** Prepare a SummaryNack to be sent by the server */
	public prepareSummaryNack() {
		const contents: ISummaryNack = {
			summaryProposal: {
				summarySequenceNumber: this.deltaManager.lastSequenceNumber,
			},
		};
		this.deltaManager.prepareInboundResponse(MessageType.SummaryNack, contents);
	}

	/** Call on the Summarizer object to summarize */
	public async summarize() {
		const result = this.summarizer.summarizeOnDemand({
			reason: "fuzzTest",
			retryOnFailure: false,
		});
		return Promise.all([
			result.summarySubmitted,
			result.summaryOpBroadcasted,
			result.receivedSummaryAckOrNack,
		]);
	}

	public async submitSummary(options: ISubmitSummaryOptions): Promise<SubmitSummaryResult> {
		const summaryMessage: ISummaryContent = {
			handle: "",
			head: "",
			message: "",
			parents: [],
		};
		const referenceSequenceNumber = this.deltaManager.lastSequenceNumber;

		const summarizeMessage: IDocumentMessage = {
			type: MessageType.Summarize,
			clientSequenceNumber: 0,
			referenceSequenceNumber,
			contents: summaryMessage,
		};
		this.deltaManager.inbound.push({
			...summarizeMessage,
			clientId: this.clientId,
			sequenceNumber: 0,
			minimumSequenceNumber: 0,
			timestamp: 0,
		});
		this.deltaManager.outbound.push([summarizeMessage]);

		const summaryStats: IGeneratedSummaryStats = {
			...mergeStats(),
			dataStoreCount: 1,
			summarizedDataStoreCount: 1,
			summaryNumber: 1,
		};

		return {
			stage: "submit",
			handle: "",
			clientSequenceNumber: -1,
			referenceSequenceNumber,
			minimumSequenceNumber: -1,
			submitOpDuration: 0,
			uploadDuration: 0,
			generateDuration: 0,
			forcedFullTree: false,
			summaryTree: {
				type: SummaryType.Tree,
				tree: {},
			},
			summaryStats,
		};
	}

	public async refreshLatestSummaryAck(options: IRefreshSummaryAckOptions): Promise<void> {
		// Do nothing
	}

	public setConnectedState(value: boolean) {
		super.setConnectedState(value);

		this.connectedState.setConnectedState(value, this.clientId);
		this.summarizerClientElection.setClientId(this.clientId);
	}

	public closeFn() {
		this.disposeFn();
	}

	public disposed: boolean = false;
	public disposeFn() {
		this.connected = false;
		this.disposed = true;
		this.summaryManager.dispose();
		this.summarizer.dispose();
		this.deltaManager.dispose();
	}
}

class MockSummarizerClientElection
	extends TypedEventEmitter<ISummarizerClientElectionEvents>
	implements ISummarizerClientElection
{
	public electedClientId: string | undefined;
	public electedParentId: string | undefined;

	constructor(clientId: string) {
		super();
		this.setClientId(clientId);
	}

	public setClientId(clientId: string) {
		this.electedClientId = clientId;
		this.electedParentId = clientId;
	}
}

class MockConnectedState extends TypedEventEmitter<IConnectedEvents> implements IConnectedState {
	public connected: boolean = false;

	constructor(
		private readonly logger: ITelemetryLoggerExt,
		public clientId: string,
	) {
		super();
	}

	public setConnectedState(connected: boolean, clientId: string): void {
		if (this.connected === connected) {
			return;
		}
		this.clientId = clientId;

		raiseConnectedEvent(this.logger, this, connected, clientId);
	}
}

class MockThrottler implements IThrottler {
	public getDelay = () => 0;
	public numAttempts = 3;
	public delayWindowMs = 0;
	public maxDelayMs = 0;
	public delayFn = () => 0;
}
