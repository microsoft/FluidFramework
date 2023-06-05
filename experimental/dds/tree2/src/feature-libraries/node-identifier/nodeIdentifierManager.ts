/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { assertIsStableId, generateStableId } from "@fluidframework/container-runtime";
import {
	IIdCompressor,
	SessionSpaceCompressedId,
	StableId,
} from "@fluidframework/runtime-definitions";
import { brand, extractFromOpaque } from "../../util";
import { NodeIdentifier, CompressedNodeIdentifier } from "./nodeIdentifier";

/**
 * An object which handles the generation of node identifiers as well as conversion between their two types ({@link NodeIdentifier} and {@link CompressedNodeIdentifier}).
 * @alpha
 */
export interface NodeIdentifierManager {
	/**
	 * Generate a unique identifier that can be used to identify a node in the tree.
	 */
	generateNodeIdentifier(): NodeIdentifier;

	/**
	 * Generate a compressed variant of a {@link NodeIdentifier}.
	 * {@link CompressedNodeIdentifier}s can be converted to and from their uncompressed form via {@link NodeIdentifierManager.compressNodeIdentifier} and {@link NodeIdentifierManager.decompressNodeIdentifier}.
	 */
	generateCompressedNodeIdentifier(): CompressedNodeIdentifier;

	/**
	 * Compress the given {@link NodeIdentifier} into its {@link CompressedNodeIdentifier} form.
	 */
	compressNodeIdentifier(nodeIdentifier: NodeIdentifier): CompressedNodeIdentifier;

	/**
	 * Decompress the given {@link CompressedNodeIdentifier} into its {@link NodeIdentifier} form.
	 */
	decompressNodeIdentifier(compressedNodeIdentifier: CompressedNodeIdentifier): NodeIdentifier;
}

/**
 * Creates a {@link NodeIdentifierManager} from the given {@link IIdCompressor}.
 * @param idCompressor - the compressor to use for identifier generation, compression, and decompression.
 * If undefined, then {@link NodeIdentifier}s may be generated, but attempting to compress them or to generate/decompress {@link CompressedNodeIdentifier}s will fail.
 */
export function createNodeIdentifierManager(
	idCompressor?: IIdCompressor | undefined,
): NodeIdentifierManager {
	return {
		generateNodeIdentifier: () => {
			if (idCompressor === undefined) {
				return brand(generateStableId());
			}
			// TODO: The assert below is required for type safety but is maybe slow
			return brand(
				assertIsStableId(idCompressor.decompress(idCompressor.generateCompressedId())),
			);
		},

		generateCompressedNodeIdentifier: () => {
			assert(
				idCompressor !== undefined,
				"Runtime IdCompressor must be available to generate compressed node identifiers",
			);
			return brand(idCompressor.generateCompressedId());
		},

		compressNodeIdentifier: (nodeIdentifier: NodeIdentifier) => {
			assert(
				idCompressor !== undefined,
				"Runtime IdCompressor must be available to compress node identifiers",
			);
			return brand(idCompressor.recompress(nodeIdentifier));
		},

		decompressNodeIdentifier: (compressedNodeIdentifier: CompressedNodeIdentifier) => {
			assert(
				idCompressor !== undefined,
				"Runtime IdCompressor must be available to decompress node identifiers",
			);
			return brand(
				// TODO: The assert below is required for type safety but is maybe slow
				assertIsStableId(
					idCompressor.decompress(extractFromOpaque(compressedNodeIdentifier)),
				),
			);
		},
	};
}

/**
 * Create a {@link NodeIdentifierManager} that generates deterministic {@link NodeIdentifier}s and {@link CompressedNodeIdentifier}s.
 * @remarks This is useful for test environments because it will always yield the same identifiers in the same order.
 * It should not be used for production environments for the same reason; the identifiers are not universally unique.
 */
export function createMockNodeIdentifierManager(): NodeIdentifierManager {
	return new MockNodeIdentifierManager();
}

class MockNodeIdentifierManager implements NodeIdentifierManager {
	private count = 0;

	public generateNodeIdentifier(): NodeIdentifier {
		return brand(this.createMockStableId(this.count++));
	}

	public generateCompressedNodeIdentifier(): CompressedNodeIdentifier {
		return this.compressNodeIdentifier(this.generateNodeIdentifier());
	}

	public compressNodeIdentifier(nodeIdentifier: NodeIdentifier): CompressedNodeIdentifier {
		return brand(Number.parseInt(nodeIdentifier.substring(30), 16) as SessionSpaceCompressedId);
	}

	public decompressNodeIdentifier(
		compressedNodeIdentifier: CompressedNodeIdentifier,
	): NodeIdentifier {
		return brand(this.createMockStableId(extractFromOpaque(compressedNodeIdentifier)));
	}

	private createMockStableId(offset: number): StableId {
		assert(offset >= 0, "UUID offset may not be negative");
		assert(offset < 281_474_976_710_656, "UUID offset must be at most 16^12");
		return assertIsStableId(
			`a110ca7e-add1-4000-8000-${Math.round(offset).toString(16).padStart(12, "0")}`,
		);
	}
}
