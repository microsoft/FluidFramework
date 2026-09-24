/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISummarizer } from "@fluidframework/container-runtime/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import type {
	IDocumentStorageService,
	ISummaryContext,
	ISummaryTree,
} from "@fluidframework/driver-definitions/internal";
import { summarizeNow, type SummaryInfo } from "@fluidframework/test-utils/internal";

/**
 * Check the real upload parent, not just receipt of an ACK.
 * A full first summary may not contain handles into the virtual native snapshot.
 */
export function validateSummaryUpload(
	summary: ISummaryTree,
	context: ISummaryContext,
	expectedParent: string,
	fullTree: boolean,
): void {
	if (context.ackHandle !== expectedParent) {
		throw new Error("Summary parent was not adopted; reload the summarizer");
	}
	if (fullTree) {
		for (const entry of Object.values(summary.tree)) {
			if (entry.type === SummaryType.Handle) {
				throw new Error("First native summary cannot reuse a virtual seed path");
			}
			if (entry.type === SummaryType.Tree) {
				validateSummaryUpload(entry, context, expectedParent, true);
			}
		}
	}
}

/**
 * Explicit on-demand host for this bounded reference, not a generic runtime policy.
 *
 * The factory disables automatic summaries. All requests and uploads must pass through this host.
 * ACK success permits the next incremental attempt; its upload must also prove the native runtime
 * adopted that exact parent. Baseline summarizer code can log refresh errors and still report an ACK.
 * Failed clients are closed, not retried with possibly inconsistent or late-ACK state.
 *
 * Lifecycle contract:
 * Call {@link SeedSummaryHost.summarize} to request a summary from the given summarizer.
 * This arms the host (`active = true`) for exactly the duration of that attempt and enforces
 * `fullTree` (`true` only for the very first summary out of a seed-materialized snapshot).
 * While armed, the runtime's storage layer must route its one upload through
 * {@link SeedSummaryHost.upload}, which validates the parent/full-tree shape and records the
 * uploaded tree. Any upload attempted outside an active `summarize()` call, or by a summarizer
 * other than the one currently bound, is rejected.
 * On ACK, `summarize()` confirms the acknowledged tree matches the one `upload()` recorded,
 * advances `expectedParent` to the new version, and permanently clears `fullTree`.
 * On any failure (including a mismatched ACK), the host marks itself permanently `failed` and
 * closes the summarizer; it will reject all further use. Recovery requires loading a fresh
 * client (and a fresh host) from the latest durable snapshot, not retrying this instance.
 */
export class SeedSummaryHost {
	private queue: Promise<unknown> = Promise.resolve();
	private active = false;
	private failed = false;
	private fullTree: boolean;
	private expectedParent: string;
	private uploadedTree: ISummaryTree | undefined;
	private summarizer: ISummarizer | undefined;

	/** Bind a host to one loaded runtime and its real stored version. */
	public constructor(parent: string, fromSeed: boolean) {
		this.expectedParent = parent;
		this.fullTree = fromSeed;
	}

	/**
	 * Admission check at the public storage boundary, before any write reaches the driver.
	 * Upload context advances only after native summarizer-node and GC adoption finish.
	 */
	public async upload(
		storage: Pick<IDocumentStorageService, "uploadSummaryWithContext">,
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		if (!this.active || this.failed) {
			throw new Error("Use SeedSummaryHost for every summary request");
		}
		validateSummaryUpload(summary, context, this.expectedParent, this.fullTree);
		const handle = await storage.uploadSummaryWithContext(summary, context);
		this.uploadedTree = summary;
		return handle;
	}

	/**
	 * Serialize requests. The full-tree flag is enforced here rather than supplied by tests.
	 */
	public async summarize(summarizer: ISummarizer, reason: string): Promise<SummaryInfo> {
		const attempt = this.queue.then(async () => {
			if (this.failed || (this.summarizer !== undefined && this.summarizer !== summarizer)) {
				throw new Error("Load a fresh summarizer and its corresponding summary host");
			}
			this.summarizer = summarizer;
			this.active = true;
			this.uploadedTree = undefined;
			try {
				const result = await summarizeNow(summarizer, {
					reason,
					fullTree: this.fullTree,
					retryOnFailure: false,
				});
				if (result.summaryTree !== this.uploadedTree) {
					throw new Error("Acknowledged summary did not pass this runtime's upload gate");
				}
				this.expectedParent = result.summaryVersion;
				this.fullTree = false;
				return result;
			} catch (error) {
				this.failed = true;
				summarizer.close();
				throw error;
			} finally {
				this.active = false;
				this.uploadedTree = undefined;
			}
		});
		this.queue = attempt.catch(() => {});
		return attempt;
	}
}
