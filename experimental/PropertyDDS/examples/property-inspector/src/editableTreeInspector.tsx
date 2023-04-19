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
	ValueSchema,
	ContextuallyTypedNodeDataObject,
	isWritableArrayLike,
	ISharedTree,
	TreeSchemaIdentifier,
	parentField,
	getPrimaryField,
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
	FieldAction,
	NodeAction,
	forEachField,
	forEachNode,
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

const tableProps: Partial<IInspectorTableProps> = {
	columns: ["name", "value", "type"],
	dataCreationHandler: async (
		rowData: IEditableTreeRow,
		name: string,
		typeid: string,
		context: string,
	) => {
		const typeName = brand<TreeSchemaIdentifier>(typeid);
		try {
			if (isUnwrappedNode(rowData.parent)) {
				const fieldKey = brand<FieldKey>(name);
				(rowData.parent as ContextuallyTypedNodeDataObject)[fieldKey] = getNewNodeData(
					rowData.sharedTree,
					context === "single"
						? typeName
						: brand<TreeSchemaIdentifier>(`${context}<${typeid}>`),
				);
			} else {
				assert(isWritableArrayLike(rowData.parent), "expected writable ArrayLike");
				rowData.parent[Number(name)] = getNewNodeData(rowData.sharedTree, typeName);
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
		return expandField({}, data, root, "");
	},
};

const expandNode: NodeAction<IExpandedMap> = (
	expanded: IExpandedMap,
	sharedTree: ISharedTree,
	node: EditableTree,
	pathPrefix: string,
) => {
	const { parent, index } = node[parentField];
	const id = getRowId(parent.fieldKey, pathPrefix, index);
	const nodeType = node[typeSymbol];
	// TODO: e.g., how to properly schematize maps (`Serializable`)?
	if (!isPrimitive(nodeType) || nodeType.value === ValueSchema.Serializable) {
		expanded[id] = true;
	}
	forEachField(expandField, expanded, sharedTree, node, id);
};

const expandField: FieldAction<IExpandedMap> = (
	expanded: IExpandedMap,
	sharedTree: ISharedTree,
	field: EditableField,
	pathPrefix: string,
) => {
	return forEachNode(expandNode, expanded, sharedTree, field, pathPrefix);
};

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

// TODO: maybe discuss alternatives on how global fields must be converted into row IDs.
// Global fields in runtime are used as follows:
// - as `GlobalFieldKeySymbol` (a symbol) => `Symbol(myGlobalField)` - used to read the tree data;
// - as `GlobalFieldKey` (a string) => `myGlobalField` - used in `TreeSchema` and `JsonableTree`,
// since global and local fields there are structurally separated.
// Here we use "Symbol(myGlobalField)" (and not "myGlobalField") as a unique ID for this field,
// since then a name clashing occurs iff one defines a local field "Symbol(myGlobalField)" for the same node,
// and it will be more probable if we'll use just a string "myGlobalField" instead.
// We might introduce a new special syntax for the IDs of global fields to avoid clashing,
// but it seems that the default syntax already provides a very good safeguard though.
const getRowId = (fieldKey: FieldKey, pathPrefix: string, nodeIndex?: number): string =>
	`${pathPrefix}/${String(fieldKey)}${nodeIndex ? `[${nodeIndex}]` : ""}`;

const nodeToTableRow: NodeAction<IEditableTreeRow[]> = (
	rows: IEditableTreeRow[],
	sharedTree: ISharedTree,
	data: EditableTree,
	pathPrefix: string,
) => {
	const { parent, index } = data[parentField];
	const fieldKey = parent.fieldKey;
	const id = getRowId(fieldKey, pathPrefix, index);
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
	// An addition `context !== "single"` is required since currently
	// maps are considered to be primitive objects. tbd.
	if (!isPrimitive(nodeType) || context !== "single") {
		newRow.children = forEachField(fieldToTableRow, [], sharedTree, data, id);
		// Do not allow to create fields under a node having a primary field.
		if (getPrimaryField(nodeType) === undefined) {
			addNewDataLine(newRow.children, sharedTree, data, id);
		}
	}
	rows.push(newRow);
};

const fieldToTableRow: FieldAction<IEditableTreeRow[]> = (
	rows: IEditableTreeRow[],
	sharedTree: ISharedTree,
	field: EditableField,
	pathPrefix: string,
) => {
	const isSequence = isSequenceField(field);
	// skip root and primary field sequences, as they don't require to render field rows
	if (isSequence && field.parent && getPrimaryField(field.parent[typeSymbol]) === undefined) {
		const id = getRowId(field.fieldKey, pathPrefix);
		const children = forEachNode(nodeToTableRow, [], sharedTree, field, id);
		addNewDataLine(children, sharedTree, field, id);
		const fieldTypes: TreeSchemaIdentifier[] = [];
		if (field.fieldSchema.types) {
			field.fieldSchema.types.forEach((type) => fieldTypes.push(type));
		} else {
			fieldTypes.push(brand("any"));
		}
		assert(fieldTypes.length === 1, "Polymorphic fields are not supported yet");
		const newRow: IEditableTreeRow = {
			id,
			name: stringifyKey(field.fieldKey),
			context: "single",
			isReference: false,
			typeid: `sequence<${fieldTypes[0]}>`,
			parent: field.parent,
			data: field,
			sharedTree,
			children,
		};
		rows.push(newRow);
	} else {
		forEachNode(nodeToTableRow, rows, sharedTree, field, pathPrefix);
		if (isEmptyRoot(field) || isSequence) {
			addNewDataLine(rows, sharedTree, field, pathPrefix);
		}
	}
	return rows;
};

const editableTreeTableProps: Partial<IInspectorTableProps> = {
	...tableProps,
	columnsRenderers: {
		name: nameCellRenderer,
		value: valueCellRenderer,
		type: typeCellRenderer,
	},
	toTableRows: ({ data }: { data: ISharedTree }): IEditableTreeRow[] => {
		return fieldToTableRow([], data, data.context.root, "");
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
