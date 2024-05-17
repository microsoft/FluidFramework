import type { ICreateBlobResponse } from "@fluidframework/protocol-definitions";
import type { IDetachedBlobStorage } from "./loader.js";

export class MemoryBlobStorage implements IDetachedBlobStorage {
	private blobId: number = 0;
	private readonly blobs = new Map<string, ArrayBuffer>();

	async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
		const id = `${this.blobId++}`;
		this.blobs.set(id, file);
		return { id };
	}
	async readBlob(id: string): Promise<ArrayBufferLike> {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.blobs.get(id)!;
	}
	get size() {
		return this.blobs.size;
	}
	getBlobIds(): string[] {
		return [...this.blobs.keys()];
	}

	public async getBlob(id: string): Promise<ArrayBuffer | undefined> {
		return this.blobs.get(id);
	}

	public async storeBlob(blob: ArrayBuffer): Promise<string> {
		const id = `${this.blobs.size}`;
		this.blobs.set(id, blob);
		return id;
	}
}
