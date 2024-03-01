/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import InspectorTableIcons from "../assets/icons/SVGStoreIcons/index.js";
export { InspectorTableIcons };

export { CustomChip } from "./CustomChip.js";
export { getIconFromTypeId, getDefaultInspectorTableIcons, typeidToIconMap } from "./icons.js";
export {
	defaultInspectorTableChildGetter,
	defaultInspectorTableDataGetter,
	defaultInspectorTableNameGetter,
	InspectorTable,
} from "./InspectorTable.js";
export {
	ColumnRendererType,
	IColumns,
	IDataCreationOptions,
	IDataGetterParameter,
	IExpandedMap,
	IEditableValueCellProps,
	IInspectorRow,
	IInspectorColumnsKeys,
	IInspectorTableProps,
	IInspectorSearchAbortHandler,
	IInspectorSearchCallback,
	IInspectorSearchMatch,
	IInspectorSearchMatchMap,
	IInspectorSearchControls,
	IInspectorSearchState,
	IInspectorTableState,
	IRowData,
	IToTableRowsProps,
	IToTableRowsOptions,
	IPropertyToTableRowOptions,
	IShowNextResultResult,
	SearchResult,
} from "./InspectorTableTypes.js";
export { ModalManager, ModalContext, ModalConsumer } from "./ModalManager.js";
export { ModalRoot } from "./ModalRoot.js";
export {
	fetchRegisteredTemplates,
	handlePropertyDataCreationOptionGeneration,
	handlePropertyDataCreation,
} from "./PropertyDataCreationHandlers.js";
export {
	addDataForm,
	collectionChildTableRow,
	dummyChild,
	EditReferenceView,
	expandAll,
	fillExpanded,
	generateForm,
	getCollectionTypeid,
	getDefaultPropertyTableProps,
	getPropertyValue,
	getReferenceValue,
	handleReferencePropertyEdit,
	idSeparator,
	ISanitizer,
	isPrimitive,
	nameCellRenderer,
	typeCellRenderer,
	toTableRows,
	sanitizePath,
	singlePropertyTableRow,
	valueCellRenderer,
} from "./propertyInspectorUtils.js";
export { TypeColumn, useChipStyles } from "./TypeColumn.js";
export { search, showNextResult } from "./utils.js";
