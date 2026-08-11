/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { toUtf8 } from "@fluidframework/common-utils";
import type { ICommit, ICommitDetails, ICreateCommitParams } from "@fluidframework/gitresources";
import {
	type IDocumentAttributes,
	type ICommittedProposal,
	type ISequencedDocumentMessage,
	type ISummaryTree,
	SummaryType,
} from "@fluidframework/protocol-definitions";
import {
	type IGitCache,
	SummaryTreeUploadManager,
	WholeSummaryUploadManager,
	type ISession,
	getGlobalTimeoutContext,
	type IGitManager,
	NetworkError,
} from "@fluidframework/server-services-client";
import {
	type IAdditionalQueryParams,
	type ICollection,
	type IDeliState,
	type IDocument,
	type IDocumentDetails,
	type IDocumentRepository,
	type IDocumentStorage,
	type IScribe,
	type ISequencedOperationMessage,
	type IStorageNameAllocator,
	type ITenantManager,
	SequencedOperationType,
	StageTrace,
} from "@fluidframework/server-services-core";
import {
	BaseTelemetryProperties,
	CommonProperties,
	getLumberBaseProperties,
	LumberEventName,
	Lumberjack,
	type Lumber,
} from "@fluidframework/server-services-telemetry";
import { AsyncLocalStorageContextProvider } from "@fluidframework/server-services-utils";
import * as winston from "winston";

/**
 * @internal
 */

export enum DocCreationStage {
	Started = "Started",
	StorageNameAllocated = "StorageNameAllocated",
	GitManagerCreated = "GitManagerCreated",
	DocCreationCompleted = "DocCreationCompleted",
	InitialSummaryUploaded = "InitialSummaryUploaded",
	DocCreated = "DocCreated",
}

// Basic protection against obvious attacks
const MAX_DEPTH = 10; // Prevent deep nesting attacks
const MAX_KEY_LENGTH = 200; // Prevent extremely long keys
const MAX_VALUE_LENGTH = 10000; // Prevent extremely long values
const MAX_OBJECT_SIZE = 100; // Prevent too many properties

export class DocumentStorage implements IDocumentStorage {
	protected readonly createDocContext: AsyncLocalStorageContextProvider<IAdditionalQueryParams> =
		new AsyncLocalStorageContextProvider<IAdditionalQueryParams>();
	constructor(
		protected readonly documentRepository: IDocumentRepository,
		protected readonly tenantManager: ITenantManager,
		protected readonly enableWholeSummaryUpload: boolean,
		protected readonly opsCollection: ICollection<ISequencedOperationMessage>,
		protected readonly storageNameAssigner: IStorageNameAllocator | undefined,
		protected readonly ephemeralDocumentTTLSec: number = 60 * 60 * 24, // 24 hours in seconds
	) {}

	/**
	 * Retrieves database details for the given document
	 */
	// eslint-disable-next-line @rushstack/no-new-null
	public async getDocument(tenantId: string, documentId: string): Promise<IDocument | null> {
		return this.documentRepository.readOne({ tenantId, documentId });
	}

	public async getOrCreateDocument(
		tenantId: string,
		documentId: string,
	): Promise<IDocumentDetails> {
		const getOrCreateP = this.getOrCreateObject(tenantId, documentId);

		return getOrCreateP;
	}

	private createInitialProtocolTree(
		sequenceNumber: number,
		values: [string, ICommittedProposal][],
	): ISummaryTree {
		const documentAttributes: IDocumentAttributes = {
			minimumSequenceNumber: sequenceNumber,
			sequenceNumber,
		};

		const summary: ISummaryTree = {
			tree: {
				attributes: {
					content: JSON.stringify(documentAttributes),
					type: SummaryType.Blob,
				},
				quorumMembers: {
					content: JSON.stringify([]),
					type: SummaryType.Blob,
				},
				quorumProposals: {
					content: JSON.stringify([]),
					type: SummaryType.Blob,
				},
				quorumValues: {
					content: JSON.stringify(values),
					type: SummaryType.Blob,
				},
			},
			type: SummaryType.Tree,
		};

		return summary;
	}

	private createFullTree(appTree: ISummaryTree, protocolTree: ISummaryTree): ISummaryTree {
		return this.enableWholeSummaryUpload
			? {
					type: SummaryType.Tree,
					tree: {
						".protocol": protocolTree,
						".app": appTree,
					},
			  }
			: {
					type: SummaryType.Tree,
					tree: {
						".protocol": protocolTree,
						...appTree.tree,
					},
			  };
	}

	protected async getGitManager(
		tenantId: string,
		documentId: string,
		storageName: string | undefined,
		isEphemeralContainer: boolean,
	): Promise<IGitManager> {
		return this.tenantManager.getTenantGitManager(
			tenantId,
			documentId,
			storageName,
			false /* includeDisabledTenant */,
			isEphemeralContainer,
		);
	}

	public async createDocument(
		tenantId: string,
		documentId: string,
		appTree: ISummaryTree,
		sequenceNumber: number,
		initialHash: string,
		ordererUrl: string,
		historianUrl: string,
		deltaStreamUrl: string,
		values: [string, ICommittedProposal][],
		enableDiscovery: boolean = false,
		isEphemeralContainer: boolean = false,
		messageBrokerId?: string,
		additionalQueryParams?: IAdditionalQueryParams,
	): Promise<IDocumentDetails> {
		// Basic security validation for extensibility point
		this.validateAdditionalQueryParams(additionalQueryParams);
		return this.createDocContext.bindContext(additionalQueryParams ?? {}, async () => {
			const createDocTrace = new StageTrace<DocCreationStage>(DocCreationStage.Started);
			const lumberjackProperties: Record<string, any> = {
				...getLumberBaseProperties(documentId, tenantId),
				enableWholeSummaryUpload: this.enableWholeSummaryUpload,
				[CommonProperties.isEphemeralContainer]: isEphemeralContainer,
			};
			let runTimeError;
			const createDocMetric = Lumberjack.newLumberMetric(
				LumberEventName.CreateDocument,
				lumberjackProperties,
			);
			try {
				const storageName = await this.storageNameAssigner?.assign(tenantId, documentId);
				const storageNameAssignerEnabled = !!this.storageNameAssigner;
				lumberjackProperties.storageName = storageName;
				lumberjackProperties.storageNameAssignerEnabled = storageNameAssignerEnabled;
				if (storageNameAssignerEnabled && !storageName) {
					// Using a warning instead of an error just in case there are some outliers that we don't know about.
					Lumberjack.warning(
						"Failed to get storage name for new document.",
						lumberjackProperties,
					);
				}
				createDocTrace.stampStage(DocCreationStage.StorageNameAllocated);
				getGlobalTimeoutContext().checkTimeout();

				const gitManager = await this.getGitManager(
					tenantId,
					documentId,
					storageName,
					isEphemeralContainer,
				);

				const protocolTree = this.createInitialProtocolTree(sequenceNumber, values);
				const fullTree = this.createFullTree(appTree, protocolTree);
				const blobsShaCache = new Map<string, string>();
				const uploadManager = this.enableWholeSummaryUpload
					? new WholeSummaryUploadManager(gitManager)
					: new SummaryTreeUploadManager(
							gitManager,
							blobsShaCache,
							async () => undefined,
					  );

				const summaryTimeStr = new Date().toISOString();

				const dbResult: IDocumentDetails = await this.createDocumentCore(
					createDocMetric,
					lumberjackProperties,
					createDocTrace,
					uploadManager,
					fullTree,
					gitManager,
					documentId,
					summaryTimeStr,
					sequenceNumber,
					initialHash,
					values,
					ordererUrl,
					historianUrl,
					deltaStreamUrl,
					messageBrokerId,
					enableDiscovery,
					tenantId,
					storageName,
					isEphemeralContainer,
				);
				createDocTrace.stampStage(DocCreationStage.DocCreationCompleted);
				return dbResult;
			} catch (err: unknown) {
				runTimeError = err;
				throw err;
			} finally {
				createDocMetric.setProperty("createDocTrace", createDocTrace.trace);
				if (runTimeError) {
					createDocMetric.error("Failed created doc", runTimeError);
				} else {
					createDocMetric.success("Successfully created doc");
				}
			}
		});
	}

	protected async createDocumentCore(
		createDocMetric: Lumber<LumberEventName.CreateDocument>, // Used by override
		lumberjackProperties: Record<string, any>,
		createDocTrace: StageTrace<DocCreationStage>,
		uploadManager: WholeSummaryUploadManager | SummaryTreeUploadManager,
		fullTree: ISummaryTree,
		gitManager: IGitManager,
		documentId: string,
		summaryTimeStr: string,
		sequenceNumber: number,
		initialHash: string,
		values: [string, ICommittedProposal][],
		ordererUrl: string,
		historianUrl: string,
		deltaStreamUrl: string,
		messageBrokerId: string | undefined,
		enableDiscovery: boolean,
		tenantId: string,
		storageName: string | undefined,
		isEphemeralContainer: boolean,
	): Promise<IDocumentDetails> {
		const initialSummaryUploadMetric = Lumberjack.newLumberMetric(
			LumberEventName.CreateDocInitialSummaryWrite,
			lumberjackProperties,
		);

		let initialSummaryVersionId: string;
		try {
			const { summaryVersionId, summaryUploadMessage } = await this.uploadSummary(
				uploadManager,
				fullTree,
				gitManager,
				documentId,
				summaryTimeStr,
			);
			initialSummaryVersionId = summaryVersionId;
			initialSummaryUploadMetric.success(summaryUploadMessage);
		} catch (error: any) {
			initialSummaryUploadMetric.error("Error during initial summary upload", error);
			throw error;
		}

		// Storage is known to take too long sometimes. Check timeout before continuing.
		createDocTrace.stampStage(DocCreationStage.InitialSummaryUploaded);
		getGlobalTimeoutContext().checkTimeout();

		const deli: IDeliState = {
			clients: undefined,
			durableSequenceNumber: sequenceNumber,
			expHash1: initialHash,
			logOffset: -1,
			sequenceNumber,
			signalClientConnectionNumber: 0,
			lastSentMSN: 0,
			nackMessages: undefined,
			checkpointTimestamp: Date.now(),
		};

		const scribe: IScribe = {
			logOffset: -1,
			minimumSequenceNumber: sequenceNumber,
			protocolState: {
				members: [],
				minimumSequenceNumber: sequenceNumber,
				proposals: [],
				sequenceNumber,
				values,
			},
			sequenceNumber,
			lastClientSummaryHead: undefined,
			lastSummarySequenceNumber: 0,
			// Add initialSummaryVersionId as a valid parent summary. There is no summaryAck for initial summary,
			// and it is possible for a sumarizer to load from the initial summary, while a service summary is being written.
			// If the summarizer then proposes the initial summary as a parent summary after the service summary is written,
			// the initial summary would not be accepted as a valid parent because lastClientSummaryHead is undefined and latest
			// summary is a service summary. However, initial summary _is_ a valid parent in this scenario.
			validParentSummaries: [initialSummaryVersionId],
			isCorrupt: false,
			protocolHead: undefined,
			checkpointTimestamp: Date.now(),
		};

		const session: ISession = {
			ordererUrl,
			historianUrl,
			deltaStreamUrl,
			isSessionAlive: true,
			isSessionActive: false,
		};

		// if undefined and added directly to the session object - will be serialized as null in mongo which is undesirable
		if (messageBrokerId) {
			session.messageBrokerId = messageBrokerId;
		}

		Lumberjack.info(
			`Create session with enableDiscovery as ${enableDiscovery}: ${JSON.stringify(session)}`,
			lumberjackProperties,
		);

		const createDocumentCollectionMetric = Lumberjack.newLumberMetric(
			LumberEventName.CreateDocumentUpdateDocumentCollection,
			lumberjackProperties,
		);

		const document: IDocument = {
			createTime: Date.now(),
			deli: JSON.stringify(deli),
			documentId,
			session,
			scribe: JSON.stringify(scribe),
			tenantId,
			version: "0.1",
			storageName,
			isEphemeralContainer,
		};
		const documentDbValue: IDocument & { ttl?: number } = this.createDocumentDbValue(
			document,
			isEphemeralContainer,
		);

		let dbResult: IDocumentDetails;
		try {
			dbResult = await this.documentRepository.findOneOrCreate(
				{
					documentId,
					tenantId,
				},
				documentDbValue,
			);
			createDocTrace.stampStage(DocCreationStage.DocCreated);
			createDocumentCollectionMetric.success("Successfully created document");
		} catch (error: any) {
			createDocumentCollectionMetric.error("Error create document", error);
			throw error;
		}
		return dbResult;
	}

	protected createDocumentDbValue(document: IDocument, isEphemeralContainer: boolean) {
		const documentDbValue: IDocument & { ttl?: number } = {
			...document,
		};
		if (isEphemeralContainer) {
			documentDbValue.ttl = this.ephemeralDocumentTTLSec;
		}
		return documentDbValue;
	}

	/**
	 * Basic validation for additionalQueryParams extensibility point.
	 * Override this method in derived classes for custom validation logic.
	 */
	protected validateAdditionalQueryParams(additionalQueryParams?: IAdditionalQueryParams): void {
		if (!additionalQueryParams) {
			return;
		}

		// Log usage for security monitoring (in non-production or with privacy considerations)
		const paramKeys = Object.keys(additionalQueryParams);
		if (paramKeys.length > 0) {
			Lumberjack.info("additionalQueryParams usage detected", {
				paramCount: paramKeys.length,
				// Only log keys, not values, for privacy
				paramKeys: paramKeys.join(","),
			});
		}

		this.validateObjectRecursive(additionalQueryParams, 0);
	}

	/**
	 * Recursive validation helper
	 */
	private validateObjectRecursive(obj: IAdditionalQueryParams, currentDepth: number): void {
		if (currentDepth > MAX_DEPTH) {
			throw new NetworkError(
				400,
				"additionalQueryParams: Maximum nesting depth exceeded",
				false,
			);
		}

		if (typeof obj !== "object" || obj === null) {
			return;
		}

		const keys = Object.keys(obj);
		if (keys.length > MAX_OBJECT_SIZE) {
			throw new NetworkError(400, "additionalQueryParams: Too many properties", false);
		}

		for (const key of keys) {
			if (key.length > MAX_KEY_LENGTH) {
				throw new NetworkError(400, "additionalQueryParams: Key length exceeded", false);
			}

			const value = obj[key];
			if (value === undefined) {
				continue;
			}

			if (typeof value === "string" && value.length > MAX_VALUE_LENGTH) {
				throw new NetworkError(400, "additionalQueryParams: Value length exceeded", false);
			} else if (Array.isArray(value)) {
				if (value.length > MAX_OBJECT_SIZE) {
					throw new NetworkError(
						400,
						"additionalQueryParams: Array size exceeded",
						false,
					);
				}
				for (const item of value) {
					if (typeof item === "string" && item.length > MAX_VALUE_LENGTH) {
						throw new NetworkError(
							400,
							"additionalQueryParams: Array item length exceeded",
							false,
						);
					} else if (typeof item === "object") {
						this.validateObjectRecursive(item, currentDepth + 1);
					}
				}
			} else if (typeof value === "object" && value !== null) {
				this.validateObjectRecursive(value, currentDepth + 1);
			}
		}
	}

	protected async uploadSummary(
		uploadManager: WholeSummaryUploadManager | SummaryTreeUploadManager,
		fullTree: ISummaryTree,
		gitManager: IGitManager,
		documentId: string,
		summaryTimeStr: string,
	) {
		let summaryVersionId: string;
		const handle = await uploadManager.writeSummaryTree(
			fullTree /* summaryTree */,
			"" /* parentHandle */,
			"container" /* summaryType */,
			0 /* sequenceNumber */,
			true /* initial */,
			summaryTimeStr,
		);

		let summaryUploadMessage = `Tree reference: ${JSON.stringify(handle)}`;

		if (!this.enableWholeSummaryUpload) {
			const commitParams: ICreateCommitParams = {
				author: {
					date: summaryTimeStr,
					email: "dummy@microsoft.com",
					name: "Routerlicious Service",
				},
				message: "New document",
				parents: [],
				tree: handle,
			};

			const commit = await gitManager.createCommit(commitParams);
			await gitManager.createRef(documentId, commit.sha);
			// In the case of ShreddedSummary Upload, summary version is always the commit sha.
			summaryVersionId = commit.sha;
			summaryUploadMessage += ` - Commit sha: ${JSON.stringify(commit.sha)}`;
		} else {
			// In the case of WholeSummary Upload, summary tree handle is actually commit sha or version id.
			summaryVersionId = handle;
		}
		return { summaryVersionId, summaryUploadMessage };
	}

	public async getLatestVersion(tenantId: string, documentId: string): Promise<ICommit | null> {
		const versions = await this.getVersions(tenantId, documentId, 1);
		if (!versions.length) {
			return null;
		}

		const latest = versions[0];
		return {
			author: latest.commit.author,
			committer: latest.commit.committer,
			message: latest.commit.message,
			parents: latest.parents,
			sha: latest.sha,
			tree: latest.commit.tree,
			url: latest.url,
		};
	}

	public async getVersions(
		tenantId: string,
		documentId: string,
		count: number,
	): Promise<ICommitDetails[]> {
		const gitManager = await this.tenantManager.getTenantGitManager(tenantId, documentId);

		return gitManager.getCommits(documentId, count);
	}

	public async getVersion(tenantId: string, documentId: string, sha: string): Promise<ICommit> {
		const gitManager = await this.tenantManager.getTenantGitManager(tenantId, documentId);

		return gitManager.getCommit(sha);
	}

	public async getFullTree(
		tenantId: string,
		documentId: string,
	): Promise<{ cache: IGitCache; code: string }> {
		const gitManager = await this.tenantManager.getTenantGitManager(tenantId, documentId);
		const versions = await gitManager.getCommits(documentId, 1);
		if (versions.length === 0) {
			return {
				cache: {
					blobs: [],
					commits: [],
					refs: {},
					trees: [],
				},
				code: null as unknown as string,
			};
		}

		const fullTree = await gitManager.getFullTree(versions[0].sha);

		let code: string = null as unknown as string;
		if (fullTree.quorumValues) {
			let quorumValues;
			for (const blob of fullTree.blobs) {
				if (blob.sha === fullTree.quorumValues) {
					quorumValues = JSON.parse(toUtf8(blob.content, blob.encoding)) as [
						string,
						{ value: string },
					][];

					for (const quorumValue of quorumValues) {
						if (quorumValue[0] === "code") {
							code = quorumValue[1].value;
							break;
						}
					}

					break;
				}
			}
		}

		return {
			cache: {
				blobs: fullTree.blobs,
				commits: fullTree.commits,
				refs: { [documentId]: versions[0].sha },
				trees: fullTree.trees,
			},
			code,
		};
	}

	private async createObject(
		tenantId: string,
		documentId: string,
		deli?: string,
		scribe?: string,
		session?: ISession,
	): Promise<IDocument> {
		const value: IDocument = {
			createTime: Date.now(),
			deli: deli as unknown as string,
			documentId,
			session: session as unknown as ISession,
			scribe: scribe as unknown as string,
			tenantId,
			version: "0.1",
		};
		await this.documentRepository.create(value);
		return value;
	}

	// Looks up the DB and summary for the document.
	private async getOrCreateObject(
		tenantId: string,
		documentId: string,
	): Promise<IDocumentDetails> {
		const document = await this.documentRepository.readOne({ documentId, tenantId });
		if (document === null) {
			// Guard against storage failure. Returns false if storage is unresponsive.
			const foundInSummaryP = this.readFromSummary(tenantId, documentId)
				.then((result) => {
					return result;
				})
				.catch((err) => {
					winston.error(`Error while fetching summary for ${tenantId}/${documentId}`);
					winston.error(err);
					const lumberjackProperties = {
						[BaseTelemetryProperties.tenantId]: tenantId,
						[BaseTelemetryProperties.documentId]: documentId,
					};
					Lumberjack.error(`Error while fetching summary`, lumberjackProperties);
					return false;
				});

			const inSummary = await foundInSummaryP;
			Lumberjack.warning("Backfilling document from summary!", {
				[BaseTelemetryProperties.tenantId]: tenantId,
				[BaseTelemetryProperties.documentId]: documentId,
			});

			// Setting an empty string to deli and scribe denotes that the checkpoints should be loaded from summary.
			const value = inSummary
				? await this.createObject(tenantId, documentId, "", "")
				: await this.createObject(tenantId, documentId);

			return {
				value,
				existing: inSummary,
			};
		} else {
			return {
				value: document,
				existing: true,
			};
		}
	}

	private async readFromSummary(tenantId: string, documentId: string): Promise<boolean> {
		const gitManager = await this.tenantManager.getTenantGitManager(tenantId, documentId);
		const existingRef = await gitManager.getRef(encodeURIComponent(documentId));
		if (existingRef) {
			// Fetch ops from logTail and insert into deltas collection.
			// TODO: Make the rest endpoint handle this case.
			const opsContent = await gitManager.getContent(
				existingRef.object.sha,
				".logTail/logTail",
			);
			const ops = JSON.parse(
				Buffer.from(
					opsContent.content,
					Buffer.isEncoding(opsContent.encoding) ? opsContent.encoding : undefined,
				).toString(),
			) as ISequencedDocumentMessage[];
			const dbOps: ISequencedOperationMessage[] = ops.map((op: ISequencedDocumentMessage) => {
				return {
					documentId,
					operation: op,
					tenantId,
					type: SequencedOperationType,
					mongoTimestamp: new Date(op.timestamp),
				};
			});
			await this.opsCollection.insertMany(dbOps, false).catch(async (error) => {
				// Duplicate key errors are ignored
				if (error.code !== 11000) {
					// Needs to be a full rejection here
					throw error;
				}
			});
			winston.info(`Inserted ${dbOps.length} ops into deltas DB`);
			const lumberjackProperties = {
				[BaseTelemetryProperties.tenantId]: tenantId,
				[BaseTelemetryProperties.documentId]: documentId,
			};
			Lumberjack.info(`Inserted ${dbOps.length} ops into deltas DB`, lumberjackProperties);
			return true;
		} else {
			return false;
		}
	}
}
