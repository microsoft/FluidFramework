/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { strict as assert } from "assert";
import {
    AttachState,
    IContainerContext,
    ICriticalContainerError,
} from "@fluidframework/container-definitions";
import {
    MockLogger,
} from "@fluidframework/telemetry-utils";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { MockDeltaManager, MockQuorumClients } from "@fluidframework/test-runtime-utils";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { FluidObject } from "@fluidframework/core-interfaces";
import { ISequencedDocumentMessage, ISnapshotTree, SummaryType } from "@fluidframework/protocol-definitions";
import { createRuntimeAttributor, IProvideRuntimeAttributor, mixinAttributor } from "../mixinAttributor";
import { Attributor } from "../attributor";
import { makeLZ4Encoder } from "../lz4Encoder";
import { AttributorSerializer, chain, deltaEncoder } from "../encoders";
import { makeMockAudience } from "./utils";

type Mutable<T> = {
    -readonly[P in keyof T]: T[P]
};

describe("mixinAttributor", () => {
    const clientId = "mock client id";
    let containerRuntime: ContainerRuntime;
    const getMockContext = ((): Partial<IContainerContext> => {
        return {
            audience: makeMockAudience([clientId]),
            attachState: AttachState.Attached,
            deltaManager: new MockDeltaManager(),
            quorum: new MockQuorumClients(),
            taggedLogger: new MockLogger(),
            clientDetails: { capabilities: { interactive: true } },
            // eslint-disable-next-line @typescript-eslint/no-throw-literal
            closeFn: (error?: ICriticalContainerError): void => { if (error) { throw error; } },
            updateDirtyContainerState: (_dirty: boolean) => { },
        };
    });

    const getScope = (): FluidObject<IProvideRuntimeAttributor> => ({
        IRuntimeAttributor: createRuntimeAttributor()
    });

    const AttributingContainerRuntime = mixinAttributor();

    it("Attributes ops", async () => {
        const context = getMockContext() as IContainerContext;
        containerRuntime = await AttributingContainerRuntime.load(
            context,
            [],
            undefined, // requestHandler
            {}, // runtimeOptions
            getScope(),
        );

        const maybeProvidesAttributor: FluidObject<IProvideRuntimeAttributor> = containerRuntime.scope;
        assert(maybeProvidesAttributor.IRuntimeAttributor !== undefined)
        const runtimeAttribution = maybeProvidesAttributor.IRuntimeAttributor;

        const op: Partial<ISequencedDocumentMessage> = {
            sequenceNumber: 7,
            clientId,
            timestamp: 1006
        };

        (context.deltaManager as MockDeltaManager).emit("op", op);
        
        assert.deepEqual(runtimeAttribution.get({ type: "op", seq: op.sequenceNumber! }), {
            timestamp: op.timestamp,
            user: context.audience?.getMember(op.clientId!)?.user
        });
    });

    it("includes attribution association data in the summary tree", async () => {
        const context = getMockContext() as IContainerContext;
        containerRuntime = await AttributingContainerRuntime.load(
            context,
            [],
            undefined, // requestHandler
            {}, // runtimeOptions
            getScope(),
        );

        const op: Partial<ISequencedDocumentMessage> = {
            sequenceNumber: 7,
            clientId,
            timestamp: 1006
        };

        (context.deltaManager as MockDeltaManager).emit("op", op);
        const { summary } = await containerRuntime.summarize({ fullTree: true, trackState: false, runGC: false });
        
        const { ".attributor": attributor } = summary.tree;
        assert(attributor !== undefined && attributor.type === SummaryType.Tree, "summary should contain attributor data");
        const opAttributorBlob = attributor.tree.op;
        assert(opAttributorBlob.type === SummaryType.Blob && typeof opAttributorBlob.content === "string");
        const decoder = chain(
            new AttributorSerializer(
                (entries) => new Attributor(entries),
                deltaEncoder
            ),
            makeLZ4Encoder()
        );
        const decoded = decoder.decode(opAttributorBlob.content);
        assert.deepEqual(
            decoded.getAttributionInfo(op.sequenceNumber!),
            { timestamp: op.timestamp, user: context.audience?.getMember(op.clientId!)?.user }
        );
    });

    it("repopulates attribution association data using the summary tree", async () => {
        const op: Partial<ISequencedDocumentMessage> = {
            sequenceNumber: 7,
            clientId,
            timestamp: 1006
        };

        const encoder = chain(
            new AttributorSerializer(
                (entries) => new Attributor(entries),
                deltaEncoder
            ),
            makeLZ4Encoder()
        );
        const context = getMockContext() as Mutable<IContainerContext>;
        const sampleAttributor = new Attributor([
            [op.sequenceNumber!, { timestamp: op.timestamp!, user: context.audience!.getMember(op.clientId!)!.user }]
        ]);

        const opAttributorBlobId = "mock attributor blob id";
        const mockStorage: IDocumentStorageService = {
            readBlob: async (blobId: string) => {
                assert(blobId === opAttributorBlobId);
                return encoder.encode(sampleAttributor);
            }
        } as unknown as IDocumentStorageService;
        const snapshot: ISnapshotTree = {
            blobs: {},
            trees: {
                ".attributor": {
                    blobs: { op: opAttributorBlobId },
                    trees: {},
                }
            }
        };
        context.baseSnapshot = snapshot;
        context.storage = mockStorage;
        containerRuntime = await AttributingContainerRuntime.load(
            context,
            [],
            undefined, // requestHandler
            {}, // runtimeOptions
            getScope(),
        );

        const maybeProvidesAttributor: FluidObject<IProvideRuntimeAttributor> = containerRuntime.scope;
        assert(maybeProvidesAttributor.IRuntimeAttributor !== undefined)
        const runtimeAttribution = maybeProvidesAttributor.IRuntimeAttributor;

        assert.deepEqual(
            runtimeAttribution.get({ type: "op", seq: op.sequenceNumber! }),
            { timestamp: op.timestamp, user: context.audience?.getMember(op.clientId!)?.user }
        );
    });

    it("Doesn't summarize attributor for existing documents that had no attributor", async () => {
        const context = getMockContext() as Mutable<IContainerContext>;
        const snapshot: ISnapshotTree = {
            blobs: {},
            trees: {}
        };
        context.baseSnapshot = snapshot;
        containerRuntime = await AttributingContainerRuntime.load(
            context,
            [],
            undefined, // requestHandler
            {}, // runtimeOptions
            getScope(),
        );

        const maybeProvidesAttributor: FluidObject<IProvideRuntimeAttributor> = containerRuntime.scope;
        assert(maybeProvidesAttributor.IRuntimeAttributor !== undefined);

        const { summary } = await containerRuntime.summarize({ fullTree: true, trackState: false, runGC: false });
        assert(summary.tree[".attributor"] === undefined);
    });
});

/* eslint-enable @typescript-eslint/no-non-null-assertion */
