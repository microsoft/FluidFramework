/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDeltaStorageService,
    IDocumentDeltaStorageService,
    IDeltasFetchResult,
} from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { ITokenProvider } from "./tokens";
import { DocumentStorageService } from "./documentStorageService";
import { RouterliciousOrdererRestWrapper } from "./restWrapper";

const MaxBatchDeltas = 2000; // Maximum number of ops we can fetch at a time

/**
 * Storage service limited to only being able to fetch documents for a specific document
 */
export class DocumentDeltaStorageService implements IDocumentDeltaStorageService {
    constructor(
        private readonly tenantId: string,
        private readonly id: string,
        private readonly storageService: IDeltaStorageService,
        private readonly documentStorageService: DocumentStorageService) {
    }

    private logtailSha: string | undefined = this.documentStorageService.logTailSha;

    public async get(from: number, to: number): Promise<IDeltasFetchResult> {
        const opsFromLogTail = this.logtailSha ? await readAndParse<ISequencedDocumentMessage[]>
            (this.documentStorageService, this.logtailSha) : [];

        this.logtailSha = undefined;
        if (opsFromLogTail.length > 0) {
            const messages = opsFromLogTail.filter((op) =>
                op.sequenceNumber > from,
            );
            if (messages.length > 0) {
                return { messages, partialResult: true };
            }
        }

        const length = to - from - 1; // to & from are exclusive!
        const batchLength = Math.min(MaxBatchDeltas, length); // limit number of ops we retrieve at once
        const result = await this.storageService.get(this.tenantId, this.id, from, from + batchLength + 1);

        // if we got full batch, and did not fully satisfy original request, then there is likely more...
        // Note that it's not disallowed to return more ops than requested!
        if (result.messages.length >= batchLength && result.messages.length !== length) {
            result.partialResult = true;
        }
        return result;
    }
}

/**
 * Provides access to the underlying delta storage on the server for routerlicious driver.
 */
export class DeltaStorageService implements IDeltaStorageService {
    constructor(
        private readonly url: string,
        private readonly tokenProvider: ITokenProvider,
        private readonly logger: ITelemetryLogger) {
    }

    public async get(
        tenantId: string,
        id: string,
        from: number,
        to: number): Promise<IDeltasFetchResult> {
        const ordererRestWrapper = await RouterliciousOrdererRestWrapper.load(
            tenantId, id, this.tokenProvider, this.logger);
        const ops = await PerformanceEvent.timedExecAsync(
            this.logger,
            {
                eventName: "getDeltas",
                from,
                to,
            },
            async (event) => {
                const response = await ordererRestWrapper.get<ISequencedDocumentMessage[]>(this.url, { from, to });
                event.end({
                    count: response.length,
                });
                return response;
            },
        );

        // It is assumed that server always returns all the ops that it has in the range that was requested.
        // This may change in the future, if so, we need to adjust and receive "end" value from server in such case.
        return { messages: ops, partialResult: false };
    }
}
