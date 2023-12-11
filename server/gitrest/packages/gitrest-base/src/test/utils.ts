/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as util from "util";
import nconf from "nconf";
import rimrafCallback from "rimraf";
import { IStorageDirectoryConfig } from "../utils";

export type gitLibType = "isomorphic-git";
export interface IRouteTestMode {
	name: string;
	gitLibrary: gitLibType;
	repoPerDocEnabled: boolean;
}
export interface ISummaryTestMode {
	repoPerDocEnabled: boolean;
    enableLowIoWrite: boolean;
    enableOptimizedInitialSummary: boolean;
    enableSlimGitInit: boolean;
}

export const defaultProvider = new nconf.Provider({}).use("memory").defaults({
	logger: {
		colorize: true,
		json: false,
		level: "info",
		morganFormat: "dev",
		timestamp: true,
	},
	storageDir: {
		baseDir: "/tmp/historian",
		useRepoOwner: true,
	},
	externalStorage: {
		enabled: false,
		endpoint: "http://localhost:3005",
	},
	git: {
		lib: {
			name: "isomorphic-git",
		},
		filesystem: {
			name: "nodeFs"
		},
		ephemeralfilesystem: {
			name: "redisFs"
		},
		persistLatestFullSummary: false,
		repoPerDocEnabled: false,
		enableRepositoryManagerMetrics: false,
		apiMetricsSamplingPeriod: 100,
		enableLowIoWrite: false,
		enableOptimizedInitialSummary: false,
		enableSlimGitInit: false,
		enableRedisFsMetrics: true,
		redisApiMetricsSamplingPeriod: 0,
		enforceStrictPersistedFullSummaryReads: false
	},
});

const rimraf = util.promisify(rimrafCallback);

export function initializeBeforeAfterTestHooks(provider: nconf.Provider) {
	afterEach(async () => {
		const storageDirConfig: IStorageDirectoryConfig = provider.get("storageDir");
		return rimraf(storageDirConfig.baseDir);
	});
}
