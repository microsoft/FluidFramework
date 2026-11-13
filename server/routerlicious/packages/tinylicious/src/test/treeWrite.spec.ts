/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";

import express from "express";
import nconf from "nconf";
import { v4 as uuid } from "uuid";

import { createTree } from "../routes/storage/git/trees";
import { handleResponse } from "../routes/storage/utils";

describe("Concurrent Git tree writes", () => {
	it("coalesces equivalent tree writes until their objects are fully persisted", async () => {
		const directory = path.resolve("nyc", `tree-write-${uuid()}`);
		const store = new nconf.Provider();
		store.overrides({ storage: directory });
		const writeFile = fs.promises.writeFile;
		let releaseWrite: (() => void) | undefined;
		let onPartialWrite: (() => void) | undefined;
		const gate = new Promise<void>((resolve) => {
			releaseWrite = resolve;
		});
		const partialWrite = new Promise<void>((resolve) => {
			onPartialWrite = resolve;
		});
		let intercepted = false;
		fs.promises.writeFile = async (file, data, options) => {
			if (
				!intercepted &&
				typeof file === "string" &&
				path.resolve(file).startsWith(directory + path.sep) &&
				file.includes("objects") &&
				data instanceof Uint8Array
			) {
				await writeFile(file, data.subarray(0, 5), options);
				intercepted = true;
				onPartialWrite?.();
				await gate;
			}
			return writeFile(file, data, options);
		};
		const params = {
			tree: [
				{ mode: "100644", path: "a", sha: "1".repeat(40), type: "blob" },
				{ mode: "100644", path: "b", sha: "2".repeat(40), type: "blob" },
			],
		};
		const first = createTree(store, "test", "", params);
		let second: ReturnType<typeof createTree> | undefined;
		try {
			await Promise.race([
				partialWrite,
				first.then(() => {
					throw new Error("Write was not intercepted");
				}),
			]);
			second = createTree(store, "test", "", { tree: [...params.tree].reverse() });
			assert.equal(second, first, "A duplicate must not read the partial loose object");
			releaseWrite?.();
			assert.deepEqual(await second, await first);
			assert.equal((await first).tree.length, 2);
		} finally {
			releaseWrite?.();
			await Promise.allSettled(second === undefined ? [first] : [first, second]);
			fs.promises.writeFile = writeFile;
			await fs.promises.rm(directory, { recursive: true, force: true });
		}
	});

	it("forgets failed writes so a later request can retry without a poisoned promise", async () => {
		const directory = path.resolve("nyc", `tree-write-${uuid()}`);
		const store = new nconf.Provider();
		store.overrides({ storage: directory });
		const writeFile = fs.promises.writeFile;
		fs.promises.writeFile = async (file, data, options) => {
			if (typeof file === "string" && path.resolve(file).startsWith(directory + path.sep)) {
				throw new Error("injected write failure");
			}
			return writeFile(file, data, options);
		};
		try {
			try {
				await assert.rejects(
					createTree(store, "test", "", { tree: [] }),
					/injected write failure/,
				);
			} finally {
				fs.promises.writeFile = writeFile;
			}
			assert.deepEqual((await createTree(store, "test", "", { tree: [] })).tree, []);
		} finally {
			await fs.promises.rm(directory, { recursive: true, force: true });
		}
	});

	it("returns the HTTP status and message instead of an empty platform error object", async () => {
		const app = express();
		app.get("/", (_request, response) => {
			handleResponse(Promise.reject(new TypeError("injected storage failure")), response);
		});
		const server = app.listen(0);
		try {
			await once(server, "listening");
			const address = server.address();
			assert(address !== null && typeof address !== "string");
			const response = await fetch(`http://localhost:${address.port}`);
			assert.equal(response.status, 400);
			assert.deepEqual(await response.json(), {
				name: "TypeError",
				message: "injected storage failure",
			});
		} finally {
			await new Promise<void>((resolve, reject) => {
				server.close((error) => {
					if (error === undefined) {
						resolve();
					} else {
						reject(error);
					}
				});
			});
		}
	});
});
