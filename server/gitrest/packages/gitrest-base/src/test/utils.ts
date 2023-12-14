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
			name: "nodeFs",
		},
		ephemeralfilesystem: {
			name: "redisFs",
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
		enforceStrictPersistedFullSummaryReads: false,
	},
});

const rimraf = util.promisify(rimrafCallback);

export function initializeBeforeAfterTestHooks(provider: nconf.Provider) {
	afterEach(async () => {
		const storageDirConfig: IStorageDirectoryConfig = provider.get("storageDir");
		return rimraf(storageDirConfig.baseDir);
	});
}

export function convertAllUtf8ToBase64<T>(obj: Record<string, any>): T {
	return JSON.parse(
		JSON.stringify(obj, (key, value: any): any => {
			// console.log(key, value);
			if (
				typeof value === "object" &&
				value !== null &&
				value.encoding === "utf-8" &&
				value.content
			) {
				const originalValue = value;
				const newValue = {
					content: Buffer.from(value.content, "utf-8").toString("base64"),
					encoding: "base64",
					size: undefined,
				};
				if (originalValue.size !== undefined) {
					newValue.size = newValue.content.length;
				}
				return {
					...originalValue,
					...newValue,
				};
			}
			return value;
		}),
	) as unknown as T;
}
