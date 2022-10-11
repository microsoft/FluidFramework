/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as assert from "assert";
import proxy from "proxyquire";
import { compute_chunks as computeChunksNode } from "@dstanesc/wasm-chunking-fastcdc-node";

import {
    IChunkingConfig,
    ChunkingStrategyEnum,
    IContentChunker,
} from "../contentChunkingInterfaces";

import {
    FixedSizeContentChunker,
} from "../contentChunkingFixed";

function swapWebpackWithNodeProvider(): any {
    const proxyquire = proxy.noCallThru();
    const factory = proxyquire("../contentChunkingFactory", {
        "./contentChunkingFast": proxyquire("../contentChunkingFast", {
            "./contentChunkingProviders": { computeChunksFast: computeChunksNode },
        }),
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return factory;
}

function createTestData(): Uint8Array {
    const text = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut sit amet bibendum lorem.
    In pharetra quis felis vel placerat. Aenean eget elementum turpis. Phasellus dolor sem, facilisis a
    suscipit nec, ullamcorper quis lorem. Proin faucibus purus nec diam feugiat, ac pulvinar purus venenatis.
    Suspendisse ultrices vestibulum tortor laoreet condimentum. Ut id sapien porta, fringilla urna vitae, congue mi.
    Praesent eleifend tempus justo, eu volutpat mauris vehicula at. Phasellus ornare congue tortor a tristique.
    Praesent tristique dolor bibendum sem tempus, ac finibus felis egestas. Nulla nec massa porta, pulvinar urna at,
    faucibus nisl. Nullam convallis sem eget enim convallis, vel sagittis leo hendrerit. Suspendisse hendrerit mauris
    faucibus, fermentum augue vel, pulvinar quam. Quisque commodo nulla vel nulla mattis porta. Maecenas fermentum
    dictum tempor. Praesent rutrum eu erat at euismod.`;
    return new TextEncoder().encode(text);
}

const chunkingFactory = swapWebpackWithNodeProvider();

describe("Content chunking", () => {
    describe("performed by the fastcdc provider", () => {
        it("has deterministic boundaries", () => {
            const testData = createTestData();
            const offsets = computeChunksNode(testData, 64, 256, 1024);
            assert.strictEqual(offsets[0], 0);
            assert.strictEqual(offsets[offsets.length - 1], testData.byteLength);
        });
    });
    describe("#createChunkingMethod", () => {
        it("should create fixed size chunker", () => {
            const avgChunkSize = 256 * 1024;
            const chunkingConfig: IChunkingConfig = { avgChunkSize, chunkingStrategy: ChunkingStrategyEnum.FixedSize };
            const contentChunker: IContentChunker = chunkingFactory.createChunkingMethod(chunkingConfig);
            const fixedSizeChunker: FixedSizeContentChunker = contentChunker as FixedSizeContentChunker;
            assert.strictEqual(fixedSizeChunker.chunkSize, avgChunkSize);
        });
        it("should create content-based chunker", () => {
            // eslint-disable-next-line max-len
            const avgChunkSize = 256 * 1024;
            // eslint-disable-next-line max-len
            const chunkingConfig: IChunkingConfig = { avgChunkSize, chunkingStrategy: ChunkingStrategyEnum.ContentDefined };
            const contentChunker: IContentChunker = chunkingFactory.createChunkingMethod(chunkingConfig);
            // eslint-disable-next-line @typescript-eslint/dot-notation
            assert.strictEqual(contentChunker["minSize"], Math.floor(avgChunkSize / 4));
            // eslint-disable-next-line @typescript-eslint/dot-notation
            assert.strictEqual(contentChunker["avgSize"], avgChunkSize);
            // eslint-disable-next-line @typescript-eslint/dot-notation
            assert.strictEqual(contentChunker["maxSize"], avgChunkSize * 4);
        });
        it("should trigger errors when the specified avgChunkSize < 256 bytes", () => {
            const avgChunkSize = 128;
            // eslint-disable-next-line max-len
            const chunkingConfig: IChunkingConfig = { avgChunkSize, chunkingStrategy: ChunkingStrategyEnum.ContentDefined };
            assert.throws(
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                () => chunkingFactory.createChunkingMethod(chunkingConfig),
                Error,
                "avgChunkSize should be a positive integer larger or equal to 256. Wrong input 128",
            );
        });
        it("should trigger errors when computed min < 64 bytes", () => {
            const avgChunkSize = 1024;
            const chunkingConfig: IChunkingConfig = {
                avgChunkSize, chunkingStrategy: ChunkingStrategyEnum.ContentDefined, sizeRange: (avgSize) => {
                    return {
                        min: 0,
                        max: avgSize * 2,
                    };
                },
            };
            assert.throws(
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                () => chunkingFactory.createChunkingMethod(chunkingConfig),
                Error,
                "min should be a positive integer larger or equal to 64. Wrong input 0",
            );
        });
        it("should trigger errors when computed max < 1024 bytes", () => {
            const avgChunkSize = 256;
            const chunkingConfig: IChunkingConfig = {
                avgChunkSize, chunkingStrategy: ChunkingStrategyEnum.ContentDefined, sizeRange: (avgSize) => {
                    return {
                        min: 128,
                        max: 512,
                    };
                },
            };
            assert.throws(
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                () => chunkingFactory.createChunkingMethod(chunkingConfig),
                Error,
                "max should be a positive integer larger or equal to 1024. Wrong input 512",
            );
        });
        it("should allow fine granular configuration", () => {
            // eslint-disable-next-line max-len
            const avgChunkSize = 256 * 1024;
            const chunkingConfig: IChunkingConfig = {
                avgChunkSize, chunkingStrategy: ChunkingStrategyEnum.ContentDefined, sizeRange: (avgSize) => {
                    return {
                        min: 64,
                        max: avgSize * 2,
                    };
                },
            };
            const contentChunker: IContentChunker = chunkingFactory.createChunkingMethod(chunkingConfig);
            // eslint-disable-next-line @typescript-eslint/dot-notation
            assert.strictEqual(contentChunker["minSize"], 64);
            // eslint-disable-next-line @typescript-eslint/dot-notation
            assert.strictEqual(contentChunker["avgSize"], avgChunkSize);
            // eslint-disable-next-line @typescript-eslint/dot-notation
            assert.strictEqual(contentChunker["maxSize"], avgChunkSize * 2);
        });
    });
    describe("#computeChunks w/ fixed size strategy", () => {
        it("should work correctly and yield fixed size chunks", () => {
            const avgChunkSize = 256;
            const chunkingConfig: IChunkingConfig = { avgChunkSize, chunkingStrategy: ChunkingStrategyEnum.FixedSize };
            const contentChunker: IContentChunker = chunkingFactory.createChunkingMethod(chunkingConfig);
            const testData = createTestData();
            const chunks = contentChunker.computeChunks(testData);
            // eslint-disable-next-line max-len
            const totalSize = chunks.map((chunk: Uint8Array) => chunk.byteLength).reduce((prev: number, current: number) => prev + current, 0);
            assert.strictEqual(totalSize, testData.byteLength);
            assert.strictEqual(chunks[0].byteLength, chunks[1].byteLength);
            assert.strictEqual(chunks[1].byteLength, chunks[2].byteLength);
        });
    });
    describe("#computeChunks w/ content defined strategy", () => {
        it("should work correctly and yield stable chunks for same input", () => {
            const avgChunkSize = 256;
            // eslint-disable-next-line max-len
            const chunkingConfig: IChunkingConfig = { avgChunkSize, chunkingStrategy: ChunkingStrategyEnum.ContentDefined };
            const contentChunker: IContentChunker = chunkingFactory.createChunkingMethod(chunkingConfig);
            const testData = createTestData();
            const chunks1 = contentChunker.computeChunks(testData);
            // eslint-disable-next-line max-len
            const totalSize1 = chunks1.map((chunk: Uint8Array) => chunk.byteLength).reduce((prev: number, current: number) => prev + current, 0);
            assert.strictEqual(totalSize1, testData.byteLength);
            const chunks2 = contentChunker.computeChunks(testData);
            // eslint-disable-next-line max-len
            const totalSize2 = chunks2.map((chunk: Uint8Array) => chunk.byteLength).reduce((prev: number, current: number) => prev + current, 0);
            assert.strictEqual(totalSize2, testData.byteLength);
            assert.strictEqual(chunks1[0].byteLength, chunks2[0].byteLength);
            assert.strictEqual(chunks1[1].byteLength, chunks2[1].byteLength);
            assert.strictEqual(chunks1[2].byteLength, chunks2[2].byteLength);
        });
    });
});
