/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { CollaborativeTextArea, SharedStringHelper } from "@fluid-experimental/react-inputs";
import { makeSerializableDataObject, LoadableDataObject } from "@fluid-experimental/to-non-fluid";
import { SharedCounter } from "@fluidframework/counter";
import { SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import {
	DefaultButton,
	IContextualMenuItem,
	IContextualMenuProps,
	PrimaryButton,
	Stack,
} from "@fluentui/react";
import {
	Accordion,
	AccordionHeader,
	AccordionItem,
	AccordionPanel,
} from "@fluentui/react-components";
import {
	ArchiveRegular,
	ArrowFlowUpRightRectangleMultipleRegular,
	DrawTextRegular,
	NumberSymbolRegular,
	RocketRegular,
} from "@fluentui/react-icons";
import { CollaborativeMap } from "./collaborativeMap";
import { CollaborativeDirectory } from "./collaborativeDirectory";
import { CollaborativeCounter } from "./collaborativeCounter";
import {
	addIcon,
	buildIcon,
	clearIcon,
	marginTop10,
	stackTokens,
	standardSidePadding,
} from "./constants";

export interface CollaborativeProps {
	model: LoadableDataObject;
}

export const CollaborativeView = (props: CollaborativeProps) => {
	const [value, setValue] = React.useState("");
	const [childDataObjects, setDataObjects] = React.useState([...props.model.dataObjects]);
	const [childSharedObjects, setSharedObjects] = React.useState([...props.model.sharedObjects]);

	const getLocalDataObjectAsync = async () => {
		await props.model.toRawLocalDataObject([""]);
		const localDataObject = await props.model.toLocalDataObject();
		const serializableDataObject = makeSerializableDataObject(localDataObject);
		setValue(JSON.stringify(serializableDataObject, undefined, 4));
	};
	const serialize = () => {
		getLocalDataObjectAsync().catch((error) => console.log(error));
	};
	const clear = () => {
		setValue("");
	};
	const addDataObject = () => {
		props.model.createChildDataObject(`${childDataObjects.length}`);
	};

	const addSharedObject = (item: IContextualMenuItem | undefined) => {
		console.log(item);
		if (item === undefined) return;
		props.model.createChildSharedObject(item.key);
	};

	const menuProps: IContextualMenuProps = {
		// For example: disable dismiss if shift key is held down while dismissing
		onItemClick: (ev, item) => addSharedObject(item),
		items: [
			{
				key: SharedCounter.getFactory().type,
				text: "SharedCounter",
				iconProps: { iconName: "NumberSymbol" },
			},
			{
				key: SharedDirectory.getFactory().type,
				text: "SharedDirectory",
				iconProps: { iconName: "ModelingView" },
			},
			{
				key: SharedMap.getFactory().type,
				text: "SharedMap",
				iconProps: { iconName: "Nav2DMapView" },
			},
			{
				key: SharedString.getFactory().type,
				text: "SharedString",
				iconProps: { iconName: "InsertTextBox" },
			},
		],
		directionalHintFixed: true,
	};

	React.useEffect(() => {
		const handleSharedObjectChanged = () => {
			setSharedObjects([...props.model.sharedObjects]);
		};
		const handleDataObjectChanged = () => {
			setDataObjects([...props.model.dataObjects]);
		};

		props.model.on("sharedObjectsUpdated", handleSharedObjectChanged);
		props.model.on("dataObjectsUpdated", handleDataObjectChanged);
		return () => {
			props.model.off("sharedObjectsUpdated", handleSharedObjectChanged);
			props.model.off("dataObjectsUpdated", handleDataObjectChanged);
		};
	});

	const textareaStyle: React.CSSProperties = {
		width: "100%",
		height: 150,
		background: "#323130",
		color: "#FFFFFF",
		border: "1px solid #D0D0D0",
	};

	return (
		<div style={standardSidePadding}>
			<Accordion multiple collapsible>
				<PrimaryButton text="Add Data Object" iconProps={addIcon} onClick={addDataObject} />
				{childDataObjects.map((child, index) => {
					const length: number = childSharedObjects.length;
					const i: number = index;
					const newIndex: number = length + i;
					return (
						<AccordionItem value={newIndex} key={newIndex}>
							<AccordionHeader
								icon={<ArchiveRegular />}
							>{`${child.constructor.name} ${index}`}</AccordionHeader>
							<AccordionPanel>
								<CollaborativeView model={child} />
							</AccordionPanel>
						</AccordionItem>
					);
				})}
				<div style={marginTop10}>
					<PrimaryButton
						text="Add Shared Object"
						iconProps={addIcon}
						menuProps={menuProps}
					/>
				</div>
				{childSharedObjects.map((child, index) => {
					let childElement: JSX.Element;
					switch (child.attributes.type) {
						case SharedCounter.getFactory().type: {
							childElement = (
								<AccordionItem value={index} key={index}>
									<AccordionHeader icon={<NumberSymbolRegular />}>
										{`${child.constructor.name} ${index}`}
									</AccordionHeader>
									<AccordionPanel>
										<CollaborativeCounter data={child as SharedCounter} />
									</AccordionPanel>
								</AccordionItem>
							);
							break;
						}
						case SharedDirectory.getFactory().type: {
							childElement = (
								<AccordionItem value={index} key={index}>
									<AccordionHeader
										icon={<ArrowFlowUpRightRectangleMultipleRegular />}
									>
										{`${child.constructor.name} ${index}`}
									</AccordionHeader>
									<AccordionPanel>
										<CollaborativeDirectory data={child as SharedDirectory} />
									</AccordionPanel>
								</AccordionItem>
							);
							break;
						}
						case SharedString.getFactory().type: {
							const helper = new SharedStringHelper(child as SharedString);
							childElement = (
								<AccordionItem value={index} key={index}>
									<AccordionHeader icon={<DrawTextRegular />}>
										{`${child.constructor.name} ${index}`}
									</AccordionHeader>
									<AccordionPanel>
										<div style={standardSidePadding}>
											<CollaborativeTextArea
												className={"ms-TextField-field field-111"}
												style={textareaStyle}
												sharedStringHelper={helper}
											/>
										</div>
									</AccordionPanel>
								</AccordionItem>
							);
							break;
						}
						case SharedMap.getFactory().type: {
							childElement = (
								<AccordionItem value={index} key={index}>
									<AccordionHeader icon={<RocketRegular />}>
										{`${child.constructor.name} ${index}`}
									</AccordionHeader>
									<AccordionPanel>
										<CollaborativeMap data={child as SharedMap} />
									</AccordionPanel>
								</AccordionItem>
							);
							break;
						}
						default: {
							throw new Error("Unexpected type!");
						}
					}

					return (
						<AccordionItem value={index} key={index}>
							{childElement}
						</AccordionItem>
					);
				})}
			</Accordion>

			<div style={marginTop10}>
				<Stack horizontal tokens={stackTokens}>
					<PrimaryButton text="Serialize" iconProps={buildIcon} onClick={serialize} />
					<DefaultButton text="Clear" iconProps={clearIcon} onClick={clear} />
				</Stack>
			</div>
			{value !== "" ? <pre>{value}</pre> : null}
		</div>
	);
};
