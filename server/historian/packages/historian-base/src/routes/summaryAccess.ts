/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NetworkError } from "@fluidframework/server-services-client";
import type { IDocument } from "@fluidframework/server-services-core";

import {
	type ActivateSummaryAccessResult,
	type IEphemeralSummaryAccessRecord,
	type IEphemeralSummaryAccessStore,
	type ISummaryAccessContext,
	MalformedEphemeralSummaryAccessRecordError,
} from "../services";
import {
	denySummaryDocumentAccess,
	getSummaryDocumentIdentity,
	type ISummaryOwnershipTelemetryDetails,
	type IValidateSummaryDocumentArgs,
	logSummaryOwnershipOutcome,
	readAndValidateSummaryDocument,
} from "./utils";

export interface IResolveSummaryAccessArgs extends IValidateSummaryDocumentArgs {
	accessStore?: IEphemeralSummaryAccessStore;
}

function contextFromDocument(
	document: IDocument,
	source: ISummaryAccessContext["source"],
	ignoreEphemeralFlag: boolean,
): ISummaryAccessContext {
	return {
		tenantId: document.tenantId,
		documentId: document.documentId,
		isEphemeralContainer: !ignoreEphemeralFlag && document.isEphemeralContainer === true,
		createTime: document.createTime,
		storageName: document.storageName ?? undefined,
		source,
	};
}

function logAllowed(
	args: IResolveSummaryAccessArgs,
	documentId: string,
	source: ISummaryAccessContext["source"],
	details: Omit<ISummaryOwnershipTelemetryDetails, "source"> = {},
): void {
	logSummaryOwnershipOutcome(
		args.tenantId,
		documentId,
		args.operation,
		args.routeType,
		"allowed",
		undefined,
		{ source, ...details },
	);
}

export async function resolveSummaryAccess(
	args: IResolveSummaryAccessArgs,
): Promise<ISummaryAccessContext> {
	const identity = getSummaryDocumentIdentity(args.tenantId, args.authorization);
	const expiresAtFor = (createTime: number): number =>
		createTime + args.ephemeralDocumentTTLSec * 1000;

	if (args.operation === "get" && !args.ignoreEphemeralFlag && args.accessStore !== undefined) {
		let localFailureOutcome: "malformed" | "dependencyError" | undefined;
		let record: IEphemeralSummaryAccessRecord | undefined;
		try {
			record = await args.accessStore.readSummaryAccess(args.tenantId, identity.documentId);
		} catch (error) {
			localFailureOutcome =
				error instanceof MalformedEphemeralSummaryAccessRecordError
					? "malformed"
					: "dependencyError";
			logSummaryOwnershipOutcome(
				args.tenantId,
				identity.documentId,
				args.operation,
				args.routeType,
				"dependencyError",
				error,
				{
					source: "localEphemeral",
					localOutcome: localFailureOutcome,
					fallbackReason: "localDependencyError",
				},
			);
		}

		if (record?.state === "deleted") {
			return denySummaryDocumentAccess(
				args.tenantId,
				identity.documentId,
				args.operation,
				args.routeType,
				"notFound",
				{
					source: "localEphemeral",
					localOutcome: "deleted",
				},
			);
		}
		if (record?.state === "active") {
			if (Date.now() >= expiresAtFor(record.createTime)) {
				return denySummaryDocumentAccess(
					args.tenantId,
					identity.documentId,
					args.operation,
					args.routeType,
					"notFound",
					{
						source: "localEphemeral",
						localOutcome: "expired",
					},
				);
			}
			logAllowed(args, identity.documentId, "localEphemeral", {
				localOutcome: "active",
			});
			return {
				tenantId: args.tenantId,
				documentId: identity.documentId,
				isEphemeralContainer: true,
				createTime: record.createTime,
				storageName: undefined,
				source: "localEphemeral",
			};
		}

		const fallbackDetails: Omit<ISummaryOwnershipTelemetryDetails, "source"> = {
			localOutcome: localFailureOutcome ?? "miss",
			fallbackReason:
				localFailureOutcome === undefined ? "cleanMiss" : "localDependencyError",
		};
		const validated = await readAndValidateSummaryDocument({
			...args,
			telemetryDetails: { source: "alfred", ...fallbackDetails },
		});
		if (validated.document.isEphemeralContainer !== true) {
			logAllowed(args, identity.documentId, "alfred", fallbackDetails);
			return contextFromDocument(
				validated.document,
				"alfred",
				args.ignoreEphemeralFlag ?? false,
			);
		}
		if (localFailureOutcome !== undefined) {
			throw new NetworkError(503, "Ephemeral summary access state is unavailable.");
		}

		let activation: ActivateSummaryAccessResult | "writeError";
		try {
			activation = await args.accessStore.activateSummaryAccessIfNotDeleted(
				args.tenantId,
				identity.documentId,
				validated.document.createTime,
				expiresAtFor(validated.document.createTime),
			);
		} catch (error) {
			activation = "writeError";
			logSummaryOwnershipOutcome(
				args.tenantId,
				identity.documentId,
				args.operation,
				args.routeType,
				"dependencyError",
				error,
				{
					source: "alfred",
					...fallbackDetails,
					activationOutcome: "writeError",
				},
			);
		}
		if (activation === "deleted") {
			return denySummaryDocumentAccess(
				args.tenantId,
				identity.documentId,
				args.operation,
				args.routeType,
				"notFound",
				{
					source: "alfred",
					...fallbackDetails,
					activationOutcome: "deleted",
				},
			);
		}

		logAllowed(args, identity.documentId, "alfred", {
			...fallbackDetails,
			activationOutcome: activation,
		});
		return contextFromDocument(validated.document, "alfred", args.ignoreEphemeralFlag ?? false);
	}

	const validated = await readAndValidateSummaryDocument({
		...args,
		telemetryDetails: { source: "alfred" },
	});
	logAllowed(args, identity.documentId, "alfred");
	return contextFromDocument(validated.document, "alfred", args.ignoreEphemeralFlag ?? false);
}
