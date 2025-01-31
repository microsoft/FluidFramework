/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import { IDeltaManager } from "@fluidframework/container-definitions/internal";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import {
	IDocumentMessage,
	type ISnapshotTree,
	ISequencedDocumentMessage,
	IQuorumClients,
} from "@fluidframework/driver-definitions/internal";
import {
	type AttributionInfo,
	type AttributionKey,
	type ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";

import { OpStreamAttributor, type IAttributor } from "./attributor.js";
import { opBlobName, type IRuntimeAttributor } from "./attributorContracts.js";
import { AttributorSerializer, chain, deltaEncoder, type Encoder } from "./encoders.js";
import { makeLZ4Encoder } from "./lz4Encoder.js";

export class RuntimeAttributor implements IRuntimeAttributor {
	public get IRuntimeAttributor(): IRuntimeAttributor {
		return this;
	}

	public get(key: AttributionKey): AttributionInfo {
		assert(
			this.opAttributor !== undefined,
			0x509 /* RuntimeAttributor must be initialized before getAttributionInfo can be called */,
		);

		if (key.type === "detached") {
			throw new Error("Attribution of detached keys is not yet supported.");
		}

		if (key.type === "local") {
			// Note: we can *almost* orchestrate this correctly with internal-only changes by looking up the current
			// client id in the audience. However, for read->write client transition, the container might have not yet
			// received a client id. This is left as a TODO as it might be more easily solved once the detached case
			// is settled (e.g. if it's reasonable for the host to know the current user information at container
			// creation time, we could just use that here as well).
			throw new Error("Attribution of local keys is not yet supported.");
		}

		return this.opAttributor.getAttributionInfo(key.seq);
	}

	public has(key: AttributionKey): boolean {
		if (key.type === "detached") {
			return false;
		}

		if (key.type === "local") {
			return false;
		}

		return this.opAttributor?.tryGetAttributionInfo(key.seq) !== undefined;
	}

	private encoder: Encoder<IAttributor, string> = {
		encode: unreachableCase,
		decode: unreachableCase,
	};

	private opAttributor: IAttributor | undefined;
	public isEnabled = true;

	public async initialize(
		deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
		quorum: IQuorumClients,
		baseSnapshotForAttributorTree: ISnapshotTree | undefined,
		readBlob: (id: string) => Promise<ArrayBufferLike>,
	): Promise<void> {
		this.encoder = chain(
			new AttributorSerializer(
				(entries) => new OpStreamAttributor(deltaManager, quorum, entries),
				deltaEncoder,
			),
			makeLZ4Encoder(),
		);

		if (baseSnapshotForAttributorTree === undefined) {
			this.opAttributor = new OpStreamAttributor(deltaManager, quorum);
		} else {
			const id: string | undefined = baseSnapshotForAttributorTree.blobs[opBlobName];
			assert(
				id !== undefined,
				0x50a /* Attributor tree should have op attributor summary blob. */,
			);
			const blobContents = await readBlob(id);
			const attributorSnapshot = bufferToString(blobContents, "utf8");
			this.opAttributor = this.encoder.decode(attributorSnapshot);
		}
	}

	public summarizeOpAttributor(): ISummaryTreeWithStats {
		assert(
			this.opAttributor !== undefined,
			0xa1d /* RuntimeAttributor should be initialized before summarization */,
		);
		const builder = new SummaryTreeBuilder();
		builder.addBlob(opBlobName, this.encoder.encode(this.opAttributor));
		return builder.getSummaryTree();
	}
}
