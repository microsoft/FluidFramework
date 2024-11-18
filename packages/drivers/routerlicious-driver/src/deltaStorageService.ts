/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseProperties } from "@fluidframework/core-interfaces";
import { getW3CData, validateMessages } from "@fluidframework/driver-base/internal";
import {
	IDeltaStorageService,
	IDeltasFetchResult,
	IDocumentDeltaStorageService,
	IStream,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import {
	emptyMessageStream,
	readAndParse,
	requestOps,
	streamObserver,
} from "@fluidframework/driver-utils/internal";
import {
	ITelemetryLoggerExt,
	PerformanceEvent,
} from "@fluidframework/telemetry-utils/internal";

import { DocumentStorageService } from "./documentStorageService.js";
import { RestWrapper } from "./restWrapperBase.js";

/**
 * Maximum number of ops we can fetch at a time. This should be kept at 2k, as
 * server determines whether to try to fallback to long-term storage if the ops range requested is larger than
 * what they have locally available in short-term storage. So if we request 2k ops, they know it is not a
 * specific request and they don't fall to long term storage which takes time.
 * Please coordinate to AFR team if this value need to be changed.
 */
const MaxBatchDeltas = 2000;

/**
 * Storage service limited to only being able to fetch documents for a specific document
 */
export class DocumentDeltaStorageService implements IDocumentDeltaStorageService {
	constructor(
		private readonly tenantId: string,
		private readonly id: string,
		private readonly deltaStorageService: IDeltaStorageService,
		private readonly documentStorageService: DocumentStorageService,
		private readonly logger: ITelemetryLoggerExt,
	) {
		this.logtailSha = documentStorageService.logTailSha;
	}

	private logtailSha: string | undefined;
	private snapshotOps: ISequencedDocumentMessage[] | undefined;

	fetchMessages(
		fromTotal: number,
		toTotal: number | undefined,
		abortSignal?: AbortSignal,
		cachedOnly?: boolean,
		fetchReason?: string,
	): IStream<ISequencedDocumentMessage[]> {
		if (cachedOnly) {
			return emptyMessageStream;
		}

		let opsFromSnapshot = 0;
		let opsFromStorage = 0;
		const requestCallback = async (
			from: number,
			to: number,
			telemetryProps: ITelemetryBaseProperties,
		) => {
			this.snapshotOps = this.logtailSha
				? await readAndParse<ISequencedDocumentMessage[]>(
						this.documentStorageService,
						this.logtailSha,
					)
				: [];
			this.logtailSha = undefined;

			if (this.snapshotOps !== undefined && this.snapshotOps.length !== 0) {
				const messages = this.snapshotOps.filter(
					(op) => op.sequenceNumber >= from && op.sequenceNumber < to,
				);
				validateMessages("snapshotOps", messages, from, this.logger, false /* strict */);
				if (messages.length > 0 && messages[0].sequenceNumber === from) {
					this.snapshotOps = this.snapshotOps.filter((op) => op.sequenceNumber >= to);
					opsFromSnapshot += messages.length;
					return { messages, partialResult: true };
				}
				this.snapshotOps = undefined;
			}

			const ops = await this.deltaStorageService.get(
				this.tenantId,
				this.id,
				from,
				to,
				fetchReason,
			);
			validateMessages("storage", ops.messages, from, this.logger, false /* strict */);
			opsFromStorage += ops.messages.length;
			return ops;
		};

		const stream = requestOps(
			async (from: number, to: number, telemetryProps: ITelemetryBaseProperties) => {
				const result = await requestCallback(from, to, telemetryProps);
				// Catch all case, just in case
				validateMessages("catch all", result.messages, from, this.logger);
				return result;
			},
			// Staging: starting with no concurrency, listening for feedback first.
			// In future releases we will switch to actual concurrency
			1, // concurrency
			fromTotal, // inclusive
			toTotal, // exclusive
			MaxBatchDeltas,
			this.logger,
			abortSignal,
			fetchReason,
		);

		return streamObserver(stream, (result) => {
			if (result.done && opsFromSnapshot + opsFromStorage !== 0) {
				this.logger.sendPerformanceEvent({
					eventName: "CacheOpsRetrieved",
					opsFromSnapshot,
					opsFromStorage,
				});
			}
		});
	}
}

/**
 * Provides access to the underlying delta storage on the server for routerlicious driver.
 */
export class DeltaStorageService implements IDeltaStorageService {
	constructor(
		private readonly url: string,
		private readonly restWrapper: RestWrapper,
		private readonly logger: ITelemetryLoggerExt,
		private readonly getRestWrapper: () => Promise<RestWrapper> = async () => this.restWrapper,
		private readonly getDeltaStorageUrl: () => string = () => this.url,
	) {}

	public async get(
		tenantId: string,
		id: string,
		from: number, // inclusive
		to: number, // exclusive
		fetchReason?: string,
	): Promise<IDeltasFetchResult> {
		const ops = await PerformanceEvent.timedExecAsync(
			this.logger,
			{
				eventName: "OpsFetch",
				from,
				to,
			},
			async (event) => {
				const restWrapper = await this.getRestWrapper();
				const url = this.getDeltaStorageUrl();
				const response = await restWrapper.get<ISequencedDocumentMessage[]>(url, {
					from: from - 1,
					to,
					fetchReason: fetchReason ?? "",
				});
				event.end({
					length: response.content.length,
					details: JSON.stringify({
						firstOpSeqNumber: response.content[0]?.sequenceNumber,
						lastOpSeqNumber: response.content[response.content.length - 1]?.sequenceNumber,
					}),
					...response.propsToLog,
					...getW3CData(response.requestUrl, "xmlhttprequest"),
				});
				return response.content;
			},
		);

		// It is assumed that server always returns all the ops that it has in the range that was requested.
		// This may change in the future, if so, we need to adjust and receive "end" value from server in such case.
		return { messages: ops, partialResult: false };
	}
}
