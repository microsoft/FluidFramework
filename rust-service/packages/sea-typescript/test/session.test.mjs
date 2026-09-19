/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import {
	createMemoryService as rootCreateMemoryService,
	openWebTransport as rootOpenWebTransport,
} from "@fluidframework/sea-typescript/internal";
import { createMemoryService } from "@fluidframework/sea-typescript/internal/memory";
import { openWebTransport } from "@fluidframework/sea-typescript/internal/webtransport";

const encode = (text) => new TextEncoder().encode(text);

test("capability entrypoints share factories and reach only lazy capability-specific artifacts", () => {
	assert.equal(createMemoryService, rootCreateMemoryService);
	assert.equal(openWebTransport, rootOpenWebTransport);
	for (const [capability, configurations] of [
		["memory", ["memory", "memory-compression"]],
		["webtransport", ["webtransport", "webtransport-compression"]],
	]) {
		const visited = new Set();
		const artifacts = new Set();
		const visitModule = (url) => {
			if (visited.has(url.href)) return;
			visited.add(url.href);
			const source = ts.createSourceFile(
				url.pathname,
				readFileSync(url, "utf8"),
				ts.ScriptTarget.Latest,
				true,
				ts.ScriptKind.JS,
			);
			const visitNode = (node) => {
				const dynamic =
					ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword;
				const specifier = dynamic
					? node.arguments[0]
					: ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
						? node.moduleSpecifier
						: undefined;
				if (specifier !== undefined && ts.isStringLiteral(specifier)) {
					assert.ok(specifier.text.startsWith("."), `unexpected dependency ${specifier.text}`);
					const dependency = new URL(specifier.text, url);
					const generated = dependency.pathname.match(
						/\/generated\/([^/]+)\/(node|web)\/sea_wasm\.js$/u,
					);
					if (generated === null) {
						visitModule(dependency);
					} else {
						assert.ok(dynamic, "generated artifacts must load lazily");
						artifacts.add(`${generated[1]}/${generated[2]}`);
					}
				}
				ts.forEachChild(node, visitNode);
			};
			visitNode(source);
		};
		visitModule(
			new URL(import.meta.resolve(`@fluidframework/sea-typescript/internal/${capability}`)),
		);
		assert.deepEqual(
			[...artifacts].sort(),
			configurations
				.flatMap((configuration) =>
					capability === "memory"
						? [`${configuration}/node`, `${configuration}/web`]
						: [`${configuration}/web`],
				)
				.sort(),
		);
	}
});

for (const compression of [false, true]) {
	test(`package entrypoint supports shared memory sessions (compression=${compression})`, async () => {
		const configuration = compression ? "memory-compression" : "memory";
		const service = await createMemoryService({ configuration, environment: "node" });
		const isolated = await createMemoryService({ configuration, environment: "node" });
		const writer = await service.open(undefined, {
			author: encode("writer"),
			session: encode("writer-session"),
			compression,
		});
		const reader = await service.open(writer.document, {
			author: encode("reader"),
			session: encode("reader-session"),
			compression,
		});
		try {
			await assert.rejects(
				isolated.open(writer.document, {
					author: encode("isolated"),
					session: encode("isolated-session"),
					compression,
				}),
				{ kind: "Rejected", message: "document does not exist in this memory service" },
			);
			const payload = encode("opaque application payload ".repeat(100));
			const blob = await writer.putBlob(payload);
			assert.deepEqual(await reader.getBlob(blob), payload);
			if (compression) {
				const rawReader = await service.open(writer.document, {
					author: encode("raw-reader"),
					session: encode("raw-reader-session"),
				});
				try {
					const stored = await rawReader.getBlob(blob);
					assert.notDeepEqual(stored, payload);
					assert.ok(stored.length < payload.length);
				} finally {
					await rawReader.close();
				}
			}
			const root = await writer.putDirectory([{ name: "state", child: blob }]);
			assert.deepEqual(await reader.getDirectory(root), [{ name: "state", child: blob }]);
			assert.equal(await reader.getSnapshot(), undefined);
			const position = await writer.submit(encode("operation"), undefined, payload, root);
			assert.deepEqual(await writer.getDirectory(root), [{ name: "state", child: blob }]);
			assert.equal(await writer.resolveSubmission(encode("operation")), position);
			const events = reader.read(undefined, position);
			let observed = false;
			for (;;) {
				const item = await events.next();
				if (item === undefined) {
					break;
				}
				if (item.kind === "event") {
					assert.deepEqual(item.payload, payload);
					assert.deepEqual(item.blobTree, root);
					observed = true;
				}
			}
			assert.ok(observed);
			const coordination = await writer.coordinateSnapshots("clientSelected");
			await coordination.next();
			await writer.publishSnapshot(undefined, undefined, position, root);
			const loaded = await reader.load();
			const snapshot = await loaded.next();
			assert.equal(snapshot.kind, "snapshot");
			assert.equal(snapshot.atEvent, position);
			assert.deepEqual(snapshot.root, root);
			assert.deepEqual(await reader.getSnapshot(), snapshot);
			assert.deepEqual(await reader.getSnapshot(position), snapshot);
			assert.equal(await reader.getSnapshot(position - 1n), undefined);
			loaded.cancel();
			coordination.cancel();
			const pendingStream = reader.read(position);
			while ((await pendingStream.next()).kind !== "progress") {}
			const pending = pendingStream.next();
			pendingStream.cancel();
			assert.equal(await pending, undefined);
		} finally {
			await writer.close();
			await reader.close();
			service.close();
			isolated.close();
		}
	});
}

test("minimal memory bundle rejects unavailable compression before creating a document", async () => {
	const service = await createMemoryService({ environment: "node" });
	try {
		await assert.rejects(
			service.open(undefined, {
				author: encode("writer"),
				session: encode("session"),
				compression: true,
			}),
			{ kind: "Rejected", message: "this WASM bundle does not support compression" },
		);
	} finally {
		service.close();
	}
});

test("closing a memory service lets an admitted open settle without freeing its borrow", async () => {
	const service = await createMemoryService({ environment: "node" });
	const opening = service.open(undefined, {
		author: encode("writer"),
		session: encode("opening-session"),
	});
	let session;
	try {
		service.close();
		service.close();
		session = await opening;
		await assert.rejects(
			service.open(undefined, { author: encode("other"), session: encode("other") }),
			{ kind: "Closed", message: "memory service is closed" },
		);
		const blob = await session.putBlob(encode("retained storage"));
		assert.deepEqual(await session.getBlob(blob), encode("retained storage"));
	} finally {
		session ??= await opening;
		await session.close();
		service.close();
	}
});

test("session close is idempotent and rejects later calls without invalid WASM access", async () => {
	const service = await createMemoryService({ environment: "node" });
	const session = await service.open(undefined, {
		author: encode("writer"),
		session: encode("writer"),
	});
	const peer = await service.open(session.document, {
		author: encode("peer"),
		session: encode("peer"),
	});
	try {
		const pending = session.putBlob(encode("in-flight content"));
		const closing = session.close();
		assert.equal(session.close(), closing);
		const blob = await pending;
		await closing;
		assert.deepEqual(await peer.getBlob(blob), encode("in-flight content"));
		await assert.rejects(session.getBlob(blob), { kind: "Closed" });
		await assert.rejects(session.submit(encode("late"), undefined, encode("late")), {
			kind: "Closed",
		});
		assert.throws(() => session.read(), { kind: "Closed" });
		await peer.submit(encode("peer-operation"), undefined, encode("still open"));
	} finally {
		await session.close();
		await peer.close();
		service.close();
	}
});
