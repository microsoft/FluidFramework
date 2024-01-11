/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { KeyboardEventHandler, useEffect, useRef, useState } from "react";

import { FlowDocument } from "../document/index.js";
import { Editor } from "../editor/index.js";
import { htmlFormatter } from "../html/formatters.js";
import { ICommand, TagName } from "../util/index.js";
import { IFormatterState, RootFormatter } from "../view/formatter.js";
import { debug } from "./debug.js";
// eslint-disable-next-line import/no-unassigned-import
import "./index.css";
// eslint-disable-next-line import/no-unassigned-import
import "./debug.css";
import { SearchMenuView } from "./searchmenu/index.js";

const always = () => true;

interface IWebflowViewProps {
	docP: Promise<FlowDocument>;
}

export const WebflowView: React.FC<IWebflowViewProps> = (props: IWebflowViewProps) => {
	const { docP } = props;

	const [flowDocument, setFlowDocument] = useState<FlowDocument | undefined>(undefined);
	const previouslyFocused = useRef<HTMLOrSVGElement | undefined>(undefined);
	const slotElementRef = useRef<HTMLParagraphElement>(null);
	const searchElementRef = useRef<HTMLDivElement>(null);
	const searchMenuRef = useRef<SearchMenuView | undefined>(undefined);

	useEffect(() => {
		docP.then(setFlowDocument).catch((e) => {
			console.error("Flow document promise rejected", e);
		});
	}, [docP]);

	useEffect(() => {
		if (flowDocument === undefined) {
			return;
		}

		if (slotElementRef.current === null) {
			throw new Error("Null slot element");
		}

		let editor = new Editor(flowDocument, slotElementRef.current, htmlFormatter);
		const hasSelection = () => {
			const { start, end } = editor.selection;
			return start < end;
		};
		const setFormat = (tag: TagName) => {
			const { end } = editor.selection;

			// Note that calling 'setFormat(..)' with the position of a paragraph marker will change the block
			// format of that marker.  This looks unnatural to the user, since the caret is still at the end of
			// the text on the previous line, hence the '- 1'.
			flowDocument.setFormat(end - 1, tag);
		};
		const toggleSelection = (className: string) => {
			const { start, end } = editor.selection;
			flowDocument.toggleCssClass(start, end, className);
		};
		const switchFormatter = (formatter: Readonly<RootFormatter<IFormatterState>>) => {
			editor.remove();
			if (slotElementRef.current === null) {
				throw new Error("Null slot element");
			}
			editor = new Editor(flowDocument, slotElementRef.current, formatter);
		};
		const setStyle = (style: string) => {
			const { start, end } = editor.selection;
			flowDocument.setCssStyle(start, end, style);
		};
		const toggleDebug = () => {
			if (slotElementRef.current === null) {
				throw new Error("Null slot element");
			}
			slotElementRef.current.toggleAttribute("data-debug");
		};

		if (searchElementRef.current === null) {
			throw new Error("Null search element");
		}
		searchMenuRef.current = new SearchMenuView();
		searchMenuRef.current.attach(searchElementRef.current, {
			commands: [
				{
					name: "blockquote",
					enabled: always,
					exec: () => {
						setFormat(TagName.blockquote);
					},
				},
				{ name: "bold", enabled: hasSelection, exec: () => toggleSelection("bold") },
				{
					name: "debug",
					enabled: always,
					exec: () => {
						toggleDebug();
					},
				},
				{
					name: "h1",
					enabled: always,
					exec: () => {
						setFormat(TagName.h1);
					},
				},
				{
					name: "h2",
					enabled: always,
					exec: () => {
						setFormat(TagName.h2);
					},
				},
				{
					name: "h3",
					enabled: always,
					exec: () => {
						setFormat(TagName.h3);
					},
				},
				{
					name: "h4",
					enabled: always,
					exec: () => {
						setFormat(TagName.h4);
					},
				},
				{
					name: "h5",
					enabled: always,
					exec: () => {
						setFormat(TagName.h5);
					},
				},
				{
					name: "h6",
					enabled: always,
					exec: () => {
						setFormat(TagName.h6);
					},
				},
				{
					name: "p",
					enabled: always,
					exec: () => {
						setFormat(TagName.p);
					},
				},
				{
					name: "html",
					enabled: always,
					exec: () => {
						switchFormatter(htmlFormatter);
					},
				},
				{
					name: "red",
					enabled: always,
					exec: () => {
						setStyle("color:red");
					},
				},
			],
			onComplete,
		});

		return () => {
			searchMenuRef.current?.detach();
			searchMenuRef.current = undefined;
		};
	}, [flowDocument]);

	const onKeyDown: KeyboardEventHandler<HTMLDivElement> = (e: React.KeyboardEvent) => {
		if (e.ctrlKey && e.key === "m") {
			if (searchMenuRef.current === undefined) {
				throw new Error("Undefined search menu view");
			}
			previouslyFocused.current = document.activeElement as unknown as HTMLOrSVGElement;
			searchMenuRef.current.show();
		}
	};

	const onComplete = (command?: ICommand) => {
		if (command) {
			debug(`Execute Command: ${command.name}`);
			command.exec();
		}

		previouslyFocused.current?.focus();
		previouslyFocused.current = undefined;
	};

	return (
		<div className="host" onKeyDown={onKeyDown}>
			<div className="viewport">
				<p className="slot" ref={slotElementRef}></p>
			</div>
			<div className="search" ref={searchElementRef}></div>
		</div>
	);
};
