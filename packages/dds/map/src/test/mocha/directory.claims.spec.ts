/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockSharedObjectServices,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import type { IDirectoryNewStorageFormat } from "../../directory.js";
import { type ISharedDirectory, SharedDirectory } from "../../index.js";

function makeRuntime(enableClaims: boolean): MockFluidDataStoreRuntime {
	const runtime = new MockFluidDataStoreRuntime({
		registry: [SharedDirectory.getFactory()],
	});
	if (enableClaims) {
		runtime.options.enableDdsClaims = true;
	}
	return runtime;
}

function createConnectedDirectoryWithClaims(
	id: string,
	runtimeFactory: MockContainerRuntimeFactory,
	enableClaims = true,
): { directory: ISharedDirectory; runtime: MockFluidDataStoreRuntime } {
	const runtime = makeRuntime(enableClaims);
	const containerRuntime = runtimeFactory.createContainerRuntime(runtime);
	const services = {
		deltaConnection: runtime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};
	const directory = SharedDirectory.create(runtime, id);
	directory.connect(services);
	void containerRuntime;
	return { directory, runtime };
}

describe("SharedDirectory claims", () => {
	describe("Feature flag", () => {
		it("trySetClaim throws when enableDdsClaims is not set", async () => {
			const factory = new MockContainerRuntimeFactory();
			const { directory } = createConnectedDirectoryWithClaims("d", factory, false);
			await assert.rejects(directory.trySetClaim("k", "v"), /enableDdsClaims/);
		});

		it("isClaimed returns false for unknown keys (regardless of flag)", () => {
			const factory = new MockContainerRuntimeFactory();
			const { directory } = createConnectedDirectoryWithClaims("d", factory, false);
			assert.strictEqual(directory.isClaimed("k"), false);
		});
	});

	describe("Single client", () => {
		it("first claim succeeds and is observable via get", async () => {
			const factory = new MockContainerRuntimeFactory();
			const { directory } = createConnectedDirectoryWithClaims("d", factory);
			const promise = directory.trySetClaim("k", "v1");
			factory.processAllMessages();
			const result = await promise;
			assert.strictEqual(result, "Success");
			assert.strictEqual(directory.isClaimed("k"), true);
			assert.strictEqual(directory.get("k"), "v1");
		});

		it("repeated claim from winner returns Success", async () => {
			const factory = new MockContainerRuntimeFactory();
			const { directory } = createConnectedDirectoryWithClaims("d", factory);
			const p1 = directory.trySetClaim("k", "v1");
			factory.processAllMessages();
			assert.strictEqual(await p1, "Success");
			// Second call: synchronous resolution since key is locally known claimed and
			// this client is the recorded winner.
			const r2 = await directory.trySetClaim("k", "v2");
			assert.strictEqual(r2, "Success");
			// Value is unchanged — claim is immutable.
			assert.strictEqual(directory.get("k"), "v1");
		});

		it("set on a claimed key throws synchronously", async () => {
			const factory = new MockContainerRuntimeFactory();
			const { directory } = createConnectedDirectoryWithClaims("d", factory);
			const p1 = directory.trySetClaim("k", "v1");
			factory.processAllMessages();
			await p1;
			assert.throws(() => directory.set("k", "other"), /claimed/);
		});

		it("delete on a claimed key throws synchronously", async () => {
			const factory = new MockContainerRuntimeFactory();
			const { directory } = createConnectedDirectoryWithClaims("d", factory);
			const p1 = directory.trySetClaim("k", "v1");
			factory.processAllMessages();
			await p1;
			assert.throws(() => directory.delete("k"), /claimed/);
		});

		it("clear preserves claimed entries", async () => {
			const factory = new MockContainerRuntimeFactory();
			const { directory } = createConnectedDirectoryWithClaims("d", factory);
			directory.set("regular", "x");
			const p = directory.trySetClaim("k", "v1");
			factory.processAllMessages();
			await p;
			directory.clear();
			factory.processAllMessages();
			assert.strictEqual(directory.get("k"), "v1");
			assert.strictEqual(directory.isClaimed("k"), true);
		});
	});

	describe("Two-client race", () => {
		it("exactly one client gets Success; the other gets AlreadyClaimed", async () => {
			const factory = new MockContainerRuntimeFactory();
			const { directory: d1 } = createConnectedDirectoryWithClaims("d1", factory);
			const { directory: d2 } = createConnectedDirectoryWithClaims("d2", factory);

			const p1 = d1.trySetClaim("k", "v-from-1");
			const p2 = d2.trySetClaim("k", "v-from-2");
			factory.processAllMessages();
			const [r1, r2] = await Promise.all([p1, p2]);

			const successes = [r1, r2].filter((r) => r === "Success").length;
			const failures = [r1, r2].filter((r) => r === "AlreadyClaimed").length;
			assert.strictEqual(successes, 1, "exactly one Success expected");
			assert.strictEqual(failures, 1, "exactly one AlreadyClaimed expected");

			// Both observers see the same claimed value.
			assert.strictEqual(d1.get("k"), d2.get("k"));
			assert.ok(d1.isClaimed("k"));
			assert.ok(d2.isClaimed("k"));
		});

		it("loser repeating trySetClaim still gets AlreadyClaimed", async () => {
			const factory = new MockContainerRuntimeFactory();
			const { directory: d1 } = createConnectedDirectoryWithClaims("d1", factory);
			const { directory: d2 } = createConnectedDirectoryWithClaims("d2", factory);

			const p1 = d1.trySetClaim("k", "v-from-1");
			const p2 = d2.trySetClaim("k", "v-from-2");
			factory.processAllMessages();
			const [r1, r2] = await Promise.all([p1, p2]);
			const winner = r1 === "Success" ? d1 : d2;
			const loser = r1 === "Success" ? d2 : d1;
			void r2;

			// Repeats: winner sees Success, loser sees AlreadyClaimed.
			assert.strictEqual(await winner.trySetClaim("k", "again"), "Success");
			assert.strictEqual(await loser.trySetClaim("k", "again"), "AlreadyClaimed");
		});
	});

	describe("Detached", () => {
		it("trySetClaim resolves synchronously to Success and survives attach", async () => {
			const runtime = new MockFluidDataStoreRuntime({
				attachState: AttachState.Detached,
				registry: [SharedDirectory.getFactory()],
			});
			runtime.options.enableDdsClaims = true;
			const directory = SharedDirectory.create(runtime, "d");
			const result = await directory.trySetClaim("k", "v1");
			assert.strictEqual(result, "Success");
			assert.strictEqual(directory.get("k"), "v1");

			// Round-trip via summary → reload.
			const summary = directory.getAttachSummary().summary;
			const services = MockSharedObjectServices.createFromSummary(summary);
			const runtime2 = makeRuntime(true);
			const factory = SharedDirectory.getFactory();
			const reloaded = (await factory.load(
				runtime2,
				"d",
				services,
				factory.attributes,
			)) as ISharedDirectory;
			assert.strictEqual(reloaded.isClaimed("k"), true);
			assert.strictEqual(reloaded.get("k"), "v1");
		});
	});

	describe("Summary back-compat", () => {
		it("loads a snapshot without a claims field", async () => {
			const oldFormat: IDirectoryNewStorageFormat = {
				blobs: [],
				content: { storage: { foo: { type: "Plain", value: "bar" } } },
			};
			const services = MockSharedObjectServices.createFromSummary({
				type: 1, // SummaryType.Tree
				tree: {
					header: {
						type: 2, // SummaryType.Blob
						content: JSON.stringify(oldFormat),
					},
				},
			} as never);
			const runtime = makeRuntime(true);
			const factory = SharedDirectory.getFactory();
			const directory = (await factory.load(
				runtime,
				"d",
				services,
				factory.attributes,
			)) as ISharedDirectory;
			assert.strictEqual(directory.get("foo"), "bar");
			assert.strictEqual(directory.isClaimed("foo"), false);
		});
	});

	describe("Sequenced rehydration", () => {
		it("reload from summary keeps claimed values; new client is loser-on-retry", async () => {
			const factory = new MockContainerRuntimeFactory();
			const { directory: d1 } = createConnectedDirectoryWithClaims("d1", factory);
			const p1 = d1.trySetClaim("k", "v1");
			factory.processAllMessages();
			await p1;

			const summary = d1.getAttachSummary().summary;
			const services = MockSharedObjectServices.createFromSummary(summary);
			const runtime2 = makeRuntime(true);
			const dirFactory = SharedDirectory.getFactory();
			const reloaded = (await dirFactory.load(
				runtime2,
				"d2",
				services,
				dirFactory.attributes,
			)) as ISharedDirectory;
			assert.strictEqual(reloaded.isClaimed("k"), true);
			assert.strictEqual(reloaded.get("k"), "v1");

			// On the reloaded client, no client is the winner; trySetClaim returns
			// AlreadyClaimed (loser-on-retry behavior per spec).
			const r = await reloaded.trySetClaim("k", "v2");
			assert.strictEqual(r, "AlreadyClaimed");
		});
	});
});
