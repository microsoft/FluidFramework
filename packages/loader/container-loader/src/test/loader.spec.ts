/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { v4 as uuid } from "uuid";
import { isFluidError } from "@fluidframework/telemetry-utils";
import { FluidErrorTypes } from "@fluidframework/core-interfaces";
import { ICreateBlobResponse, SummaryType } from "@fluidframework/protocol-definitions";
import { IRuntime } from "@fluidframework/container-definitions";
import { stringToBuffer } from "@fluid-internal/client-utils";
import { IDetachedBlobStorage, Loader } from "../loader";

const failProxy = <T extends object>() => {
	const proxy = new Proxy<T>({} as any as T, {
		get: (_, p) => {
			throw Error(`${p.toString()} not implemented`);
		},
	});
	return proxy;
};

const failSometimeProxy = <T extends object>(handler: Partial<T>) => {
	const proxy = new Proxy<T>(handler as T, {
		get: (t, p, r) => {
			if (p in handler) {
				return Reflect.get(t, p, r);
			}
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return failProxy();
		},
	});
	return proxy;
};

const codeLoader = {
	load: async () => {
		return {
			details: {
				package: "none",
			},
			module: {
				fluidExport: {
					IRuntimeFactory: {
						get IRuntimeFactory() {
							return this;
						},
						async instantiateRuntime(context, existing) {
							return failSometimeProxy<IRuntime>({
								createSummary: () => ({
									tree: {},
									type: SummaryType.Tree,
								}),
							});
						},
					},
				},
			},
		};
	},
};

describe("loader unit test", () => {
	it("rehydrateDetachedContainerFromSnapshot with invalid format", async () => {
		const loader = new Loader({
			codeLoader: failProxy(),
			documentServiceFactory: failProxy(),
			urlResolver: failProxy(),
		});

		try {
			await loader.rehydrateDetachedContainerFromSnapshot(`{"foo":"bar"}`);
			assert.fail("should fail");
		} catch (e) {
			assert.strict(isFluidError(e), `should be a Fluid error: ${e}`);
			assert.strictEqual(e.errorType, FluidErrorTypes.usageError, "should be a usage error");
		}
	});

	it("rehydrateDetachedContainerFromSnapshot with valid format", async () => {
		const loader = new Loader({
			codeLoader,
			documentServiceFactory: failProxy(),
			urlResolver: failProxy(),
		});
		const detached = await loader.createDetachedContainer({ package: "none" });
		const summary = detached.serialize();
		assert.strictEqual(
			summary,
			'{"type":1,"tree":{".protocol":{"tree":{"attributes":{"content":"{\\"minimumSequenceNumber\\":0,\\"sequenceNumber\\":0}","type":2},"quorumMembers":{"content":"[]","type":2},"quorumProposals":{"content":"[]","type":2},"quorumValues":{"content":"[[\\"code\\",{\\"key\\":\\"code\\",\\"value\\":{\\"package\\":\\"none\\"},\\"approvalSequenceNumber\\":0,\\"commitSequenceNumber\\":0,\\"sequenceNumber\\":0}]]","type":2}},"type":1},".app":{"tree":{},"type":1}}}',
			"summary does not match expected format",
		);
		await loader.rehydrateDetachedContainerFromSnapshot(summary);
	});

	it("rehydrateDetachedContainerFromSnapshot with valid format and attachment blobs", async () => {
		const blobs = new Map<string, ArrayBufferLike>();
		const detachedBlobStorage: IDetachedBlobStorage = {
			createBlob: async (file) => {
				const response: ICreateBlobResponse = {
					id: uuid(),
				};
				blobs.set(response.id, file);
				return response;
			},
			getBlobIds: () => [...blobs.keys()],
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			readBlob: async (id) => blobs.get(id)!,
			get size() {
				return blobs.size;
			},
		};
		const loader = new Loader({
			codeLoader,
			documentServiceFactory: failProxy(),
			urlResolver: failProxy(),
			detachedBlobStorage,
		});
		const detached = await loader.createDetachedContainer({ package: "none" });
		await detachedBlobStorage.createBlob(stringToBuffer("whatever", "utf8"));
		const summary = detached.serialize();
		assert.strictEqual(
			summary,
			'{"type":1,"tree":{".protocol":{"tree":{"attributes":{"content":"{\\"minimumSequenceNumber\\":0,\\"sequenceNumber\\":0}","type":2},"quorumMembers":{"content":"[]","type":2},"quorumProposals":{"content":"[]","type":2},"quorumValues":{"content":"[[\\"code\\",{\\"key\\":\\"code\\",\\"value\\":{\\"package\\":\\"none\\"},\\"approvalSequenceNumber\\":0,\\"commitSequenceNumber\\":0,\\"sequenceNumber\\":0}]]","type":2}},"type":1},".app":{"tree":{},"type":1},".hasAttachmentBlobs":{"type":2,"content":"true"}}}',
			"summary does not match expected format",
		);
		await loader.rehydrateDetachedContainerFromSnapshot(summary);
	});
});
