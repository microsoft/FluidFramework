/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	assertIsStableId,
	IIdCompressor,
	SessionSpaceCompressedId,
	StableId,
} from "@fluidframework/id-compressor";
import { brand, extractFromOpaque } from "../../util";
import { StableNodeKey, LocalNodeKey } from "./nodeKey";

/**
 * An object which handles the generation of node keys as well as conversion between their two types ({@link StableNodeKey} and {@link LocalNodeKey}).
 */
export interface NodeKeyManager {
	/**
	 * Generate a {@link StableNodeKey}.
	 */
	generateLocalNodeKey(): LocalNodeKey;

	/**
	 * Convert the given {@link StableNodeKey} into its {@link LocalNodeKey} form.
	 */
	localizeNodeKey(key: StableNodeKey): LocalNodeKey;

	/**
	 * Convert the given {@link LocalNodeKey} into its {@link StableNodeKey} form.
	 */
	stabilizeNodeKey(key: LocalNodeKey): StableNodeKey;
}

/**
 * Creates a {@link NodeKeyManager} from the given {@link IIdCompressor}.
 * @param idCompressor - the compressor to use for key generation, compression, and decompression.
 * If undefined, then attempts to generate or convert keys will throw an error.
 */
export function createNodeKeyManager(idCompressor?: IIdCompressor | undefined): NodeKeyManager {
	return {
		generateLocalNodeKey: () => {
			assert(
				idCompressor !== undefined,
				0x6e4 /* Runtime IdCompressor must be available to generate local node keys */,
			);
			return brand(idCompressor.generateCompressedId());
		},

		localizeNodeKey: (key: StableNodeKey) => {
			assert(
				idCompressor !== undefined,
				0x6e5 /* Runtime IdCompressor must be available to convert node keys */,
			);
			return brand(idCompressor.recompress(key));
		},

		stabilizeNodeKey: (key: LocalNodeKey) => {
			assert(
				idCompressor !== undefined,
				0x6e6 /* Runtime IdCompressor must be available to convert node keys */,
			);
			return brand(
				// TODO: The assert below is required for type safety but is maybe slow
				assertIsStableId(idCompressor.decompress(extractFromOpaque(key))),
			);
		},
	};
}

/**
 * Create a {@link NodeKeyManager} that generates deterministic {@link StableNodeKey}s and {@link LocalNodeKey}s.
 * @remarks This is useful for test environments because it will always yield the same keys in the same order.
 * It should not be used for production environments for the same reason; the {@link StableNodeKey}s are not universally unique.
 */
export function createMockNodeKeyManager(): NodeKeyManager {
	return new MockNodeKeyManager();
}

class MockNodeKeyManager implements NodeKeyManager {
	private count = 0;

	public generateStableNodeKey(): StableNodeKey {
		return brand(this.createMockStableId(this.count++));
	}

	public generateLocalNodeKey(): LocalNodeKey {
		return this.localizeNodeKey(this.generateStableNodeKey());
	}

	public localizeNodeKey(key: StableNodeKey): LocalNodeKey {
		return brand(Number.parseInt(key.substring(30), 16) as SessionSpaceCompressedId);
	}

	public stabilizeNodeKey(key: LocalNodeKey): StableNodeKey {
		return brand(this.createMockStableId(extractFromOpaque(key)));
	}

	private createMockStableId(offset: number): StableId {
		assert(offset >= 0, 0x6e7 /* UUID offset may not be negative */);
		assert(offset < 281_474_976_710_656, 0x6e8 /* UUID offset must be at most 16^12 */);
		return assertIsStableId(
			`a110ca7e-add1-4000-8000-${Math.round(offset).toString(16).padStart(12, "0")}`,
		);
	}
}
