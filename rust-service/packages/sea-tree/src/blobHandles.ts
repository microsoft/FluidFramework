/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type {
	IFluidHandleInternal,
	ILocalFluidHandle,
	ILocalFluidHandleEvents,
} from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { createSessionId } from "@fluidframework/id-compressor/internal";
import { FluidHandleBase, isSerializedHandle } from "@fluidframework/runtime-utils/internal";
import type { SeaDriverClient } from "@fluidframework/sea-driver/internal";
import { FluidSerializer } from "@fluidframework/shared-object-base/internal";

/** Persistent attachment identities carried alongside an operation. */
export type BlobReferences = Readonly<Record<string, string>>;

interface BlobRecord {
	digest?: Uint8Array;
	handle?: WeakRef<DirectBlobHandle>;
	prefetched?: Uint8Array;
}

/** Local bytes belong to the handle, not to the document's permanent reference registry. */
class DirectBlobHandle
	extends FluidHandleBase<ArrayBuffer>
	implements ILocalFluidHandle<ArrayBuffer>
{
	public readonly events = createEmitter<ILocalFluidHandleEvents>();
	public payloadShareError: unknown;
	private attached = false;
	private upload: Promise<Uint8Array> | undefined;
	private read: Promise<Uint8Array> | undefined;

	public constructor(
		public readonly owner: BlobHandles,
		public readonly id: string,
		private readonly record: BlobRecord,
		private bytes?: Uint8Array,
	) {
		super();
	}

	public get absolutePath(): string {
		return `${this.owner.absolutePath}/${this.id}`;
	}

	public get isAttached(): boolean {
		return this.attached;
	}

	public get payloadState(): "pending" | "shared" {
		return this.record.digest === undefined ? "pending" : "shared";
	}

	public attachGraph(): void {
		this.attached = true;
	}

	public sharePayload(): void {
		const generation = this.owner.generation();
		// Failure is exposed both on the handle and through the host's status notification.
		void this.ensureUploaded().catch((error: unknown) =>
			this.owner.reportError(error, generation),
		);
	}

	public async ensureUploaded(): Promise<Uint8Array> {
		if (this.record.digest !== undefined) return this.record.digest;
		if (this.upload !== undefined) return this.upload;
		const work = async (): Promise<Uint8Array> => {
			try {
				this.owner.requireConnected();
				assert(this.bytes !== undefined, "A pending blob must retain its local bytes");
				const { digest } = await this.owner.client.uploadBlob(this.bytes);
				this.record.digest = digest.slice();
				this.payloadShareError = undefined;
				this.events.emit("payloadShared");
				return this.record.digest;
			} catch (error) {
				this.payloadShareError = error;
				this.events.emit("payloadShareFailed", error);
				throw error;
			}
		};
		this.upload = work();
		try {
			return await this.upload;
		} finally {
			this.upload = undefined;
		}
	}

	public async get(): Promise<ArrayBuffer> {
		if (this.bytes === undefined) {
			this.owner.requireConnected();
			assert(this.record.digest !== undefined, "A remote blob must have a storage identity");
			this.read ??= this.owner.client.fetchBlob(this.record.digest);
			try {
				this.bytes = await this.read;
			} finally {
				this.read = undefined;
			}
		}
		return this.bytes.slice().buffer;
	}
}

/** Binding endpoint used by FluidSerializer without constructing a Fluid runtime. */
class BlobBinding extends FluidHandleBase<never> {
	public readonly absolutePath = "";
	public readonly isAttached = true;

	public constructor(public readonly bind: (handle: IFluidHandleInternal) => void) {
		super();
	}

	public attachGraph(): void {}

	public async get(): Promise<never> {
		throw new Error("The direct serialization binding is not an application object");
	}
}

/** Standard Fluid serialization with document-scoped blob resolution and reference capture. */
export class BlobHandles extends FluidSerializer {
	public readonly absolutePath: string;
	private readonly records = new Map<string, BlobRecord>();
	private readonly binding: BlobBinding;
	private collecting: Set<DirectBlobHandle> | undefined;
	private summaryBlobs: Map<string, ReadonlySet<DirectBlobHandle>> | undefined;

	public constructor(
		public readonly client: SeaDriverClient,
		document: Uint8Array,
		public readonly requireConnected: () => void,
		public readonly reportError: (error: unknown, generation: number) => void,
		public readonly generation: () => number,
	) {
		super({
			get IFluidHandleContext() {
				return this;
			},
			absolutePath: "",
			isAttached: true,
			attachGraph: () => {},
			resolveHandle: async () => {
				throw new Error("Direct SharedTree supports only its own blob handles");
			},
		});
		this.absolutePath = `/sea-blobs/${byteKey(document)}`;
		this.binding = new BlobBinding((handle) => {
			if (
				!(handle instanceof DirectBlobHandle) ||
				handle.owner.absolutePath !== this.absolutePath
			)
				throw new Error("Direct SharedTree requires a blob handle from the same document");
			this.collecting?.add(handle);
			handle.attachGraph();
		});
	}

	public create(bytes: Uint8Array): ILocalFluidHandle<ArrayBuffer> {
		const id = createSessionId();
		const record: BlobRecord = {};
		const handle = new DirectBlobHandle(this, id, record, bytes.slice());
		record.handle = new WeakRef(handle);
		this.records.set(id, record);
		// Defer work so callers can observe pending state and subscribe before upload starts.
		queueMicrotask(() => handle.sharePayload());
		return handle;
	}

	public override encode(input: unknown): unknown {
		return super.encode(input, this.binding);
	}

	public encodeMessage(input: unknown): {
		contents: unknown;
		handles: ReadonlySet<DirectBlobHandle>;
	} {
		return this.capture(() => this.encode(input));
	}

	private capture(action: () => unknown): {
		contents: unknown;
		handles: ReadonlySet<DirectBlobHandle>;
	} {
		const previous = this.collecting;
		const handles = new Set<DirectBlobHandle>();
		this.collecting = handles;
		try {
			return { contents: action(), handles };
		} finally {
			this.collecting = previous;
			for (const handle of handles) previous?.add(handle);
		}
	}

	public override stringify(input: unknown): string {
		const { contents, handles } = this.capture(() => super.stringify(input, this.binding));
		assert(typeof contents === "string", "Summary serialization must produce a string");
		this.summaryBlobs?.set(contents, handles);
		return contents;
	}

	public captureSummary<T>(summarize: () => T): {
		summary: T;
		references: ReadonlyMap<string, ReadonlySet<DirectBlobHandle>>;
	} {
		assert(this.summaryBlobs === undefined, "Summary reference capture must not nest");
		const references = new Map<string, ReadonlySet<DirectBlobHandle>>();
		this.summaryBlobs = references;
		try {
			return { summary: summarize(), references };
		} finally {
			this.summaryBlobs = undefined;
		}
	}

	protected override decodeValue(value: unknown): unknown {
		if (!isSerializedHandle(value)) return value;
		if (typeof value.url !== "string" || !value.url.startsWith(`${this.absolutePath}/`))
			throw new Error("Invalid or foreign direct blob handle");
		const id = value.url.slice(this.absolutePath.length + 1);
		validateBlobId(id);
		const record = this.records.get(id);
		if (record === undefined) throw new Error(`Missing direct blob reference: ${id}`);
		let handle = record.handle?.deref();
		if (handle === undefined) {
			handle = new DirectBlobHandle(this, id, record, record.prefetched);
			delete record.prefetched;
			record.handle = new WeakRef(handle);
		}
		handle.attachGraph();
		return handle;
	}

	public register(id: string, digest: Uint8Array, prefetched?: Uint8Array): void {
		validateBlobId(id);
		const record = this.records.get(id) ?? {};
		if (record.digest !== undefined && byteKey(record.digest) !== byteKey(digest))
			throw new Error(`Conflicting direct blob reference: ${id}`);
		record.digest = digest.slice();
		if (prefetched !== undefined) record.prefetched = prefetched;
		this.records.set(id, record);
	}

	public registerReferences(references: unknown): void {
		if (references === undefined) return;
		if (references === null || typeof references !== "object" || Array.isArray(references))
			throw new Error("Invalid direct blob reference table");
		for (const [id, digest] of Object.entries(references)) {
			if (typeof digest !== "string" || !/^[0-9a-f]{64}$/u.test(digest))
				throw new Error("Invalid direct blob digest");
			this.register(
				id,
				Uint8Array.from(digest.match(/../gu) ?? [], (byte) => Number.parseInt(byte, 16)),
			);
		}
	}

	public async uploadReferences(
		handles: ReadonlySet<DirectBlobHandle>,
	): Promise<BlobReferences> {
		return Object.fromEntries(
			await Promise.all(
				[...handles].map(async (handle) => {
					const digest = await handle.ensureUploaded();
					this.register(handle.id, digest);
					return [handle.id, byteKey(digest)];
				}),
			),
		);
	}
}

export function validateBlobId(id: string): void {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(id))
		throw new Error("Invalid direct blob identity");
}

/** Stable key for opaque service identities. */
export function byteKey(value: Uint8Array): string {
	return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
