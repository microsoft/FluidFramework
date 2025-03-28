/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { SessionSpaceCompressedId, StableId } from "@fluidframework/id-compressor";
import { assertIsStableId } from "@fluidframework/id-compressor/internal";
import type { LocalNodeIdentifier, StableNodeIdentifier } from "./nodeIdentifier.js";
import {
	isStableNodeIdentifier,
	type NodeIdentifierManager,
} from "./nodeIdentifierManager.js";
import { brand, extractFromOpaque, fail } from "../../util/index.js";

/**
 * Mock {@link NodeIdentifierManager} that generates deterministic {@link StableNodeIdentifier}s and {@link LocalNodeIdentifier}s.
 * @remarks This is useful for test environments because it will always yield the same keys in the same order.
 * It should not be used for production environments for the same reason; the {@link StableNodeIdentifier}s are not universally unique.
 */
export class MockNodeIdentifierManager implements NodeIdentifierManager {
	private count = 0;

	public generateStableNodeIdentifier(): StableNodeIdentifier {
		return brand(this.getId(this.count++));
	}

	public generateLocalNodeIdentifier(): LocalNodeIdentifier {
		return this.localizeNodeIdentifier(this.generateStableNodeIdentifier());
	}

	public localizeNodeIdentifier(key: StableNodeIdentifier): LocalNodeIdentifier {
		return (
			this.tryLocalizeNodeIdentifier(key) ?? fail(0xb26 /* Identifier is not compressible */)
		);
	}

	public stabilizeNodeIdentifier(key: LocalNodeIdentifier): StableNodeIdentifier {
		return brand(this.getId(extractFromOpaque(key)));
	}

	public tryLocalizeNodeIdentifier(key: string): LocalNodeIdentifier | undefined {
		if (!isStableNodeIdentifier(key) || !key.startsWith("a110ca7e-add1-4000-8000-")) {
			return undefined;
		}
		const localNodeIdentifier = Number.parseInt(key.substring(24), 16);
		return localNodeIdentifier < this.count
			? brand(localNodeIdentifier as SessionSpaceCompressedId)
			: undefined;
	}

	public getId(offset: number): StableId {
		assert(offset >= 0, 0x6e7 /* UUID offset may not be negative */);
		assert(offset < 281_474_976_710_656, 0x6e8 /* UUID offset must be at most 16^12 */);
		return assertIsStableId(
			`a110ca7e-add1-4000-8000-${Math.round(offset).toString(16).padStart(12, "0")}`,
		);
	}
}
