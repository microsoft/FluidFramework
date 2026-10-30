/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ISummaryBlob,
	SummaryType,
	type ISummaryTree,
} from "@fluidframework/driver-definitions";
import type { ISummaryContext } from "@fluidframework/driver-definitions/internal";

import type {
	IApplicationSummaryProjection,
	IApplicationSummaryProjectionContext,
	IApplicationSummaryProjectionResult,
} from "../../summary/index.js";

/**
 * Sample application state with two independently projected subtrees.
 * A real application would derive these strings from DDS content such as SharedTree subtrees.
 */
export interface ITwoProjectionState {
	left: string;
	right: string;
}

/**
 * Minimal sample showing how an application can project two blobs and reuse unchanged content via handles.
 */
export class TwoBlobApplicationSummaryProjectionSample {
	private acceptedState: ITwoProjectionState | undefined;
	private acceptedSummary: ISummaryContext | undefined;
	private acceptedCount = 0;

	public constructor(private state: ITwoProjectionState) {}

	public update(next: Partial<ITwoProjectionState>): void {
		this.state = { ...this.state, ...next };
	}

	public get onAcceptedCount(): number {
		return this.acceptedCount;
	}

	public get projection(): IApplicationSummaryProjection {
		return {
			key: "appProjection",
			summarize: (context) => this.summarize(context),
		};
	}

	private summarize(
		context: IApplicationSummaryProjectionContext,
	): IApplicationSummaryProjectionResult {
		const capturedState = { ...this.state };
		const summary: ISummaryTree = {
			type: SummaryType.Tree,
			tree: {
				left: this.createBlobOrHandle("left", capturedState.left, context),
				right: this.createBlobOrHandle("right", capturedState.right, context),
			},
		};
		return {
			summary,
			onAccepted: (acceptedContext) => {
				this.acceptedState = capturedState;
				this.acceptedSummary = acceptedContext;
				this.acceptedCount++;
			},
		};
	}

	private createBlobOrHandle(
		key: keyof ITwoProjectionState,
		content: string,
		context: IApplicationSummaryProjectionContext,
	):
		| ISummaryBlob
		| { type: SummaryType.Handle; handleType: SummaryType.Blob; handle: string } {
		if (
			!context.fullTree &&
			this.acceptedSummary !== undefined &&
			context.previousSummary?.ackHandle === this.acceptedSummary.ackHandle &&
			this.acceptedState?.[key] === content
		) {
			return {
				type: SummaryType.Handle,
				handleType: SummaryType.Blob,
				handle: `/${this.projection.key}/${key}`,
			};
		}
		return {
			type: SummaryType.Blob,
			content,
		};
	}
}
