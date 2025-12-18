/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type {
	IIdCompressor,
	SessionSpaceCompressedId,
	OpSpaceCompressedId,
	SessionId,
	StableId,
} from "./types/index.js";

/**
 * A sandboxed ID compressor that only supports generating IDs from a pre-burned range.
 * All other operations will throw errors.
 *
 * @remarks
 * This class is intended for use in sandboxed environments where you need to generate
 * IDs from a pre-allocated range without full ID compressor functionality.
 *
 * @alpha
 */
export class SandboxedIdCompressor implements IIdCompressor {
	private currentGenCount: number;
	private readonly maxGenCount: number;

	/**
	 * Creates a new SandboxedIdCompressor.
	 * @param baseId - The starting generation count (base ID)
	 * @param burnCount - The number of IDs that were burned (available for generation)
	 */
	constructor(baseId: number, burnCount: number) {
		this.currentGenCount = baseId - 1; // Start before the first ID
		this.maxGenCount = this.currentGenCount + burnCount;
	}

	/**
	 * Generates a compressed ID from the burned range.
	 * @returns A session-space compressed ID (negative number)
	 * @throws If all burned IDs have been exhausted
	 */
	public generateCompressedId(): SessionSpaceCompressedId {
		this.currentGenCount++;

		if (this.currentGenCount > this.maxGenCount) {
			throw new UsageError(
				"SandboxedIdCompressor has exhausted all burned IDs.",
			);
		}

		// Local IDs are negative: genCount = -localId, so localId = -genCount
		return -this.currentGenCount as SessionSpaceCompressedId;
	}

	// All other methods throw errors

	public get localSessionId(): SessionId {
		throw new UsageError(
			"SandboxedIdCompressor does not support localSessionId. This is a limited compressor for sandbox use only.",
		);
	}

	public generateDocumentUniqueId():
		| (SessionSpaceCompressedId & OpSpaceCompressedId)
		| StableId {
		throw new UsageError(
			"SandboxedIdCompressor does not support generateDocumentUniqueId. Use generateCompressedId instead.",
		);
	}

	public normalizeToOpSpace(_id: SessionSpaceCompressedId): OpSpaceCompressedId {
		throw new UsageError(
			"SandboxedIdCompressor does not support normalizeToOpSpace. This is a limited compressor for sandbox use only.",
		);
	}

	public normalizeToSessionSpace(
		_id: OpSpaceCompressedId,
		_originSessionId: SessionId,
	): SessionSpaceCompressedId {
		throw new UsageError(
			"SandboxedIdCompressor does not support normalizeToSessionSpace. This is a limited compressor for sandbox use only.",
		);
	}

	public decompress(_id: SessionSpaceCompressedId): StableId {
		throw new UsageError(
			"SandboxedIdCompressor does not support decompress. This is a limited compressor for sandbox use only.",
		);
	}

	public recompress(_uncompressed: StableId): SessionSpaceCompressedId {
		throw new UsageError(
			"SandboxedIdCompressor does not support recompress. This is a limited compressor for sandbox use only.",
		);
	}

	public tryRecompress(_uncompressed: StableId): SessionSpaceCompressedId | undefined {
		throw new UsageError(
			"SandboxedIdCompressor does not support tryRecompress. This is a limited compressor for sandbox use only.",
		);
	}
}
