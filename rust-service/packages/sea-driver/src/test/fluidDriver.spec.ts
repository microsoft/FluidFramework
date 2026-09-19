/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { setImmediate } from "node:timers/promises";

import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions";
import {
	MessageType,
	type ISummaryContext,
} from "@fluidframework/driver-definitions/internal";
import { createMemoryService } from "@fluidframework/sea-typescript/internal";
import { useFakeTimers } from "sinon";

import {
	SeaDeltaConnection,
	SeaDeltaStorage,
	SeaDocumentService,
	SeaDocumentStorage,
	SeaDriver,
	SeaSessionDriverClient,
	type BlobUpload,
	type ProjectedOperationSubscription,
	type ProjectedReadPage,
	type SeaDriverClient,
	type SubmissionResolution,
	type SummaryEntry,
	type SummaryPublication,
} from "../index.js";

describe("SeaDriver", () => {
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();

	it("published summary proposals produce ordered replayable acknowledgments", async () => {
		const service = await createMemoryService({ environment: "node" });
		const writer = new SeaSessionDriverClient(service.open, "clientSelected");
		const observer = new SeaSessionDriverClient(service.open, "readOnly");
		try {
			const document = await writer.create();
			await writer.openSession(document, encoder.encode("writer"), encoder.encode("session"));
			const root = await writer.publishSummary([]);
			const version = await writer.publishSnapshotRoot(undefined, undefined, root.digest);
			const handle = Buffer.from(version).toString("hex");
			const subscription = await writer.subscribeProjected(version);
			try {
				await writer.submitEvent(
					encoder.encode("summary"),
					1,
					encoder.encode(
						JSON.stringify({
							clientSequenceNumber: 1,
							referenceSequenceNumber: 0,
							type: MessageType.Summarize,
							contents: JSON.stringify({ handle }),
						}),
					),
					version,
				);
				const history = await writer.readProjected();
				const messages = history.operations.map((operation) =>
					JSON.parse(decoder.decode(operation.payload)),
				);
				assert.deepEqual(
					messages.map((message) => message.type),
					[MessageType.Summarize, MessageType.SummaryAck],
				);
				assert.deepEqual(messages[1].contents, {
					handle,
					summaryProposal: { summarySequenceNumber: 1 },
				});
				assert.equal((await subscription.next()).eventType, "application");
				assert.equal((await subscription.next()).eventType, "summaryAck");
				await observer.openSession(
					document,
					encoder.encode("observer"),
					encoder.encode("observer-session"),
				);
				assert.deepEqual((await observer.readProjected()).operations, history.operations);
				const page = await new SeaDeltaStorage(observer).fetchMessages(2, 3).read();
				assert.equal(page.done, false);
				if (!page.done) {
					assert.equal(page.value.length, 1);
					assert.equal(page.value[0]?.type, MessageType.SummaryAck);
					assert.equal(page.value[0]?.clientId, null);
					assert.equal(page.value[0]?.sequenceNumber, 2);
				}
			} finally {
				await subscription.cancel();
			}
		} finally {
			writer.disconnect();
			observer.disconnect();
			await Promise.all([writer.reconnect(), observer.reconnect()]);
			service.close();
		}
	});

	it("summary uploads remain private until proposal submission and are discarded on close", async () => {
		const service = await createMemoryService({ environment: "node" });
		const writer = new SeaSessionDriverClient(service.open, "clientSelected");
		const observer = new SeaSessionDriverClient(service.open, "readOnly");
		try {
			const document = await writer.create();
			await writer.openSession(document, encoder.encode("writer"), encoder.encode("session"));
			const storage = new SeaDocumentStorage(writer);
			await storage.uploadInitialSummary({ type: SummaryType.Tree, tree: {} });
			const initial = (await storage.getVersions(null, 1))[0];
			assert.ok(initial);
			await writer.announceMembership(encoder.encode(JSON.stringify({ mode: "write" })));
			await writer.readProjected();
			await observer.openSession(
				document,
				encoder.encode("observer"),
				encoder.encode("observer"),
			);
			const reference = writer.positionForSequence(1);
			assert.ok(reference);
			const abandoned = await storage.uploadSummaryWithContext(
				{
					type: SummaryType.Tree,
					tree: { value: { type: SummaryType.Blob, content: "abandoned" } },
				},
				{ referenceSequenceNumber: 1, ackHandle: initial.id, proposalHandle: undefined },
			);
			const beforeReplacement = await observer.latestSnapshot();
			assert.ok(beforeReplacement);
			assert.equal(Buffer.from(beforeReplacement.id).toString("hex"), initial.id);
			writer.disconnect();
			await writer.openSession(
				document,
				encoder.encode("writer"),
				encoder.encode("replacement"),
			);
			const afterReplacement = await observer.latestSnapshot();
			assert.ok(afterReplacement);
			assert.equal(Buffer.from(afterReplacement.id).toString("hex"), initial.id);
			const proposal = await storage.uploadSummaryWithContext(
				{
					type: SummaryType.Tree,
					tree: { value: { type: SummaryType.Blob, content: "accepted" } },
				},
				{ referenceSequenceNumber: 1, ackHandle: initial.id, proposalHandle: undefined },
			);
			assert.notEqual(proposal, abandoned);
			await writer.submitEvent(
				encoder.encode("summary"),
				1,
				encoder.encode(
					JSON.stringify({
						type: MessageType.Summarize,
						contents: JSON.stringify({ handle: proposal }),
					}),
				),
				reference,
			);
			const published = await observer.latestSnapshot();
			assert.ok(published);
			assert.deepEqual(published.atEvent, reference);
			const snapshot = await new SeaDocumentStorage(observer).getSnapshotTree();
			assert.ok(snapshot);
			assert.ok(snapshot.blobs.value);
			assert.equal(decoder.decode(await storage.readBlob(snapshot.blobs.value)), "accepted");
			const history = await observer.readProjected();
			const acknowledgment = history.operations.find(
				(operation) => operation.eventType === "summaryAck",
			);
			assert.ok(acknowledgment);
			assert.equal(
				JSON.parse(decoder.decode(acknowledgment.payload)).contents.handle,
				Buffer.from(reference).toString("hex"),
			);
		} finally {
			writer.disconnect();
			observer.disconnect();
			await Promise.all([writer.reconnect(), observer.reconnect()]);
			service.close();
		}
	});

	it("accepted summary proposals cannot publish through a replacement session", async () => {
		const service = await createMemoryService({ environment: "node" });
		const writer = new SeaSessionDriverClient(async (...args) => {
			const session = await service.open(...args);
			return {
				...session,
				submit: async (...submissionArgs) => {
					const position = await session.submit(...submissionArgs);
					if (JSON.parse(decoder.decode(submissionArgs[2])).type === MessageType.Summarize) {
						await writer.openSession(
							session.document,
							encoder.encode("writer"),
							encoder.encode("replacement"),
						);
					}
					return position;
				},
			};
		}, "clientSelected");
		try {
			const document = await writer.create();
			await writer.openSession(document, encoder.encode("writer"), encoder.encode("session"));
			const root = await writer.publishSummary([]);
			const initial = await writer.publishSnapshotRoot(undefined, undefined, root.digest);
			await writer.announceMembership(encoder.encode(JSON.stringify({ mode: "write" })));
			await writer.readProjected();
			const reference = writer.positionForSequence(1);
			assert.ok(reference);
			const staged = await writer.stageSnapshotRoot(initial, reference, root.digest);
			await assert.rejects(
				writer.submitEvent(
					encoder.encode("summary"),
					1,
					encoder.encode(
						JSON.stringify({
							type: MessageType.Summarize,
							contents: JSON.stringify({ handle: bytesKey(staged) }),
						}),
					),
					reference,
				),
				/original session/,
			);
			assert.deepEqual((await writer.latestSnapshot())?.id, initial);
			assert.equal(
				(await writer.readProjected()).operations.some(
					(operation) => operation.eventType === "summaryAck",
				),
				false,
			);
		} finally {
			writer.disconnect();
			await writer.reconnect();
			service.close();
		}
	});

	it("unpublished summary proposals terminate membership without an acknowledgment", async () => {
		const service = await createMemoryService({ environment: "node" });
		const writer = new SeaSessionDriverClient(service.open, "clientSelected");
		try {
			const document = await writer.create();
			await writer.openSession(document, encoder.encode("writer"), encoder.encode("session"));
			await writer.announceMembership(encoder.encode(JSON.stringify({ mode: "write" })));
			await assert.rejects(
				writer.submitEvent(
					encoder.encode("summary"),
					1,
					encoder.encode(
						JSON.stringify({
							type: MessageType.Summarize,
							contents: JSON.stringify({ handle: "000000000000ffff" }),
						}),
					),
				),
				/published snapshot/,
			);
			await writer.openSession(
				document,
				encoder.encode("observer"),
				encoder.encode("observer-session"),
			);
			assert.deepEqual(
				(await writer.readProjected()).operations.map((operation) => operation.eventType),
				["joined", "left"],
			);
		} finally {
			writer.disconnect();
			await writer.reconnect();
			service.close();
		}
	});

	it("failed summary acknowledgment leaves only the accepted proposal before departure", async () => {
		const service = await createMemoryService({ environment: "node" });
		let acknowledgmentAttempts = 0;
		const writer = new SeaSessionDriverClient(async (...args) => {
			const session = await service.open(...args);
			return {
				...session,
				submit: async (...submissionArgs) => {
					if (JSON.parse(decoder.decode(submissionArgs[2])).seaFluid === "summaryAck") {
						acknowledgmentAttempts++;
						throw new Error("acknowledgment interrupted");
					}
					return session.submit(...submissionArgs);
				},
			};
		}, "clientSelected");
		try {
			const document = await writer.create();
			await writer.openSession(document, encoder.encode("writer"), encoder.encode("session"));
			const root = await writer.publishSummary([]);
			const version = await writer.publishSnapshotRoot(undefined, undefined, root.digest);
			await writer.announceMembership(encoder.encode(JSON.stringify({ mode: "write" })));
			await assert.rejects(
				writer.submitEvent(
					encoder.encode("summary"),
					1,
					encoder.encode(
						JSON.stringify({
							type: MessageType.Summarize,
							contents: JSON.stringify({ handle: Buffer.from(version).toString("hex") }),
						}),
					),
					version,
				),
				/acknowledgment interrupted/,
			);
			await writer.openSession(
				document,
				encoder.encode("observer"),
				encoder.encode("observer-session"),
			);
			assert.deepEqual(
				(await writer.readProjected()).operations.map((operation) => operation.eventType),
				["joined", "application", "left"],
			);
			assert.equal(acknowledgmentAttempts, 1);
		} finally {
			writer.disconnect();
			await writer.reconnect();
			service.close();
		}
	});

	it("neutral session driver hides initialization and preserves snapshot versions across reopen", async () => {
		const service = await createMemoryService({ environment: "node" });
		const writer = new SeaSessionDriverClient(service.open, "clientSelected");
		const observer = new SeaSessionDriverClient(service.open, "readOnly");
		try {
			const document = await writer.create();
			await writer.openSession(
				document,
				encoder.encode("writer"),
				encoder.encode("writer-session"),
			);
			const root = await writer.publishSummary([]);
			const initial = await writer.publishSnapshotRoot(undefined, undefined, root.digest);
			assert.deepEqual(writer.positionForSequence(0), initial);
			assert.deepEqual((await writer.readProjected()).operations, []);
			const position = await writer.submitEvent(
				encoder.encode("edit"),
				1,
				encoder.encode(JSON.stringify({ clientSequenceNumber: 1 })),
				initial,
			);
			const history = await writer.readProjected();
			assert.equal(history.operations.length, 1);
			assert.equal(history.operations[0]?.sequenceNumber, 1n);
			assert.deepEqual(writer.positionForSequence(1), position);
			const version = await writer.publishSnapshotRoot(initial, position, root.digest);
			assert.deepEqual(version, position);
			await observer.openSession(
				document,
				encoder.encode("observer"),
				encoder.encode("observer-session"),
			);
			assert.deepEqual(observer.positionForSequence(0), initial);
			assert.deepEqual(observer.positionForSequence(1), position);
			assert.equal((await observer.readProjected()).operations[0]?.sequenceNumber, 1n);
			assert.deepEqual((await observer.snapshot(initial))?.id, initial);
			assert.deepEqual((await observer.latestSnapshot())?.id, version);
			assert.equal(await observer.snapshot(encodeU64(999n)), undefined);
			const firstSubscription = await observer.subscribeProjected();
			const secondSubscription = await observer.subscribeProjected();
			assert.deepEqual((await firstSubscription.next()).position, position);
			await firstSubscription.cancel();
			assert.deepEqual((await secondSubscription.next()).position, position);
			await secondSubscription.cancel();
			const connection = new SeaDeltaConnection(
				"observer",
				{
					clientId: "observer",
					remoteClientId: "writer",
					writer: encoder.encode("observer"),
					cursor: position,
					lastPosition: initial,
					remoteClientSequenceNumber: 0,
					remoteSequenceNumbers: new Map(),
				},
				encoder.encode("observer-reopened"),
				document,
				observer,
				{
					details: { capabilities: { interactive: true } },
					permission: [],
					scopes: [],
					user: { id: "observer" },
					mode: "write",
				},
				"write",
				[],
			);
			try {
				await connection.open();
			} finally {
				connection.dispose();
			}
		} finally {
			writer.disconnect();
			observer.disconnect();
			await Promise.all([writer.reconnect(), observer.reconnect()]);
			service.close();
		}
	});

	it("subscription restart preserves membership, signals, and ordered delivery", async () => {
		const service = await createMemoryService({ environment: "node" });
		let sessionOpens = 0;
		const adapter = new SeaSessionDriverClient(async (...args) => {
			sessionOpens++;
			return service.open(...args);
		}, "readOnly");
		const document = await adapter.create();
		const connection = new SeaDeltaConnection(
			"writer",
			{
				clientId: "writer",
				remoteClientId: "remote",
				writer: encoder.encode("writer"),
				cursor: undefined,
				lastPosition: undefined,
				remoteClientSequenceNumber: 0,
				remoteSequenceNumbers: new Map(),
			},
			encoder.encode("writer"),
			document,
			adapter,
			{
				details: { capabilities: { interactive: true } },
				permission: [],
				scopes: [],
				user: { id: "writer" },
				mode: "write",
			},
			"write",
			[],
		);
		const received: number[] = [];
		const signals: unknown[] = [];
		connection.on("op", (_document, messages) => {
			for (const message of messages) {
				if (message.type === "op") received.push(message.clientSequenceNumber);
			}
		});
		connection.on("signal", (signal) => {
			for (const message of Array.isArray(signal) ? signal : [signal]) {
				signals.push(message.content);
			}
		});
		try {
			await connection.open();
			const initialOpens = sessionOpens;
			connection.submit([
				{
					clientSequenceNumber: 1,
					referenceSequenceNumber: connection.checkpointSequenceNumber,
					type: "op",
					contents: "before restart",
				},
			]);
			await connection.waitForIdle();
			await setImmediate();
			assert.deepEqual(received, [1]);
			const checkpoint = connection.checkpointSequenceNumber;
			assert.equal(await connection.restartSubscription(), true);
			assert.equal(connection.clientId, "writer");
			assert.equal(sessionOpens, initialOpens);
			assert.equal(connection.checkpointSequenceNumber, checkpoint);
			assert.deepEqual(signals, []);
			connection.submit([
				{
					clientSequenceNumber: 2,
					referenceSequenceNumber: checkpoint,
					type: "op",
					contents: "after restart",
				},
			]);
			connection.submitSignal("after restart");
			await connection.waitForIdle();
			await setImmediate();
			assert.deepEqual(received, [1, 2]);
			assert.deepEqual(signals, ["after restart"]);
		} finally {
			connection.dispose();
			adapter.disconnect();
			await adapter.reconnect();
			service.close();
		}
	});

	it("pong waits for a service response and ignores failed or disposed measurements", async () => {
		const service = await createMemoryService({ environment: "node" });
		const adapter = new SeaSessionDriverClient(service.open, "readOnly");
		const document = await adapter.create();
		const connection = new SeaDeltaConnection(
			"writer",
			{
				clientId: "writer",
				remoteClientId: "remote",
				writer: encoder.encode("writer"),
				cursor: undefined,
				lastPosition: undefined,
				remoteClientSequenceNumber: 0,
				remoteSequenceNumbers: new Map(),
			},
			encoder.encode("writer"),
			document,
			adapter,
			{
				details: { capabilities: { interactive: true } },
				permission: [],
				scopes: [],
				user: { id: "writer" },
				mode: "write",
			},
			"write",
			[],
		);
		const responses: { resolve: () => void; reject: (error: Error) => void }[] = [];
		adapter.latestSnapshot = () =>
			new Promise((resolve, reject) => {
				responses.push({ resolve: () => resolve(undefined), reject });
			});
		try {
			await connection.open();
			const clock = useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			try {
				assert.equal(responses.length, 0);
				const latencies: number[] = [];
				connection.on("pong", (latency) => latencies.push(latency));
				let onceCalls = 0;
				connection.once("pong", () => {
					onceCalls++;
				});
				assert.equal(responses.length, 1);
				assert.deepEqual(latencies, []);
				responses[0]?.resolve();
				await setImmediate();
				assert.equal(latencies.length, 1);
				assert.ok(Number.isFinite(latencies[0]) && (latencies[0] ?? -1) >= 0);
				assert.equal(onceCalls, 1);
				clock.tick(60_000);
				assert.equal(responses.length, 2);
				responses[1]?.reject(new Error("probe failed"));
				await setImmediate();
				assert.equal(latencies.length, 1);
				clock.tick(60_000);
				assert.equal(responses.length, 3);
				connection.dispose();
				responses[2]?.resolve();
				await setImmediate();
				clock.tick(60_000);
				assert.equal(responses.length, 3);
				assert.equal(latencies.length, 1);
			} finally {
				clock.restore();
			}
		} finally {
			connection.dispose();
			for (const response of responses) response.resolve();
			adapter.disconnect();
			await adapter.reconnect();
			service.close();
		}
	});

	it("terminal recovery proves a prefix before transforming only the unaccepted suffix", async () => {
		const service = await createMemoryService({ environment: "node" });
		const adapter = new SeaSessionDriverClient(service.open, "readOnly");
		const document = await adapter.create();
		const connection = new SeaDeltaConnection(
			"writer",
			{
				clientId: "writer",
				remoteClientId: "remote",
				writer: encoder.encode("writer"),
				cursor: undefined,
				lastPosition: undefined,
				remoteClientSequenceNumber: 0,
				remoteSequenceNumbers: new Map(),
			},
			encoder.encode("writer"),
			document,
			adapter,
			{
				details: { capabilities: { interactive: true } },
				permission: [],
				scopes: [],
				user: { id: "writer" },
				mode: "write",
			},
			"write",
			[],
		);
		try {
			await connection.open();
			const submit = adapter.submitEvent.bind(adapter);
			let loseReceipt = true;
			adapter.submitEvent = async (...args) => {
				const position = await submit(...args);
				if (loseReceipt && args[1] === 2) {
					loseReceipt = false;
					throw new Error("lost receipt");
				}
				return position;
			};
			connection.submit(
				[1, 2, 3].map((sequence) => ({
					clientSequenceNumber: sequence,
					referenceSequenceNumber: connection.checkpointSequenceNumber,
					type: "op",
					contents: { delta: sequence },
				})),
			);
			await assert.rejects(connection.waitForIdle(), /lost receipt/);
			await assert.rejects(connection.recoverPending(), /fresh session/);
			await connection.reconnect();
			await assert.rejects(
				connection.resubmitPending(() => []),
				/proven suffix/,
			);
			const read = adapter.readProjected.bind(adapter);
			adapter.readProjected = async () => {
				const page = await read();
				return {
					...page,
					operations: page.operations.filter((operation) => operation.eventType !== "left"),
				};
			};
			await assert.rejects(connection.recoverPending(), /terminal leave/);
			adapter.readProjected = async () => {
				const page = await read();
				return {
					...page,
					operations: page.operations.filter(
						(operation) =>
							operation.eventType !== "application" || operation.localSequenceNumber !== 1n,
					),
				};
			};
			await assert.rejects(connection.recoverPending(), /submitted prefix/);
			adapter.readProjected = read;
			assert.equal((await connection.recoverPending()).get(3)?.kind, "notCommitted");
			await connection.resubmitPending((suffix) => {
				assert.deepEqual(
					suffix.map((pending) => pending.message.clientSequenceNumber),
					[3],
				);
				return [
					{
						clientSequenceNumber: 1,
						referenceSequenceNumber: connection.checkpointSequenceNumber,
						type: "op",
						contents: { delta: 7 },
					},
				];
			});
			const applications = (await read()).operations.filter(
				(operation) => operation.eventType === "application",
			);
			assert.deepEqual(
				applications.map(
					(operation) => JSON.parse(decoder.decode(operation.payload)).contents.delta,
				),
				[1, 2, 7],
			);
			assert.notDeepEqual(applications[1]?.session, applications[2]?.session);
			assert.notDeepEqual(applications[1]?.submission, applications[2]?.submission);
			assert.equal(connection.pending.size, 0);
		} finally {
			connection.dispose();
			adapter.disconnect();
			await adapter.reconnect();
			service.close();
		}
	});

	it("stale delta disposal cannot close a replacement session", async () => {
		const service = await createMemoryService({ environment: "node" });
		const adapter = new SeaSessionDriverClient(service.open, "readOnly");
		const document = await adapter.create();
		try {
			await adapter.openSession(document, encoder.encode("writer"), encoder.encode("old"));
			await adapter.announceMembership(encoder.encode('{"mode":"write"}'));
			await adapter.openSession(document, encoder.encode("writer"), encoder.encode("new"));
			await adapter.announceMembership(encoder.encode('{"mode":"write"}'));
			adapter.disconnect(encoder.encode("old"));
			assert.deepEqual(
				(await adapter.readProjected()).operations.map((operation) => operation.eventType),
				["joined", "left", "joined"],
			);
			adapter.disconnect(encoder.encode("new"));
			await adapter.reconnect();
			const payload = encoder.encode("archive after delta disposal");
			const blob = await adapter.uploadBlob(payload);
			assert.deepEqual(await adapter.fetchBlob(blob.digest), payload);
			await assert.rejects(
				adapter.announceMembership(encoder.encode('{"mode":"write"}')),
				/SEA session is not open/,
			);
			adapter.disconnect(encoder.encode("new"));
			assert.deepEqual(await adapter.fetchBlob(blob.digest), payload);
			await adapter.openSession(document, encoder.encode("reader"), encoder.encode("reader"));
			assert.deepEqual(
				(await adapter.readProjected()).operations.map((operation) => operation.eventType),
				["joined", "left", "joined", "left"],
			);
			adapter.disconnect();
			await assert.rejects(adapter.fetchBlob(blob.digest), /SEA session is not open/);
		} finally {
			adapter.disconnect();
			await adapter.reconnect();
			service.close();
		}
	});

	it("document disposal drains a shared lazy archive opening and rejects later reads", async () => {
		const service = await createMemoryService({ environment: "node" });
		let releaseOpen = (): void => {};
		const blocked = new Promise<void>((resolve) => {
			releaseOpen = resolve;
		});
		let enteredOpen = (): void => {};
		const entered = new Promise<void>((resolve) => {
			enteredOpen = resolve;
		});
		let archiveOpens = 0;
		let archiveCloses = 0;
		const adapter = new SeaSessionDriverClient(async (document, options) => {
			const archive = decoder.decode(options.author).startsWith("archive-");
			if (archive) {
				archiveOpens += 1;
				enteredOpen();
				await blocked;
			}
			const session = await service.open(document, options);
			if (archive) {
				const close = session.close.bind(session);
				session.close = () => {
					archiveCloses += 1;
					return close();
				};
			}
			return session;
		}, "readOnly");
		try {
			const document = await adapter.create();
			const payload = encoder.encode("lazy archive content");
			const blob = await adapter.uploadBlob(payload);
			const owner = encoder.encode("delta");
			await adapter.openSession(document, encoder.encode("writer"), owner);
			adapter.disconnect(owner);
			const reads = Promise.all([
				adapter.fetchBlob(blob.digest),
				adapter.fetchBlob(blob.digest),
			]);
			await entered;
			assert.equal(archiveOpens, 1);
			adapter.disconnect();
			await assert.rejects(adapter.fetchBlob(blob.digest), /SEA session is not open/);
			assert.equal(archiveCloses, 0);
			releaseOpen();
			assert.deepEqual(await reads, [payload, payload]);
			await adapter.reconnect();
			assert.equal(archiveCloses, 1);
			assert.equal(archiveOpens, 1);
		} finally {
			releaseOpen();
			adapter.disconnect();
			await adapter.reconnect();
			service.close();
		}
	});

	it("neutral projection preserves the durable floor across membership close and reopen", async () => {
		const service = await createMemoryService({ environment: "node" });
		const writer = await service.open(undefined, {
			author: encoder.encode("writer"),
			session: encoder.encode("first"),
		});
		const adapter = new SeaSessionDriverClient(service.open, "readOnly");
		try {
			const joined = await writer.announceMembership(encoder.encode('{"mode":"write"}'));
			await writer.submit(
				encoder.encode("edit"),
				joined,
				encoder.encode('{"clientSequenceNumber":1}'),
			);
			await writer.close();
			await adapter.openSession(
				writer.document,
				encoder.encode("reader"),
				encoder.encode("second"),
			);
			await adapter.announceMembership(encoder.encode('{"mode":"write"}'));
			const history = (await adapter.readProjected()).operations;
			assert.deepEqual(
				history.map((operation) => operation.eventType),
				["joined", "application", "left", "joined"],
			);
			assert.ok(history[1]?.minimumReference !== undefined);
			assert.deepEqual(history[3]?.minimumReference, history[1]?.position);
			assert.deepEqual(
				history.map((operation) => operation.minimumSequenceNumber),
				[0n, 1n, 2n, 2n],
			);
			assert.deepEqual(
				(await adapter.readProjected(history[1]?.position)).operations,
				history.slice(2),
			);
		} finally {
			adapter.disconnect();
			await adapter.reconnect();
			await writer.close();
			service.close();
		}
	});

	it("neutral session driver cancels startup history when initialization is invalid", async () => {
		const service = await createMemoryService({ environment: "node" });
		const client = await service.open(undefined, {
			author: encoder.encode("author"),
			session: encoder.encode("initial-session"),
		});
		const document = client.document;
		await client.submit(
			encoder.encode("invalid-initialization"),
			undefined,
			encoder.encode(JSON.stringify({ seaFluid: "initialize", version: 2 })),
		);
		let cancelled = false;
		const adapter = new SeaSessionDriverClient(async (archive, options) => {
			const session = await service.open(archive, options);
			const read = session.read.bind(session);
			session.read = (...args) => {
				const stream = read(...args);
				const cancel = stream.cancel.bind(stream);
				stream.cancel = () => {
					cancelled = true;
					cancel();
				};
				return stream;
			};
			return session;
		}, "readOnly");
		try {
			await assert.rejects(
				adapter.openSession(
					document,
					encoder.encode("reader"),
					encoder.encode("reader-session"),
				),
				/invalid Fluid initialization event/,
			);
			assert.equal(cancelled, true, "failed startup must release its live history read");
		} finally {
			adapter.disconnect();
			await adapter.reconnect();
			await client.close();
			service.close();
		}
	});

	it("neutral session disposal drains reads and uploads while replacement defers later work", async () => {
		const service = await createMemoryService({ environment: "node" });
		let releaseRead = (): void => {};
		const blocked = new Promise<void>((resolve) => {
			releaseRead = resolve;
		});
		let enteredRead = (): void => {};
		const entered = new Promise<void>((resolve) => {
			enteredRead = resolve;
		});
		let releaseUpload = (): void => {};
		const blockedUpload = new Promise<void>((resolve) => {
			releaseUpload = resolve;
		});
		let enteredUpload = (): void => {};
		const uploading = new Promise<void>((resolve) => {
			enteredUpload = resolve;
		});
		let blockUploads = false;
		let opens = 0;
		let firstClosed = false;
		const adapter = new SeaSessionDriverClient(async (document, options) => {
			const session = await service.open(document, options);
			opens += 1;
			if (opens === 1) {
				const getBlob = session.getBlob.bind(session);
				const putBlob = session.putBlob.bind(session);
				const close = session.close.bind(session);
				session.putBlob = async (payload) => {
					if (blockUploads) {
						enteredUpload();
						await blockedUpload;
					}
					return putBlob(payload);
				};
				session.getBlob = async (id) => {
					enteredRead();
					await blocked;
					return getBlob(id);
				};
				session.close = () => {
					firstClosed = true;
					return close();
				};
			}
			return session;
		}, "clientSelected");
		const document = await adapter.create();
		const payload = encoder.encode("storage read across delta membership replacement");
		const blob = await adapter.uploadBlob(payload);
		const reading = adapter.fetchBlob(blob.digest);
		await entered;
		blockUploads = true;
		const writing = adapter.uploadBlob(payload);
		await uploading;
		adapter.disconnect();
		const replacement = adapter.openSession(
			document,
			encoder.encode("writer"),
			encoder.encode("delta-session"),
		);
		let laterCompleted = false;
		const later = adapter.fetchBlob(blob.digest).then((value) => {
			laterCompleted = true;
			return value;
		});
		const laterUpload = adapter.uploadBlob(payload);
		const results = Promise.allSettled([reading, writing, replacement, later, laterUpload]);
		try {
			await setImmediate();
			assert.equal(
				firstClosed,
				false,
				"disposal must not close a session with an admitted storage read",
			);
			assert.equal(laterCompleted, false, "new reads must wait for membership replacement");
			releaseRead();
			assert.deepEqual(await reading, payload);
			await setImmediate();
			assert.equal(
				firstClosed,
				false,
				"an admitted upload still pins the old session after reads finish",
			);
			assert.equal(opens, 1);
			releaseUpload();
			assert.deepEqual((await writing).digest, blob.digest);
			await replacement;
			assert.deepEqual(await later, payload);
			assert.deepEqual((await laterUpload).digest, blob.digest);
			assert.equal(firstClosed, true);
			assert.equal(opens, 2);
		} finally {
			releaseRead();
			releaseUpload();
			await results;
			adapter.disconnect();
			await adapter.reconnect();
			service.close();
		}
	});

	it("overlapping delta opens finish initialization before replacing the shared session", async () => {
		const service = await createMemoryService({ environment: "node" });
		const seed = await service.open(undefined, {
			author: encoder.encode("seed"),
			session: encoder.encode("seed"),
		});
		let releaseSignals = (): void => {};
		const blocked = new Promise<void>((resolve) => {
			releaseSignals = resolve;
		});
		let enteredSignals = (): void => {};
		const entered = new Promise<void>((resolve) => {
			enteredSignals = resolve;
		});
		let opens = 0;
		const adapter = new SeaSessionDriverClient(async (document, options) => {
			opens += 1;
			return service.open(document, options);
		}, "readOnly");
		const openSignals = adapter.openSignals.bind(adapter);
		let signalOpens = 0;
		adapter.openSignals = async (member) => {
			if (++signalOpens === 1) {
				enteredSignals();
				await blocked;
			}
			return openSignals(member);
		};
		const id = Buffer.from(seed.document).toString("hex");
		const documentService = new SeaDocumentService(
			{ type: "fluid", id, url: `fluid://localhost/minimal/${id}`, tokens: {}, endpoints: {} },
			async () => adapter,
			{},
		);
		const pending: Promise<SeaDeltaConnection>[] = [];
		try {
			const client = {
				details: { capabilities: { interactive: true } },
				permission: [],
				scopes: [],
				user: { id: "writer" },
				mode: "write" as const,
			};
			const first = documentService.connectToDeltaStream(client);
			pending.push(first);
			await entered;
			const second = documentService.connectToDeltaStream(client);
			pending.push(second);
			const results = Promise.allSettled(pending);
			await setImmediate();
			assert.equal(
				opens,
				1,
				"a queued delta must not replace a session still opening signals",
			);
			assert.equal(signalOpens, 1);
			releaseSignals();
			assert.deepEqual(
				(await results).map((result) => result.status),
				["fulfilled", "fulfilled"],
			);
			assert.equal(opens, 2);
			assert.equal(signalOpens, 2);
		} finally {
			releaseSignals();
			for (const result of await Promise.allSettled(pending)) {
				if (result.status === "fulfilled") result.value.dispose();
			}
			documentService.dispose();
			await adapter.reconnect();
			await seed.close();
			service.close();
		}
	});

	it("read-first document services retain independent memberships and shared writer identities", async () => {
		const service = await createMemoryService({ environment: "node" });
		const seed = await service.open(undefined, {
			author: encoder.encode("seed"),
			session: encoder.encode("seed"),
		});
		const payload = encoder.encode("shared archive content");
		const blob = await seed.putBlob(payload);
		const id = Buffer.from(seed.document).toString("hex");
		const adapters: SeaSessionDriverClient[] = [];
		const services = Array.from(
			{ length: 4 },
			() =>
				new SeaDocumentService(
					{
						type: "fluid",
						id,
						url: `fluid://localhost/minimal/${id}`,
						tokens: {},
						endpoints: {},
					},
					async () => {
						const adapter = new SeaSessionDriverClient(service.open, "readOnly");
						adapters.push(adapter);
						return adapter;
					},
					{},
				),
		);
		const connections: SeaDeltaConnection[] = [];
		try {
			for (const documentService of services) {
				connections.push(
					await documentService.connectToDeltaStream({
						details: { capabilities: { interactive: true } },
						permission: [],
						scopes: [],
						user: { id: "reader" },
						mode: connections.length < 2 ? "read" : "write",
					}),
				);
			}
			for (const adapter of adapters)
				assert.deepEqual(await adapter.fetchBlob(blob.bytes), payload);
			const expectedMembers = connections.slice(2).map((connection) => connection.clientId);
			const latest = connections.at(-1);
			assert.ok(latest);
			assert.deepEqual(
				latest.initialClients.map((member) => member.clientId).sort(),
				connections.map((connection) => connection.clientId).sort(),
			);
			assert.deepEqual(
				latest.initialMessages
					.filter((message) => message.type === MessageType.ClientJoin)
					.map((message) => (JSON.parse(message.data ?? "") as { clientId: string }).clientId),
				expectedMembers,
			);
			for (const documentService of services) {
				const history = await documentService.connectToDeltaStorage();
				const page = await history
					.fetchMessages(1, latest.checkpointSequenceNumber + 1)
					.read();
				assert.equal(page.done, false);
				if (!page.done) assert.deepEqual(page.value, latest.initialMessages);
			}
			const writer = connections[2];
			assert.ok(writer);
			const received: unknown[][] = connections.map(() => []);
			const completed = connections.map(
				(connection, index) =>
					new Promise<void>((resolve) => {
						connection.on("signal", (signal) => {
							assert.ok(!Array.isArray(signal));
							if (signal.clientId !== null) {
								const receivedSignals = received[index];
								assert.ok(receivedSignals);
								receivedSignals.push(signal);
								if (signal.content === "broadcast") resolve();
							}
						});
					}),
			);
			writer.submitSignal("broadcast");
			await Promise.all(completed);
			for (const messages of received)
				assert.deepEqual(messages, [{ clientId: writer.clientId, content: "broadcast" }]);
			const targeted = new Promise<void>((resolve) =>
				latest.on("signal", (signal) => {
					assert.ok(!Array.isArray(signal));
					if (signal.content === "target") {
						assert.equal(signal.targetClientId, latest.clientId);
						resolve();
					}
				}),
			);
			writer.submitSignal("target", latest.clientId);
			await targeted;
			assert.deepEqual(
				received.map((messages) => messages.length),
				[1, 1, 1, 2],
			);
			assert.equal(
				(await writer.synchronize()).length,
				0,
				"signals do not enter sequenced history",
			);
			const missed: unknown[] = [];
			writer.on("op", (_document, messages) =>
				missed.push(...messages.filter((message) => message.type === MessageType.Operation)),
			);
			writer.disconnect();
			latest.submit([
				{
					clientSequenceNumber: 1,
					referenceSequenceNumber: latest.checkpointSequenceNumber,
					type: MessageType.Operation,
					contents: "offline peer edit",
				},
			]);
			await latest.waitForIdle();
			const previousClientId = writer.clientId;
			await writer.reconnect();
			assert.notEqual(writer.clientId, previousClientId);
			assert.equal(missed.length, 1, "reconnect must deliver an edit missed while offline");
			assert.equal(
				(await writer.synchronize()).length,
				0,
				"catch-up must not duplicate delivery",
			);
			const reader = connections[0];
			assert.ok(reader);
			const left = new Promise<string>((resolve) => {
				latest.on("signal", (signal) => {
					assert.ok(!Array.isArray(signal));
					const content = JSON.parse(signal.content as string) as {
						type: string;
						content: string;
					};
					if (content.type === MessageType.ClientLeave) resolve(content.content);
				});
			});
			reader.disconnect();
			assert.equal(await left, reader.clientId);
			const joined = new Promise<string>((resolve) => {
				latest.on("signal", (signal) => {
					assert.ok(!Array.isArray(signal));
					const content = JSON.parse(signal.content as string) as {
						type: string;
						content: { clientId: string };
					};
					if (content.type === MessageType.ClientJoin) resolve(content.content.clientId);
				});
			});
			await reader.reconnect();
			assert.equal(await joined, reader.clientId);
		} finally {
			for (const connection of connections) connection.dispose();
			for (const documentService of services) documentService.dispose();
			await Promise.all(adapters.map(async (adapter) => adapter.reconnect()));
			await seed.close();
			service.close();
		}
	});

	interface FixtureSnapshot {
		readonly id: Uint8Array;
		readonly root: Uint8Array;
		readonly atEvent?: Uint8Array;
	}

	class SummaryFixtureClient implements SeaDriverClient {
		private readonly blobs = new Map<string, Uint8Array>();
		private readonly summaries = new Map<string, readonly SummaryEntry[]>();
		private readonly snapshots = new Map<string, FixtureSnapshot>();
		private latestSnapshotId: Uint8Array | undefined;

		public blobUploadCount = 0;
		public async create(): Promise<Uint8Array> {
			return encodeU64(1n);
		}

		public async openSession(
			_document: Uint8Array,
			_writer: Uint8Array,
			_session: Uint8Array,
			_resumeAfter?: Uint8Array,
		): Promise<void> {}

		public async submitEvent(): Promise<Uint8Array> {
			throw new Error("not implemented by summary fixture");
		}

		public async latestSnapshot(): Promise<FixtureSnapshot | undefined> {
			return this.latestSnapshotId === undefined
				? undefined
				: this.snapshot(this.latestSnapshotId);
		}

		public async snapshot(id: Uint8Array): Promise<FixtureSnapshot | undefined> {
			return this.snapshots.get(bytesKey(id));
		}

		public async publishSnapshotRoot(
			expectedParent: Uint8Array | undefined,
			atEvent: Uint8Array | undefined,
			root: Uint8Array,
		): Promise<Uint8Array> {
			if (!sameOptionalBytes(expectedParent, this.latestSnapshotId)) {
				throw new Error("snapshot parent conflict");
			}
			if (!this.summaries.has(bytesKey(root))) {
				throw new Error("snapshot root does not exist");
			}
			const id = atEvent ?? encodeU64(1n);
			if (this.snapshots.has(bytesKey(id))) {
				throw new Error("snapshot position conflict");
			}
			const snapshot = {
				id,
				root: root.slice(),
				...(atEvent === undefined ? {} : { atEvent: atEvent.slice() }),
			};
			this.snapshots.set(bytesKey(id), snapshot);
			this.latestSnapshotId = id;
			return id;
		}

		public positionForSequence(sequenceNumber: number): Uint8Array | undefined {
			return sequenceNumber > 0 ? encodeU64(BigInt(sequenceNumber)) : undefined;
		}

		public async readProjected(): Promise<ProjectedReadPage> {
			throw new Error("not implemented by summary fixture");
		}

		public subscribeProjected(): ProjectedOperationSubscription {
			throw new Error("not implemented by summary fixture");
		}

		public async resolveSubmission(): Promise<SubmissionResolution> {
			throw new Error("not implemented by summary fixture");
		}

		public async uploadBlob(payload: Uint8Array): Promise<BlobUpload> {
			this.blobUploadCount++;
			const digest = digestBytes(payload);
			this.blobs.set(bytesKey(digest), payload.slice());
			return {
				digest,
				sizeBytes: BigInt(payload.length),
				deduplicated: false,
			};
		}

		public async fetchBlob(digest: Uint8Array): Promise<Uint8Array> {
			const payload = this.blobs.get(bytesKey(digest));
			if (payload === undefined) {
				throw new Error("blob does not exist");
			}
			return payload.slice();
		}

		public async publishSummary(
			entries: readonly SummaryEntry[],
		): Promise<SummaryPublication> {
			for (const entry of entries) {
				if (!this.blobs.has(bytesKey(entry.blob))) {
					throw new Error("summary references a missing blob");
				}
			}
			const hash = createHash("sha256");
			for (const entry of entries) {
				hash.update(entry.path);
				hash.update("\0");
				hash.update(entry.blob);
			}
			const digest = new Uint8Array(hash.digest());
			this.summaries.set(
				bytesKey(digest),
				entries.map((entry) => ({ path: entry.path.slice(), blob: entry.blob.slice() })),
			);
			return {
				digest,
				entryCount: entries.length,
				persistedBytes: 0n,
				deduplicated: false,
			};
		}

		public async fetchSummary(digest: Uint8Array): Promise<readonly SummaryEntry[]> {
			const entries = this.summaries.get(bytesKey(digest));
			if (entries === undefined) {
				throw new Error("summary does not exist");
			}
			return entries.map((entry) => ({ path: entry.path.slice(), blob: entry.blob.slice() }));
		}

		public disconnect(): void {}

		public async reconnect(): Promise<void> {}
	}

	it("driver creation disposes its client when initial summary upload fails", async () => {
		const client = new SummaryFixtureClient();
		let disconnected = false;
		client.disconnect = () => {
			disconnected = true;
		};
		client.uploadBlob = async () => {
			throw new Error("injected summary upload failure");
		};
		const driver = new SeaDriver(async () => client);
		await assert.rejects(
			driver.createContainer(tree({ leaf: blob("initial") }), {
				type: "fluid",
				id: "new",
				url: "fluid://sea/documents/new",
				tokens: {},
				endpoints: {},
			}),
			/injected summary upload failure/u,
		);
		assert.equal(disconnected, true);
	});

	it("summary blob uploads overlap with bounded refill and publish only after completion", async () => {
		const client = new SummaryFixtureClient();
		const storage = createStorage(client);
		const upload = client.uploadBlob.bind(client);
		const pending: (() => void)[] = [];
		let started = 0;
		let active = 0;
		let peak = 0;
		client.uploadBlob = async (payload) => {
			started++;
			active++;
			peak = Math.max(peak, active);
			await new Promise<void>((resolve) => pending.push(resolve));
			const result = await upload(payload);
			active--;
			return result;
		};
		const result = storage.uploadInitialSummary(
			tree(
				Object.fromEntries(
					Array.from({ length: 24 }, (_, index) => [
						`blob-${index}`,
						blob(`content-${index}`),
					]),
				),
			),
		);
		await setImmediate();
		assert.equal(started, 8, "uploads must overlap before any receipt returns");
		assert.equal(await client.latestSnapshot(), undefined);
		const completeLast = pending.pop();
		assert.ok(completeLast);
		completeLast();
		await setImmediate();
		assert.equal(started, 9, "one completed upload must refill without waiting for its peers");
		while (pending.length > 0) {
			const complete = pending.shift();
			assert.ok(complete);
			complete();
			await setImmediate();
			assert.ok(active <= 8);
		}
		await result;
		assert.equal(started, 24);
		assert.equal(peak, 8);
		assert.ok(await client.latestSnapshot());
		const snapshot = await storage.getSnapshotTree();
		assert.ok(snapshot);
		assert.equal(Object.keys(snapshot.blobs).length, 24);
	});

	it("summary upload failure drains admitted blobs without scheduling or publishing a suffix", async () => {
		const client = new SummaryFixtureClient();
		const storage = createStorage(client);
		const upload = client.uploadBlob.bind(client);
		const pending: { complete: () => void; fail: (error: Error) => void }[] = [];
		client.uploadBlob = async (payload) => {
			await new Promise<void>((complete, fail) => pending.push({ complete, fail }));
			return upload(payload);
		};
		let settled = false;
		const failure = new Error("blob upload failed");
		const result = storage.uploadInitialSummary(
			tree(
				Object.fromEntries(
					Array.from({ length: 24 }, (_, index) => [
						`branch-${index}`,
						tree({ leaf: blob(`content-${index}`) }),
					]),
				),
			),
		);
		const rejected = assert.rejects(result, (error) => {
			settled = true;
			assert.equal(error, failure);
			return true;
		});
		await setImmediate();
		assert.equal(pending.length, 8);
		const [first, ...others] = pending;
		assert.ok(first);
		first.fail(failure);
		await setImmediate();
		assert.equal(
			settled,
			false,
			"failure must wait for admitted uploads before callers dispose resources",
		);
		assert.equal(pending.length, 8, "no suffix upload may start after observed failure");
		for (const pendingUpload of others) pendingUpload.complete();
		await rejected;
		assert.equal(pending.length, 8);
		assert.equal(client.blobUploadCount, 7);
		assert.equal(await client.latestSnapshot(), undefined);
	});

	it("incremental summaries reuse tree and blob handles and include attachments", async () => {
		const client = new SummaryFixtureClient();
		const storage = createStorage(client);
		const retainedAttachment = await storage.createBlob(
			encoder.encode("retained attachment").buffer,
		);
		const firstHandle = await storage.uploadSummaryWithContext(
			tree({
				stable: tree({
					leaf: blob("stable leaf"),
					nested: tree({ child: blob("stable child") }),
				}),
				single: blob("single blob"),
				retainedAttachment: {
					type: SummaryType.Attachment,
					id: retainedAttachment.id,
				},
			}),
			summaryContext(),
		);
		const directAttachment = await storage.createBlob(encoder.encode("attachment").buffer);
		const secondHandle = await storage.uploadSummaryWithContext(
			tree({
				copiedTree: {
					type: SummaryType.Handle,
					handleType: SummaryType.Tree,
					handle: "/stable",
				},
				copiedBlob: {
					type: SummaryType.Handle,
					handleType: SummaryType.Blob,
					handle: "/single",
				},
				copiedAttachment: {
					type: SummaryType.Handle,
					handleType: SummaryType.Attachment,
					handle: "/retainedAttachment",
				},
				directAttachment: {
					type: SummaryType.Attachment,
					id: directAttachment.id,
				},
				changed: blob("changed blob"),
			}),
			summaryContext(firstHandle),
		);
		assert.equal(client.blobUploadCount, 6, "handles must not upload referenced blobs again");
		const [firstVersion] = await storage.getVersions(firstHandle, 1);
		assert(firstVersion !== undefined);
		const firstSnapshot = await storage.getSnapshotTree(firstVersion);
		const secondSnapshot = await storage.getSnapshotTree();
		assert(firstSnapshot !== null);
		assert(secondSnapshot !== null);
		const copiedTree = secondSnapshot.trees.copiedTree;
		const stableTree = firstSnapshot.trees.stable;
		assert(copiedTree !== undefined);
		assert(stableTree !== undefined);
		const copiedNestedTree = copiedTree.trees.nested;
		const stableNestedTree = stableTree.trees.nested;
		assert(copiedNestedTree !== undefined);
		assert(stableNestedTree !== undefined);
		const changedBlob = secondSnapshot.blobs.changed;
		assert(changedBlob !== undefined);
		assert.equal(secondSnapshot.id, secondHandle);
		assert.equal(copiedTree.blobs.leaf, stableTree.blobs.leaf);
		assert.equal(copiedNestedTree.blobs.child, stableNestedTree.blobs.child);
		assert.equal(secondSnapshot.blobs.copiedBlob, firstSnapshot.blobs.single);
		assert.equal(
			secondSnapshot.blobs.copiedAttachment,
			firstSnapshot.blobs.retainedAttachment,
		);
		assert.equal(secondSnapshot.blobs.directAttachment, directAttachment.id);
		assert.equal(
			decoder.decode(new Uint8Array(await storage.readBlob(changedBlob))),
			"changed blob",
		);
	});

	it("summary handles require a parent and attachments must identify an uploaded blob", async () => {
		const storage = createStorage(new SummaryFixtureClient());
		await assert.rejects(
			storage.uploadSummaryWithContext(
				tree({
					reused: {
						type: SummaryType.Handle,
						handleType: SummaryType.Blob,
						handle: "/missing",
					},
				}),
				summaryContext(),
			),
			/acknowledged parent snapshot/u,
		);
		const parent = await storage.uploadSummaryWithContext(
			tree({ present: blob("present") }),
			summaryContext(),
		);
		await assert.rejects(
			storage.uploadSummaryWithContext(
				tree({
					reused: {
						type: SummaryType.Handle,
						handleType: SummaryType.Blob,
						handle: "/missing",
					},
				}),
				summaryContext(parent),
			),
			/does not resolve/u,
		);
		await assert.rejects(
			storage.uploadSummaryWithContext(
				tree({
					missing: { type: SummaryType.Attachment, id: "00".repeat(32) },
				}),
				summaryContext(parent),
			),
			/missing blob/u,
		);
	});

	it("incremental summary publication rejects a stale acknowledged parent", async () => {
		const storage = createStorage(new SummaryFixtureClient());
		const parent = await storage.uploadSummaryWithContext(
			tree({ stable: blob("parent") }),
			summaryContext(),
		);
		const winner = await storage.uploadSummaryWithContext(
			tree({ stable: blob("winner") }),
			summaryContext(parent),
		);
		await assert.rejects(
			storage.uploadSummaryWithContext(
				tree({
					stable: {
						type: SummaryType.Handle,
						handleType: SummaryType.Blob,
						handle: "/stable",
					},
				}),
				summaryContext(parent),
			),
			/parent conflict/u,
		);
		assert.equal((await storage.getVersions(null, 1))[0]?.id, winner);
	});

	function createStorage(client: SummaryFixtureClient): SeaDocumentStorage {
		return new SeaDocumentStorage(client);
	}

	function tree(children: ISummaryTree["tree"]): ISummaryTree {
		return { type: SummaryType.Tree, tree: children };
	}

	function blob(content: string) {
		return { type: SummaryType.Blob, content } as const;
	}

	function summaryContext(ackHandle?: string): ISummaryContext {
		return {
			proposalHandle: undefined,
			ackHandle,
			referenceSequenceNumber:
				ackHandle === undefined ? 3 : Number(BigInt(`0x${ackHandle}`)) + 3,
		};
	}

	function digestBytes(payload: Uint8Array): Uint8Array {
		return new Uint8Array(createHash("sha256").update(payload).digest());
	}

	function bytesKey(bytes: Uint8Array): string {
		return Buffer.from(bytes).toString("hex");
	}

	function sameOptionalBytes(
		left: Uint8Array | undefined,
		right: Uint8Array | undefined,
	): boolean {
		return left === undefined || right === undefined
			? left === right
			: Buffer.from(left).equals(Buffer.from(right));
	}

	function encodeU64(value: bigint): Uint8Array {
		const bytes = new Uint8Array(8);
		new DataView(bytes.buffer).setBigUint64(0, value);
		return bytes;
	}
});
