/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
	exists,
	getGitManagerFactoryParamsFromConfig,
	getRepoInfoFromParamsAndStorageConfig,
	IsomorphicGitManagerFactory,
	NodeFsManagerFactory,
	type IRepoManagerParams,
} from "../utils";
import { defaultProvider, initializeBeforeAfterTestHooks } from "./utils";
import type { Stats } from "fs";
import path from "path";

describe("IsomorphicGitManagerFactory", function () {
	let repoManagerFactory: IsomorphicGitManagerFactory;
	let fileSystemManagerFactory: NodeFsManagerFactory;
	let repoManagerParams: IRepoManagerParams;

	beforeEach(function () {
		const {
			storageDirectoryConfig,
			apiMetricsSamplingPeriod,
			repoPerDocEnabled,
			enableRepositoryManagerMetrics,
			enableSlimGitInit,
			externalStorageManager,
		} = getGitManagerFactoryParamsFromConfig(defaultProvider);
		fileSystemManagerFactory = new NodeFsManagerFactory();
		repoManagerFactory = new IsomorphicGitManagerFactory(
			storageDirectoryConfig,
			{
				defaultFileSystemManagerFactory: fileSystemManagerFactory,
			},
			externalStorageManager,
			repoPerDocEnabled,
			enableRepositoryManagerMetrics,
			enableSlimGitInit,
			apiMetricsSamplingPeriod,
		);
		repoManagerParams = {
			repoOwner: "test-owner",
			repoName: "test-name",
			storageRoutingId: {
				documentId: "test-document",
				tenantId: "test-tenant",
			},
		};
		const { directoryPath } = getRepoInfoFromParamsAndStorageConfig(
			repoPerDocEnabled,
			repoManagerParams,
			storageDirectoryConfig,
		);
		repoManagerParams.fileSystemManagerParams = {
			rootDir: directoryPath,
		};
	});

	initializeBeforeAfterTestHooks(defaultProvider);

	it("should create a repo", async function () {
		await assert.doesNotReject(() => repoManagerFactory.create(repoManagerParams));
		const fsManager = fileSystemManagerFactory.create(
			repoManagerParams.fileSystemManagerParams,
		);
		const directoryExists = await exists(
			fsManager,
			repoManagerParams.fileSystemManagerParams.rootDir,
		);
		assert.notStrictEqual(
			directoryExists,
			false,
			"repo directory exists() should return Stats",
		);
		assert.strictEqual(
			(directoryExists as Stats).isDirectory(),
			true,
			"repo directory should exist",
		);
		const gitObjectsDirectoryShouldExist = await exists(
			fsManager,
			path.join(repoManagerParams.fileSystemManagerParams.rootDir, "/objects"),
		);
		assert.notStrictEqual(
			gitObjectsDirectoryShouldExist,
			false,
			"repo/objects exists() should return Stats",
		);
		assert.strictEqual(
			(gitObjectsDirectoryShouldExist as Stats).isDirectory(),
			true,
			"repo/objects directory should exist",
		);
	});
	it("should open an existing repo", async function () {
		await assert.doesNotReject(() => repoManagerFactory.create(repoManagerParams));
		await assert.doesNotReject(() => repoManagerFactory.open(repoManagerParams));
	});
	it("should fail to open a non-existing repo", async function () {
		const fsManager = fileSystemManagerFactory.create(
			repoManagerParams.fileSystemManagerParams,
		);
		assert.strictEqual(
			await exists(fsManager, repoManagerParams.fileSystemManagerParams.rootDir),
			false,
		);
		await assert.rejects(() => repoManagerFactory.open(repoManagerParams));
	});
	it("should fail to open a non-existing repo even if root directory exists", async function () {
		const fsManager = fileSystemManagerFactory.create(
			repoManagerParams.fileSystemManagerParams,
		);
		await fsManager.promises.mkdir(repoManagerParams.fileSystemManagerParams.rootDir, {
			recursive: true,
		});
		const directoryExists = await exists(
			fsManager,
			repoManagerParams.fileSystemManagerParams.rootDir,
		);
		assert.notStrictEqual(
			directoryExists,
			false,
			"repo directory exists() should return Stats",
		);
		assert.strictEqual(
			(directoryExists as Stats).isDirectory(),
			true,
			"repo directory should exist",
		);

		await assert.rejects(() => repoManagerFactory.open(repoManagerParams));
	});
});
