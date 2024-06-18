/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import type { IDeltaManager } from "@fluidframework/container-definitions/internal";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import {
	type IDocumentMessage,
	type ISnapshotTree,
	type IQuorumClients,
	type ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import {
	type ISummaryTreeWithStats,
	type AttributionInfo,
	type AttributionKey,
} from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";

import { Attributor, type IAttributor, OpStreamAttributor } from "./attributor.js";
import { AttributorSerializer, type Encoder, chain, deltaEncoder } from "./encoders.js";
import type { IRuntimeAttributor } from "./interfaces.js";
import { makeLZ4Encoder } from "./lz4Encoder.js";
import { attributorTreeName, opBlobName } from "./utils.js";

/**
 * @internal
 */
export class RuntimeAttributor implements IRuntimeAttributor {
	public get IRuntimeAttributor(): IRuntimeAttributor {
		return this;
	}

	public get(key: AttributionKey): AttributionInfo {
		assert(
			this.opAttributor !== undefined,
			"RuntimeAttributor must be initialized before getAttributionInfo can be called",
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
	public isEnabled = false;

	public async initialize(
		deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
		quorum: IQuorumClients,
		baseSnapshot: ISnapshotTree | undefined,
		readBlob: (id: string) => Promise<ArrayBufferLike>,
		shouldAddAttributorOnNewFile: boolean,
	): Promise<void> {
		const attributorTree = baseSnapshot?.trees[attributorTreeName];
		// Existing documents that don't already have a snapshot containing runtime attribution info shouldn't
		// inject any for now--this causes some back-compat integration problems that aren't fully worked out.
		const shouldExcludeAttributor =
			(baseSnapshot !== undefined && attributorTree === undefined) ||
			(baseSnapshot === undefined && !shouldAddAttributorOnNewFile);
		if (shouldExcludeAttributor) {
			// This gives a consistent error for calls to `get` on keys that don't exist.
			this.opAttributor = new Attributor();
			return;
		}

		this.isEnabled = true;
		this.encoder = chain(
			new AttributorSerializer(
				(entries) => new OpStreamAttributor(deltaManager, quorum, entries),
				deltaEncoder,
			),
			makeLZ4Encoder(),
		);

		if (attributorTree === undefined) {
			this.opAttributor = new OpStreamAttributor(deltaManager, quorum);
		} else {
			const id = attributorTree.blobs[opBlobName];
			assert(id !== undefined, "Attributor tree should have op attributor summary blob.");
			const blobContents = await readBlob(id);
			const attributorSnapshot = bufferToString(blobContents, "utf8");
			this.opAttributor = this.encoder.decode(attributorSnapshot);
		}
	}

	public summarize(): ISummaryTreeWithStats | undefined {
		if (!this.isEnabled) {
			// Loaded existing document without attributor data: avoid injecting any data.
			return undefined;
		}

		assert(
			this.opAttributor !== undefined,
			"RuntimeAttributor should be initialized before summarization",
		);
		const builder = new SummaryTreeBuilder();
		builder.addBlob(opBlobName, this.encoder.encode(this.opAttributor));
		return builder.getSummaryTree();
	}
}
/**
 * @internal
 */
export function createRuntimeAttributor() {
	return new RuntimeAttributor();
}
