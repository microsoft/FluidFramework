/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocumentContext } from "@fluidframework/server-lambdas-driver";
import {
	IServiceConfiguration,
	LambdaCloseType,
	NackMessagesType,
} from "@fluidframework/server-services-core";
import {
	CommonProperties,
	getLumberBaseProperties,
	Lumber,
	LumberEventName,
	Lumberjack,
	SessionState,
} from "@fluidframework/server-services-telemetry";

// TODO: documentation
// eslint-disable-next-line jsdoc/require-description
/**
 * @internal
 */
export const createSessionMetric = <T extends string = LumberEventName>(
	tenantId: string,
	documentId: string,
	lumberEventName: T,
	serviceConfiguration: IServiceConfiguration,
	isEphemeralContainer: boolean = false,
): Lumber<T> | undefined => {
	if (!serviceConfiguration.enableLumberjack) {
		return undefined;
	}

	const sessionMetric = Lumberjack.newLumberMetric(lumberEventName);
	sessionMetric?.setProperties({
		...getLumberBaseProperties(documentId, tenantId),
		[CommonProperties.isEphemeralContainer]: isEphemeralContainer,
	});

	return sessionMetric;
};

// TODO: documentation
// eslint-disable-next-line jsdoc/require-description
/**
 * @internal
 */
export const logCommonSessionEndMetrics = (
	context: DocumentContext,
	closeType: LambdaCloseType,
	sessionMetric: Lumber | undefined,
	sequenceNumber: number,
	lastSummarySequenceNumber: number,
	activeNackMessageTypes: NackMessagesType[] | undefined,
): void => {
	if (!sessionMetric) {
		return;
	}

	const contextError = context.getContextError();

	sessionMetric.setProperties({ [CommonProperties.sessionEndReason]: closeType });
	sessionMetric.setProperties({ [CommonProperties.sessionState]: SessionState.end });
	sessionMetric.setProperties({ [CommonProperties.sequenceNumber]: sequenceNumber });
	sessionMetric.setProperties({
		[CommonProperties.lastSummarySequenceNumber]: lastSummarySequenceNumber,
	});

	if (contextError) {
		sessionMetric.error(`Session terminated due to ${contextError}`);
	} else if (closeType === LambdaCloseType.Error) {
		sessionMetric.error("Session terminated due to error");
	} else if (
		!closeType ||
		closeType === LambdaCloseType.Stop ||
		closeType === LambdaCloseType.Rebalance
	) {
		Lumberjack.info("Session Paused", sessionMetric?.properties);
	} else if (closeType === LambdaCloseType.ActivityTimeout) {
		if (activeNackMessageTypes?.includes(NackMessagesType.SummaryMaxOps)) {
			sessionMetric.error(
				"Session terminated due to inactivity while exceeding max ops since last summary",
			);
		} else {
			sessionMetric.success("Session terminated due to inactivity");
		}
	} else {
		sessionMetric.error("Unknown session end state");
	}
};
