/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import * as sinon from "sinon";
import {
	IFileSystemManagerParams,
	IRepoManagerParams,
	IsomorphicGitManagerFactory,
	MemFsManagerFactory,
	SystemErrors,
} from "../utils";
import { NullExternalStorageManager } from "../externalStorageManager";
import { sizeof } from "../utils";

/**
 * Get a string that cannot be compressed by zlib.
 * http://blog.chenshuo.com/2014/05/incompressible-zlibdeflate-data.html
 * @param length - The length of the string to generate (substring of the incompressible string).
 */
function getIncompressibleString(length?: number): string {
	const incompressible: string[] = [];
	for (let step = 1; step <= 128; ++step) {
		for (let inc = 0; inc < step; ++inc) {
			for (let i = inc; i < 256; i += step) {
				incompressible.push(String.fromCharCode(i));
			}
		}
	}
	const incompressibleString = incompressible.join("");
	if (length === undefined) {
		return incompressibleString;
	}

	if (length > incompressibleString.length) {
		throw new Error(
			`Requested incompressible string length ${length} is greater than the maximum possible length ${incompressibleString.length}`,
		);
	}
	return incompressibleString.substring(0, length);
}

describe("isomorphic-git manager", () => {
	/**
	 * The maximum file size that can be created in the filesystem.
	 * This will be applied _after_ compression.
	 */
	const fsMaxFileSizeBytes = 5 * 1024;
	/**
	 * The maximum file size that can be created in the git repository.
	 * This will be applied _before_ compression.
	 *
	 * This is 3x larger than fsMaxFileSizeBytes to ensure that we can accurately
	 * test the size limits of the filesystem distinctly from the git repository.
	 */
	const gitMaxBlobSizeBytes = getIncompressibleString().length;
	const fsFactory = new MemFsManagerFactory(fsMaxFileSizeBytes);
	const repoManagerFactory = new IsomorphicGitManagerFactory(
		{ useRepoOwner: false },
		{ defaultFileSystemManagerFactory: fsFactory },
		new NullExternalStorageManager(),
		true /* repoPerDocEnabled */,
		false /* enableRepositoryManagerMetrics */,
		true /* enableSlimGitInit */,
		undefined /* apiSamplingPeriod */,
		gitMaxBlobSizeBytes,
	);
	const repoManagerParams: IRepoManagerParams = {
		repoOwner: "fluid",
		repoName: "test",
		storageRoutingId: {
			tenantId: "fluid",
			documentId: "test",
		},
		fileSystemManagerParams: {
			rootDir: "/",
		},
		optimizeForInitialSummary: true,
		isEphemeralContainer: false,
	};

	afterEach(() => {
		fsFactory.volume.reset();
	});

	describe("ephemeral filesystem isolation", () => {
		const sandbox = sinon.createSandbox();
		const physicalContainerName = "pd2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

		afterEach(() => sandbox.restore());

		function createFactory(repoPerDocEnabled: boolean, includeEphemeral = true) {
			const durable = new MemFsManagerFactory(fsMaxFileSizeBytes);
			const ephemeral = new MemFsManagerFactory(fsMaxFileSizeBytes);
			const durableCreate = sandbox.spy(durable, "create");
			const ephemeralCreate = sandbox.spy(ephemeral, "create");
			const factory = new IsomorphicGitManagerFactory(
				{ useRepoOwner: false },
				{
					defaultFileSystemManagerFactory: durable,
					ephemeralFileSystemManagerFactory: includeEphemeral ? ephemeral : undefined,
				},
				new NullExternalStorageManager(),
				repoPerDocEnabled,
				false,
				true,
				undefined,
				gitMaxBlobSizeBytes,
			);
			return { factory, durableCreate, ephemeralCreate };
		}

		for (const repoPerDocEnabled of [false, true]) {
			it(`creates and opens isolated EC and DC repositories with per-doc=${repoPerDocEnabled}`, async () => {
				const { factory, durableCreate, ephemeralCreate } =
					createFactory(repoPerDocEnabled);
				const durable = await factory.create(repoManagerParams);
				const ephemeralParams = {
					...repoManagerParams,
					isEphemeralContainer: true,
					fileSystemManagerParams: { storageName: "storage-account" },
				};
				const ephemeral = await factory.create(ephemeralParams);
				const blob = await ephemeral.createBlob({
					content: "ephemeral",
					encoding: "utf-8",
				});
				await assert.rejects(durable.getBlob(blob.sha));
				const reopened = await factory.open(ephemeralParams);
				assert.strictEqual(
					(await reopened.getBlob(blob.sha)).content,
					Buffer.from("ephemeral").toString("base64"),
				);
				assert.strictEqual(ephemeral.path, repoPerDocEnabled ? "fluid/test" : "test");
				sinon.assert.calledOnce(durableCreate);
				sinon.assert.calledTwice(ephemeralCreate);
				await factory.open(repoManagerParams);
				sinon.assert.calledTwice(durableCreate);
			});

			for (const operation of ["create", "open"] as const) {
				it(`rejects ${operation} without an EC filesystem before DC access with per-doc=${repoPerDocEnabled}`, async () => {
					const { factory, durableCreate } = createFactory(repoPerDocEnabled, false);
					await factory.create(repoManagerParams);
					durableCreate.resetHistory();

					await assert.rejects(
						factory[operation]({ ...repoManagerParams, isEphemeralContainer: true }),
						{ name: "NetworkError", code: 503, canRetry: false },
					);

					sinon.assert.notCalled(durableCreate);
				});

				const routingCases: IFileSystemManagerParams[] = [
					{ physicalContainerName },
					{ storageLayoutVersion: "v2" },
					{ storageLifecycleVersion: "generation-1" },
					{
						physicalContainerName,
						storageLayoutVersion: "v2",
						storageLifecycleVersion: "generation-1",
					},
				];
				for (const routing of routingCases) {
					it(`rejects mixed EC/DC ${operation} routing ${Object.keys(routing).join(
						",",
					)} with per-doc=${repoPerDocEnabled}`, async () => {
						const { factory, durableCreate, ephemeralCreate } =
							createFactory(repoPerDocEnabled);

						await assert.rejects(
							factory[operation]({
								...repoManagerParams,
								isEphemeralContainer: true,
								fileSystemManagerParams: routing,
							}),
							{
								name: "NetworkError",
								code: 400,
								canRetry: false,
								message: "Ephemeral requests cannot use durable storage routing.",
							},
						);

						sinon.assert.notCalled(durableCreate);
						sinon.assert.notCalled(ephemeralCreate);
					});
				}
			}
		}
	});

	it("uses the authorized physical container as the repository root", async () => {
		const physicalContainerName = "pd2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		const repoManager = await repoManagerFactory.create({
			...repoManagerParams,
			repoName: "physical-root-test",
			storageRoutingId: {
				tenantId: "fluid",
				documentId: "physical-root-test",
			},
			fileSystemManagerParams: {
				...repoManagerParams.fileSystemManagerParams,
				physicalContainerName,
				storageLayoutVersion: "v2",
				storageLifecycleVersion: "generation-1",
			},
		});

		assert.strictEqual(repoManager.path, `${physicalContainerName}/physical-root-test`);
	});

	it("rejects physical-container routing when repo-per-document mode is disabled", async () => {
		const repoPerTenantFactory = new IsomorphicGitManagerFactory(
			{ useRepoOwner: false },
			{ defaultFileSystemManagerFactory: fsFactory },
			new NullExternalStorageManager(),
			false /* repoPerDocEnabled */,
			false /* enableRepositoryManagerMetrics */,
			true /* enableSlimGitInit */,
			undefined /* apiSamplingPeriod */,
			gitMaxBlobSizeBytes,
		);

		await assert.rejects(
			repoPerTenantFactory.create({
				...repoManagerParams,
				fileSystemManagerParams: {
					...repoManagerParams.fileSystemManagerParams,
					physicalContainerName:
						"pd2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
					storageLayoutVersion: "v2",
					storageLifecycleVersion: "generation-1",
				},
			}),
			(error: unknown) =>
				error instanceof Error &&
				error.message === "Physical-container routing requires repo-per-document mode.",
		);
	});

	it("rejects an invalid physical container supplied directly to the factory", async () => {
		await assert.rejects(
			repoManagerFactory.create({
				...repoManagerParams,
				fileSystemManagerParams: {
					...repoManagerParams.fileSystemManagerParams,
					physicalContainerName: "../victim",
					storageLayoutVersion: "v2",
					storageLifecycleVersion: "generation-1",
				},
			}),
			/Invalid physical container name/,
		);
	});

	describe("ref SHA validation", () => {
		const canonicalSha = "0123456789abcdef0123456789abcdef01234567";

		for (const sha of [
			"refs/heads/main",
			"../heads/main",
			"",
			canonicalSha.slice(1),
			`${canonicalSha}0`,
			canonicalSha.toUpperCase(),
			`g${canonicalSha.slice(1)}`,
			`${canonicalSha}\n`,
		]) {
			it(`rejects creating a ref with noncanonical SHA ${JSON.stringify(sha)}`, async () => {
				const repoManager = await repoManagerFactory.create(repoManagerParams);
				await repoManager.createRef({ ref: "refs/heads/main", sha: canonicalSha });

				await assert.rejects(repoManager.createRef({ ref: "refs/heads/other", sha }), {
					name: "NetworkError",
					code: 400,
				});
			});

			it(`rejects patching a ref with noncanonical SHA ${JSON.stringify(sha)}`, async () => {
				const repoManager = await repoManagerFactory.create(repoManagerParams);
				await repoManager.createRef({ ref: "refs/heads/main", sha: canonicalSha });

				await assert.rejects(
					repoManager.patchRef("refs/heads/main", { sha, force: true }),
					{ name: "NetworkError", code: 400 },
				);
			});
		}

		it("creates and patches refs with canonical SHAs", async () => {
			const repoManager = await repoManagerFactory.create(repoManagerParams);
			const created = await repoManager.createRef({
				ref: "refs/heads/main",
				sha: canonicalSha,
			});
			assert.strictEqual(created.object.sha, canonicalSha);
			const updatedSha = "abcdef0123456789abcdef0123456789abcdef01";
			const patched = await repoManager.patchRef("refs/heads/main", {
				sha: updatedSha,
				force: true,
			});
			assert.strictEqual(patched.object.sha, updatedSha);
			assert.strictEqual(
				(await repoManager.getRef("refs/heads/main")).object.sha,
				updatedSha,
			);
		});
	});

	it("should create/read a blob", async () => {
		const repoManager = await repoManagerFactory.create(repoManagerParams);
		const base64BlobContents = Buffer.from("Hello, World!", "utf-8").toString("base64");
		const createBlobResponse = await repoManager.createBlob({
			content: base64BlobContents,
			encoding: "base64",
		});
		const readBlobResponse = await repoManager.getBlob(createBlobResponse.sha);
		assert.strictEqual(readBlobResponse.content, base64BlobContents);
		assert.strictEqual(readBlobResponse.encoding, "base64");
		assert.strictEqual(readBlobResponse.sha, createBlobResponse.sha);
		assert.strictEqual(readBlobResponse.size, base64BlobContents.length);
	});

	it("should not create a too large file", async () => {
		const repoManager = await repoManagerFactory.create(repoManagerParams);
		/**
		 * Using an incompressible string that is less than the maximum allowed size for Git,
		 * but greater than the maximum allowed size for the filesystem, allows us to test the
		 * size limits of the filesystem distinctly from the git repository's limits.
		 *
		 * This is relevant for multi-filesystem scenarios where different filesystems may have a
		 * different maximum file size from the service's Git repo limit. In those cases, compression does not matter,
		 * because a compressed file in a filesystem is fine. The issue is when the file is too large to be stored in the service's memory.
		 */
		const base64BlobContents = Buffer.from(
			getIncompressibleString(fsMaxFileSizeBytes + 1),
		).toString("base64");
		assert(
			sizeof(base64BlobContents) > fsMaxFileSizeBytes,
			`Blob size: ${sizeof(base64BlobContents)} should be greater than ${fsMaxFileSizeBytes}`,
		);
		assert(
			sizeof(base64BlobContents) < gitMaxBlobSizeBytes,
			`Blob size: ${sizeof(base64BlobContents)} should be less than ${gitMaxBlobSizeBytes}`,
		);
		await assert.rejects(
			async () =>
				await repoManager.createBlob({
					content: base64BlobContents,
					encoding: "base64",
				}),
			{
				// This error should be thrown from the Filesystem layer because the size is
				// less than the gitMaxFileSizeBytes, but greater than the fsMaxFileSizeBytes.
				name: "FilesystemError",
				code: SystemErrors.EFBIG.code,
			},
		);
	});

	it("should not create a too large blob", async () => {
		const repoManager = await repoManagerFactory.create(repoManagerParams);
		/**
		 * A blob of all "a"s that is one byte larger than the maximum allowed size
		 * This blob is highly compressible, so it will go around any filesystem level size limits
		 * after isomorphic-git uses Pako deflate (zlib) to compress it.
		 *
		 * If this test fails, it is likely because the Git blob size check is happening after compression,
		 * when it should be happening before it.
		 */
		const base64BlobContents = Buffer.from("a".repeat(gitMaxBlobSizeBytes + 1)).toString(
			"base64",
		);
		assert(
			sizeof(base64BlobContents) > gitMaxBlobSizeBytes,
			`Blob size: ${sizeof(base64BlobContents)} should be greater than ${fsMaxFileSizeBytes}`,
		);
		await assert.rejects(
			async () =>
				await repoManager.createBlob({
					content: base64BlobContents,
					encoding: "base64",
				}),
			{
				// This error should be thrown from the git layer because the size is
				// greater than the gitMaxBlobSizeBytes before compression.
				name: "NetworkError",
				code: 413,
			},
		);
	});
});
