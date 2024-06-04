/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	CompressionAlgorithms,
	type IContainerRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import type { CompatibilityMode } from "./types.js";

/**
 * The CompatibilityMode selected determines the set of runtime options to use. In "1" mode we support
 * full interop with true 1.x clients, while in "2" mode we only support interop with 2.x clients.
 */
export const compatibilityModeRuntimeOptions: Record<CompatibilityMode, IContainerRuntimeOptions> =
	{
		"1": {
			// 1.x clients are compatible with TurnBased flushing, but here we elect to remain on Immediate flush mode
			// as a work-around for inability to send batches larger than 1Mb. Immediate flushing keeps batches smaller as
			// fewer messages will be included per flush.
			flushMode: FlushMode.Immediate,
			// Op compression is on by default but introduces a new type of op which is not compatible with 1.x clients.
			compressionOptions: {
				minimumBatchSizeInBytes: Number.POSITIVE_INFINITY, // disabled
				compressionAlgorithm: CompressionAlgorithms.lz4,
			},
			// Grouped batching is on by default but introduces a new type of op which is not compatible with 1.x clients.
			enableGroupedBatching: false,
			// TODO: Include explicit disables for things that are currently off-by-default?
		},
		"2": {
			// Explicit schema control explicitly makes the container incompatible with 1.x clients, to force their
			// ejection from collaboration and prevent container corruption.  It is off by default and must be explicitly enabled.
			explicitSchemaControl: true,
			// The runtime ID compressor is a prerequisite to use SharedTree but is off by default and must be explicitly enabled.
			// It introduces a new type of op which is not compatible with 1.x clients.
			enableRuntimeIdCompressor: "on",
		},
	};
