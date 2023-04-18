/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getW3CData } from "@fluidframework/driver-base";
import {
	IDeltaStorageService,
	IDocumentDeltaStorageService,
	IDeltasFetchResult,
	IStream,
} from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { readAndParse, requestOps, emptyMessageStream } from "@fluidframework/driver-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { PerformanceEvent, TelemetryNullLogger } from "@fluidframework/telemetry-utils";
import { DocumentStorageService } from "./documentStorageService";
import { RestWrapper } from "./restWrapperBase";

const MaxBatchDeltas = 2000; // Maximum number of ops we can fetch at a time

/**
 * Storage service limited to only being able to fetch documents for a specific document
 */
export class DocumentDeltaStorageService implements IDocumentDeltaStorageService {
	constructor(
		private readonly tenantId: string,
		private readonly id: string,
		private readonly deltaStorageService: IDeltaStorageService,
		private readonly documentStorageService: DocumentStorageService,
		private readonly logger: ITelemetryLogger,
	) {}

	private logtailSha: string | undefined = this.documentStorageService.logTailSha;

	fetchMessages(
		from: number,
		to: number | undefined,
		abortSignal?: AbortSignal,
		cachedOnly?: boolean,
		fetchReason?: string,
	): IStream<ISequencedDocumentMessage[]> {
		if (cachedOnly) {
			return emptyMessageStream;
		}
		return requestOps(
			this.getCore.bind(this),
			// Staging: starting with no concurrency, listening for feedback first.
			// In future releases we will switch to actual concurrency
			1, // concurrency
			from, // inclusive
			to, // exclusive
			MaxBatchDeltas,
			new TelemetryNullLogger(),
			abortSignal,
			fetchReason,
		);
	}

	private async getCore(from: number, to: number): Promise<IDeltasFetchResult> {
		const opsFromLogTail = this.logtailSha
			? await readAndParse<ISequencedDocumentMessage[]>(
					this.documentStorageService,
					this.logtailSha,
			  )
			: [];

		this.logtailSha = undefined;
		if (opsFromLogTail.length > 0) {
			try {
				const messages = opsFromLogTail.filter((op, i) => {
					// throw if the sequence numbers in logtail are not contiguous
					if (i > 0 && op.sequenceNumber !== opsFromLogTail[i - 1].sequenceNumber + 1) {
						throw new Error("Log tail ops are not contiguous");
					}
					return op.sequenceNumber >= from;
				});

				if (messages.length > 0 && messages[0].sequenceNumber === from) {
					return { messages, partialResult: true };
				}
			} catch (error) {
				this.logger.sendErrorEvent({ eventName: "LogTailReadError" }, error);
			}
		}

		return this.deltaStorageService.get(this.tenantId, this.id, from, to);
	}
}

/**
 * Provides access to the underlying delta storage on the server for routerlicious driver.
 */
export class DeltaStorageService implements IDeltaStorageService {
	constructor(
		private readonly url: string,
		private readonly restWrapper: RestWrapper,
		private readonly logger: ITelemetryLogger,
		private readonly getRestWrapper: () => Promise<RestWrapper> = async () => this.restWrapper,
		private readonly getDeltaStorageUrl: () => string = () => this.url,
	) {}

	public async get(
		tenantId: string,
		id: string,
		from: number, // inclusive
		to: number, // exclusive
	): Promise<IDeltasFetchResult> {
		const ops = await PerformanceEvent.timedExecAsync(
			this.logger,
			{
				eventName: "getDeltas",
				from,
				to,
			},
			async (event) => {
				const restWrapper = await this.getRestWrapper();
				const url = this.getDeltaStorageUrl();
				const response = await restWrapper.get<ISequencedDocumentMessage[]>(url, {
					from: from - 1,
					to,
				});
				event.end({
					length: response.content.length,
					details: JSON.stringify({
						firstOpSeqNumber: response.content[0]?.sequenceNumber,
						lastOpSeqNumber:
							response.content[response.content.length - 1]?.sequenceNumber,
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
