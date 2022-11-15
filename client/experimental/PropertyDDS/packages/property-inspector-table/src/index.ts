/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import InspectorTableIcons from "../assets/icons/SVGStoreIcons";
export { InspectorTableIcons };

export { CustomChip } from "./CustomChip";
export { getIconFromTypeId, getDefaultInspectorTableIcons, typeidToIconMap } from "./icons";
export {
    defaultInspectorTableChildGetter,
    defaultInspectorTableDataGetter,
    defaultInspectorTableNameGetter,
    InspectorTable,
} from "./InspectorTable";
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
} from "./InspectorTableTypes";
export { ModalManager, ModalContext, ModalConsumer } from "./ModalManager";
export { ModalRoot } from "./ModalRoot";
export {
    fetchRegisteredTemplates,
    handlePropertyDataCreationOptionGeneration,
    handlePropertyDataCreation,
} from "./PropertyDataCreationHandlers";
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
} from "./propertyInspectorUtils";
export { TypeColumn, useChipStyles } from "./TypeColumn";
export { search, showNextResult } from "./utils";
