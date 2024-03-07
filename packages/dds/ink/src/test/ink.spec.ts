/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	MockFluidDataStoreRuntime,
	MockContainerRuntimeFactory,
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
	MockSharedObjectServices,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { Ink } from "../ink.js";
import { InkFactory } from "../inkFactory.js";
import { IPen } from "../interfaces.js";

describe("Ink", () => {
	let ink: Ink;
	let dataStoreRuntime: MockFluidDataStoreRuntime;
	let pen: IPen;

	beforeEach("createInk", async () => {
		dataStoreRuntime = new MockFluidDataStoreRuntime();
		ink = new Ink(dataStoreRuntime, "ink", InkFactory.Attributes);
	});

	describe("Ink in local state", () => {
		beforeEach("setupInkInLocalState", () => {
			dataStoreRuntime.local = true;
			pen = {
				color: { r: 0, g: 161 / 255, b: 241 / 255, a: 0 },
				thickness: 7,
			};
		});

		it("Can create Ink", () => {
			assert.ok(ink, "Could not create ink");
		});

		it("Can create / get a stroke", () => {
			const strokeId = ink.createStroke(pen).id;

			const stroke = ink.getStroke(strokeId);
			assert.ok(stroke, "Could not retrieve the stroke");
			assert.equal(stroke.id, strokeId, "The stroke's id is incorrect");
			assert.deepEqual(stroke.pen, pen, "The stroke's pen is incorrect");
		});

		it("Can create / get multiple strokes", () => {
			const strokeId1 = ink.createStroke(pen).id;
			const strokeId2 = ink.createStroke(pen).id;

			const strokes = ink.getStrokes();
			assert.equal(strokes.length, 2, "There should be two strokes");
			assert.deepEqual(strokes[0].id, strokeId1, "The first stroke's id is incorrect");
			assert.deepEqual(strokes[0].pen, pen, "The first stroke's pen is incorrect");
			assert.deepEqual(strokes[1].id, strokeId2, "The second stroke's id is incorrect");
			assert.deepEqual(strokes[1].pen, pen, "The second stroke's pen is incorrect");
		});

		it("Can append a point to a stroke", () => {
			const strokeId = ink.createStroke(pen).id;
			// Append a point to the stroke.
			const inkPoint = {
				x: 10,
				y: 10,
				time: Date.now(),
				pressure: 10,
			};
			ink.appendPointToStroke(inkPoint, strokeId);

			// Get the stroked and verify it has the correct point.
			const stroke = ink.getStroke(strokeId);
			assert.equal(stroke.points.length, 1, "There should be only one point in the stroke");
			assert.deepEqual(stroke.points[0], inkPoint, "The ink point is incorrect");
		});

		it("Can clear a stroke", () => {
			const strokeId = ink.createStroke(pen).id;
			assert.ok(ink.getStroke(strokeId), "Could not retrieve the stroke");

			// Clear the stroke.
			ink.clear();
			assert.equal(ink.getStroke(strokeId), undefined, "The stroke should have been cleared");
		});

		it("can load an Ink from snapshot", async () => {
			const strokeId = ink.createStroke(pen).id;
			// Append a point to the stroke.
			const inkPoint = {
				x: 10,
				y: 10,
				time: Date.now(),
				pressure: 10,
			};
			ink.appendPointToStroke(inkPoint, strokeId);

			// Load a new Ink from the snapshot of the first one.
			const services = MockSharedObjectServices.createFromSummary(
				ink.getAttachSummary().summary,
			);
			const ink2 = new Ink(dataStoreRuntime, "ink2", InkFactory.Attributes);
			await ink2.load(services);

			// Verify that the new Ink has the stroke and the point.
			const stroke = ink2.getStroke(strokeId);
			assert.equal(stroke.points.length, 1, "There should be only one point in the stroke");
			assert.deepEqual(stroke.points[0], inkPoint, "The ink point is incorrect");
		});
	});

	describe("Ink op processing in local state", () => {
		it("should correctly process operations sent in local state", async () => {
			// Set the data store runtime to local.
			dataStoreRuntime.local = true;

			// Create a stroke in local state.
			const strokeId = ink.createStroke(pen).id;

			// Load a new Ink in connected state from the snapshot of the first one.
			const containerRuntimeFactory = new MockContainerRuntimeFactory();
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
			const services2 = MockSharedObjectServices.createFromSummary(
				ink.getAttachSummary().summary,
			);
			services2.deltaConnection = dataStoreRuntime2.createDeltaConnection();

			const ink2 = new Ink(dataStoreRuntime2, "ink2", InkFactory.Attributes);
			await ink2.load(services2);

			// Now connect the first Ink
			dataStoreRuntime.setAttachState(AttachState.Attached);
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
			const services1 = {
				deltaConnection: dataStoreRuntime.createDeltaConnection(),
				objectStorage: new MockStorage(undefined),
			};
			ink.connect(services1);

			// Verify that both the inks have the stroke.
			assert.ok(ink.getStroke(strokeId), "The first ink does not have the stroke");
			assert.ok(ink2.getStroke(strokeId), "The second ink does not have the stroke");

			// Add a point to the stroke in the second ink.
			const inkPoint = {
				x: 10,
				y: 10,
				time: Date.now(),
				pressure: 10,
			};
			ink2.appendPointToStroke(inkPoint, strokeId);

			// Process the message.
			containerRuntimeFactory.processAllMessages();

			// Verify that both the inks have the added point.
			const points1 = ink.getStroke(strokeId).points;
			assert.equal(points1.length, 1, "There should be only one point in the stroke");
			assert.deepEqual(points1[0], inkPoint, "The ink point is incorrect");

			const points2 = ink2.getStroke(strokeId).points;
			assert.equal(
				points2.length,
				1,
				"There should be only one point in the stroke in remote client",
			);
			assert.deepEqual(points2[0], inkPoint, "The ink point is incorrect in remote client");
		});
	});

	describe("Ink in connected state with a remote Ink", () => {
		let ink2: Ink;
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach("createConnectedInks", () => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();

			// Connect the first Ink.
			dataStoreRuntime.setAttachState(AttachState.Attached);
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
			const services1 = {
				deltaConnection: dataStoreRuntime.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			ink.connect(services1);

			// Create and connect a second Ink.
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
			const services2 = {
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};

			ink2 = new Ink(dataStoreRuntime2, "ink2", InkFactory.Attributes);
			ink2.connect(services2);
		});

		it("Can create / get a stroke", () => {
			// Create a stroke in the first ink.
			const strokeId = ink.createStroke(pen).id;

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that the first ink has the correct stroke.
			const stroke1 = ink.getStroke(strokeId);
			assert.ok(stroke1, "Could not retrieve the stroke");
			assert.equal(stroke1.id, strokeId, "The stroke's id is incorrect");
			assert.deepEqual(stroke1.pen, pen, "The stroke's pen is incorrect");

			// Verify that the remote ink has the correct stroke.
			const stroke2 = ink2.getStroke(strokeId);
			assert.ok(stroke2, "Could not retrieve the stroke in remote client");
			assert.equal(stroke2.id, strokeId, "The stroke's id is incorrect in remote client");
			assert.deepEqual(stroke2.pen, pen, "The stroke's pen is incorrect in remote client");
		});

		it("Can create / get multiple strokes", () => {
			// Create multiple stroked in the first ink.
			const stroke1Id = ink.createStroke(pen).id;
			const stroke2Id = ink.createStroke(pen).id;

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that the first ink has the correct strokes.
			const strokes1 = ink.getStrokes();
			assert.equal(strokes1.length, 2, "There should be two strokes");
			assert.deepEqual(strokes1[0].id, stroke1Id, "The first stroke's id is incorrect");
			assert.deepEqual(strokes1[0].pen, pen, "The first stroke's pen is incorrect");
			assert.deepEqual(strokes1[1].id, stroke2Id, "The second stroke's id is incorrect");
			assert.deepEqual(strokes1[1].pen, pen, "The second stroke's pen is incorrect");

			// Verify that the remote ink has the correct strokes.
			const strokes2 = ink2.getStrokes();
			assert.equal(strokes2.length, 2, "There should be two strokes in remote client");
			assert.deepEqual(
				strokes2[0].id,
				stroke1Id,
				"The first stroke's id is incorrect in remote client",
			);
			assert.deepEqual(
				strokes2[0].pen,
				pen,
				"The first stroke's pen is incorrect in remote client",
			);
			assert.deepEqual(
				strokes2[1].id,
				stroke2Id,
				"The second stroke's id is incorrect in remote client",
			);
			assert.deepEqual(
				strokes2[1].pen,
				pen,
				"The second stroke's pen is incorrect in remote client",
			);
		});

		it("Can append multiple points to a stroke", () => {
			// Create a stroke and append couple of points in the first ink.
			const strokeId = ink.createStroke(pen).id;
			const inkPoint1 = {
				x: 10,
				y: 10,
				time: Date.now(),
				pressure: 10,
			};
			const inkPoint2 = {
				x: 20,
				y: 20,
				time: Date.now(),
				pressure: 20,
			};
			ink.appendPointToStroke(inkPoint1, strokeId);
			ink.appendPointToStroke(inkPoint2, strokeId);

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that the first ink has the correct stroke with both the points.
			const stroke1 = ink.getStroke(strokeId);
			assert.equal(stroke1.points.length, 2, "There should be two points in the stroke");
			assert.deepEqual(stroke1.points[0], inkPoint1, "The first ink point is incorrect");
			assert.deepEqual(stroke1.points[1], inkPoint2, "The second ink point is incorrect");

			// Verify that the remote ink has the correct stroke with both the points.
			const stroke2 = ink2.getStroke(strokeId);
			assert.equal(
				stroke2.points.length,
				2,
				"There should be two points in the stroke in remote client",
			);
			assert.deepEqual(
				stroke2.points[0],
				inkPoint1,
				"The first ink point is incorrect in remote client",
			);
			assert.deepEqual(
				stroke2.points[0],
				inkPoint1,
				"The second ink point is incorrect in remote client",
			);
		});

		it("Can clear a stroke", () => {
			// Create a stroke in the first ink.
			const strokeId = ink.createStroke(pen).id;

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that both the inks have the stroke.
			assert.ok(ink.getStroke(strokeId), "Could not retrieve the stroke");
			assert.ok(ink2.getStroke(strokeId), "Could not retrieve the stroke in remote client");

			// Clear the stroke.
			ink.clear();

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that the stroke is cleared from both the inks.
			assert.equal(ink.getStroke(strokeId), undefined, "The stroke should have been cleared");
			assert.equal(
				ink2.getStroke(strokeId),
				undefined,
				"The stroke should have been cleared in remote client",
			);
		});
	});

	describe("Ink reconnection flow", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
		let containerRuntime1: MockContainerRuntimeForReconnection;
		let containerRuntime2: MockContainerRuntimeForReconnection;
		let ink2: Ink;

		beforeEach("createConnectedInks", () => {
			containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

			// Connect the first Ink.
			dataStoreRuntime.setAttachState(AttachState.Attached);
			containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
			const services1 = {
				deltaConnection: dataStoreRuntime.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			ink.connect(services1);

			// Create and connect a second Ink.
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
			const services2 = {
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};

			ink2 = new Ink(dataStoreRuntime2, "ink2", InkFactory.Attributes);
			ink2.connect(services2);
		});

		it("can resend unacked ops on reconnection", async () => {
			// Create a stroke in the first ink.
			const strokeId = ink.createStroke(pen).id;

			// Disconnect and reconnect the first client.
			containerRuntime1.connected = false;
			containerRuntime1.connected = true;

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that the stroke is present in both the client.
			assert.ok(ink.getStroke(strokeId), "The local client does not have the stroke");
			assert.ok(ink2.getStroke(strokeId), "The remote client does not have the stroke");

			// Add a point to the stroke in the second ink.
			const inkPoint = {
				x: 10,
				y: 10,
				time: Date.now(),
				pressure: 10,
			};
			ink2.appendPointToStroke(inkPoint, strokeId);

			// Disconnect and reconnect the second client.
			containerRuntime2.connected = false;
			containerRuntime2.connected = true;

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that both the inks have the added point.
			const points1 = ink.getStroke(strokeId).points;
			assert.equal(
				points1.length,
				1,
				"There should be only one point in the stroke in first client",
			);
			assert.deepEqual(points1[0], inkPoint, "The ink point is incorrect in first client");

			const points2 = ink2.getStroke(strokeId).points;
			assert.equal(
				points2.length,
				1,
				"There should be only one point in the stroke in second client",
			);
			assert.deepEqual(points2[0], inkPoint, "The ink point is incorrect in second client");
		});

		it("can store ops in disconnected state and resend them on reconnection", async () => {
			// Disconnect the first client.
			containerRuntime1.connected = false;

			// Create a stroke in the first ink.
			const strokeId = ink.createStroke(pen).id;

			// Reconnect the first client.
			containerRuntime1.connected = true;

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that the stroke is present in both the client.
			assert.ok(ink.getStroke(strokeId), "The local client does not have the stroke");
			assert.ok(ink2.getStroke(strokeId), "The remote client does not have the stroke");

			// Disconnect the second client.
			containerRuntime2.connected = false;

			// Add a point to the stroke in the second ink.
			const inkPoint = {
				x: 10,
				y: 10,
				time: Date.now(),
				pressure: 10,
			};
			ink2.appendPointToStroke(inkPoint, strokeId);

			// Reconnect the second client.
			containerRuntime2.connected = true;

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that both the inks have the added point.
			const points1 = ink.getStroke(strokeId).points;
			assert.equal(
				points1.length,
				1,
				"There should be only one point in the stroke in first client",
			);
			assert.deepEqual(points1[0], inkPoint, "The ink point is incorrect in first client");

			const points2 = ink2.getStroke(strokeId).points;
			assert.equal(
				points2.length,
				1,
				"There should be only one point in the stroke in second client",
			);
			assert.deepEqual(points2[0], inkPoint, "The ink point is incorrect in second client");
		});
	});
});
