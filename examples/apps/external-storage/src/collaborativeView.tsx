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
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { CollaborativeMap } from "./collaborativeMap";
import { CollaborativeDirectory } from "./collaborativeDirectory";
import { CollaborativeCounter } from "./collaborativeCounter";
import { addIcon, buildIcon, clearIcon, marginTop10, standardSidePadding } from "./constants";

export interface CollaborativeProps {
	model: LoadableDataObject;
	handleState: [
		IFluidHandle<LoadableDataObject> | undefined,
		React.Dispatch<React.SetStateAction<IFluidHandle<LoadableDataObject> | undefined>>,
	];
}

export const CollaborativeView = (props: CollaborativeProps) => {
	const [value, setValue] = React.useState("");
	const [childDataObjects, setDataObjects] = React.useState([...props.model.dataObjects]);
	const [childSharedObjects, setSharedObjects] = React.useState([...props.model.sharedObjects]);
	const [handle, setHandle] = props.handleState;

	const getLocalDataObjectAsync = async (model: LoadableDataObject) => {
		// unfortunately we need to update the tree twice, once for the tree, twice for the handles
		await model.toRawLocalDataObject([""]);
		const localDataObject = await model.toLocalDataObject();
		const serializableDataObject = makeSerializableDataObject(localDataObject);
		setValue(JSON.stringify(serializableDataObject, undefined, 4));
	};
	const serialize = () => {
		getLocalDataObjectAsync(props.model).catch((error) => console.log(error));
	};
	const clear = () => {
		setValue("");
		props.model.clear();
	};
	const addDataObject = () => {
		props.model.createChildDataObject(`${childDataObjects.length}`);
	};

	const addSharedObject = (item: IContextualMenuItem | undefined) => {
		console.log(item);
		if (item === undefined) return;
		props.model.createChildSharedObject(item.key);
	};

	const actOnDataObject = (item: IContextualMenuItem | undefined) => {
		if (item === undefined) return;
		switch (item.key) {
			case "Serialize":
				serialize();
				break;
			case "Clear":
				clear();
				break;
			case "Pick Handle":
				setHandle(props.model.handle);
				break;
			case "Store Handle":
				if (handle === undefined) return;
				props.model.addReferenceHandle(handle?.absolutePath, handle);
				break;
			default:
				break;
		}
	};

	const actMenuProps: IContextualMenuProps = {
		// For example: disable dismiss if shift key is held down while dismissing
		onItemClick: (ev, item) => actOnDataObject(item),
		items: [
			{
				key: "Serialize",
				text: "Serialize",
				iconProps: buildIcon,
			},
			{
				key: "Clear",
				text: "Clear",
				iconProps: clearIcon,
			},
			{
				key: "Pick Handle",
				text: "Pick Handle",
				iconProps: { iconName: "Touch" },
			},
			{
				key: "Store Handle",
				text: "Store Handle",
				iconProps: { iconName: "Subscribe" },
			},
		],
		directionalHintFixed: true,
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

	const showHandleAsync = async (childHandle: IFluidHandle<LoadableDataObject>) => {
		const model = await childHandle.get();
		const localDataObject = await model.toRawLocalDataObject([""]);
		const serializableDataObject = makeSerializableDataObject(localDataObject);
		setValue(JSON.stringify(serializableDataObject, undefined, 4));
	};

	const showHandle = (item: IContextualMenuItem | undefined) => {
		if (item === undefined) return;
		const childHandle = props.model.getHandle(item.key);
		if (childHandle === undefined) {
			console.log(`handle missing ${item.key}`);
			return;
		}
		showHandleAsync(childHandle).catch((error) => console.log(error));
	};

	const handleMenuProps: IContextualMenuProps = {
		// For example: disable dismiss if shift key is held down while dismissing
		onItemClick: (_, item) => showHandle(item),
		items: props.model.handles.map(([key, _]) => {
			return {
				key,
				text: key,
				iconProps: { iconName: "POI" },
			};
		}),
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
								<CollaborativeView model={child} handleState={props.handleState} />
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
				<PrimaryButton
					text="Handles"
					iconProps={{ iconName: "SetAction" }}
					menuProps={handleMenuProps}
				/>
			</div>

			<div style={marginTop10}>
				<DefaultButton
					text="Act on Data Object"
					iconProps={{ iconName: "SetAction" }}
					menuProps={actMenuProps}
				/>
			</div>
			{value !== "" ? <pre>{value}</pre> : null}
		</div>
	);
};
