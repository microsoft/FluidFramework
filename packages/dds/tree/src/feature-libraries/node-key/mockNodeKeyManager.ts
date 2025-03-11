/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { SessionSpaceCompressedId, StableId } from "@fluidframework/id-compressor";
import { assertIsStableId } from "@fluidframework/id-compressor/internal";
import type { LocalNodeKey, StableNodeKey } from "./nodeKey.js";
import { isStableNodeKey, type NodeKeyManager } from "./nodeKeyManager.js";
import { brand, extractFromOpaque, fail } from "../../util/index.js";

/**
 * Mock {@link NodeKeyManager} that generates deterministic {@link StableNodeKey}s and {@link LocalNodeKey}s.
 * @remarks This is useful for test environments because it will always yield the same keys in the same order.
 * It should not be used for production environments for the same reason; the {@link StableNodeKey}s are not universally unique.
 */
export class MockNodeKeyManager implements NodeKeyManager {
	private count = 0;

	public generateStableNodeKey(): StableNodeKey {
		return brand(this.getId(this.count++));
	}

	public generateLocalNodeKey(): LocalNodeKey {
		return this.localizeNodeKey(this.generateStableNodeKey());
	}

	public localizeNodeKey(key: StableNodeKey): LocalNodeKey {
		return this.tryLocalizeNodeKey(key) ?? fail(0xb26 /* Key is not compressible */);
	}

	public stabilizeNodeKey(key: LocalNodeKey): StableNodeKey {
		return brand(this.getId(extractFromOpaque(key)));
	}

	public tryLocalizeNodeKey(key: string): LocalNodeKey | undefined {
		if (!isStableNodeKey(key) || !key.startsWith("a110ca7e-add1-4000-8000-")) {
			return undefined;
		}
		const localNodeKey = Number.parseInt(key.substring(24), 16);
		return localNodeKey < this.count
			? brand(localNodeKey as SessionSpaceCompressedId)
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
