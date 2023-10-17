/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	getTextAndMarkers,
	MergeTreeDeltaType,
	TextSegment,
	ReferenceType,
	reservedTileLabelsKey,
	Marker,
} from "@fluidframework/sequence";

import React, { useEffect, useRef } from "react";
import SimpleMDE from "simplemde";

import { SmdeDataObject } from "./smde";

// eslint-disable-next-line import/no-internal-modules, import/no-unassigned-import
import "simplemde/dist/simplemde.min.css";

class SmdeView {
	private textArea: HTMLTextAreaElement | undefined;
	private smde: SimpleMDE | undefined;

	public constructor(private readonly smdeDataObject: SmdeDataObject) {}

	public render(elm: HTMLElement): void {
		// Create base textarea
		if (!this.textArea) {
			this.textArea = document.createElement("textarea");
		}

		// Reparent if needed
		if (this.textArea.parentElement !== elm) {
			this.textArea.remove();
			elm.appendChild(this.textArea);
		}

		if (!this.smde) {
			this.setupEditor();
		}
	}

	private setupEditor() {
		const smde = new SimpleMDE({ element: this.textArea });
		this.smde = smde;

		const { parallelText } = getTextAndMarkers(this.smdeDataObject.text, "pg");
		const text = parallelText.join("\n");
		this.smde.value(text);

		let localEdit = false;

		this.smdeDataObject.text.on("sequenceDelta", (ev) => {
			// We assume local modifications to the string were already applied to the editor (because they were typed there by the user), so there's nothing to do.
			if (ev.isLocal) {
				return;
			}

			localEdit = true;
			for (const range of ev.ranges) {
				const segment = range.segment;

				if (range.operation === MergeTreeDeltaType.INSERT) {
					if (TextSegment.is(segment)) {
						// TODO need to count markers
						smde.codemirror.replaceRange(
							segment.text,
							smde.codemirror.posFromIndex(range.position),
						);
					} else if (Marker.is(segment)) {
						smde.codemirror.replaceRange(
							"\n",
							smde.codemirror.posFromIndex(range.position),
						);
					}
				} else if (range.operation === MergeTreeDeltaType.REMOVE) {
					if (TextSegment.is(segment)) {
						const textSegment = range.segment as TextSegment;
						smde.codemirror.replaceRange(
							"",
							smde.codemirror.posFromIndex(range.position),
							smde.codemirror.posFromIndex(range.position + textSegment.text.length),
						);
					} else if (Marker.is(segment)) {
						smde.codemirror.replaceRange(
							"",
							smde.codemirror.posFromIndex(range.position),
							smde.codemirror.posFromIndex(range.position + 1),
						);
					}
				}
			}
			localEdit = false;
		});

		this.smde.codemirror.on("beforeChange", (instance, changeObj) => {
			if (localEdit) {
				return;
			}

			// We add in line to adjust for paragraph markers
			let from = instance.doc.indexFromPos(changeObj.from);
			const to = instance.doc.indexFromPos(changeObj.to);

			if (from !== to) {
				this.smdeDataObject.text.removeText(from, to);
			}

			const changedText = changeObj.text as string[];
			changedText.forEach((value, index) => {
				// Insert the updated text
				if (value) {
					this.smdeDataObject.text.insertText(from, value);
					from += value.length;
				}

				// Add in a paragraph marker if this is a multi-line update
				if (index !== changedText.length - 1) {
					this.smdeDataObject.text.insertMarker(from, ReferenceType.Tile, {
						[reservedTileLabelsKey]: ["pg"],
					});
					from++;
				}
			});
		});
	}
}

/**
 * Props for creating an SmdeReactView.
 */
export interface ISmdeReactViewProps {
	readonly smdeDataObject: SmdeDataObject;
}

/**
 * A React view that may be applied to an SmdeDataObject to render it and allow editing.
 */
export const SmdeReactView: React.FC<ISmdeReactViewProps> = (props: ISmdeReactViewProps) => {
	const { smdeDataObject } = props;
	const htmlView = useRef<SmdeView>(new SmdeView(smdeDataObject));
	const divRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (divRef.current !== null) {
			htmlView.current.render(divRef.current);
		}
	}, [divRef.current]);
	return <div ref={divRef}></div>;
};
