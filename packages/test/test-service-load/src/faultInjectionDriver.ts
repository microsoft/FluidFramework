/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { IDisposable, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert, Deferred } from "@fluidframework/core-utils/internal";
import { IClient, ISummaryTree } from "@fluidframework/driver-definitions";
import {
	IDocumentDeltaConnection,
	IDocumentDeltaConnectionEvents,
	IDocumentDeltaStorageService,
	IDocumentService,
	IDocumentServiceEvents,
	IDocumentServiceFactory,
	IDocumentStorageService,
	IResolvedUrl,
	ISnapshotFetchOptions,
	DriverErrorTypes,
	IDocumentMessage,
	INack,
	NackErrorType,
} from "@fluidframework/driver-definitions/internal";
import { LoggingError, UsageError, wrapError } from "@fluidframework/telemetry-utils/internal";

export class FaultInjectionDocumentServiceFactory implements IDocumentServiceFactory {
	private readonly _documentServices = new Map<IResolvedUrl, FaultInjectionDocumentService>();

	public get documentServices() {
		return this._documentServices;
	}

	constructor(private readonly internal: IDocumentServiceFactory) {}

	async createDocumentService(
		resolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		const internal = await this.internal.createDocumentService(
			resolvedUrl,
			logger,
			clientIsSummarizer,
		);
		const ds = new FaultInjectionDocumentService(internal);
		assert(!this._documentServices.has(ds.resolvedUrl), "one ds per resolved url instance");
		this._documentServices.set(ds.resolvedUrl, ds);
		return ds;
	}
	async createContainer(
		createNewSummary: ISummaryTree,
		createNewResolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		return this.internal.createContainer(
			createNewSummary,
			createNewResolvedUrl,
			logger,
			clientIsSummarizer,
		);
	}
}

export class FaultInjectionDocumentService
	extends TypedEventEmitter<IDocumentServiceEvents>
	implements IDocumentService
{
	private _currentDeltaStream?: FaultInjectionDocumentDeltaConnection;
	private _currentDeltaStorage?: FaultInjectionDocumentDeltaStorageService;
	private _currentStorage?: FaultInjectionDocumentStorageService;

	private onlineP = new Deferred<void>();
	public get online() {
		return this.onlineP.isCompleted;
	}

	public goOffline() {
		assert(this.online, "must only go offline while online");
		this.onlineP = new Deferred();
		assert(!!this._currentDeltaStream, "no delta stream");
		assert(!!this._currentStorage, "no storage");
		this._currentDeltaStream.goOffline();
		this._currentStorage.goOffline();
		this._currentDeltaStorage?.goOffline();
	}

	public goOnline() {
		assert(!this.online, "must only go online while offline");
		this.onlineP.resolve();
		assert(!!this._currentDeltaStream, "no delta stream");
		assert(!!this._currentStorage, "no storage");
		this._currentDeltaStream.goOnline();
		this._currentStorage.goOnline();
		this._currentDeltaStorage?.goOnline();
	}

	constructor(private readonly internal: IDocumentService) {
		super();
		this.onlineP.resolve();
	}

	public get resolvedUrl() {
		return this.internal.resolvedUrl;
	}
	public get policies() {
		return this.internal.policies;
	}
	public get documentDeltaConnection() {
		return this._currentDeltaStream;
	}
	public get documentDeltaStorageService() {
		return this._currentDeltaStorage;
	}
	public get documentStorageService() {
		return this._currentStorage;
	}

	public dispose(error?: any) {
		this.onlineP.reject(
			wrapError(error, (message) => new FaultInjectionError(`disposed: ${message}`, false)),
		);
		this.internal.dispose(error);
	}

	async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
		assert(
			this._currentDeltaStream?.disposed !== false,
			"Document service factory should only have one open connection",
		);
		// this method is not expected to resolve until connected
		await this.onlineP.promise;
		this._currentDeltaStream = new FaultInjectionDocumentDeltaConnection(
			await this.internal.connectToDeltaStream(client),
			this.online,
		);
		return this._currentDeltaStream;
	}

	async connectToStorage(): Promise<IDocumentStorageService> {
		const internal = await this.internal.connectToStorage();
		this._currentStorage = new FaultInjectionDocumentStorageService(internal, this.online);
		return this._currentStorage;
	}

	async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
		const internal = await this.internal.connectToDeltaStorage();
		this._currentDeltaStorage = new FaultInjectionDocumentDeltaStorageService(
			internal,
			this.online,
		);
		return this._currentDeltaStorage;
	}
}

export class FaultInjectionDocumentDeltaConnection
	extends TypedEventEmitter<IDocumentDeltaConnectionEvents>
	implements IDocumentDeltaConnection, IDisposable
{
	constructor(
		private readonly internal: IDocumentDeltaConnection,
		private online: boolean,
	) {
		super();
		this.on("newListener", (event) => this.forwardEvent(event));
	}

	private readonly events = new Map<any, () => void>();

	// forward events from internal connection only if online
	private forwardEvent(event: any) {
		const emitterEvents = ["newListener", "removeListener"];
		if (!emitterEvents.includes(event) && !this.events.has(event)) {
			const listener = (...args: any[]) => {
				if (this.online) {
					this.emit(event, ...args);
				}
			};
			this.internal.on(event, listener);
			this.events.set(event, listener);
		}
	}

	public get disposed() {
		return this.internal.disposed;
	}

	public get clientId() {
		return this.internal.clientId;
	}

	public get claims() {
		return this.internal.claims;
	}

	public get mode() {
		return this.internal.mode;
	}
	public get existing() {
		return this.internal.existing;
	}
	public get maxMessageSize() {
		return this.internal.serviceConfiguration.maxMessageSize;
	}
	public get version() {
		return this.internal.version;
	}
	public get initialMessages() {
		return this.internal.initialMessages;
	}

	public get initialSignals() {
		return this.internal.initialSignals;
	}
	public get initialClients() {
		return this.internal.initialClients;
	}
	public get serviceConfiguration() {
		return this.internal.serviceConfiguration;
	}
	public get checkpointSequenceNumber() {
		return this.internal.checkpointSequenceNumber;
	}

	/**
	 * Submit a new message to the server
	 */
	submit(messages: IDocumentMessage[]): void {
		if (this.online) {
			// should probably simulate messages that are successful even though we don't see the ACK
			// could just submit a random number of messages after going offline
			this.internal.submit(messages);
		}
	}

	/**
	 * Submit a new signal to the server
	 */
	submitSignal(message: any): void {
		if (this.online) {
			this.internal.submitSignal(message);
		}
	}

	/**
	 * Disconnects the given delta connection
	 */
	public dispose(): void {
		this.events.forEach((listener, event) => this.internal.off(event, listener));
		this.internal.dispose();
	}

	public injectNack(docId: string, canRetry: boolean | undefined) {
		// Cannot inject nack into closed delta connection. So don't do anything.
		if (this.disposed) {
			return;
		}
		const nack: Partial<INack> = {
			content: {
				code: canRetry === true ? 500 : 403,
				message: "FaultInjectionNack",
				type: NackErrorType.BadRequestError,
			},
		};
		this.emit("nack", docId, [nack]);
	}

	public injectError(canRetry: boolean | undefined) {
		// Cannot inject error into closed delta connection. So don't do anything.
		if (this.disposed) {
			return;
		}
		// https://nodejs.org/api/events.html#events_error_events
		assert(
			this.listenerCount("error") > 0,
			"emitting error with no listeners will crash the process",
		);
		this.emit("error", new FaultInjectionError("FaultInjectionError", canRetry));
	}

	public injectDisconnect() {
		// Cannot inject disconnect into closed delta connection. So don't do anything.
		if (this.disposed) {
			return;
		}
		this.emit("disconnect", "FaultInjectionDisconnect");
	}

	public goOffline() {
		this.online = false;
		if (!this.disposed) {
			this.injectDisconnect();
		}
	}

	public goOnline() {
		this.online = true;
	}
}

export class FaultInjectionDocumentDeltaStorageService implements IDocumentDeltaStorageService {
	constructor(
		private readonly internal: IDocumentDeltaStorageService,
		private online: boolean,
	) {}
	public goOffline() {
		this.online = false;
	}
	public goOnline() {
		this.online = true;
	}

	public fetchMessages(from, to, abortSignal, cachedOnly, fetchReason) {
		if (!this.online) {
			throwOfflineError();
		}
		return this.internal.fetchMessages(from, to, abortSignal, cachedOnly, fetchReason);
	}
}

export class FaultInjectionDocumentStorageService implements IDocumentStorageService {
	constructor(
		private readonly internal: IDocumentStorageService,
		private online: boolean,
	) {}

	public goOffline() {
		this.online = false;
	}
	public goOnline() {
		this.online = true;
	}

	private throwIfOffline() {
		if (!this.online) {
			throwOfflineError();
		}
	}

	public get policies() {
		return this.internal.policies;
	}

	public async getSnapshotTree(version, scenarioName?: string) {
		this.throwIfOffline();
		return this.internal.getSnapshotTree(version, scenarioName);
	}

	public async getSnapshot(snapshotFetchOptions?: ISnapshotFetchOptions) {
		this.throwIfOffline();
		if (this.internal.getSnapshot !== undefined) {
			return this.internal.getSnapshot(snapshotFetchOptions);
		}
		throw new UsageError("GetSnapshotApi not present");
	}

	public async getVersions(versionId, count, scenarioName, fetchSource) {
		this.throwIfOffline();
		return this.internal.getVersions(versionId, count, scenarioName, fetchSource);
	}

	public async createBlob(file: ArrayBufferLike) {
		this.throwIfOffline();
		return this.internal.createBlob(file);
	}

	public async readBlob(id: string): Promise<ArrayBufferLike> {
		// Intentionally return blobs even while offline. Current driver behavior is to cache the initial
		// snapshot which means readBlob() calls will succeed regardless of connection status. While
		// depending on this behavior is not advised, it's more accurate to real usage. Additionally, very
		// long service response delays can cause offline injection to interfere with Container load, which
		// is not expected to succeed offline, as well as interfering with the test setup itself.
		return this.internal.readBlob(id);
	}

	public async uploadSummaryWithContext(summary: ISummaryTree, context): Promise<string> {
		this.throwIfOffline();
		return this.internal.uploadSummaryWithContext(summary, context);
	}

	public async downloadSummary(handle): Promise<ISummaryTree> {
		this.throwIfOffline();
		return this.internal.downloadSummary(handle);
	}
}

function throwOfflineError(): never {
	throw new FaultInjectionError("simulated offline error", false, DriverErrorTypes.offlineError);
}

export class FaultInjectionError extends LoggingError {
	constructor(
		message: string,
		public readonly canRetry: boolean | undefined,
		public errorType = "faultInjectionError",
	) {
		super(message, { testCategoryOverride: "generic" });
	}
}
