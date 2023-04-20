/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useState } from "react";
import ReactDOM from "react-dom";

import { assert } from "@fluidframework/common-utils";
import {
	EditableTree,
	typeNameSymbol,
	valueSymbol,
	EditableField,
	isPrimitive,
	typeSymbol,
	isUnwrappedNode,
	brand,
	FieldKey,
	ContextuallyTypedNodeDataObject,
	isWritableArrayLike,
	ISharedTree,
	TreeSchemaIdentifier,
	parentField,
	getPrimaryField,
	forEachField,
	cursorFromContextualData,
} from "@fluid-internal/tree";
import {
	IDataCreationOptions,
	IInspectorTableProps,
	InspectorTable,
	ModalManager,
	ModalRoot,
	fetchRegisteredTemplates,
	nameCellRenderer,
	typeCellRenderer,
	valueCellRenderer,
	IEditableTreeRow,
	IExpandedMap,
} from "@fluid-experimental/property-inspector-table";

import { Tabs, Tab, Button, Toolbar } from "@material-ui/core";
import { makeStyles } from "@material-ui/styles";
import { MuiThemeProvider } from "@material-ui/core/styles";

import AutoSizer from "react-virtualized-auto-sizer";

import { theme } from "./theme";
import { getPerson } from "./demoPersonData";
import {
	getNewNodeData,
	isEmptyRoot,
	isSequenceField,
	stringifyKey,
} from "./editableTreeTableUtilities";

const useStyles = makeStyles(
	{
		activeGraph: {
			"flex-basis": "100%",
			"z-index": 1,
		},
		horizontalContainer: {
			display: "flex",
			flex: "1",
		},
		inspectorContainer: {
			"display": "flex",
			"flex-basis": "100%",
			"padding-left": "1px",
		},
		root: {
			"display": "flex",
			"flex-direction": "column",
			"font-family": "ArtifaktElement, Helvetica, Arial",
			"height": "100%",
			"justify-content": "flex-start",
			"overflow": "hidden",
		},
		sideNavContainer: {
			display: "flex",
		},
		verticalContainer: {
			"display": "flex",
			"flex-basis": "100%",
			"flex-direction": "column",
			"justify-content": "space-between",
		},
		tableContainer: {
			display: "flex",
			height: "100%",
			width: "100%",
		},
		editor: {
			container: {
				width: "100%",
			},
			body: {
				width: undefined,
				display: "flex",
			},
			outerBox: {
				width: "100%",
			},
			contentBox: {
				width: undefined,
				flex: 1,
			},
			warningBox: {
				width: "100%",
			},
		},
	},
	{ name: "InspectorApp" },
);

export const handleDataCreationOptionGeneration = (
	rowData: IEditableTreeRow,
	nameOnly: boolean,
): IDataCreationOptions => {
	if (nameOnly) {
		return { name: "property" };
	}
	const templates = fetchRegisteredTemplates();
	return { name: "property", options: templates };
};

/**
 * Current inspector implementation for the SharedTree does not support
 * the following features (partially including already listed in the schemaConverter):
 * - constants
 * - references
 * - default values for primitives other than the hardcoded `defaultPrimitiveValues` below
 * - enums
 * - polymorphic types (also, it's not supported by the PropertyDDS, in general)
 */

interface IEditableTreeRowOptions {
	sharedTree: ISharedTree;
	pathPrefix: string;
}

const tableProps: Partial<IInspectorTableProps> = {
	columns: ["name", "value", "type"],
	dataCreationHandler: async (
		rowData: IEditableTreeRow,
		name: string,
		typeid: string,
		context: string,
	) => {
		const { parent, sharedTree } = rowData;
		const typeName = brand<TreeSchemaIdentifier>(typeid);
		try {
			if (isUnwrappedNode(parent)) {
				const fieldKey = brand<FieldKey>(name);
				(parent as ContextuallyTypedNodeDataObject)[fieldKey] = getNewNodeData(
					sharedTree,
					context === "single"
						? typeName
						: brand<TreeSchemaIdentifier>(`${context}<${typeid}>`),
				);
			} else {
				assert(isWritableArrayLike(parent), "expected writable ArrayLike");
				parent.insertNodes(
					Number(name),
					cursorFromContextualData(
						sharedTree.storedSchema,
						parent.fieldSchema.types,
						getNewNodeData(sharedTree, typeName),
					),
				);
			}
		} catch (e) {
			console.error(e);
		}
	},
	dataCreationOptionGenerationHandler: handleDataCreationOptionGeneration,
	expandColumnKey: "name",
	width: 1000,
	height: 600,
	expandAll: (data: ISharedTree): IExpandedMap => {
		const { root } = data.context;
		return expandField(root, {}, { sharedTree: data, pathPrefix: "" });
	},
};

function expandNode(
	node: EditableTree,
	expanded: IExpandedMap,
	options: IEditableTreeRowOptions,
): IExpandedMap {
	const { sharedTree, pathPrefix } = options;
	const { parent, index } = node[parentField];
	const id = getRowId(parent, pathPrefix, index);
	if (!isPrimitive(node[typeSymbol])) {
		expanded[id] = true;
	}
	return node[forEachField](expandField, expanded, { sharedTree, pathPrefix: id });
}

function expandField(
	field: EditableField,
	expanded: IExpandedMap,
	options: IEditableTreeRowOptions,
): IExpandedMap {
	const { pathPrefix } = options;
	// skip root and primary field sequences, as they don't have field rows
	if (isSequenceField(field) && field.parent && !getPrimaryField(field.parent[typeSymbol])) {
		const id = getRowId(field, pathPrefix);
		expanded[id] = true;
	}
	return field.forEachNode(expandNode, expanded, options);
}

function addNewDataLine(
	rows: IEditableTreeRow[],
	sharedTree: ISharedTree,
	parent: EditableField | EditableTree,
	pathPrefix: string,
): void {
	rows.push({
		id: `${pathPrefix}/Add`,
		isNewDataRow: true,
		parent,
		value: "",
		typeid: "",
		name: "",
		sharedTree,
	});
}

function getRowId(field: EditableField, pathPrefix: string, nodeIndex?: number): string {
	if (isSequenceField(field) && nodeIndex !== undefined) {
		return `${pathPrefix}[${nodeIndex}]`;
	}
	// TODO: maybe discuss alternatives on how global fields must be converted into row IDs.
	// Global fields are used as follows:
	// - `GlobalFieldKeySymbol` symbol (e.g. `Symbol(myGlobalField)`) is used in the tree data;
	// - `GlobalFieldKey` string (e.g. `myGlobalField`) is used in the `TreeSchema`
	//   and `JsonableTree` since global and local fields there are structurally separated.
	// Here we use `String(fieldKey)` resulting in "Symbol(myGlobalField)" as a unique ID for this field
	// instead of "myGlobalField" (provided by `stringifyKey` function), since otherwise
	// it's less probable for a name clashing to occure e.g.
	// if one defines a local field named "myGlobalField" for the same node.
	// We might introduce a new special syntax for the IDs of global fields to avoid clashing,
	// but it seems that the default syntax already provides a good safeguarding (at least for now).
	return `${pathPrefix}/${String(field.fieldKey)}`;
}

function nodeToTableRow(
	data: EditableTree,
	rows: IEditableTreeRow[],
	options: IEditableTreeRowOptions,
): IEditableTreeRow[] {
	const { sharedTree, pathPrefix } = options;
	const { parent, index } = data[parentField];
	const fieldKey = parent.fieldKey;
	const id = getRowId(parent, pathPrefix, index);
	const keyAsString = parent.parent ? stringifyKey(fieldKey) : "Person";
	const name = isSequenceField(parent) ? `[${index}]` : keyAsString;
	const value = data[valueSymbol];
	const typeid = data[typeNameSymbol];
	const contextAndType = typeid.split("<");
	const context = contextAndType.length > 1 ? contextAndType[0] : "single";
	const newRow: IEditableTreeRow = {
		id,
		name,
		context,
		isReference: false,
		value,
		typeid,
		parent,
		data,
		sharedTree,
	};
	const nodeType = data[typeSymbol];
	if (!isPrimitive(nodeType)) {
		newRow.children = data[forEachField](fieldToTableRow, [], { sharedTree, pathPrefix: id });
		// Do not allow to create fields under a node having a primary field.
		if (getPrimaryField(nodeType) === undefined) {
			addNewDataLine(newRow.children, sharedTree, data, id);
		}
	}
	rows.push(newRow);
	return rows;
}

function fieldToTableRow(
	field: EditableField,
	rows: IEditableTreeRow[],
	options: IEditableTreeRowOptions,
): IEditableTreeRow[] {
	const { sharedTree, pathPrefix } = options;
	const isSequence = isSequenceField(field);
	// skip root and primary field sequences, as they don't require to render field rows
	if (isSequence && field.parent && getPrimaryField(field.parent[typeSymbol]) === undefined) {
		const fieldTypes: TreeSchemaIdentifier[] = [...(field.fieldSchema.types ?? [])];
		// note that "undefined types" means any types hence also polymorphic
		assert(fieldTypes.length === 1, "Polymorphic fields are not supported yet");
		const typeid = `sequence<${fieldTypes[0]}>`;
		const id = getRowId(field, pathPrefix);
		const children = field.forEachNode(nodeToTableRow, [], { sharedTree, pathPrefix: id });
		addNewDataLine(children, sharedTree, field, id);
		const newRow: IEditableTreeRow = {
			id,
			name: stringifyKey(field.fieldKey),
			context: "single",
			isReference: false,
			typeid,
			parent: field.parent,
			data: field,
			sharedTree,
			children,
		};
		rows.push(newRow);
	} else {
		field.forEachNode(nodeToTableRow, rows, options);
		if (isEmptyRoot(field) || isSequence) {
			addNewDataLine(rows, sharedTree, field, pathPrefix);
		}
	}
	return rows;
}

const editableTreeTableProps: Partial<IInspectorTableProps> = {
	...tableProps,
	columnsRenderers: {
		name: nameCellRenderer,
		value: valueCellRenderer,
		type: typeCellRenderer,
	},
	toTableRows: ({ data: sharedTree }: { data: ISharedTree }): IEditableTreeRow[] => {
		return fieldToTableRow(sharedTree.context.root, [], { sharedTree, pathPrefix: "" });
	},
};

interface TabPanelProps {
	children?: React.ReactNode;
	index: number;
	value: number;
}

function TabPanel(props: TabPanelProps) {
	const { children, value, index, ...other } = props;

	return (
		<div role="tabpanel" hidden={value !== index} id={`simple-tabpanel-${index}`} {...other}>
			{value === index && children}
		</div>
	);
}

export const InspectorApp = (props: any) => {
	const classes = useStyles();
	const sharedTree = props.data as ISharedTree;

	// const [json, setJson] = useState(editableTree);
	const [tabIndex, setTabIndex] = useState(0);

	// const onJsonEdit = ({ updated_src }) => {
	//     setJson(updated_src);
	// };

	return (
		<MuiThemeProvider theme={theme}>
			<ModalManager>
				<ModalRoot />
				<div className={classes.root}>
					<div className={classes.horizontalContainer}>
						{/* <div className={classes.editor}>
                            <ReactJson src={json as EditableTree} onEdit={onJsonEdit}/>
                        </div> */}
						<div className={classes.verticalContainer}>
							<Toolbar>
								<Button
									onClick={() =>
										(sharedTree.root = isSequenceField(sharedTree.context.root)
											? [getPerson()]
											: getPerson())
									}
									variant="outlined"
								>
									Demo Person
								</Button>
							</Toolbar>
							<Tabs
								value={tabIndex}
								onChange={(event, newTabIndex) => {
									setTabIndex(newTabIndex);
								}}
							>
								<Tab label="Editable Tree" id="tab-editableTree" />
								{/* <Tab label="JSON" id="tab-json"/> */}
							</Tabs>
							<div className={classes.tableContainer}>
								<AutoSizer>
									{({ width, height }) => (
										<div className={classes.horizontalContainer}>
											{/* <TabPanel value={tabIndex} index={1}>
                                                <InspectorTable
                                                    {...tableProps}
                                                    width={width}
                                                    height={height}
                                                    {...props}
                                                />
                                            </TabPanel> */}
											<TabPanel value={tabIndex} index={0}>
												<InspectorTable
													readOnly={false}
													{...editableTreeTableProps}
													width={width}
													height={height}
													{...props}
													data={sharedTree}
												/>
											</TabPanel>
										</div>
									)}
								</AutoSizer>
							</div>
						</div>
					</div>
				</div>
			</ModalManager>
		</MuiThemeProvider>
	);
};

export function renderApp(sharedTree: ISharedTree) {
	const { context } = sharedTree;
	const t = typeNameSymbol;
	const v = valueSymbol;
	const render = () => {
		context.clear();
		ReactDOM.render(<InspectorApp data={sharedTree} />, document.getElementById("root")!);
	};
	sharedTree.events.on("afterBatch", render);
	render();
}
