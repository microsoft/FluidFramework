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
	EditableTreeContext,
	keyFromSymbol,
	isEditableField,
	EditableField,
	isGlobalFieldKey,
	symbolIsFieldKey,
	isPrimitive,
	typeSymbol,
	isUnwrappedNode,
	brand,
	FieldKey,
	ValueSchema,
	ContextuallyTypedNodeDataObject,
	isWritableArrayLike,
	PrimitiveValue,
	ISharedTree,
	rootFieldKey,
	symbolFromKey,
	FieldKinds,
	TreeSchemaIdentifier,
	parentField,
	getPrimaryField,
	contextSymbol,
	EmptyKey,
	lookupTreeSchema,
	neverTree,
	SchemaDataAndPolicy,
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
import { addComplexTypeToSchema } from "@fluid-experimental/property-shared-tree-interop";

import { Tabs, Tab, Button, Toolbar } from "@material-ui/core";
import { makeStyles } from "@material-ui/styles";
import { MuiThemeProvider } from "@material-ui/core/styles";

import AutoSizer from "react-virtualized-auto-sizer";

import { theme } from "./theme";
import { getPerson } from "./demoPersonData";

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

const { sequence, value: valueKind } = FieldKinds;
const defaultPrimitiveValues = {
	Bool: false,
	String: "",
	Int8: 0,
	Uint8: 0,
	Int16: 0,
	Uint16: 0,
	Int32: 0,
	Int64: 0,
	Uint64: 0,
	Uint32: 0,
	Float32: 0,
	Float64: 0,
	Reference: "",
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

let sharedTree: ISharedTree;
function getNewNodeData(
	schema: SchemaDataAndPolicy,
	typeName: TreeSchemaIdentifier,
): ContextuallyTypedNodeDataObject {
	const newData = { [typeNameSymbol]: typeName };
	const contextAndType = typeName.split("<");
	if (contextAndType.length > 1) {
		const context = contextAndType[0];
		const subType = contextAndType[1].replace(/>/g, "");
		const treeSchema = lookupTreeSchema(schema, typeName);
		if (treeSchema === neverTree) {
			sharedTree.storedSchema.update(addComplexTypeToSchema(schema, context, brand(subType)));
		}
		if (context === "array") {
			newData[EmptyKey] = [];
		}
		return newData;
	}
	const newTreeSchema = lookupTreeSchema(schema, typeName);
	if (isPrimitive(newTreeSchema)) {
		// avoid `undefined` as not supported by schema and UI
		const defaultValue: PrimitiveValue = defaultPrimitiveValues[typeName];
		newData[valueSymbol] = defaultValue;
	} else {
		newTreeSchema.localFields.forEach((field, key) => {
			if (field.kind.identifier === valueKind.identifier) {
				assert(field.types?.size === 1, "Polymorphic types are not supported yet");
				newData[key] = getNewNodeData(schema, [...field.types][0]);
			}
		});
	}
	return newData;
}

let turnOffRenderOnForestUpdates: () => void | undefined;

const tableProps: Partial<IInspectorTableProps> = {
	columns: ["name", "value", "type"],
	dataCreationHandler: async (
		rowData: IEditableTreeRow,
		name: string,
		typeid: string,
		context: string,
	) => {
		let treeContext: EditableTreeContext;
		// prevent re-render on forest updates while synchronously editing the tree
		if (turnOffRenderOnForestUpdates) turnOffRenderOnForestUpdates();
		const typeName = brand<TreeSchemaIdentifier>(typeid);
		try {
			if (isUnwrappedNode(rowData.parent)) {
				treeContext = rowData.parent[contextSymbol];
				const fieldKey = brand<FieldKey>(name);
				(rowData.parent as ContextuallyTypedNodeDataObject)[fieldKey] = getNewNodeData(
					treeContext.schema,
					context === "single"
						? typeName
						: brand<TreeSchemaIdentifier>(`${context}<${typeid}>`),
				);
			} else {
				assert(isWritableArrayLike(rowData.parent), "expected writable ArrayLike");
				treeContext = rowData.parent.context;
				rowData.parent[Number(name)] = getNewNodeData(treeContext.schema, typeName);
			}
		} catch (e) {
			console.error(e);
			treeContext = isUnwrappedNode(rowData.parent)
				? rowData.parent[contextSymbol]
				: rowData.parent.context;
		}
		// enable re-render on forest updates
		const render = getRenderer(treeContext);
		turnOffRenderOnForestUpdates = treeContext.on("afterDelta", render);
	},
	dataCreationOptionGenerationHandler: handleDataCreationOptionGeneration,
	expandColumnKey: "name",
	width: 1000,
	height: 600,
	expandAll: (data: EditableField): IExpandedMap => {
		assert(isEditableField(data), "wrong root type");
		return forEachNode(expandNode, { data }, {});
	},
};

type nodeAction<T> = (
	result: T,
	parent: EditableField,
	pathPrefix: string,
	node: EditableTree,
	isSequence: boolean,
) => void;
type addOnAction<T> = (result: T, parent: EditableField | EditableTree, pathPrefix: string) => void;

function expandNode(
	expanded: IExpandedMap,
	parent: EditableField,
	pathPrefix: string,
	data: EditableTree,
): void {
	const id = getRowId(parent.fieldKey, data[parentField].index, pathPrefix);
	const nodeType = data[typeSymbol];
	// TODO: e.g., how to properly schematize maps (`Serializable`)?
	if (!isPrimitive(nodeType) || nodeType.value === ValueSchema.Serializable) {
		expanded[id] = true;
	}
	forEachField(expandNode, expanded, { data }, id);
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
const getRowId = (fieldKey: FieldKey, nodeIndex: number, pathPrefix: string): string =>
	`${pathPrefix}/${String(fieldKey)}[${nodeIndex}]`;

function stringifyKey(fieldKey: FieldKey): string {
	if (isGlobalFieldKey(fieldKey) && symbolIsFieldKey(fieldKey)) {
		return keyFromSymbol(fieldKey);
	}
	return fieldKey;
}

function nodeToTableRow(
	rows: IEditableTreeRow[],
	parent: EditableField,
	pathPrefix: string,
	data: EditableTree,
	isSequenceNode = false,
): void {
	const fieldKey = parent.fieldKey;
	const nodeIndex = data[parentField].index;
	const id = getRowId(fieldKey, nodeIndex, pathPrefix);
	// TODO: this is a workaround, which must be replaced with the `EditableTreeUpPath` (not yet implemented)
	// in order to get, if the field is a root field.
	// For `EditableTreeUpPath`, see https://github.com/microsoft/FluidFramework/pull/12810#issuecomment-1303949419
	const keyAsString = pathPrefix === "" ? "Person" : stringifyKey(fieldKey);
	const name = isSequenceNode ? `[${nodeIndex}]` : keyAsString;
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
		isEditableTree: true,
	};
	const nodeType = data[typeSymbol];
	// An addition `context !== "single"` is required since currently
	// maps are considered to be primitive objects. tbd.
	if (!isPrimitive(nodeType) || context !== "single") {
		newRow.children = forEachField(nodeToTableRow, [], { data }, id, addNewDataLine);
		// Prevent to create fields under a node already having a primary field.
		if (getPrimaryField(nodeType) === undefined) {
			addNewDataLine(newRow.children, data, id);
		}
	}
	rows.push(newRow);
}

function addNewDataLine(
	rows: IEditableTreeRow[],
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
		isEditableTree: true,
	});
}

function forEachField<T>(
	nodeAction: nodeAction<T>,
	data: T,
	{ data: node }: Partial<IEditableTreeRow>,
	pathPrefix: string,
	addOnIfSequenceField?: addOnAction<T>,
): T {
	assert(isUnwrappedNode(node), "Expected node");
	for (const field of node) {
		forEachNode(nodeAction, { data: field }, data, pathPrefix, addOnIfSequenceField);
	}
	return data;
}

function isSequenceField(field: EditableField): boolean {
	return field.fieldSchema.kind.identifier === sequence.identifier;
}

function forEachNode<T>(
	nodeAction: nodeAction<T>,
	{ data: field }: Partial<IEditableTreeRow>,
	result: T,
	pathPrefix = "",
	addOnIfSequenceField?: addOnAction<T>,
): T {
	assert(isEditableField(field), "Expected field");
	const isSequence = isSequenceField(field);
	for (let index = 0; index < field.length; index++) {
		const node = field.getNode(index);
		nodeAction(result, field, pathPrefix, node, isSequence);
	}
	if ((isEmptyRoot(field) || isSequence) && addOnIfSequenceField !== undefined) {
		addOnIfSequenceField(result, field, pathPrefix);
	}
	return result;
}

const isEmptyRoot = (field: EditableField): boolean =>
	field.fieldKey === symbolFromKey(rootFieldKey) && field.length === 0;

const editableTreeTableProps: Partial<IInspectorTableProps> = {
	...tableProps,
	columnsRenderers: {
		name: nameCellRenderer,
		value: valueCellRenderer,
		type: typeCellRenderer,
	},
	toTableRows: (rowData: IEditableTreeRow): IEditableTreeRow[] => {
		return forEachNode(nodeToTableRow, rowData, [], "", addNewDataLine);
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
	const context = props.data as EditableTreeContext;
	const { root } = context;

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
									onClick={() => (context.root = getPerson())}
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
													data={root}
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

const getRenderer = (context: EditableTreeContext) => () => {
	context.clear();
	ReactDOM.render(<InspectorApp data={context} />, document.getElementById("root")!);
};

export function renderApp(data: ISharedTree) {
	sharedTree = data;
	const { context } = data;
	const render = getRenderer(context);
	turnOffRenderOnForestUpdates = context.on("afterDelta", render);
	render();
}
