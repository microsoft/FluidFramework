/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { IChannelServices } from "@fluidframework/datastore-definitions/internal";
import {
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";
import { Random } from "best-random";

import { SharedDelta } from "./delta.js";

describe("SharedOT", () => {
	describe("stress", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
		let docs: SharedDelta[]; // Array of docs under test
		let runtimes: MockContainerRuntimeForReconnection[] = [];
		let trace: string[]; // Repro steps to be printed if a failure is encountered.

		const extract = (doc: SharedDelta) => {
			return doc.text;
		};

		/**
		 * Drains the queue of pending ops for each client and vets that all docs converged on the same state.
		 */
		const expect = async () => {
			// Reconnect any disconnected clients before processing pending ops.
			{
				for (let i = 0; i < runtimes.length; i++) {
					const runtime = runtimes[i];
					if (!runtime.connected) {
						trace?.push(`containerRuntime${i + 1}.connected = true;`);
						runtime.connected = true;
					}
				}
			}

			// Broadcast and process all pending messages across all docs.
			trace?.push("await expect();");
			containerRuntimeFactory.processAllMessages();

			// Verify that all docs have converged on the same final state.
			const doc0 = docs[0];
			const actual0 = extract(doc0);

			{
				for (let i = 1; i < docs.length; i++) {
					const docN = docs[i];
					const actualN = extract(docN);
					assert.deepEqual(actual0, actualN);
				}
			}
		};

		/**
		 * Performs a stress run using the given parameters.
		 *
		 * 'syncProbability' is the probability that the clients will drain their queue of incoming messages
		 * and check for convergence.
		 *
		 * 'disconnectProbability' is the probability that a client will disconnect, forcing it to regenerate
		 * and resubmit any pending local operations on the next sync.
		 *
		 * 'seed' is the 32-bit integer used to seed the PRNG.
		 */
		async function stress(
			numClients: number,
			numOps: number,
			syncProbability: number,
			disconnectProbability: number,
			seed: number,
		) {
			try {
				docs = [];
				runtimes = [];
				trace = [];

				containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

				// Create docs for this stress run.
				for (let i = 0; i < numClients; i++) {
					const dataStoreRuntimeN = new MockFluidDataStoreRuntime({
						registry: [SharedDelta.getFactory()],
					});
					const containerRuntimeN =
						containerRuntimeFactory.createContainerRuntime(dataStoreRuntimeN);
					const servicesN: IChannelServices = {
						deltaConnection: dataStoreRuntimeN.createDeltaConnection(),
						objectStorage: new MockStorage(),
					};

					const docN = SharedDelta.create(dataStoreRuntimeN, `doc-${i}`);
					docN.connect(servicesN);

					docs.push(docN);
					runtimes.push(containerRuntimeN);
				}

				// Initialize PRNG with given seed.
				const float64 = new Random(seed).float64;

				// Returns a pseudorandom 32b integer in the range [0 .. max).
				// eslint-disable-next-line no-bitwise
				const int32 = (max = 0x7fffffff) => (float64() * max) | 0;

				const randomText = () => `${float64().toString(36).substr(0, int32(12))}`;

				const insert = (docIndex: number, position: number, text: string) => {
					trace?.push(
						`doc${
							docIndex + 1
						}.insert(/* position: */ ${position}, /* text: */ ${JSON.stringify(text)});`,
					);
					docs[docIndex].insert(position, text);
				};

				const del = (docIndex: number, start: number, end: number) => {
					trace?.push(`doc${docIndex + 1}.delete(/* start: */ ${start}, /* end: */ ${end});`);
					docs[docIndex].delete(start, end);
				};

				// Loop for the prescribed number of iterations, randomly mutating one of documents with one
				// of the following operations:
				//
				//    * insert text
				//    * delete a range of text
				//
				// Following each operation, there is a `syncProbability` chance that clients will exchange
				// ops and vet convergence.
				for (let i = 0; i < numOps; i++) {
					// Choose a client to perform the operation.
					const docIndex = int32(docs.length);
					const doc = docs[docIndex];

					const { length } = doc;

					switch (int32(4)) {
						case 0: {
							if (length > 0) {
								const start = int32(length);
								const end = int32(start - length + 1) + start;
								del(docIndex, start, end);
							}
							break;
						}
						default:
							insert(docIndex, int32(length + 1), randomText());
							break;
					}

					if (runtimes[docIndex].connected && float64() < disconnectProbability) {
						trace?.push(`containerRuntime${docIndex + 1}.connected = false;`);

						runtimes[docIndex].connected = false;
					}

					// Clients periodically exchanging ops, at which point we verify they have converged
					// on the same state.
					if (float64() < syncProbability) {
						await expect();
					}
				}

				// Test is finished.  Drain pending ops and vet that clients converged.
				await expect();
			} catch (error) {
				// If an error occurs, dump the repro instructions.
				for (const s of trace) {
					console.log(s);
				}

				// Also dump the current state of the docs.
				for (const m of docs) {
					// eslint-disable-next-line @typescript-eslint/no-base-to-string
					console.log(m.toString());
				}

				// Finally, rethrow the original error.
				throw error;
			}
		}

		for (const { numClients, numOps, syncProbability, disconnectProbability, seed } of [
			{
				numClients: 2,
				numOps: 1000,
				syncProbability: 0.3,
				disconnectProbability: 0,
				seed: 0x84d43a0a,
			},
			{
				numClients: 3,
				numOps: 1000,
				syncProbability: 0.1,
				disconnectProbability: 0,
				seed: 0x655c763b,
			},
			{
				numClients: 5,
				numOps: 200,
				syncProbability: 0.0,
				disconnectProbability: 0,
				seed: 0x2f98736d,
			},
			{
				numClients: 2,
				numOps: 1000,
				syncProbability: 0.3,
				disconnectProbability: 0.25,
				seed: 0x84d43a0a,
			},
		]) {
			it(`Stress (numClients=${numClients} numOps=${numOps} syncProbability=${syncProbability} disconnectProbability=${disconnectProbability} seed=0x${seed
				.toString(16)
				.padStart(8, "0")})`, async function () {
				// Note: Must use 'function' rather than arrow '() => { .. }' in order to set 'this.timeout(..)'
				this.timeout(20000);

				await stress(numClients, numOps, syncProbability, disconnectProbability, seed);
			});
		}

		it.skip("stress-loop", async function () {
			// Note: Must use 'function' rather than arrow '() => { .. }' in order to set 'this.timeout(..)'
			this.timeout(0); // Disable timeouts for stress loop

			let iterations = 0;
			const start = Date.now();
			let lastStatus = start;

			// eslint-disable-next-line no-constant-condition
			while (true) {
				await stress(
					/* numClients: */ 2,
					/* numOps: */ 1000,
					/* syncProbability: */ 0.1,
					/* disconnectProbability: */ 0,
					// eslint-disable-next-line no-bitwise
					/* seed: */ (Math.random() * 0x100000000) >>> 0,
				);

				// console.log(docs[0].toString());

				++iterations;
				const now = Date.now();
				if (now - lastStatus > 5000) {
					process.stdout.write(
						`Stress loop: ${iterations} iterations completed - Total Elapsed: ${(
							(Date.now() - start) / 1000
						).toFixed(2)}s\n`,
					);
					lastStatus = now;
				}
			}
		});
	});
});
