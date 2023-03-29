/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

// Biggest TODOs:
// - Decide version scheme and how to ensure internal versions don't end up in production documents
// - Implement reconnect/offline support
// - Consider supporting config specification behavior of "use this config for new documents, but don't try to upgrade loaded docs"
// - fix impl to track current persisted format for each client in collab window
// - Add fuzz testing with toy dds
// - consider working this into IChannelAttributes API

/**
 * Version identifier for a feature or format in a {@link PersistedFormatConfig}.
 *
 * Internal versions (those ending in -internal) have no backwards compatibility guarantees.
 * They are intended to be used while iterating on a "next generation" format, and not in
 * production applications.
 */
export type Version = `${number}.${number}.${number}${"-internal" | ""}`;

/**
 * Configuration which impacts the persisted format of a document.
 *
 * @remarks - The current implementation is scoped to the DDS level, but its concepts are applicable to larger scopes.
 */
export interface PersistedFormatConfig<FlagNames extends string = string> {
	/**
	 * Format version for the document contents at whatever scope this configuration applies to.
	 *
	 * In DDS usage, this typically aligns with the DDS's op/summary format.
	 */
	formatVersion: Version;

	/**
	 * number that strictly increases over time which identifies the version of this configuration.
	 * Applications should always bump this number when making any kind of configuration change.
	 * As such, this number should align with the number of configuration changes an application
	 * has made over the course of its lifetime.
	 *
	 * It's suggested that applications are able to modify this using the same mechanisms with which
	 * they can modify a DDS's configuration in order to enable safe rollback policies.
	 *
	 * Decoupling this field from `formatVersion` and any configuration flags ensures that clients can reason
	 * about which configuration is newer and act accordingly when clients with initially different configurations
	 * collaborate.
	 *
	 * @example
	 * An application first rolls out using `{ formatVersion: 1, configVersion: 1 }`.
	 *
	 * Later, the DDS they're using releases formatVersion 2, which has improved memory footprint they wish to leverage.
	 * After a version of their application which understands formatVersion 2 saturates, they ship the configuration
	 * `{ formatVersion: 2, configVersion: 2 }`.
	 *
	 * Unfortunately, after monitoring telemetry, they discover an issue exposed to formatVersion 2 and wish to rollback.
	 * They now ship the configuration `{ formatVersion: 1, configVersion: 3 }`.
	 */
	configVersion: number;

	/**
	 * Configuration flags which
	 */
	flags: Record<FlagNames, Version>; // TODO: consider making this generic
}

export enum ConfigUpgradeType {
	ConcurrentOpsInvalid,
	ConcurrentOpsValid,
}

// note: would be great to lock this down. changing this for flags that have been added can have nasty side effects
// for in progress upgrades.
// TODO: document process for adding flags
export interface PersistedConfigSchema<FlagsType extends string = string> {
	formatVersion: (current: Version, previous: Version) => ConfigUpgradeType;
	flags: Record<FlagsType, (current: Version, previous: Version) => ConfigUpgradeType>;
}

export interface PersistedConfigSummary {
	config: Omit<PersistedFormatConfig, "flags"> & Partial<Pick<PersistedFormatConfig, "flags">>;
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
export interface IPersistedConfigStore<FlagsType extends string = string> {
	// Contract: all users should first defer their op processing to this object. If it returns true,
	// they should not attempt to process the op further.
	tryProcessOp(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): boolean;

	// Submits an op to the server. This should be used in place of standard DDS `submitLocalMessage` API if composing this
	// object from within a DDS.
	submit(content: any, localOpMetadata?: unknown): void;

	// TODO: is it correct to make these more lightweight than DDS summarize methods? this avoids storage details
	// and makes DDSes not need to create a separate blob if their config is simple.
	summarize(): PersistedConfigSummary;

	loadCore(snapshot: PersistedConfigSummary): void;

	getConfigForNextSubmission(): PersistedFormatConfig<FlagsType>;

	getConfigForMessage(message: ISequencedDocumentMessage): PersistedFormatConfig<FlagsType>;
	// DDS should compose over one of these things, which controls the op format that DDS uses and the summary tree
	// it generates. It needs access to summary save/load process as well as op submission/processing.
	// SharedTree architecture needs to be able to transmit information to the indexes on what format they should write in.
	// This means SummaryElements either need to receive the write version as input (a bit yucky, it's not sharedtreecore's concern)
	// or be able to subscribe to
}

const upgradeKey = "upgrade" as const;

interface UpgradeOp {
	type: typeof upgradeKey;
	config: PersistedFormatConfig;
}

function isUpgradeOp(contents: any): contents is UpgradeOp {
	return contents.type === upgradeKey;
}

/**
 * Stores information about which persisted configuration each client in the collaboration window should be using.
 *
 * TODO: expose api so dds can get this information for an op coming in.
 *
 * Impl strategy:
 * - Retain config that clients have implicitly agreed upon (always)
 * - If there are upgrade ops within the collab window...
 * 		- Retain config at MSN
 * 		- Retain each upgrade op within the collab window (TODO: remove some data from these; not all are necessary)
 * - When receiving an op from a client, consider the set of all upgrade ops which were either before op.referenceSequenceNumber
 * OR submitted by the same client.
 * - When receiving an ack from a locally sent op, it's similar but also need to account for our own pending upgrade op in flight.
 * Config of that client's op will be the largest configVersion amongst all of those upgrades.
 */
class PersistedConfigStore<FlagsType extends string = string>
	implements IPersistedConfigStore<FlagsType>
{
	// Stores the config that clients have implicitly agreed upon (i.e. the acked config with the highest configVersion)
	private config: PersistedFormatConfig<FlagsType>;
	// When initialized with a config that has a higher config version than the loaded document,
	// this field holds that proposed newer config.
	// However, to avoid issues with readonly clients or affecting document's last edit time, actually submitting that
	// upgrade request is performed lazily upon first edit.
	// Once the proposed upgrade is submitted, this field should be cleared to avoid duplicate proposed submissions (which
	// won't cause correctness issues, but have network overhead)
	private configAwaitingSubmission: PersistedFormatConfig<FlagsType> | undefined;

	// private configAwaitingAck: PersistedFormatConfig | undefined;

	private pendingOpCount: number;

	private recentUpgrades: ISequencedDocumentMessage[] = [];
	// defined iff recentUpgrades.length > 0
	private msnConfig?: PersistedFormatConfig<FlagsType>;

	// TODO: Submissions which require a synchronization point might go poorly with this scheme due to temp downgrade
	// need to work out whether it's possible for use cases of this to either resubmit local ops on ack of the upgrade
	// or for all clients to accept them as valid (as they're not concurrent)
	// Plan for now: don't try and be super advanced. Use case for this is pretty slim anyway (shared-tree scheme is
	// pretty advanced, we likely won't do that kind of thing very often. we don't even like *regular* format changes
	// which don't have anywhere near the complexity). Thus: any config change at

	// Sequence number for the most recent upgrade which required op resubmission.
	// This is tracked so it can be stored in the summary, so that clients joining the session while an upgrade op is in the
	// collab window know to ignore concurrent ops. Undefined signifies that no upgrade ops were submitted in the collab window.
	private mostRecentResubmissionSeq: number | undefined;

	constructor(
		private readonly schema: PersistedConfigSchema<FlagsType>,
		initialConfig: PersistedFormatConfig<FlagsType>, // should be provided at DDS construction time, generally will be specified by the application
		private readonly submitLocalMessage: (content: any, localOpMetadata: unknown) => void,
		private readonly onProtocolChange: (
			current: PersistedFormatConfig<FlagsType>,
			previous: PersistedFormatConfig<FlagsType>,
		) => void,
		private readonly reSubmitPendingOps: (config: PersistedFormatConfig<FlagsType>) => void,
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
			if (this.recentUpgrades.length === 0) {
				this.msnConfig = this.config;
			}
			this.recentUpgrades.push(message);
			if (contents.config.configVersion > this.config.configVersion) {
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
			} else if (contents.config.configVersion === this.config.configVersion) {
				if (!areEquivalentConfigs(contents.config, this.config)) {
					throw new Error("TODO: determine error policy here");
				}
			}
			// otherwise, proposed config should be ignored. this could happen with a client submitting a concurrent upgrade
			// request

			if (
				contents.config.configVersion >= (this.configAwaitingSubmission?.configVersion ?? 0)
			) {
				// TODO: Could consider validating deep equality of the config in the case of config equality.
				// This avoids sending duplicate upgrade ops in most cases (they can still happen due to concurrency).
				// Since clients should process duplicate upgrade ops as no-ops (or ignore them, if "upgrading" to an older
				// configVersion), this step is technically unnecessary. But it avoids some network traffic.
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

	public getConfigForNextSubmission(): PersistedFormatConfig<FlagsType> {
		return this.config;
	}

	public getConfigForMessage(
		message: ISequencedDocumentMessage,
	): PersistedFormatConfig<FlagsType> {
		if (this.recentUpgrades.length === 0) {
			return this.config;
		}

		const refSeq = message.referenceSequenceNumber;
		assert(
			this.msnConfig !== undefined,
			"config at MSN should be saved if upgrade ops are within the collab window.",
		);
		let config = this.msnConfig;
		for (
			let i = 0;
			i < this.recentUpgrades.length && this.recentUpgrades[i].sequenceNumber <= refSeq;
			i++
		) {
			const upgradeConfig: PersistedFormatConfig<FlagsType> =
				this.recentUpgrades[i].contents.config;
			if (upgradeConfig.configVersion > config!.configVersion) {
				config = upgradeConfig;
			}
		}

		return config;
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

	public summarize(): PersistedConfigSummary {
		return {
			config: {
				configVersion: this.config.configVersion,
				formatVersion: this.config.formatVersion,
				flags: Object.keys(this.config.flags).length === 0 ? undefined : this.config.flags,
			},
			mostRecentResubmissionSeq: this.mostRecentResubmissionSeq,
		};
	}

	public loadCore(snapshot: PersistedConfigSummary): void {
		const { config: configSnapshot, mostRecentResubmissionSeq } = snapshot;
		// we omit flags from snapshot to save space when there are none.
		const config = {
			flags: {},
			...configSnapshot,
		};
		this.mostRecentResubmissionSeq = mostRecentResubmissionSeq;
		if (config.configVersion > this.config.configVersion) {
			// TODO: validate proposed config is understood by this version of the code, fail if not.
			// some policy decisions must be made here.
			this.updateConfig(config);
		} else if (config.configVersion === this.config.configVersion) {
			if (!areEquivalentConfigs(config, this.config)) {
				// failing fast is arguably the correct thing to do--this indicates misconfigured configVersion,
				// i.e. application has mistakenly rolled out two configurations with the same priority.
				// Could always be resolved by rolling out a new one with higher priority.
				throw new Error("TODO: determine error policy here");
			}
		} else {
			// Downgrade to use the doc's current agreed-upon config, and set up local state to send a message
			// requesting an upgrade after the first op.
			this.configAwaitingSubmission = this.config;
			this.updateConfig(config);
		}
	}

	// whether or not ops with configVersion below the upgrade require resubmission
	private requiresOpResubmission(
		proposedConfig: PersistedFormatConfig<FlagsType>,
		currentConfig: PersistedFormatConfig<FlagsType>,
	): boolean {
		if (
			proposedConfig.formatVersion !== currentConfig.formatVersion &&
			this.schema.formatVersion(proposedConfig.formatVersion, currentConfig.formatVersion) ===
				ConfigUpgradeType.ConcurrentOpsInvalid
		) {
			return true;
		}

		const readFlags = (config: PersistedFormatConfig<FlagsType>): Iterable<FlagsType> =>
			Object.keys(config.flags) as FlagsType[];

		for (const flagName of readFlags(proposedConfig)) {
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
		const msn = message.minimumSequenceNumber;
		if (this.mostRecentResubmissionSeq !== undefined && this.mostRecentResubmissionSeq < msn) {
			// All clients have seen the config change, so concurrent ops that should be discarded
			// can no longer be acked.
			this.mostRecentResubmissionSeq = undefined;
		}

		// Remove upgrade ops pushed below the collab window
		const i = this.recentUpgrades.findIndex(
			(upgradeMessage) => upgradeMessage.sequenceNumber > msn,
		);
		if (i > 0) {
			const removedUpgradeOps = this.recentUpgrades.splice(0, i);
			if (this.recentUpgrades.length === 0) {
				// No more upgrade ops are within the collab window: all clients will send all ops
				// using the currently agreed-upon config.
				this.msnConfig = undefined;
			} else {
				let msnConfig = this.msnConfig;
				assert(
					msnConfig !== undefined,
					"msnConfig should always be defined when upgrade ops are within collab window",
				);
				for (const {
					contents: { config },
				} of removedUpgradeOps) {
					// TODO: fix up nonnull assertion
					if (config.configVersion > msnConfig!.configVersion) {
						msnConfig = config;
					}
				}
				this.msnConfig = msnConfig;
			}
		}
	}

	private updateConfig(config: PersistedFormatConfig): void {
		const oldConfig = this.config;
		this.config = config;
		this.onProtocolChange(config, oldConfig);
	}
}

function areEquivalentConfigs(a: PersistedFormatConfig, b: PersistedFormatConfig): boolean {
	if (a.formatVersion !== b.formatVersion) {
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

export function createPersistedConfigStore<FlagsType extends string = string>(
	schema: PersistedConfigSchema<FlagsType>,
	initialConfig: PersistedFormatConfig<FlagsType>, // should be provided at DDS construction time, generally will be specified by the application
	submitLocalMessage: (content: any, localOpMetadata: unknown) => void,
	// consider making this an event.
	onProtocolChange: (current: PersistedFormatConfig, previous: PersistedFormatConfig) => void,
	reSubmitPendingOps: (config: PersistedFormatConfig) => void,
): IPersistedConfigStore<FlagsType> {
	return new PersistedConfigStore(
		schema,
		initialConfig,
		submitLocalMessage,
		onProtocolChange,
		reSubmitPendingOps,
	);
}
