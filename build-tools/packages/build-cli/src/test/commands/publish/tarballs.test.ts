/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { setTimeout as delay } from "node:timers/promises";
import { expect } from "chai";
import { describe, it } from "mocha";

import PublishTarballCommand, {
	getTarballsToPublish,
	publishTarballsInOrder,
	type TarballMetadata,
} from "../../../commands/publish/tarballs.js";

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

function createTarball(name: string): TarballMetadata {
	return {
		name,
		version: "1.0.0",
		filePath: `${name}.tgz`,
		fileName: `${name}.tgz`,
	};
}

function createDeferred<T>(): Deferred<T> {
	let resolve: (value: T) => void = () => {
		throw new Error("Deferred promise was resolved before initialization");
	};
	const promise = new Promise<T>((innerResolve) => {
		resolve = innerResolve;
	});
	return { promise, resolve };
}

async function waitFor(condition: () => boolean): Promise<void> {
	for (let index = 0; index < 100; index++) {
		if (condition()) {
			return;
		}
		await delay(0);
	}
	throw new Error("Timed out waiting for test condition");
}

describe("publish tarballs", () => {
	describe("getTarballsToPublish", () => {
		it("uses the first occurrence of duplicate order entries", () => {
			const first = createTarball("first");
			const second = createTarball("second");
			const metadata = new Map([
				[first.fileName, first],
				[second.fileName, second],
			]);

			expect(
				getTarballsToPublish(
					[second.fileName, first.fileName, second.fileName],
					metadata,
					true,
				),
			).to.deep.equal([second, first]);
		});

		it("rejects order entries without matching tarballs", () => {
			expect(() => getTarballsToPublish(["missing.tgz"], new Map(), true)).to.throw(
				"No tarball found matching 'missing.tgz'",
			);
		});
	});

	describe("publishTarballsInOrder", () => {
		it("bounds concurrent preflight checks and preserves publish order", async () => {
			const tarballs = [
				createTarball("first"),
				createTarball("second"),
				createTarball("third"),
			];
			const preflightChecks: string[] = [];
			const publishOrder: string[] = [];
			const preflightDeferreds = new Map<string, Deferred<boolean>>();
			let activePreflightChecks = 0;
			let maxActivePreflightChecks = 0;

			const result = publishTarballsInOrder(tarballs, {
				retry: 0,
				preflightConcurrency: 2,
				isPublished: async (tarball) => {
					activePreflightChecks++;
					maxActivePreflightChecks = Math.max(maxActivePreflightChecks, activePreflightChecks);
					preflightChecks.push(tarball.name);
					const deferred = createDeferred<boolean>();
					preflightDeferreds.set(tarball.name, deferred);
					try {
						return await deferred.promise;
					} finally {
						activePreflightChecks--;
					}
				},
				publish: async (tarball) => {
					publishOrder.push(tarball.name);
					return "SuccessfullyPublished";
				},
			});

			await waitFor(() => preflightChecks.length === 2);
			expect(maxActivePreflightChecks).to.equal(2);
			expect(publishOrder).to.deep.equal([]);

			preflightDeferreds.get("second")?.resolve(false);
			await waitFor(() => preflightChecks.length === 3);
			preflightDeferreds.get("first")?.resolve(false);
			preflightDeferreds.get("third")?.resolve(false);

			await result;

			expect(maxActivePreflightChecks).to.equal(2);
			expect(preflightChecks).to.deep.equal(["first", "second", "third"]);
			expect(publishOrder).to.deep.equal(["first", "second", "third"]);
		});

		it("skips packages reported as already published during preflight", async () => {
			const first = createTarball("first");
			const second = createTarball("second");
			const publishedPackages = new Set([first.name]);
			const publishOrder: string[] = [];

			const results = await publishTarballsInOrder([first, second], {
				retry: 0,
				isPublished: async (tarball) => publishedPackages.has(tarball.name),
				publish: async (tarball) => {
					publishOrder.push(tarball.name);
					return "SuccessfullyPublished";
				},
			});

			expect(publishOrder).to.deep.equal([second.name]);
			expect(results.map((result) => result.status)).to.deep.equal([
				"AlreadyPublished",
				"SuccessfullyPublished",
			]);
		});

		it("treats a failed publish as already published when the version appears afterward", async () => {
			const tarball = createTarball("tarball");
			let publishedCheckCount = 0;

			const [result] = await publishTarballsInOrder([tarball], {
				retry: 0,
				isPublished: async () => {
					publishedCheckCount++;
					return publishedCheckCount > 1;
				},
				publish: async () => "Error",
			});

			expect(result).to.deep.equal({
				status: "AlreadyPublished",
				tarball,
				tryCount: 1,
			});
		});

		it("retries until exhaustion", async () => {
			const tarball = createTarball("tarball");
			let publishAttemptCount = 0;

			const [result] = await publishTarballsInOrder([tarball], {
				retry: 2,
				isPublished: async () => false,
				publish: async () => {
					publishAttemptCount++;
					return "Error";
				},
			});

			expect(publishAttemptCount).to.equal(3);
			expect(result).to.deep.equal({
				status: "Error",
				tarball,
				tryCount: 3,
			});
		});

		it("stops publishing after the first exhausted error", async () => {
			const first = createTarball("first");
			const second = createTarball("second");
			const publishOrder: string[] = [];

			const results = await publishTarballsInOrder([first, second], {
				retry: 0,
				isPublished: async () => false,
				publish: async (tarball) => {
					publishOrder.push(tarball.name);
					return "Error";
				},
			});

			expect(publishOrder).to.deep.equal([first.name]);
			expect(results).to.deep.equal([{ status: "Error", tarball: first, tryCount: 1 }]);
		});

		it("rejects negative retry counts", async () => {
			let error: unknown;
			try {
				await publishTarballsInOrder([createTarball("tarball")], {
					retry: -1,
					isPublished: async () => false,
					publish: async () => "SuccessfullyPublished",
				});
			} catch (caught) {
				error = caught;
			}

			expect(error).to.be.instanceOf(RangeError);
		});
	});

	it("rejects negative retry counts when parsing command flags", () => {
		expect(PublishTarballCommand.flags.retry).to.include({ min: 0 });
	});
});
