/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

// TODO: Document, decide if semver-like even provides value here (over e.g. plain-old number).
export type Version = `${number}.${number}.${number}${"-internal" | ""}`;

export interface PersistedConfig {
	version: Version;
	// Strictly increasing number which identifies the iteration of the proposed protocol. It's suggested
	// that applications are able to modify this using the same mechanisms with which they can modify a DDS's
	// configuration, which enables safe rollback policies.
	// Example: application enables feature flag 1 in iteration 2, then realizes there is a problem with it.
	// application then disables feature flag 1 in iteration 3.
	// Using a single version number and monotonic increase on it isn't sufficient: DDSes may support configuration
	// which impacts their serialization format with independent semantics (ex: attribution, policies to include history)
	protocolIteration: number;
	flags: Record<string, boolean>; // TODO: consider making this generic
}

export enum ConfigUpgradeType {
	ConcurrentOpsInvalid,
	ConcurrentOpsValid,
}

// note: would be great to lock this down. changing this for flags that have been added can have nasty side effects
// for in progress upgrades.
// TODO: document process for adding flags
export interface PersistedConfigSchema {
	version: (current: Version, previous: Version) => ConfigUpgradeType;
	flags: Record<string, (current: boolean, previous: boolean) => ConfigUpgradeType>;
}

interface VersionControllerSummary {
	config: Omit<PersistedConfig, "flags"> & Partial<Pick<PersistedConfig, "flags">>;
	mostRecentResubmissionSeq?: number;
}

/**
 * TODO: Better doc here. But the gist of it is typical use case would be a DDS that owns one of these.
 * The structure of DDS APIs and how this interacts with them makes the usage contract relatively brittle currently--there are
 * a few options for improving that. Still, this seems like an improvement to hard-coding the equivalent policy all over the place
 * with similar settings.
 * - Rather than call `submitLocalMessage`, they always use this object's `submit`.
 * - DDS op processing logic should always defer to this object first, and avoid handling the op if `tryProcessOp` returns true.
 * - DDS should include summary of the persisted config (obtained via `summarize`) somewhere in their summary
 * - DDS should rehydrate persisted config state in their `loadCore` (i.e. retrieve from wherever they put it in
 * 	the summary and call `loadCore` on this object)
 * - When encoding op contents for submission, DDS should use configuration dictated by `getConfigForNextSubmission`.
 *
 * Note: may want to provide simpler API for users which don't need synchronization points, which means op resubmission is never required.
 */
export interface IPersistedConfigStore {
	// Contract: all users should first defer their op processing to this object. If it returns true,
	// they should not attempt to process the op further.
	tryProcessOp(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): boolean;

	// Submits an op to the server. This should be used in place of standard DDS `submitLocalMessage` API if composing this
	// object from within a DDS.
	submit(content: any, localOpMetadata: unknown): void;

	// TODO: is it correct to make these more lightweight than DDS summarize methods? this avoids storage details
	// and makes DDSes not need to create a separate blob if their config is simple.
	summarize(): VersionControllerSummary;

	loadCore(snapshot: VersionControllerSummary): void;

	getConfigForNextSubmission(): PersistedConfig;
	// DDS should compose over one of these things, which controls the op format that DDS uses and the summary tree
	// it generates. It needs access to summary save/load process as well as op submission/processing.
	// SharedTree architecture needs to be able to transmit information to the indexes on what format they should write in.
	// This means SummaryElements either need to receive the write version as input (a bit yucky, it's not sharedtreecore's concern)
	// or be able to subscribe to
}

const upgradeKey = "upgrade" as const;

interface UpgradeOp {
	type: typeof upgradeKey;
	config: PersistedConfig;
}

function isUpgradeOp(contents: any): contents is UpgradeOp {
	return contents.type === upgradeKey;
}

// TODO: Test and validate this against reconnect & offline flows (will probably require minor api/implementation tweaks)
class PersistedConfigStore implements IPersistedConfigStore {
	// Stores the config that clients have implicitly agreed upon (i.e. the acked config with the highest protocolIteration)
	private config: PersistedConfig;
	// When initialized with a config that has a higher protocol iteration than the loaded document,
	// this field holds that proposed newer protocol version.
	// However, to avoid issues with readonly clients or affecting document's last edit time, actually submitting that
	// upgrade request is performed lazily upon first edit.
	// Once the proposed upgrade is submitted, this field should be cleared to avoid duplicate proposed submissions (which
	// won't cause correctness issues, but have network overhead)
	private configAwaitingSubmission: PersistedConfig | undefined;

	// TODO: this tracking is arguably not necessary. the DDS should know if it has pending ops.
	private pendingOpCount: number;

	// Protocol iteration for the most recent upgrade which required op resubmission.
	// This is tracked so it can be stored in the summary, so that clients joining the session while an upgrade op is in the
	// collab window know to ignore concurrent ops. Undefined signifies that no upgrade ops were submitted in the collab window.
	private mostRecentResubmissionSeq: number | undefined;

	constructor(
		private readonly schema: PersistedConfigSchema,
		initialConfig: PersistedConfig, // should be provided at DDS construction time, generally will be specified by the application
		private readonly submitLocalMessage: (content: any, localOpMetadata: unknown) => void,
		private readonly onProtocolChange: (
			current: PersistedConfig,
			previous: PersistedConfig,
		) => void,
		private readonly reSubmitPendingOps: (config: PersistedConfig) => void,
	) {
		this.config = initialConfig;
		this.pendingOpCount = 0;
	}

	tryProcessOp(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): boolean {
		this.processMinSeq(message);
		if (local) {
			this.pendingOpCount--;
		}
		const { contents } = message;
		if (isUpgradeOp(contents)) {
			if (contents.config.protocolIteration > this.config.protocolIteration) {
				// TODO: validate proposed config is understood by this version of the code, fail if not.
				if (this.requiresOpResubmission(contents.config, this.config)) {
					this.mostRecentResubmissionSeq = message.sequenceNumber;

					if (this.pendingOpCount > 0) {
						// not technically necessary given event takes the argument, but less confusing for consumer--puts
						// this class in a consistent state before calling outside.
						this.config = contents.config;
						// TODO: This has potential for dangerous op re-entrancy. need to have a discussion about it.
						this.reSubmitPendingOps(contents.config);
					}
				}
				this.updateConfig(contents.config);
			} else if (contents.config.protocolIteration === this.config.protocolIteration) {
				if (!areEquivalentConfigs(contents.config, this.config)) {
					throw new Error("TODO: determine error policy here");
				}
			}
			// otherwise, proposed protocol should be ignored. this could happen with a client submitting a concurrent upgrade
			// request

			if (
				contents.config.protocolIteration >=
				(this.configAwaitingSubmission?.protocolIteration ?? 0)
			) {
				// TODO: Could consider validating deep equality of the config in the case of protocol equality.
				// This avoids sending duplicate upgrade ops in most cases (they can still happen due to concurrency).
				// Since clients should process duplicate upgrade ops as no-ops (or ignore them, if upgrading to an older
				// protocol iteration), this step is technically unnecessary. But it avoids some network traffic.
				this.configAwaitingSubmission = undefined;
			}

			return true;
		}

		if (
			this.mostRecentResubmissionSeq !== undefined &&
			this.mostRecentResubmissionSeq > message.referenceSequenceNumber
		) {
			// Mark this op as handled: its format is no longer valid to be interpreted. The submitter of this op is
			// expected to resubmit it (which they will do when they process the upgrade message).
			return true;
		}

		// TODO: throw on ops which use a write version or a feature this client doesn't understand
		// TODO: emit telemetry sufficient to diagnose issues
		return false;
	}

	public getConfigForNextSubmission(): PersistedConfig {
		return this.config;
	}

	public submit(content: any, localOpMetadata: unknown): void {
		assert(content.type !== upgradeKey, "TODO: reasonable assert here saying incorrect usage");
		// TODO: Validate content is in correct format.
		this.pendingOpCount++;
		this.submitLocalMessage(content, localOpMetadata);

		if (this.configAwaitingSubmission !== undefined) {
			const contents: UpgradeOp = {
				type: upgradeKey,
				config: this.configAwaitingSubmission,
			};
			this.pendingOpCount++;
			this.submitLocalMessage(contents, undefined);
			this.configAwaitingSubmission = undefined;
		}
	}

	public summarize(): VersionControllerSummary {
		return {
			config: {
				protocolIteration: this.config.protocolIteration,
				version: this.config.version,
				flags: Object.keys(this.config.flags).length === 0 ? undefined : this.config.flags,
			},
			mostRecentResubmissionSeq: this.mostRecentResubmissionSeq,
		};
	}

	public loadCore(snapshot: VersionControllerSummary): void {
		const { config: configSnapshot, mostRecentResubmissionSeq } = snapshot;
		// we omit flags from snapshot to save space when there are none.
		const config = {
			flags: {},
			...configSnapshot,
		};
		this.mostRecentResubmissionSeq = mostRecentResubmissionSeq;
		if (config.protocolIteration > this.config.protocolIteration) {
			// TODO: validate proposed config is understood by this version of the code, fail if not.
			// some policy decisions must be made here.
			this.updateConfig(config);
		} else if (config.protocolIteration === this.config.protocolIteration) {
			if (!areEquivalentConfigs(config, this.config)) {
				// failing fast is arguably the correct thing to do--this indicates misconfigured protocol iteration,
				// i.e. application has mistakenly rolled out two configurations with the same priority.
				// Could always be resolved by rolling out a new one with higher priority.
				throw new Error("TODO: determine error policy here");
			}
		} else {
			// Downgrade to use the doc's current agreed-upon protocol, and set up local state to send a message
			// requesting an upgrade after the first op.
			this.configAwaitingSubmission = this.config;
			this.updateConfig(config);
		}
	}

	// whether or not ops with protocolIteration below the upgrade require resubmission
	private requiresOpResubmission(
		proposedConfig: PersistedConfig,
		currentConfig: PersistedConfig,
	): boolean {
		if (
			proposedConfig.version !== currentConfig.version &&
			this.schema.version(proposedConfig.version, currentConfig.version) ===
				ConfigUpgradeType.ConcurrentOpsInvalid
		) {
			return true;
		}

		for (const flagName of Object.keys(proposedConfig.flags)) {
			const upgradeStrategyResolver = this.schema.flags[flagName];
			// TODO: This should probably be a usage error. Apps which attempt rollouts that are too eager could hit it.
			assert(
				upgradeStrategyResolver !== undefined,
				"Flag schema didn't contain proposed config flag. Perhaps rollout of the proposed schema occurred too early?",
			);
			const proposed = proposedConfig.flags[flagName];
			const current = currentConfig.flags[flagName];
			if (
				proposed !== current &&
				upgradeStrategyResolver(proposed, current) ===
					ConfigUpgradeType.ConcurrentOpsInvalid
			) {
				return true;
			}
		}

		return false;
	}

	private processMinSeq(message: ISequencedDocumentMessage) {
		if (
			this.mostRecentResubmissionSeq !== undefined &&
			this.mostRecentResubmissionSeq < message.minimumSequenceNumber
		) {
			// All clients have seen the protocol change, so concurrent ops that should be discarded
			// can no longer be acked.
			this.mostRecentResubmissionSeq = undefined;
		}
	}

	private updateConfig(config: PersistedConfig): void {
		const oldConfig = this.config;
		this.config = config;
		this.onProtocolChange(config, oldConfig);
	}
}

function areEquivalentConfigs(a: PersistedConfig, b: PersistedConfig): boolean {
	if (a.version !== b.version) {
		return false;
	}

	const aFlagNames = Object.keys(a.flags);
	const bFlagNames = Object.keys(b.flags);
	if (aFlagNames.length !== bFlagNames.length) {
		return false;
	}

	for (const flag of aFlagNames) {
		if (a.flags[flag] !== b.flags[flag]) {
			return false;
		}
	}

	return true;
}

export function createPersistedConfigStore(
	schema: PersistedConfigSchema,
	initialConfig: PersistedConfig, // should be provided at DDS construction time, generally will be specified by the application
	submitLocalMessage: (content: any, localOpMetadata: unknown) => void,
	// consider making this an event.
	onProtocolChange: (current: PersistedConfig, previous: PersistedConfig) => void,
	reSubmitPendingOps: (config: PersistedConfig) => void,
): IPersistedConfigStore {
	return new PersistedConfigStore(
		schema,
		initialConfig,
		submitLocalMessage,
		onProtocolChange,
		reSubmitPendingOps,
	);
}
