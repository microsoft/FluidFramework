/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IFluidHandleContext } from "@fluidframework/core-interfaces/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import {
	type IDocumentMessage,
	type ISummaryAck,
	type ISummaryContent,
	type ISummaryNack,
	MessageType,
	type ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { mergeStats } from "@fluidframework/runtime-utils/internal";
import {
	type ITelemetryLoggerExt,
	createChildLogger,
	raiseConnectedEvent,
} from "@fluidframework/telemetry-utils/internal";
import {
	type IMockContainerRuntimeOptions,
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
	MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils/internal";
import { v4 as uuid } from "uuid";

import { type ISummaryConfiguration } from "../../index.js";
import {
	IConnectableRuntime,
	type IConnectedEvents,
	type IConnectedState,
	type IGeneratedSummaryStats,
	type IRefreshSummaryAckOptions,
	type ISubmitSummaryOptions,
	ISummarizerClientElection,
	ISummarizerClientElectionEvents,
	type ISummarizerInternalsProvider,
	type ISummarizerRuntime,
	RunWhileConnectedCoordinator,
	type SubmitSummaryResult,
	Summarizer,
	SummaryCollection,
	SummaryManager,
} from "../../summary/index.js";
import type { IThrottler } from "../../throttler.js";

export class MockContainerRuntimeFactoryForSummarizer extends MockContainerRuntimeFactoryForReconnection {
	override createContainerRuntime(
		dataStoreRuntime: MockFluidDataStoreRuntime,
		_?: { minimumSequenceNumber?: number },
	): MockContainerRuntimeForSummarizer {
		const containerRuntime = new MockContainerRuntimeForSummarizer(
			dataStoreRuntime,
			this,
			this.runtimeOptions,
		);
		this.runtimes.add(containerRuntime);
		return containerRuntime;
	}
}

export interface IMockContainerRuntimeForSummarizerOptions
	extends IMockContainerRuntimeOptions {
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
	public readonly baseLogger = createChildLogger();
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
	) {
		// trackRemoteOps is needed for replaying all ops on creating new ContainerRuntime
		super(dataStoreRuntime, factory, runtimeOptions, { trackRemoteOps: true });

		this.deltaManager.on("op", (message: ISequencedDocumentMessage) => {
			this.emit("op", message);
		});

		this.summarizerClientElection = new MockSummarizerClientElection(this.clientId);
		this.connectedState = new MockConnectedState(this.baseLogger, this.clientId);
		this.summaryCollection = new SummaryCollection(this.deltaManager, this.baseLogger);

		const summaryConfiguration: ISummaryConfiguration = {
			...DefaultSummaryConfiguration,
			...runtimeOptions.summaryConfiguration,
		};

		this.summarizer = new Summarizer(
			this /* summarizerRuntime */,
			() => summaryConfiguration /* configurationGetter */,
			this /* ISummarizerInternalsProvider */,
			{} as unknown as IFluidHandleContext /* handleContext */,
			this.summaryCollection,
			async (runtime: IConnectableRuntime) =>
				RunWhileConnectedCoordinator.create(runtime, () => this.deltaManager.active),
		);

		this.summaryManager = new SummaryManager(
			this.summarizerClientElection,
			this.connectedState,
			this.summaryCollection,
			this.baseLogger,
			async () => this.summarizer,
			new MockThrottler(),
		);
		this.summaryManager.start();
	}

	private nackScheduled = false;
	/**
	 * Prepare a SummaryNack to be sent by the server
	 */
	public prepareSummaryNack(): void {
		this.nackScheduled = true;
	}

	/**
	 * Call on the Summarizer object to summarize
	 */
	public async summarize(): Promise<void> {
		const result = this.summarizer.summarizeOnDemand({
			reason: "fuzzTest",
			retryOnFailure: false,
		});
		await Promise.all([
			result.summarySubmitted,
			result.summaryOpBroadcasted,
			result.receivedSummaryAckOrNack,
		]);
	}

	public async submitSummary(options: ISubmitSummaryOptions): Promise<SubmitSummaryResult> {
		const handle = uuid();
		const summaryMessage: ISummaryContent = {
			handle,
			head: "",
			message: "",
			parents: [],
		};
		const clientSequenceNumber = ++this.deltaManager.clientSequenceNumber;
		const referenceSequenceNumber = this.deltaManager.lastSequenceNumber;
		const minimumSequenceNumber = this.factory.getMinSeq();

		const summarizeMessage: IDocumentMessage = {
			type: MessageType.Summarize,
			clientSequenceNumber,
			referenceSequenceNumber,
			contents: summaryMessage,
		};
		this.deltaManager.outbound.push([summarizeMessage]);
		this.addPendingMessage(
			summarizeMessage.contents,
			summarizeMessage.metadata,
			summarizeMessage.clientSequenceNumber,
		);

		this.factory.processAllMessages();
		this.scheduleAckNack(
			this.nackScheduled /* isNack */,
			handle,
			this.deltaManager.lastSequenceNumber,
		);
		this.nackScheduled = false;

		const summaryStats: IGeneratedSummaryStats = {
			...mergeStats(),
			dataStoreCount: 1,
			summarizedDataStoreCount: 1,
			summaryNumber: 1,
		};

		return {
			stage: "submit",
			handle,
			clientSequenceNumber,
			referenceSequenceNumber,
			minimumSequenceNumber,
			submitOpDuration: 0,
			uploadDuration: 0,
			generateDuration: 0,
			summaryTree: {
				type: SummaryType.Tree,
				tree: {},
			},
			summaryStats,
		};
	}

	private scheduleAckNack(isNack: boolean, handle: string, summarySequenceNumber: number) {
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		Promise.resolve().then(() => {
			const contents: ISummaryAck | ISummaryNack = {
				handle,
				summaryProposal: {
					summarySequenceNumber,
				},
			};

			const summaryAckMessage = {
				type: isNack ? MessageType.SummaryNack : MessageType.SummaryAck,
				clientSequenceNumber: ++this.deltaManager.clientSequenceNumber,
				referenceSequenceNumber: this.deltaManager.lastSequenceNumber,
				contents,
			};
			this.deltaManager.outbound.push([summaryAckMessage]);
			this.addPendingMessage(
				summaryAckMessage.contents,
				undefined,
				summaryAckMessage.clientSequenceNumber,
			);
			this.factory.processAllMessages();
		});
	}

	public async refreshLatestSummaryAck(options: IRefreshSummaryAckOptions): Promise<void> {
		// Do nothing
	}

	public setConnectedState(value: boolean): void {
		super.setConnectedState(value);

		this.connectedState.setConnectedState(value, this.clientId);
		this.summarizerClientElection.setClientId(this.clientId);
	}

	public closeFn(): void {
		this.disposeFn();
	}

	public disposed: boolean = false;
	public disposeFn(): void {
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

class MockConnectedState
	extends TypedEventEmitter<IConnectedEvents>
	implements IConnectedState
{
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
