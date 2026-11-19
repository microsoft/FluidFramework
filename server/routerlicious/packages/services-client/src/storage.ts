/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type * as git from "@fluidframework/gitresources";
import type * as api from "@fluidframework/protocol-definitions";
import type { RawAxiosRequestHeaders } from "axios";

import type {
	IWholeSummaryPayload,
	IWholeFlatSummary,
	IWriteSummaryResponse,
	IWholeSummaryPayloadType,
} from "./storageContracts";

/**
 * Required params to create ref with config
 * @internal
 */
export interface ICreateRefParamsExternal extends git.ICreateRefParams {
	config?: IExternalWriterConfig;
}

/**
 * Required params to get ref with config
 * @internal
 */
export interface IGetRefParamsExternal {
	config?: IExternalWriterConfig;
}

/**
 * Required params to patch ref with config
 * @internal
 */
export interface IPatchRefParamsExternal extends git.IPatchRefParams {
	config?: IExternalWriterConfig;
}

/**
 * @internal
 */
export interface IExternalWriterConfig {
	enabled: boolean;
}

/**
 * Git cache data
 * @internal
 */
export interface IGitCache {
	// Cached blob values
	blobs: git.IBlob[];

	// Reference mapping
	refs: { [key: string]: string };

	// All trees contained in the commit (includes submodules)
	trees: git.ITree[];

	// Commits for each module
	commits: git.ICommit[];
}

/**
 * Interface to a generic Git provider
 * @internal
 */
export interface IGitService {
	getBlob(sha: string): Promise<git.IBlob>;
	createBlob(blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse>;
	getContent(path: string, ref: string): Promise<any>;
	getCommits(sha: string, count: number): Promise<git.ICommitDetails[]>;
	getCommit(sha: string): Promise<git.ICommit>;
	createCommit(commit: git.ICreateCommitParams): Promise<git.ICommit>;
	getRefs(): Promise<git.IRef[]>;
	getRef(ref: string): Promise<git.IRef | null>;
	createRef(params: git.ICreateRefParams): Promise<git.IRef>;
	updateRef(ref: string, params: git.IPatchRefParams): Promise<git.IRef>;
	deleteRef(ref: string): Promise<void>;
	createTag(tag: git.ICreateTagParams): Promise<git.ITag>;
	getTag(tag: string): Promise<git.ITag>;
	createTree(tree: git.ICreateTreeParams): Promise<git.ITree>;
	getTree(sha: string, recursive: boolean): Promise<git.ITree>;
	createSummary(summary: IWholeSummaryPayload, initial?: boolean): Promise<IWriteSummaryResponse>;
	deleteSummary(softDelete: boolean): Promise<void>;
	getSummary(sha: string): Promise<IWholeFlatSummary>;
}

/**
 * The Historian extends the git service by providing access to document header information stored in
 * the repository
 * @internal
 */
export interface IHistorian extends IGitService {
	endpoint: string;

	/**
	 * Retrieves the header for the given document
	 */
	getHeader(sha: string): Promise<git.IHeader>;
	getFullTree(sha: string): Promise<any>;
}

/**
 * Filters out potentially dangerous headers that could compromise security
 * @internal
 */
function filterSafeHeaders(headers: RawAxiosRequestHeaders): RawAxiosRequestHeaders {
	const dangerousHeaders = [
		"authorization",
		"cookie",
		"x-auth-token",
		"bearer",
		"x-auth",
		"auth",
		"token",
		"storagename",
	];

	const filtered: RawAxiosRequestHeaders = {};
	for (const [key, value] of Object.entries(headers)) {
		const isSecurityHeader = dangerousHeaders.some((dangerous) =>
			key.toLowerCase().includes(dangerous.toLowerCase()),
		);

		if (!isSecurityHeader) {
			filtered[key] = value;
		}
	}

	return filtered;
}

/**
 * Configuration options for customizing the GitManager creation
 * @internal
 */
export interface IGitManagerConfig {
	/** Default query string parameters */
	defaultQueryString?: Record<string, any>;
	/** Maximum body length for requests */
	maxBodyLength?: number;
	/** Maximum content length for requests */
	maxContentLength?: number;
	/** Default headers to include */
	defaultHeaders?: RawAxiosRequestHeaders;
	/** Custom function to get default headers */
	getDefaultHeaders?: () => RawAxiosRequestHeaders;
	/** Custom function to refresh default query string */
	refreshDefaultQueryString?: () => Record<string, any>;
	/** Custom function to refresh default headers */
	refreshDefaultHeaders?: () => RawAxiosRequestHeaders;
	/** Custom function to refresh tokens when needed */
	refreshTokenIfNeeded?: (
		authorizationHeader: RawAxiosRequestHeaders,
	) => Promise<RawAxiosRequestHeaders | undefined>;
	/** Custom function to get correlation ID */
	getCorrelationId?: () => string | undefined;
	/** Custom function to get telemetry properties */
	getTelemetryProperties?: () => Record<string, any>;
	/** Custom function to log HTTP metrics */
	logHttpMetrics?: (requestProps: any) => void;
	/** Custom function to get service name */
	getServiceName?: () => string;
}

/**
 * Decorator function type for customizing GitManager configuration
 * @internal
 */
export type GitManagerConfigDecorator = (
	config: IGitManagerConfig,
	context: {
		tenantId: string;
		documentId: string;
		storageName?: string;
		isEphemeralContainer: boolean;
		accessToken: string;
		baseUrl: string;
	},
) => IGitManagerConfig;

/**
 * Utility decorator implementations for common use cases
 *
 * ⚠️ SECURITY NOTE: This decorator implements security protections to prevent
 * malicious code injection. Critical security functions (token refresh,
 * correlation ID, telemetry) are immutable and cannot be overridden.
 * Authorization headers and security-related headers are filtered and protected.
 *
 * @internal
 */
export const GitManagerConfigDecorators = {
	/**
	 * Applies custom configuration overrides with built-in security protections.
	 *
	 * 🔒 Security Features:
	 * - Filters out dangerous headers (authorization, auth tokens, cookies, etc.)
	 * - Protects critical security functions from being overridden
	 * - Preserves system-generated authorization and routing headers
	 * - Prevents token refresh logic manipulation
	 *
	 * @param customConfig - Partial configuration object or a function that receives
	 * the current config and context to return custom overrides
	 *
	 * @example Simple overrides (security-filtered):
	 * ```typescript
	 * GitManagerConfigDecorators.withCustom({
	 *   defaultHeaders: {
	 *     'X-Custom-Header': 'value', // ✅ Safe custom header
	 *     'Authorization': 'Bearer evil', // ❌ Filtered out for security
	 *   },
	 *   maxBodyLength: 2000 * 1024, // ✅ Safe limit override
	 *   logHttpMetrics: (props) => console.log('Custom metrics:', props), // ✅ Allowed
	 * })
	 * ```
	 *
	 * @example Context-aware overrides:
	 * ```typescript
	 * GitManagerConfigDecorators.withCustom((config, context) => ({
	 *   defaultHeaders: {
	 *     'X-Tenant-ID': context.tenantId, // ✅ Safe tenant info
	 *     'X-Document-Type': context.isEphemeralContainer ? 'ephemeral' : 'persistent',
	 *   },
	 *   maxBodyLength: context.isEphemeralContainer ? 100 * 1024 : 1000 * 1024,
	 * }))
	 * ```
	 *
	 * @example Protected functions (these are immutable for security):
	 * ```typescript
	 * // ❌ These overrides will be ignored for security:
	 * GitManagerConfigDecorators.withCustom({
	 *   refreshTokenIfNeeded: evilTokenStealer, // Ignored - security protected
	 *   getCorrelationId: () => 'hacked',       // Ignored - security protected
	 *   getTelemetryProperties: evilLogger,     // Ignored - security protected
	 * })
	 * ```
	 */
	withCustom:
		(
			customConfig:
				| Partial<IGitManagerConfig>
				| ((
						config: IGitManagerConfig,
						context: {
							tenantId: string;
							documentId: string;
							storageName?: string;
							isEphemeralContainer: boolean;
							accessToken: string;
							baseUrl: string;
						},
				  ) => Partial<IGitManagerConfig>),
		): GitManagerConfigDecorator =>
		(config, context) => {
			const overrides =
				typeof customConfig === "function" ? customConfig(config, context) : customConfig;

			// Apply customizations with security filtering
			const secureConfig = {
				...config,
				...overrides,
				// Handle nested objects properly by merging them with security filtering
				defaultHeaders: {
					...config.defaultHeaders,
					...filterSafeHeaders(overrides.defaultHeaders || {}),
				},
				defaultQueryString: {
					...config.defaultQueryString,
					...overrides.defaultQueryString,
				},
			};

			// 🔒 IMMUTABLE SECURITY LAYER - These critical functions cannot be overridden
			secureConfig.refreshTokenIfNeeded = config.refreshTokenIfNeeded;
			secureConfig.getCorrelationId = config.getCorrelationId;
			secureConfig.getTelemetryProperties = config.getTelemetryProperties;
			secureConfig.getServiceName = config.getServiceName;

			// Ensure authorization and other security-critical headers are preserved
			if (config.defaultHeaders?.Authorization) {
				secureConfig.defaultHeaders.Authorization = config.defaultHeaders.Authorization;
			}
			if (config.defaultHeaders?.StorageName) {
				secureConfig.defaultHeaders.StorageName = config.defaultHeaders.StorageName;
			}

			return secureConfig;
		},

	/**
	 * Composes multiple decorators into one
	 */
	compose:
		(...decorators: GitManagerConfigDecorator[]): GitManagerConfigDecorator =>
		(config, context) =>
			decorators.reduce((acc, decorator) => decorator(acc, context), config),
};

/**
 * @internal
 */
export interface IGitManager {
	getHeader(id: string, sha: string): Promise<api.ISnapshotTree>;
	getFullTree(sha: string): Promise<any>;
	getCommit(sha: string): Promise<git.ICommit>;
	getCommits(sha: string, count: number): Promise<git.ICommitDetails[]>;
	getTree(root: string, recursive: boolean): Promise<git.ITree>;
	getBlob(sha: string): Promise<git.IBlob>;
	getRawUrl(sha: string): string;
	getContent(commit: string, path: string): Promise<git.IBlob>;
	createBlob(content: string, encoding: string): Promise<git.ICreateBlobResponse>;
	createGitTree(params: git.ICreateTreeParams): Promise<git.ITree>;
	createTree(files: api.ITree): Promise<git.ITree>;
	createCommit(commit: git.ICreateCommitParams): Promise<git.ICommit>;
	// eslint-disable-next-line @rushstack/no-new-null
	getRef(ref: string): Promise<git.IRef | null>;
	createRef(branch: string, sha: string): Promise<git.IRef>;
	upsertRef(branch: string, commitSha: string): Promise<git.IRef>;
	write(
		branch: string,
		inputTree: api.ITree,
		parents: string[],
		message: string,
	): Promise<git.ICommit>;
	createSummary(summary: IWholeSummaryPayload, initial?: boolean): Promise<IWriteSummaryResponse>;
	deleteSummary(softDelete: boolean): Promise<void>;
	getSummary(sha: string): Promise<IWholeFlatSummary>;
}

/**
 * Uploads a summary to storage.
 * @internal
 */
export interface ISummaryUploadManager {
	/**
	 * Writes summary tree to storage.
	 * @param summaryTree - Summary tree to write to storage
	 * @param parentHandle - Parent summary acked handle (if available from summary ack)
	 * @param summaryType - type of summary being uploaded
	 * @param sequenceNumber - optional reference sequence number of the summary
	 * @returns Id of created tree as a string.
	 */
	writeSummaryTree(
		summaryTree: api.ISummaryTree,
		parentHandle: string,
		summaryType: IWholeSummaryPayloadType,
		sequenceNumber?: number,
		initial?: boolean,
		summaryTimeStr?: string,
	): Promise<string>;
}
