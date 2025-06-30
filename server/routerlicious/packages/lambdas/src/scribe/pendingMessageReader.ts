/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IDeltaService } from "@fluidframework/server-services-core";
import { getLumberBaseProperties, Lumberjack } from "@fluidframework/server-services-telemetry";

import { IPendingMessageReader } from "./interfaces";

export class PendingMessageReader implements IPendingMessageReader {
	constructor(
		private readonly tenantId: string,
		private readonly documentId: string,
		protected readonly deltaService: IDeltaService,
	) {}

	public async readMessages(from: number, to: number): Promise<ISequencedDocumentMessage[]> {
		Lumberjack.info(
			`Fetching pending messages from ${from} to ${to}`,
			getLumberBaseProperties(this.documentId, this.tenantId),
		);
		const deltasP = this.deltaService.getDeltas(
			"",
			this.tenantId,
			this.documentId,
			from - 1,
			to + 1,
			"scribe",
		);
		return deltasP;
	}
}
