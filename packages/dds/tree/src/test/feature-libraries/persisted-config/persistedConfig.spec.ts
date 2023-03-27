import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { strict as assert } from "assert";
import {
	IPersistedConfigStore,
	createPersistedConfigStore,
	PersistedConfigSchema,
	Version,
	ConfigUpgradeType,
	PersistedConfig,
} from "../../../feature-libraries/persisted-config";

function parseVersion(version: Version): Semver {
	const isInternal = version.endsWith("-internal");
	assert(!isInternal, "TODO: Handle internal semvers.");
	const versions = version.split(".");
	assert(versions.length === 3, "invalid version string");
	const major = Number.parseInt(versions[0]);
	const minor = Number.parseInt(versions[1]);
	const patch = Number.parseInt(versions[2]);
	return {
		major,
		minor,
		patch,
		isInternal,
	};
}

interface Semver {
	major: number;
	minor: number;
	patch: number;
	isInternal: boolean;
}

function mockFn<TArgs extends any[]>(): ((...args: TArgs) => void) & {
	calls: TArgs[];
} {
	const calls: TArgs[] = [];
	const fn = (...args: TArgs): void => {
		calls.push(args);
	};
	fn.calls = calls;
	return fn;
}

// Simple sequencing server which generates ISequencedDocumentMessages from contents.
// Beware: no enforcement that generated stream of messages is valid from Fluid's perspective.
// This avoids relying on lots of layers of Fluid mocks for these unit tests.
class TestServer {
	private sequenceNumber = 0;

	public makeSequencedDocumentMessage(args: {
		contents: any;
		clientId?: string;
		minSeq?: number;
		refSeq?: number;
	}): ISequencedDocumentMessage {
		const defaults = {
			minSeq: args.refSeq ?? this.sequenceNumber,
			refSeq: this.sequenceNumber,
			clientId: "mock-client",
		};
		const { contents, clientId, minSeq, refSeq } = { ...defaults, ...args };
		return {
			get type(): string {
				throw new Error("not implemented");
			},
			clientId,
			contents,
			minimumSequenceNumber: minSeq,
			referenceSequenceNumber: refSeq,
			sequenceNumber: ++this.sequenceNumber,
			term: 0,
			timestamp: Date.now(),
			get clientSequenceNumber(): number {
				throw new Error("not implemented");
			},
		};
	}
}

describe.only("PersistedConfigStore", () => {
	let submitLocalMessage = mockFn<[content: any, localOpMetadata: unknown]>();
	let onProtocolChange = mockFn<[current: PersistedConfig, previous: PersistedConfig]>();
	let resubmitPendingOps = mockFn<[config: PersistedConfig]>();

	beforeEach(() => {
		submitLocalMessage = mockFn();
		onProtocolChange = mockFn();
		resubmitPendingOps = mockFn();
	});

	// TODO: summarization tests, tests for functionality of dropping other ops

	describe("using a schema without config flags", () => {
		const schema: PersistedConfigSchema = {
			formatVersion: (current: Version, previous: Version) => {
				// For this toy example, say any major change requires resubmission of ops
				const { major: currentMajor } = parseVersion(current);
				const { major: previousMajor } = parseVersion(previous);
				return currentMajor === previousMajor
					? ConfigUpgradeType.ConcurrentOpsValid
					: ConfigUpgradeType.ConcurrentOpsInvalid;
			},
			flags: {},
		};
		let store: IPersistedConfigStore;
		const initialConfig: PersistedConfig = {
			configVersion: 10,
			formatVersion: "1.0.0",
			flags: {},
		};

		const newerConfig: PersistedConfig = {
			formatVersion: "1.0.1",
			configVersion: 11,
			flags: {},
		};

		const olderConfig: PersistedConfig = {
			formatVersion: "0.9.0",
			configVersion: 5,
			flags: {},
		};

		beforeEach(() => {
			store = createPersistedConfigStore(
				schema,
				initialConfig,
				submitLocalMessage,
				onProtocolChange,
				resubmitPendingOps,
			);
		});

		// TODO: tests for dropping ops that require it.

		describe(".submit", () => {
			it("invokes the submitLocalCallback function provided on construction", () => {
				store.submit({ dummy: 0 }, { arbitraryLocalOpMetadata: 1 });
				assert.deepEqual(submitLocalMessage.calls, [
					[{ dummy: 0 }, { arbitraryLocalOpMetadata: 1 }],
				]);
			});

			it("sends an upgrade op alongside the first submitted op when initialized with a newer configuration than the document", () => {
				store.loadCore({ config: olderConfig });
				assert.deepEqual(
					submitLocalMessage.calls,
					[],
					"Upgrade should not be submitted eagerly.",
				);
				store.submit({ dummy: 0 }, { arbitraryLocalOpMetadata: 1 });
				assert.deepEqual(submitLocalMessage.calls, [
					[{ dummy: 0 }, { arbitraryLocalOpMetadata: 1 }],
					[{ type: "upgrade", config: initialConfig }, undefined],
				]);
			});
		});

		describe("onProtocolChange", () => {
			describe("on a new document", () => {
				it("is never invoked", () => {
					assert.deepEqual(onProtocolChange.calls, []);
				});
			});

			describe("on an existing document", () => {
				describe("with the same config", () => {
					it("is never invoked", () => {
						store.loadCore({ config: initialConfig });
						assert.deepEqual(onProtocolChange.calls, []);
					});
				});

				describe("with a newer config", () => {
					it("is invoked once", () => {
						store.loadCore({ config: newerConfig });
						assert.deepEqual(onProtocolChange.calls, [[newerConfig, initialConfig]]);
					});
				});

				describe("with an older config", () => {
					beforeEach(() => {
						store.loadCore({ config: olderConfig });
					});

					it("is used to downgrade on summary load", () => {
						assert.deepEqual(onProtocolChange.calls, [[olderConfig, initialConfig]]);
					});

					it("upgrades to the initial version upon ack of first edit", () => {
						store.submit({ dummy: 0 }, undefined);
						const server = new TestServer();
						for (const [contents, localOpMetadata] of submitLocalMessage.calls) {
							store.tryProcessOp(
								server.makeSequencedDocumentMessage({ contents }),
								true,
								localOpMetadata,
							);
						}
						assert.deepEqual(onProtocolChange.calls, [
							[olderConfig, initialConfig],
							[initialConfig, olderConfig],
						]);
					});
				});
			});
		});

		describe("resubmitPendingOps", () => {
			it("is not invoked for config changes which don't demand it", () => {
				store.loadCore({
					config: {
						formatVersion: initialConfig.formatVersion,
						configVersion: initialConfig.configVersion - 1,
					},
				});
				store.submit({ dummy: 0 }, undefined);
				const server = new TestServer();
				for (const [contents, localOpMetadata] of submitLocalMessage.calls) {
					store.tryProcessOp(
						server.makeSequencedDocumentMessage({ contents }),
						true,
						localOpMetadata,
					);
				}
				assert.deepEqual(resubmitPendingOps.calls, []);
			});

			it("is not invoked for config changes without concurrent ops", () => {
				store.loadCore({
					config: olderConfig,
				});
				store.submit({ dummy: 0 }, undefined);
				const server = new TestServer();
				for (const [contents, localOpMetadata] of submitLocalMessage.calls) {
					store.tryProcessOp(
						server.makeSequencedDocumentMessage({ contents }),
						true,
						localOpMetadata,
					);
				}
				assert.deepEqual(resubmitPendingOps.calls, []);
			});

			it("is invoked for config changes which demand it that have concurrent ops", () => {
				store.loadCore({
					config: olderConfig,
				});
				store.submit({ dummy: 0 }, undefined);
				store.submit({ dummy: 1 }, undefined);
				const server = new TestServer();
				for (const [contents, localOpMetadata] of submitLocalMessage.calls) {
					store.tryProcessOp(
						server.makeSequencedDocumentMessage({ contents, refSeq: 1 }),
						true,
						localOpMetadata,
					);
				}
				assert.deepEqual(resubmitPendingOps.calls, [[initialConfig]]);
			});
		});

		describe(".getConfigForNextSubmission", () => {
			describe("on a new document", () => {
				it("uses the initialConfig", () => {
					assert.deepEqual(store.getConfigForNextSubmission(), initialConfig);
				});
			});

			describe("on an existing document", () => {
				describe("with the same config", () => {
					it("uses that config", () => {
						store.loadCore({ config: initialConfig });
						assert.deepEqual(store.getConfigForNextSubmission(), initialConfig);
					});
				});

				describe("with a config at the same protocolIteration but not equivalent", () => {
					it("throws a reasonable error", () => {
						assert.throws(() =>
							store.loadCore({
								config: { formatVersion: "1.0.1", configVersion: 10 },
							}),
						);
					});
				});

				describe("with a newer config", () => {
					it("uses the newer config upon summary load", () => {
						store.loadCore({ config: { formatVersion: "1.0.1", configVersion: 11 } });
						assert.equal(store.getConfigForNextSubmission().formatVersion, "1.0.1");
					});
				});

				describe("with an older config", () => {
					const olderConfig: PersistedConfig = {
						formatVersion: "0.9.0",
						configVersion: 5,
						flags: {},
					};
					beforeEach(() => {
						store.loadCore({ config: olderConfig });
					});

					it("uses the stored config upon summary load", () => {
						assert.deepEqual(store.getConfigForNextSubmission(), olderConfig);
					});

					it("uses the stored config after submitting a single op", () => {
						store.submit({ dummy: 0 }, undefined);
						assert.deepEqual(store.getConfigForNextSubmission(), olderConfig);
					});

					it("uses the upgraded config after acking all ops", () => {
						store.submit({ dummy: 0 }, undefined);
						const server = new TestServer();
						for (const [contents, localOpMetadata] of submitLocalMessage.calls) {
							store.tryProcessOp(
								server.makeSequencedDocumentMessage({ contents }),
								true,
								localOpMetadata,
							);
						}
						assert.deepEqual(store.getConfigForNextSubmission(), initialConfig);
					});
				});
			});
		});

		describe("summarization", () => {
			const summaryConfig = { ...initialConfig, flags: undefined };
			it("stores the current config", () => {
				assert.deepEqual(store.summarize(), {
					config: summaryConfig,
					mostRecentResubmissionSeq: undefined,
				});
			});

			it("stores the most recent sequence number requiring ops to be resubmitted until it's outside the collab window", () => {
				store.loadCore({ config: olderConfig });
				store.submit({ dummy: 0 }, undefined);
				store.submit({ dummy: 1 }, undefined);
				const server = new TestServer();
				let mostRecentResubmissionSeq = 0;
				for (const [contents, localOpMetadata] of submitLocalMessage.calls) {
					const message = server.makeSequencedDocumentMessage({
						contents,
						refSeq: 1,
						minSeq: 1,
					});
					if (contents.type === "upgrade") {
						mostRecentResubmissionSeq = message.sequenceNumber;
					}
					store.tryProcessOp(message, true, localOpMetadata);
				}

				assert.notEqual(mostRecentResubmissionSeq, 0);

				assert.deepEqual(store.summarize(), {
					config: summaryConfig,
					mostRecentResubmissionSeq,
				});

				// Simulate another client sending a message which advances the MSN.
				store.tryProcessOp(
					server.makeSequencedDocumentMessage({
						contents: { dummy: 2 },
						minSeq: mostRecentResubmissionSeq + 1,
					}),
					false,
					undefined,
				);

				assert.deepEqual(store.summarize(), {
					config: summaryConfig,
					mostRecentResubmissionSeq: undefined,
				});
			});
		});

		it("resubmission flow ignores ops in invalid formats", () => {
			store.loadCore({ config: olderConfig });
			store.submit({ dummy: 0 }, undefined);
			store.submit({ dummy: 1 }, undefined);
			const server = new TestServer();
			let mostRecentResubmissionSeq = 0;
			for (const [contents, localOpMetadata] of submitLocalMessage.calls) {
				const message = server.makeSequencedDocumentMessage({
					contents,
					refSeq: 1,
					minSeq: 1,
				});
				if (contents.type === "upgrade") {
					mostRecentResubmissionSeq = message.sequenceNumber;
				}
				store.tryProcessOp(message, true, localOpMetadata);
			}

			// Simulate another client sending a message with refSeq below
			// the most recent seq requiring resubmission
			assert.equal(
				store.tryProcessOp(
					server.makeSequencedDocumentMessage({
						contents: { dummy: 2 },
						refSeq: mostRecentResubmissionSeq - 1,
					}),
					false,
					undefined,
				),
				true,
			);
		});
	});

	describe("using a schema with 2 config flags", () => {
		const schema: PersistedConfigSchema = {
			formatVersion: (current: Version, previous: Version) => {
				// For this toy example, say any major change requires resubmission of ops
				const { major: currentMajor } = parseVersion(current);
				const { major: previousMajor } = parseVersion(previous);
				return currentMajor === previousMajor
					? ConfigUpgradeType.ConcurrentOpsValid
					: ConfigUpgradeType.ConcurrentOpsInvalid;
			},
			flags: {
				breakingFeature: () => ConfigUpgradeType.ConcurrentOpsInvalid,
				nonbreakingFeature: () => ConfigUpgradeType.ConcurrentOpsValid,
			},
		};
		let store: IPersistedConfigStore;
		const initialConfig: PersistedConfig = {
			configVersion: 10,
			formatVersion: "1.0.0",
			flags: {
				breakingFeature: "1.0.0",
				nonbreakingFeature: "1.0.0",
			},
		};

		beforeEach(() => {
			store = createPersistedConfigStore(
				schema,
				initialConfig,
				submitLocalMessage,
				onProtocolChange,
				resubmitPendingOps,
			);
		});

		describe("throws when attempting to load a non-equivalent config with the same protocolIteration", () => {
			it("due to unequal differences", () => {
				assert.throws(() =>
					store.loadCore({
						config: {
							configVersion: 10,
							formatVersion: "1.0.0",
							flags: {
								breakingFeature: "1.0.0",
								nonbreakingFeature: "2.0.0",
							},
						},
					}),
				);
			});

			it("due to missing flags", () => {
				assert.throws(() =>
					store.loadCore({
						config: {
							configVersion: 10,
							formatVersion: "1.0.0",
							flags: {},
						},
					}),
				);
			});
		});

		describe("consults flag schema to decide whether to require resubmission", () => {
			it("requires resubmission for changes to flags marked as such", () => {
				store.loadCore({
					config: {
						configVersion: 9,
						formatVersion: "1.0.0",
						flags: {
							breakingFeature: "2.0.0",
							nonbreakingFeature: "1.0.0",
						},
					},
				});
				store.submit({ dummy: 0 }, undefined);
				store.submit({ dummy: 1 }, undefined);
				const server = new TestServer();
				for (const [contents, localOpMetadata] of submitLocalMessage.calls) {
					store.tryProcessOp(
						server.makeSequencedDocumentMessage({ contents, refSeq: 1 }),
						true,
						localOpMetadata,
					);
				}
				assert.deepEqual(resubmitPendingOps.calls, [[initialConfig]]);
			});

			it("doesn't require resubmission for changes to flags not marked as such", () => {
				store.loadCore({
					config: {
						configVersion: 9,
						formatVersion: "1.0.0",
						flags: {
							breakingFeature: "1.0.0",
							nonbreakingFeature: "2.0.0",
						},
					},
				});
				store.submit({ dummy: 0 }, undefined);
				store.submit({ dummy: 1 }, undefined);
				const server = new TestServer();
				for (const [contents, localOpMetadata] of submitLocalMessage.calls) {
					store.tryProcessOp(
						server.makeSequencedDocumentMessage({ contents, refSeq: 1 }),
						true,
						localOpMetadata,
					);
				}
				assert.deepEqual(resubmitPendingOps.calls, []);
			});
		});
	});
});
