/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PropertyProxy } from "@fluid-experimental/property-proxy";
import { storiesOf } from "@storybook/react";
import * as React from "react";
import { MockWorkspace, populateWorkspace } from "../test/common.js";
import { InspectorDecorator } from "./InspectorDecorator.js";
import { InspectorTable } from "./InspectorTable.js";
import { InspectorTableDecorator } from "./InspectorTableDecorator.js";
import { IInspectorTableProps } from "./InspectorTableTypes.js";
import { ModalManager } from "./ModalManager.js";
import { ModalRoot } from "./ModalRoot.js";
import {
	handlePropertyDataCreation,
	handlePropertyDataCreationOptionGeneration,
} from "./PropertyDataCreationHandlers.js";

class Loading extends React.Component<
	Partial<IInspectorTableProps> & {
		empty?: boolean;
		populateFunction: (workspace: MockWorkspace) => void;
	},
	{ initialized: boolean; tableView: string }
> {
	public state = { initialized: false, tableView: "table" };
	private workspace?: any;

	public componentDidMount() {
		if (this.props.empty === undefined) {
			this.workspace = new MockWorkspace();
			this.props.populateFunction(this.workspace);
			this.setState({ initialized: true });
		} else {
			this.setState({ initialized: true });
		}
	}

	public render() {
		return !this.state.initialized ? (
			<div>Loading</div>
		) : (
			<ModalManager>
				<ModalRoot />
				<InspectorTable
					width={800}
					height={600}
					data={
						this.props.empty !== undefined && this.props.empty
							? undefined
							: PropertyProxy.proxify(this.workspace!.getRoot()!)
					}
					columns={["name", "value", "type"]}
					expandColumnKey={"name"}
					dataCreationHandler={handlePropertyDataCreation}
					dataCreationOptionGenerationHandler={handlePropertyDataCreationOptionGeneration}
					{...this.props}
				/>
			</ModalManager>
		);
	}
}

storiesOf("InspectorTable", module)
	.addDecorator(InspectorDecorator)
	.addDecorator(InspectorTableDecorator)
	.add("Default", () => <Loading populateFunction={populateWorkspace} />)
	.add("Not following references", () => (
		<Loading populateFunction={populateWorkspace} followReferences={false} />
	))
	.add("Empty", () => <Loading populateFunction={populateWorkspace} empty={true} />)
	.add("Read Only", () => <Loading populateFunction={populateWorkspace} readOnly={true} />)
	.add("Loading", () => (
		<Loading populateFunction={populateWorkspace} checkoutInProgress={true} />
	));
