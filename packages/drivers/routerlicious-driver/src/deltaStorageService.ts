/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { OutgoingHttpHeaders } from "http";
import querystring from "querystring";
import {
    IDeltaStorageService,
    IDocumentDeltaStorageService,
    IDeltasFetchResult,
} from "@fluidframework/driver-definitions";
import Axios from "axios";
import { v4 as uuid } from "uuid";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { ITokenProvider } from "./tokens";
import { DocumentStorageService } from "./documentStorageService";

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
        if (result.messages.length !== length && batchLength !== length) {
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
        const query = querystring.stringify({ from, to });

        const headers: OutgoingHttpHeaders = {
            "x-correlation-id": uuid(),
        };

        const storageToken = await this.tokenProvider.fetchStorageToken(
            tenantId,
            id,
        );

        if (storageToken) {
            headers.Authorization = `Basic ${storageToken.jwt}`;
        }

        const ops = await Axios.get<ISequencedDocumentMessage[]>(
            `${this.url}?${query}`, { headers });

        this.logger.sendTelemetryEvent({
            eventName: "R11sDriverToServer",
            correlationId: headers["x-correlation-id"] as string,
        });

        // It is assumed that server always returns all the ops that it has in the range that was requested.
        // This may change in the future, if so, we need to adjust and receive "end" value from server in such case.
        return {messages: ops.data, partialResult: false };
    }
}
