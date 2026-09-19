/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { openWebTransport } from "@fluidframework/sea-typescript/internal/webtransport";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const parameters = new URLSearchParams(location.search);
const transportUrl = parameters.get("transport");
const certificateHex = parameters.get("hash");
const snapshotParticipation =
	parameters.get("snapshotPolicy") === "sea" ? "seaSelected" : "clientSelected";

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function equalBytes(actual, expected) {
	return (
		actual.length === expected.length &&
		actual.every((value, index) => value === expected[index])
	);
}

async function nextEvent(stream) {
	for (;;) {
		const item = await stream.next();
		assert(item !== undefined, "event stream ended before an event");
		if (item.kind === "event") return item;
	}
}

async function nextAwaiting(stream) {
	for (;;) {
		const item = await stream.next();
		assert(item !== undefined, "event stream ended before catching up");
		if (item.kind === "progress" && item.status === "AwaitingNewItems") {
			return item;
		}
	}
}

async function nextSnapshot(stream) {
	for (;;) {
		const item = await stream.next();
		assert(item !== undefined, "event stream ended before a recovery snapshot");
		if (item.kind === "snapshot") return item;
	}
}

async function run() {
	assert(transportUrl, "missing transport URL");
	assert(certificateHex?.length === 64, "missing SHA-256 certificate hash");
	const hash = Uint8Array.from(certificateHex.match(/../gu), (value) =>
		Number.parseInt(value, 16),
	);
	let transportSessionCount = 0;
	const open = async (document, author, session, reference) => {
		const opened = await openWebTransport(
			{ url: transportUrl, certificateHash: hash },
			document,
			{
				author: encoder.encode(author),
				session: encoder.encode(session),
				...(reference === undefined ? {} : { reference }),
			},
		);
		transportSessionCount++;
		return opened;
	};
	let missingArchiveError;
	try {
		const unexpected = await open(new Uint8Array(8), "missing-author", "missing-session");
		await unexpected.close();
	} catch (error) {
		missingArchiveError = error;
	}
	assert(
		missingArchiveError?.kind === "Rejected",
		"service rejection omitted its structured error kind",
	);
	let first = await open(undefined, "browser-author", "browser-session");
	const archive = first.document;
	const previousCoordination = await first.coordinateSnapshots(snapshotParticipation);
	await previousCoordination.next();
	previousCoordination.cancel();
	const snapshotCoordination = await first.coordinateSnapshots(snapshotParticipation);
	const publisher = await snapshotCoordination.next();
	previousCoordination.cancel();
	const load = await first.load();
	const initialCaughtUp = await nextAwaiting(load);
	const firstReceipt = await first.submit(
		encoder.encode("browser-operation-1"),
		undefined,
		encoder.encode("first-payload"),
	);
	const firstStreamedReceipt = await first.submit(
		encoder.encode("browser-operation-stream-1"),
		firstReceipt,
		encoder.encode("first-streamed-payload"),
	);
	const secondStreamedReceipt = await first.submit(
		encoder.encode("browser-operation-stream-2"),
		firstStreamedReceipt,
		encoder.encode("second-streamed-payload"),
	);
	assert(
		firstReceipt < firstStreamedReceipt && firstStreamedReceipt < secondStreamedReceipt,
		"author-stream event positions did not increase",
	);
	const resolved = await first.resolveSubmission(encoder.encode("browser-operation-1"));
	assert(resolved === firstReceipt, "submission resolution mismatch");
	const firstLoaded = await nextEvent(load);
	assert(firstLoaded.position === firstReceipt, "load omitted or reordered the first event");
	assert(
		(await nextEvent(load)).position === firstStreamedReceipt,
		"load omitted the first streamed event",
	);
	assert(
		(await nextEvent(load)).position === secondStreamedReceipt,
		"load omitted the second streamed event",
	);
	const second = await open(archive, "second-author", "second-session", secondStreamedReceipt);
	const secondSnapshotCoordination = await second.coordinateSnapshots(snapshotParticipation);
	const secondSnapshotState = await secondSnapshotCoordination.next();
	if (snapshotParticipation === "seaSelected") {
		assert(publisher.fence !== undefined, "first publisher was not nominated");
		assert(secondSnapshotState.fence === undefined, "two Sea-selected clients were nominated");
	}
	const secondLoad = await second.load(secondStreamedReceipt);
	const secondCaughtUp = await nextAwaiting(secondLoad);
	const thirdStreamedReceipt = await first.submit(
		encoder.encode("browser-operation-stream-3"),
		secondStreamedReceipt,
		encoder.encode("third-streamed-payload"),
	);
	const secondLive = await nextEvent(secondLoad);
	assert(
		secondLive.position === thirdStreamedReceipt,
		"second load omitted the live first-client event",
	);
	assert(
		decoder.decode(secondLive.payload) === "third-streamed-payload",
		"second load returned the wrong live payload",
	);
	const firstSelfLive = await nextEvent(load);
	assert(
		firstSelfLive.position === thirdStreamedReceipt,
		"first load omitted its own third event",
	);
	assert(
		decoder.decode(firstSelfLive.payload) === "third-streamed-payload",
		"first load returned the wrong self-event payload",
	);
	const fourthStreamedReceipt = await first.submit(
		encoder.encode("browser-operation-stream-4"),
		thirdStreamedReceipt,
		encoder.encode("fourth-streamed-payload"),
	);
	const secondConsecutiveLive = await nextEvent(secondLoad);
	assert(
		secondConsecutiveLive.position === fourthStreamedReceipt,
		"second load omitted the consecutive first-client event",
	);
	assert(
		decoder.decode(secondConsecutiveLive.payload) === "fourth-streamed-payload",
		"second load returned the wrong consecutive live payload",
	);
	const firstConsecutiveSelfLive = await nextEvent(load);
	assert(
		firstConsecutiveSelfLive.position === fourthStreamedReceipt,
		"first load omitted its consecutive self-event",
	);
	const secondReceipt = await second.submit(
		encoder.encode("browser-operation-2"),
		fourthStreamedReceipt,
		encoder.encode("second-payload"),
	);
	assert(secondReceipt > firstReceipt, "event positions did not increase");
	const live = await nextEvent(load);
	assert(live.position === secondReceipt, "load omitted the live second-client event");
	assert(decoder.decode(live.payload) === "second-payload", "live event payload mismatch");
	await load.cancel();

	const blobPayload = encoder.encode("browser-content-addressed-payload");
	const blob = await first.putBlob(blobPayload);
	assert(equalBytes(await first.getBlob(blob), blobPayload), "blob round trip failed");
	const directory = await first.putDirectory([{ name: "leaf", child: blob }]);
	const entries = await first.getDirectory(directory);
	assert(entries.length === 1, "directory entry count mismatch");
	assert(entries[0].name === "leaf", "directory entry name mismatch");
	assert(equalBytes(entries[0].child.bytes, blob.bytes), "directory child mismatch");

	const notification = snapshotCoordination.next();
	const snapshot = await first.publishSnapshot(
		undefined,
		publisher.fence,
		secondReceipt,
		directory,
	);
	let observed = await notification;
	while (observed.latest !== snapshot.atEvent) {
		observed = await snapshotCoordination.next();
	}
	const latest = await first.getSnapshot();
	assert(latest !== undefined, "latest snapshot was missing");
	assert(latest.atEvent === snapshot.atEvent, "latest snapshot identity mismatch");
	const fetched = await first.getSnapshot(snapshot.atEvent);
	assert(fetched !== undefined, "snapshot lookup failed");
	assert(equalBytes(fetched.root.bytes, directory.bytes), "snapshot root mismatch");

	const cancelledNotification = snapshotCoordination.next().then(
		() => {
			throw new Error("cancelled snapshot notification unexpectedly succeeded");
		},
		() => undefined,
	);
	snapshotCoordination.cancel();
	await cancelledNotification;
	await first.close();
	first = await open(archive, "browser-author", "browser-session-resumed", secondReceipt);
	const resumedSnapshots = await first.coordinateSnapshots(snapshotParticipation);
	await resumedSnapshots.next();
	const resumedLoad = await first.load(secondReceipt);
	await nextAwaiting(resumedLoad);
	const resumedReceipt = await first.submit(
		encoder.encode("browser-operation-resumed"),
		secondReceipt,
		encoder.encode("resumed-payload"),
	);
	const resumedLive = await nextEvent(resumedLoad);
	assert(
		resumedLive.position === resumedReceipt,
		"replacement-session load omitted its live event",
	);
	assert(
		decoder.decode(resumedLive.payload) === "resumed-payload",
		"replacement-session load returned the wrong payload",
	);
	await resumedLoad.cancel();

	resumedSnapshots.cancel();
	await first.close();
	let disconnected = false;
	try {
		await first.getSnapshot();
	} catch (error) {
		disconnected = error.kind === "Closed";
	}
	assert(disconnected, "request unexpectedly retried after disconnect");
	first = await open(archive, "browser-author", "browser-session-reconnected", secondReceipt);
	const recoveredSnapshots = await first.coordinateSnapshots(snapshotParticipation);
	await recoveredSnapshots.next();
	const recovered = await first.load(secondReceipt);
	assert(
		(await nextSnapshot(recovered)).atEvent === secondReceipt,
		"recovered snapshot mismatch",
	);
	const recoveredEvent = await nextEvent(recovered);
	assert(recoveredEvent.position === resumedReceipt, "snapshot suffix lost the resumed event");
	assert(
		decoder.decode(recoveredEvent.payload) === "resumed-payload",
		"snapshot suffix payload mismatch",
	);
	await nextAwaiting(recovered);
	assert((await first.getSnapshot()) !== undefined, "reconnected snapshot lookup failed");
	recovered.cancel();
	recoveredSnapshots.cancel();
	secondLoad.cancel();
	secondSnapshotCoordination.cancel();

	window.__shutdownProbe = {
		async existingRequest() {
			try {
				await first.getSnapshot();
				return "succeeded";
			} catch {
				return "rejected";
			}
		},
		async thirdSession() {
			try {
				const client = await open(archive, "third-author", "third-session");
				await client.close();
				return "unexpected-success";
			} catch {
				return "rejected";
			}
		},
	};

	return {
		status: "passed",
		browser: navigator.userAgent,
		transportSessionCount,
		firstPosition: firstReceipt.toString(),
		firstStreamedPosition: firstStreamedReceipt.toString(),
		secondStreamedPosition: secondStreamedReceipt.toString(),
		thirdStreamedPosition: thirdStreamedReceipt.toString(),
		fourthStreamedPosition: fourthStreamedReceipt.toString(),
		secondPosition: secondReceipt.toString(),
		caughtUp: initialCaughtUp.latestKnown?.toString() ?? "none",
		secondCaughtUp: secondCaughtUp.latestKnown?.toString() ?? "none",
		blobBytes: blobPayload.length,
		directoryEntries: entries.length,
		serviceErrorKind: missingArchiveError.kind,
		snapshotParticipation,
		snapshotPosition: snapshot.atEvent.toString(),
		documentIdBytes: archive.length,
	};
}

window.__webtransportResult = run()
	.then((result) => {
		document.querySelector("#result").textContent = JSON.stringify(result);
		return result;
	})
	.catch((error) => {
		const result = { status: "failed", error: String(error?.stack ?? error) };
		document.querySelector("#result").textContent = JSON.stringify(result);
		return result;
	});
