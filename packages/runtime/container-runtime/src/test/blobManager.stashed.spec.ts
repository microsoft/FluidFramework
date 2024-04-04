import { strict as assert } from "assert";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import type { IDocumentStorageService } from "@fluidframework/driver-definitions/internal";
import { Deferred } from "@fluidframework/core-utils/internal";
import { ICreateBlobResponse } from "@fluidframework/protocol-definitions";
import { BlobManager, IBlobManagerRuntime } from "../blobManager.js";

export const failProxy = <T extends object>(handler: Partial<T> = {}) => {
	const proxy: T = new Proxy<T>(handler as T, {
		get: (t, p, r) => {
			if (p === "then") {
				return undefined;
			}
			if (handler !== undefined && p in handler) {
				return Reflect.get(t, p, r);
			}
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return failProxy();
		},
	});
	return proxy;
};

function createBlobManager(overrides?: Partial<ConstructorParameters<typeof BlobManager>[0]>) {
	return new BlobManager({
		blobRequested: overrides?.blobRequested ?? (() => assert.fail("blobRequested")),
		closeContainer: overrides?.closeContainer ?? (() => assert.fail("closeContainer")),
		getStorage: overrides?.getStorage ?? (() => assert.fail("getStorage")),
		isBlobDeleted: overrides?.isBlobDeleted ?? (() => assert.fail("isBlobDeleted")),
		routeContext: overrides?.routeContext ?? failProxy(),
		runtime:
			overrides?.runtime ?? failProxy<IBlobManagerRuntime>({ logger: createChildLogger() }),
		sendBlobAttachOp: overrides?.sendBlobAttachOp ?? (() => assert.fail("sendBlobAttachOp")),
		snapshot: overrides?.snapshot ?? {},
		stashedBlobs: overrides?.stashedBlobs,
	});
}

describe("BlobManager.stashed", () => {
	it("No Pending Stashed Uploads", () => {
		const blobManager = createBlobManager();
		assert.strictEqual(blobManager.hasPendingStashedUploads(), false);
	});

	it("Stashed blob", async () => {
		const createResponse = new Deferred<ICreateBlobResponse>();
		const blobManager = createBlobManager({
			stashedBlobs: {
				a: {
					blob: "a",
				},
			},
			getStorage: () =>
				failProxy<IDocumentStorageService>({
					createBlob: async () => {
						return createResponse.promise;
					},
				}),
		});
		assert.strictEqual(blobManager.hasPendingStashedUploads(), true);
		await Promise.race([
			new Promise<void>((resolve) => setTimeout(() => resolve(), 10)),
			blobManager.trackPendingStashedUploads(),
		]);
		assert.strictEqual(blobManager.hasPendingStashedUploads(), true);
		createResponse.resolve({
			id: "a",
		});
		await Promise.race([
			new Promise<void>((resolve) => setTimeout(() => resolve(), 10)),
			blobManager.trackPendingStashedUploads(),
		]);
		assert.strictEqual(blobManager.hasPendingStashedUploads(), false);
	});

	it("Stashed blob with upload older than TTL", async () => {
		const createResponse = new Deferred<ICreateBlobResponse>();
		const blobManager = createBlobManager({
			stashedBlobs: {
				a: {
					blob: "a",
					minTTLInSeconds: 100,
					uploadTime: Date.now() - 100 * 1000,
				},
			},
			getStorage: () =>
				failProxy<IDocumentStorageService>({
					createBlob: async () => {
						return createResponse.promise;
					},
				}),
		});
		assert.strictEqual(blobManager.hasPendingStashedUploads(), true);
		await Promise.race([
			new Promise<void>((resolve) => setTimeout(() => resolve(), 10)),
			blobManager.trackPendingStashedUploads(),
		]);
		assert.strictEqual(blobManager.hasPendingStashedUploads(), true);
		createResponse.resolve({
			id: "a",
		});
		await Promise.race([
			new Promise<void>((resolve) => setTimeout(() => resolve(), 10)),
			blobManager.trackPendingStashedUploads(),
		]);
		assert.strictEqual(blobManager.hasPendingStashedUploads(), false);
	});

	it("Stashed blob with upload within TTL half-life", async () => {
		const blobManager = createBlobManager({
			stashedBlobs: {
				a: {
					blob: "a",
					minTTLInSeconds: 100,
					uploadTime: Date.now() - 25 * 1000,
				},
			},
		});
		assert.strictEqual(blobManager.hasPendingStashedUploads(), false);
	});
});
