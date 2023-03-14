/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Stack, StackItem } from "@fluentui/react";
import React from "react";

import {
	ISummaryAttachment,
	ISummaryBlob,
	ISummaryHandle,
	ISummaryTree,
	SummaryObject,
	SummaryType,
} from "@fluidframework/protocol-definitions";

import { Accordion } from "../utility-components";
import { RecordDataView } from "./RecordView";

/**
 * Base props interface for {@link @fluidframework/protocol-definitions#SummaryObject} data visualization components.
 */
export interface SummaryPropsBase<TSummaryObject extends SummaryObject> {
	/**
	 * Fluid summary data.
	 */
	summary: TSummaryObject;
}

/**
 * {@link SummaryTreeView} input props.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SummaryTreeViewProps extends SummaryPropsBase<ISummaryTree> {}

/**
 * Renders a tree-like visualization of the provided Container data summary.
 */
export function SummaryTreeView(props: SummaryTreeViewProps): React.ReactElement {
	const { summary } = props;

	const children = Object.entries(summary.tree);

	if (children.length === 0) {
		return <></>;
	}

	const renderedChildren = children.map(([key, value]) => {
		return (
			<StackItem key={key}>
				<Accordion header={key}>
					<SummaryObjectView summary={value} />
				</Accordion>
			</StackItem>
		);
	});

	return <Stack>{renderedChildren}</Stack>;
}

/**
 * {@link SummaryObjectView} input props.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SummaryObjectViewProps extends SummaryPropsBase<SummaryObject> {}

/**
 * Visualization handler for general {@link @fluidframework/protocol-definitions#SummaryObject}s.
 */
export function SummaryObjectView(props: SummaryObjectViewProps): React.ReactElement {
	const { summary } = props;
	switch (summary.type) {
		case SummaryType.Attachment:
			return <SummaryAttachmentView summary={summary} />;
		case SummaryType.Blob:
			return <SummaryBlobView summary={summary} />;
		case SummaryType.Handle:
			return <SummaryHandleView summary={summary} />;
		case SummaryType.Tree:
			return <SummaryTreeView summary={summary} />;
		default:
			throw new Error("Unrecognized SummaryObject type.");
	}
}

/**
 * {@link SummaryBlobView} input props.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SummaryBlobViewProps extends SummaryPropsBase<ISummaryBlob> {}

/**
 * Visualization handler for {@link @fluidframework/protocol-definitions#SummaryBlob}s.
 */
export function SummaryBlobView(props: SummaryBlobViewProps): React.ReactElement {
	const { summary } = props;

	if (typeof summary.content === "string") {
		const parsedContent = JSON.parse(summary.content) as Record<
			string | number | symbol,
			unknown
		>;
		return <RecordDataView data={parsedContent} renderOptions={{}} />;
	} else {
		// Otherwise, content is a binary blob, which we can just dump.
		// Likely not particularly useful, but probably better than not displaying anything?
		return <div>{summary.content}</div>;
	}
}

/**
 * {@link SummaryAttachmentView} input props.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SummaryAttachmentViewProps extends SummaryPropsBase<ISummaryAttachment> {}

/**
 * Visualization handler for {@link @fluidframework/protocol-definitions#SummaryAttachment}s.
 */
export function SummaryAttachmentView(props: SummaryAttachmentViewProps): React.ReactElement {
	const { summary } = props;
	return <div>{summary.id}</div>;
}

/**
 * {@link SummaryHandleView} input props.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SummaryHandleViewProps extends SummaryPropsBase<ISummaryHandle> {}

/**
 * Visualization handler for {@link @fluidframework/protocol-definitions#SummaryAttachment}s.
 */
export function SummaryHandleView(props: SummaryHandleViewProps): React.ReactElement {
	const { summary } = props;

	// TODO: link to the data location in the tree.
	return <div>{summary.handle}</div>;
}
