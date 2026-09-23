/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "mocha";
import ts from "typescript";
import {
	createMemoryService as rootCreateMemoryService,
	openWebTransport as rootOpenWebTransport,
	type SeaEvent,
	type SeaSession,
	type SeaStream,
} from "../index.js";
import { createMemoryService } from "../memory.js";
import { openWebTransport } from "../webtransport.js";
import { createSeaFactories } from "../presets.js";

describe("Neutral sessions", () => {
	const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
	const cleanups: (() => Promise<void>)[] = [];

	afterEach(async () => {
		await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
	});

	/** Owns one memory namespace and all sessions and streams opened by a scenario. */
	async function sessionFixture() {
		const service = await createMemoryService({ environment: "node" });
		const sessions: SeaSession[] = [];
		const streams: SeaStream<unknown>[] = [];
		cleanups.push(async () => {
			for (const stream of streams) stream.cancel();
			try {
				await Promise.all(sessions.map((session) => session.close()));
			} finally {
				service.close();
			}
		});
		const open = async (
			document: Uint8Array | undefined,
			_membership: string,
			reference?: bigint,
		): Promise<SeaSession> => {
			const session = await service.open(document, {
				...(reference === undefined ? {} : { reference }),
			});
			sessions.push(session);
			return session;
		};
		const ownStream = <Item>(stream: SeaStream<Item>): SeaStream<Item> => {
			streams.push(stream);
			return stream;
		};
		return { open, ownStream };
	}

	/** Advances monitored history to a requested result, rejecting premature completion. */
	async function nextMatching<Item, Match extends Item>(
		stream: SeaStream<Item>,
		predicate: (item: Item) => item is Match,
	): Promise<Match>;
	async function nextMatching<Item>(
		stream: SeaStream<Item>,
		predicate: (item: Item) => boolean,
	): Promise<Item>;
	async function nextMatching<Item>(
		stream: SeaStream<Item>,
		predicate: (item: Item) => boolean,
	): Promise<Item> {
		for (;;) {
			const item = await stream.next();
			assert.ok(item !== undefined);
			if (predicate(item)) return item;
		}
	}

	it("neutral membership announcements and departures share application event order", async () => {
		const { open, ownStream } = await sessionFixture();
		const writer = await open(undefined, "writer-session");
		const observer = await open(writer.document, "observer-session");
		const stream = ownStream(observer.read());
		const joined = await writer.announceMembership(encode("public member"));
		assert.equal(await writer.announceMembership(encode("public member")), joined);
		const edit = await writer.submit(joined, encode("edit"));
		await assert.rejects(writer.announceMembership(encode("changed")), { kind: "Rejected" });
		await writer.close();
		await writer.close();
		const events: SeaEvent[] = [];
		for (let index = 0; index < 3; index++) {
			events.push(await nextMatching(stream, (item) => item.kind === "event"));
		}
		assert.deepEqual(
			events.map((event) => event.eventType),
			["joined", "application", "left"],
		);
		const [joinEvent, editEvent, leaveEvent] = events;
		assert.ok(joinEvent && editEvent && leaveEvent);
		assert.equal(joinEvent.position, joined);
		assert.equal(editEvent.position, edit);
		assert.ok(leaveEvent.position > edit);
		assert.deepEqual(joinEvent.payload, encode("public member"));
		assert.deepEqual(leaveEvent.payload, new Uint8Array());
		assert.deepEqual(leaveEvent.session, writer.sessionId);
	});

	it("neutral signals broadcast, target, close pending reads, and leave history unchanged", async () => {
		const { open, ownStream } = await sessionFixture();
		const first = await open(undefined, "first-session");
		const second = await open(first.document, "second-session");
		const sender = await first.openSignals({
			id: encode("first"),
			metadata: encode("public"),
		});
		const initialMembers = await sender.next();
		assert.ok(initialMembers?.kind === "members");
		assert.equal(initialMembers.members.length, 1);
		const receiver = await second.openSignals({
			id: encode("second"),
			metadata: new Uint8Array(),
		});
		const updatedMembers = await receiver.next();
		assert.ok(updatedMembers?.kind === "members");
		assert.equal(updatedMembers.members.length, 2);
		assert.equal((await sender.next())?.kind, "joined");
		await sender.send(encode("broadcast"));
		assert.deepEqual(await sender.next(), await receiver.next());
		await sender.send(encode("target"), { target: encode("second"), delivery: "bestEffort" });
		const signal = await receiver.next();
		assert.ok(signal?.kind === "message");
		assert.equal(signal.delivery, "bestEffort");
		const history = ownStream(first.read());
		const progress = await history.next();
		assert.ok(progress?.kind === "progress");
		assert.equal(progress.latestKnown, undefined);
		const pending = receiver.next();
		await assert.rejects(receiver.next(), { kind: "Conflict" });
		await receiver.close();
		assert.equal(await pending, undefined);
		assert.deepEqual(await sender.next(), { kind: "left", id: encode("second") });
		await sender.close();
		await assert.rejects(sender.send(encode("closed")), { kind: "Closed" });
	});

	it("invalid append input terminates the accepted prefix before queued work", async () => {
		for (const invalidTree of [false, true]) {
			const { open, ownStream } = await sessionFixture();
			const writer = await open(undefined, "writer-session");
			const observer = await open(writer.document, "observer-session");
			const joined = await writer.announceMembership(encode("member"));
			await writer.submit(joined, encode("accepted"));
			const failed = writer.submit(
				invalidTree ? joined : 0xffff_ffff_ffff_ffffn,
				encode("invalid"),
				invalidTree ? { kind: "blob", bytes: new Uint8Array() } : undefined,
			);
			const queued = writer.submit(joined, encode("must not append"));
			const results = await Promise.allSettled([failed, queued]);
			assert.deepEqual(
				results.map((result) => result.status),
				["rejected", "rejected"],
			);
			await writer.close();
			const stream = ownStream(observer.read());
			const kinds: SeaEvent["eventType"][] = [];
			for (;;) {
				const event = await nextMatching(stream, (item) => item.kind === "event");
				kinds.push(event.eventType);
				if (event.eventType === "left") break;
			}
			assert.deepEqual(kinds, ["joined", "application", "left"]);
		}
	});

	it("neutral sessions load backlog, tail a peer, and cancel a pending read", async () => {
		const { open, ownStream } = await sessionFixture();
		const writer = await open(undefined, "writer-session");
		const position = await writer.submit(undefined, encode("first"));
		assert.equal(typeof position, "bigint");
		const load = ownStream(await writer.load());
		assert.deepEqual(
			(await nextMatching(load, (item) => item.kind === "event")).payload,
			encode("first"),
		);
		await nextMatching(
			load,
			(item) => item.kind === "progress" && item.status === "AwaitingNewItems",
		);
		const peer = await open(writer.document, "peer-session", position);
		const nextPosition = await peer.submit(position, encode("second"));
		const event = await nextMatching(load, (item) => item.kind === "event");
		assert.equal(event.position, nextPosition);
		assert.deepEqual(event.payload, encode("second"));
		await nextMatching(
			load,
			(item) => item.kind === "progress" && item.status === "AwaitingNewItems",
		);
		const pending = load.next();
		load.cancel();
		assert.equal(await pending, undefined);
	});

	it("neutral sessions preserve recursive content and idempotent snapshot publication", async () => {
		const { open, ownStream } = await sessionFixture();
		const session = await open(undefined, "writer-session");
		const coordination = ownStream(await session.coordinateSnapshots("clientSelected"));
		await coordination.next();
		const blob = await session.putBlob(encode("content"));
		assert.equal(blob.kind, "blob");
		assert.deepEqual(await session.getBlob(blob), encode("content"));
		const child = await session.putDirectory([{ name: "leaf", child: blob }]);
		const root = await session.putDirectory([{ name: "child", child }]);
		assert.equal(root.kind, "directory");
		assert.deepEqual(await session.getDirectory(root), [{ name: "child", child }]);
		assert.deepEqual(await session.getDirectory(child), [{ name: "leaf", child: blob }]);
		const position = await session.submit(undefined, encode("initial state"), root);
		const snapshot = await session.publishSnapshot(undefined, undefined, position, root);
		assert.deepEqual(await session.getSnapshot(), snapshot);
		assert.deepEqual(await session.getSnapshot(position), snapshot);
		assert.deepEqual(
			await session.publishSnapshot(undefined, undefined, position, root),
			snapshot,
		);
		const other = await session.putBlob(encode("other state"));
		await assert.rejects(
			session.publishSnapshot(undefined, undefined, position, other),
			/different root/,
		);
	});

	it("neutral snapshot participation enforces read-only authority and explicit fences", async () => {
		const { open, ownStream } = await sessionFixture();
		const reader = await open(undefined, "reader-session");
		const notifications = ownStream(await reader.coordinateSnapshots("readOnly"));
		await notifications.next();
		const root = await reader.putBlob(encode("state"));
		const position = await reader.submit(undefined, encode("initial"), root);
		await assert.rejects(
			reader.publishSnapshot(undefined, undefined, position, root),
			/snapshot publisher is not authorized/,
		);
		notifications.cancel();
		await reader.close();
		const selected = await open(reader.document, "selected-session");
		const coordination = ownStream(await selected.coordinateSnapshots("seaSelected"));
		const state = await coordination.next();
		assert.ok(state);
		assert.notEqual(state.fence, undefined);
		await assert.rejects(selected.publishSnapshot(undefined, undefined, position, root));
		const snapshot = await selected.publishSnapshot(undefined, state.fence, position, root);
		assert.deepEqual(snapshot.root, root);
		coordination.cancel();
		await assert.rejects(selected.publishSnapshot(position, state.fence, position, root));
	});

	it("neutral snapshot replacement and cancellation release only their own registration", async () => {
		const { open, ownStream } = await sessionFixture();
		const session = await open(undefined, "writer-session");
		const previous = ownStream(await session.coordinateSnapshots("clientSelected"));
		await previous.next();
		const ended = assert.rejects(previous.next(), /snapshot stream ended/);
		const replacement = ownStream(await session.coordinateSnapshots("clientSelected"));
		await ended;
		await replacement.next();
		previous.cancel();
		const root = await session.putBlob(encode("state"));
		const position = await session.submit(undefined, encode("state"), root);
		const notification = replacement.next();
		await session.publishSnapshot(undefined, undefined, position, root);
		assert.equal((await notification)?.latest, position);
		const cancelled = assert.rejects(replacement.next());
		replacement.cancel();
		await cancelled;
		await assert.rejects(
			session.publishSnapshot(position, undefined, position, root),
			/snapshot publisher is not authorized/,
		);
	});

	it("neutral sessions remain independent and allocate distinct identities", async () => {
		const { open } = await sessionFixture();
		const first = await open(undefined, "first-session");
		const position = await first.submit(undefined, encode("first"));
		assert.ok((await first.submit(undefined, encode("first"))) > position);
		const replacement = await open(first.document, "replacement-session");
		assert.equal(await first.getSnapshot(), undefined);
		await first.close();
		const reopened = await open(first.document, "first-session");
		assert.equal(first.sessionId.length, 8);
		assert.notDeepEqual(reopened.sessionId, first.sessionId);
		assert.notDeepEqual(reopened.sessionId, replacement.sessionId);
		await replacement.submit(undefined, encode("still open"));
	});

	it("neutral sessions close and explicitly reopen retained content", async () => {
		const { open } = await sessionFixture();
		const first = await open(undefined, "first-session");
		const blob = await first.putBlob(encode("retained"));
		await first.close();
		await assert.rejects(first.getSnapshot(), { kind: "Closed" });
		const replacement = await open(first.document, "replacement-session");
		assert.equal(await replacement.getSnapshot(), undefined);
		assert.deepEqual(await replacement.getBlob(blob), encode("retained"));
	});

	it("neutral services allocate document identities and never implicitly create on open", async () => {
		const { open } = await sessionFixture();
		await assert.rejects(
			open(encode("missing"), "missing-session"),
			/document does not exist/,
		);
		const allocated = await open(undefined, "creator-session");
		const another = await open(undefined, "another-session");
		assert.notDeepEqual(allocated.document, another.document);
		const reopened = await open(allocated.document, "reader-session");
		assert.deepEqual(reopened.document, allocated.document);
	});

	it("capability entrypoints share factories and reach only lazy capability-specific artifacts", () => {
		assert.equal(createMemoryService, rootCreateMemoryService);
		assert.equal(openWebTransport, rootOpenWebTransport);
		for (const [capability, configurations] of [
			["memory", ["memory", "memory-compression"]],
			["webtransport", ["webtransport", "webtransport-compression"]],
			["websocket", ["websocket"]],
		] as const) {
			const visited = new Set<string>();
			const artifacts = new Set<string>();
			const visitModule = (url: URL): void => {
				if (visited.has(url.href)) return;
				visited.add(url.href);
				const source = ts.createSourceFile(
					url.pathname,
					readFileSync(url, "utf8"),
					ts.ScriptTarget.Latest,
					true,
					ts.ScriptKind.JS,
				);
				const visitNode = (node: ts.Node): void => {
					const dynamic =
						ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword;
					const specifier = dynamic
						? node.arguments[0]
						: ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
							? node.moduleSpecifier
							: undefined;
					if (specifier !== undefined && ts.isStringLiteral(specifier)) {
						assert.ok(
							specifier.text.startsWith("."),
							`unexpected dependency ${specifier.text}`,
						);
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
						capability !== "webtransport"
							? [`${configuration}/node`, `${configuration}/web`]
							: [`${configuration}/web`],
					)
					.sort(),
			);
		}
	});

	for (const preset of ["split", "combined"] as const) {
		for (const compression of [false, true]) {
			it(`package entrypoint supports shared memory sessions (preset=${preset}, compression=${compression})`, async () => {
				const factories = createSeaFactories({
					preset,
					compressionSupport: compression,
					environment: "node",
				});
				const service = await factories.createMemoryService();
				const isolated = await factories.createMemoryService();
				const writer = await service.open(undefined, {
					compression,
				});
				const reader = await service.open(writer.document, {
					compression,
				});
				try {
					await assert.rejects(
						isolated.open(writer.document, {
							compression,
						}),
						{ kind: "Rejected", message: "document does not exist in this memory service" },
					);
					const payload = encode("opaque application payload ".repeat(100));
					const blob = await writer.putBlob(payload);
					assert.deepEqual(await reader.getBlob(blob), payload);
					if (compression) {
						const rawReader = await service.open(writer.document, {});
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
					const position = await writer.submit(undefined, payload, root);
					assert.deepEqual(await writer.getDirectory(root), [{ name: "state", child: blob }]);
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
					assert.ok(snapshot?.kind === "snapshot");
					assert.equal(snapshot.atEvent, position);
					assert.deepEqual(snapshot.root, root);
					assert.deepEqual(await reader.getSnapshot(), snapshot);
					assert.deepEqual(await reader.getSnapshot(position), snapshot);
					assert.equal(await reader.getSnapshot(position - 1n), undefined);
					loaded.cancel();
					coordination.cancel();
					const pendingStream = reader.read(position);
					await nextMatching(pendingStream, (item) => item.kind === "progress");
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
	}

	for (const preset of ["split", "combined"] as const) {
		it(`minimal ${preset} preset rejects unavailable compression before creating a document`, async () => {
			const service = await createSeaFactories({
				preset,
				environment: "node",
			}).createMemoryService();
			try {
				await assert.rejects(
					service.open(undefined, {
						compression: true,
					}),
					{ kind: "Rejected", message: "this WASM bundle does not support compression" },
				);
			} finally {
				service.close();
			}
		});

		it(`${preset} compression support does not enable compression implicitly`, async () => {
			const service = await createSeaFactories({
				preset,
				environment: "node",
				compressionSupport: true,
			}).createMemoryService();
			const session = await service.open(undefined, {});
			const raw = await service.open(session.document, {
				compression: false,
			});
			try {
				const payload = encode("uncompressed despite compiled support ".repeat(50));
				assert.deepEqual(await raw.getBlob(await session.putBlob(payload)), payload);
			} finally {
				await session.close();
				await raw.close();
				service.close();
			}
		});
	}

	it("preset selection rejects invalid configuration and unsupported Node WebTransport", async () => {
		assert.throws(
			() => Reflect.apply(createSeaFactories, undefined, [{ preset: "unknown" }]),
			{ kind: "Rejected" },
		);
		assert.throws(
			() => Reflect.apply(createSeaFactories, undefined, [{ environment: "unknown" }]),
			{ kind: "Rejected" },
		);
		for (const preset of ["split", "combined"] as const) {
			await assert.rejects(
				createSeaFactories({ preset, environment: "node" }).openWebTransport(
					{ url: "https://unused.invalid/sea", certificateHash: new Uint8Array(32) },
					undefined,
					{},
				),
				{ kind: "Unavailable", message: "WebTransport requires a supported browser" },
			);
		}
	});

	it("bundle initialization is shared by concurrent callers and caches failure without retries", async () => {
		const { initialize } = await import("../bindings.js");
		let loads = 0;
		let initializations = 0;
		const module = {};
		const load = async () => {
			loads++;
			return module;
		};
		const setup = async () => {
			initializations++;
		};
		const first = initialize("test/concurrent", load, setup);
		const second = initialize("test/concurrent", load, setup);
		assert.equal(first, second);
		assert.equal(await first, module);
		assert.equal(await initialize("test/concurrent", load, setup), module);
		assert.equal(loads, 1);
		assert.equal(initializations, 1);
		const failure = new Error("initialization failed");
		const failed = initialize("test/failure", load, async () => {
			throw failure;
		});
		await assert.rejects(failed, failure);
		assert.equal(initialize("test/failure", load, setup), failed);
		await assert.rejects(failed, failure);
		assert.equal(loads, 2);
	});

	it("closing a memory service lets an admitted open settle without freeing its borrow", async () => {
		const service = await createMemoryService({ environment: "node" });
		const opening = service.open(undefined, {});
		let session: SeaSession | undefined;
		try {
			service.close();
			service.close();
			session = await opening;
			await assert.rejects(service.open(undefined, {}), {
				kind: "Closed",
				message: "memory service is closed",
			});
			const blob = await session.putBlob(encode("retained storage"));
			assert.deepEqual(await session.getBlob(blob), encode("retained storage"));
		} finally {
			session ??= await opening;
			await session.close();
			service.close();
		}
	});

	it("session close is idempotent and rejects later calls without invalid WASM access", async () => {
		const service = await createMemoryService({ environment: "node" });
		const session = await service.open(undefined, {});
		const peer = await service.open(session.document, {});
		try {
			const pending = session.putBlob(encode("in-flight content"));
			const closing = session.close();
			assert.equal(session.close(), closing);
			const blob = await pending;
			await closing;
			assert.deepEqual(await peer.getBlob(blob), encode("in-flight content"));
			await assert.rejects(session.getBlob(blob), { kind: "Closed" });
			await assert.rejects(session.submit(undefined, encode("late")), {
				kind: "Closed",
			});
			assert.throws(() => session.read(), { kind: "Closed" });
			await peer.submit(undefined, encode("still open"));
		} finally {
			await session.close();
			await peer.close();
			service.close();
		}
	});
});
