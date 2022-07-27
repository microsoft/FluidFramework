/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { forEachProperty } from "@fluid-experimental/property-binder";
import { TypeIdHelper } from "@fluid-experimental/property-changeset";
import {
  BaseProperty,
  ContainerProperty,
  MapProperty,
  PropertyFactory,
  ReferenceArrayProperty,
  ReferenceMapProperty,
  ReferenceProperty,
} from "@fluid-experimental/property-properties";
import { BaseProxifiedProperty, PropertyProxy } from "@fluid-experimental/property-proxy";
import Tooltip from "@material-ui/core/Tooltip";
import memoize from "memoize-one";
import React from "react";
import Skeleton from "react-loading-skeleton";
import { createStyles, withStyles } from "@material-ui/core";
import { EditableValueCell } from "./EditableValueCell";
import { TypeColumn } from "./TypeColumn";
import { InspectorMessages, minRowWidth, rowWidthInterval } from "./constants";
import { HashCalculator } from "./HashCalculator";
import {
  ColumnRendererType,
  IExpandedMap, IInspectorRow, IInspectorSearchMatch,
  IPropertyToTableRowOptions,
  IToTableRowsOptions, IToTableRowsProps, SearchResult,
} from "./InspectorTableTypes";
import { NameCell } from "./NameCell";
import { Utils } from "./typeUtils";
import { ThemedSkeleton } from "./ThemedSkeleton";
import { NewDataForm } from "./NewDataForm";
import { EditReferencePath } from "./EditReferencePath";
import { getDefaultInspectorTableIcons } from "./icons";

const { isEnumProperty, isEnumArrayProperty, isInt64Property, isReferenceProperty,
  isUint64Property, isCollectionProperty, isReferenceArrayProperty, isReferenceCollectionTypeid,
  isReferenceMapProperty } = Utils;

export const idSeparator = "/";

export const isPrimitive = memoize((typeid: string): boolean => {
  return TypeIdHelper.isPrimitiveType(typeid);
});

const getTypeid = memoize((property: BaseProperty): string => {
  return isEnumProperty(property) || property.getContext() !== "single" ?
    property.getFullTypeid() :
    property.getTypeid();
});

export const getCollectionTypeid = memoize((property: BaseProperty): string => {
  return isEnumArrayProperty(property) ? (property as any).getFullTypeid(true) : property.getTypeid();
});

export const getReferenceValue = (rowData: IInspectorRow) => {
  const parentProp = (rowData.parent! as ContainerProperty);
  let path = "";
  if (Utils.isReferenceCollectionTypeid(getCollectionTypeid(parentProp))) {
    path = parentProp.getValue(rowData.propertyId) as string;
  } else {
    const unresolvedProperty = parentProp.get(
      [rowData.propertyId, BaseProperty.PATH_TOKENS.REF]) as unknown as ReferenceProperty;
    path = unresolvedProperty.getValue() as string;
  }

  return path;
};

const styles = () => createStyles({
  editReferenceContainer: {
    bottom: 32,
    display: "flex",
    justifyContent: "center",
    position: "absolute",
    width: "100%",
  },
});

function editReferenceView({ getReferenceValue, onCancel, onSubmit, editReferenceRowData, classes }) {
  return (<div className={classes.editReferenceContainer}>
    <EditReferencePath
      className={classes.editReference}
      name={editReferenceRowData.name}
      path={getReferenceValue(editReferenceRowData)}
      onCancel={onCancel}
      onEdit={onSubmit} />
  </div>);
}

export const EditReferenceView = withStyles(styles)(editReferenceView);

const getShortId = (parentPath: string, childId: string | undefined = undefined): string => {
  const sanitizer = [
    { searchFor: /[.[]/g, replaceWith: idSeparator },
    { searchFor: /]/g, replaceWith: "" },
    { searchFor: /\/\/+/g, replaceWith: idSeparator },
  ];
  const absolutePath = childId !== undefined ?
    parentPath + idSeparator + childId :
    parentPath;
  const hash = new HashCalculator();
  hash.pushString(sanitizePath(absolutePath, sanitizer));
  return hash.getHash();
};
/**
 * Checks if a row is expandable.
 * @param data - The data of the current row.
 * @param context - The specified context of the row. Will only be used if data is primitive.
 * @param typeid - The specified typeid of the row.
 * @param dataCreation - Indicates if data creation is enabled
 */
const isExpandable = (data: any, context: string, typeid: string, dataCreation: boolean): boolean => {
  context = (data && data.getProperty) ? data.getProperty().getContext() : context;
  // If data creation is enabled everything except primitives is expandable to access the data
  // creation. Otherwise, make sure that properties contain at least one element.
  return dataCreation ? data && (context !== "single" || !isPrimitive(typeid)) :
    data && ((context !== "single" && (data.size > 0 || data.length > 0)) ||
      (!isPrimitive(typeid) && Object.keys(data).length > 0));
};

const addAdditionalRow = (subRows, id, parentProperty) => {
  const undefinedRowData = {
    context: undefined,
    data: undefined,
    id: `${id}/Add`,
    name: "",
    parent: parentProperty,
    typeid: undefined,
    value: undefined,
  };

  const isDefinedParent = parentProperty.getParent() !== undefined;
  const isNotUint64Property = !isUint64Property(parentProperty);
  const isNotInt64Property = !isInt64Property(parentProperty);
  const isNotEnumProperty = !isEnumProperty(parentProperty);

  const canAddData = (isDefinedParent || parentProperty.isRoot()) &&
    (parentProperty.isDynamic() || isCollectionProperty(parentProperty)) &&
    (isNotUint64Property || isNotInt64Property || isNotEnumProperty);

  if (canAddData) {
    subRows.push(undefinedRowData);
  }
};
const compareName = (a: string, b: string) => {
  // ignore upper and lowercase
  const nameA = a.toUpperCase();
  const nameB = b.toUpperCase();
  if (nameA < nameB) {
    return -1;
  }
  if (nameA > nameB) {
    return 1;
  }
  return 0;
};
const compareNameDesc = (a: string, b: string) => {
  return compareName(a, b) * -1;
};

export const dummyChild = {
  children: undefined,
  context: "d",
  id: "d",
  isConstant: false,
  isReference: false,
  name: "d",
  parentId: "d",
  parentIsConstant: false,
  propertyId: "d",
  typeid: "d",
  value: "d",
};
const OPTION_DEFAULTS = { depth: 0, addDummy: true, followReferences: true, ascending: true, parentIsConstant: false };

export const toTableRows = (
  {
    data, id = "",
  }: IInspectorRow,
  props: IToTableRowsProps,
  options: Partial<IToTableRowsOptions> = {},
  pathPrefix: string = "",
): IInspectorRow[] => {
  if (!data) {
    return [];
  }
  const { ascending, parentIsConstant } = { ...OPTION_DEFAULTS, ...options };
  const dataCreation = (props.readOnly !== true) && !parentIsConstant &&
    !!props.dataCreationHandler && !!props.dataCreationOptionGenerationHandler;
  const subRows: IInspectorRow[] = [];

  const parentProperty = data.getProperty() as ContainerProperty;
  const dataContext = parentProperty.getContext();
  const keys = Object.keys(parentProperty.getEntriesReadOnly());

  let sortedKeys = keys;
  if (dataContext === "map" || dataContext === "single") {
    if (ascending) {
      sortedKeys = keys.sort(compareName);
    } else {
      sortedKeys = keys.sort(compareNameDesc);
    }
  }

  switch (dataContext) {
    case "single": {
      sortedKeys.forEach((key) => {
        const newRow = singlePropertyTableRow(data, key, id, props,
          { ...OPTION_DEFAULTS, ...options, dataCreation }, pathPrefix);
        subRows.push(newRow);
      });
      break;
    }
    default: {
      sortedKeys.forEach((key) => {
        const newRow = collectionChildTableRow(data, key, id, props,
          { ...OPTION_DEFAULTS, ...options, dataCreation }, pathPrefix);
        subRows.push(newRow);
      });
      break;
    }
  }
  if (dataCreation) { addAdditionalRow(subRows, id, parentProperty); }
  return subRows;
};
const createInvalidReference = (parentData: BaseProxifiedProperty, propertyId: string, parentRowId: string,
  props: IToTableRowsProps, options: IPropertyToTableRowOptions,
  pathPrefix: string) => {
  const parentProperty = parentData.getProperty();
  const newId = getShortId(pathPrefix + parentProperty.getAbsolutePath(), propertyId);
  const parentIsConstant = !!options.parentIsConstant;
  const newRow: IInspectorRow = {
    children: undefined,
    context: "single",
    data: undefined,
    id: newId,
    isConstant: false,
    isReference: true,
    name: String(propertyId),
    parent: parentProperty,
    parentId: parentRowId,
    parentIsConstant,
    propertyId: String(propertyId),
    typeid: "Reference",
    value: "",
  };
  return newRow;
};
/**
 * Construct a table row for an entry in a property that is not a collection.
 */

export const singlePropertyTableRow = (parentData: BaseProxifiedProperty, propertyId: string, parentRowId: string,
  props: IToTableRowsProps, options: IPropertyToTableRowOptions,
  pathPrefix: string): IInspectorRow => {
  const { depth, addDummy, dataCreation, followReferences, ascending } = options;
  const parentIsConstant = !!options.parentIsConstant;
  const parentProperty = parentData.getProperty();
  let property;
  // when we try to access an non-existing element of an array, the 'get' method throws which causes app crash
  try {
    property = (parentProperty as ContainerProperty).get(propertyId);
  } catch {
    return createInvalidReference(parentData, propertyId, parentRowId, props, options, pathPrefix);
  }
  const unresolvedProperty = parentData.getProperty([propertyId, BaseProperty.PATH_TOKENS.REF]);
  if (property === undefined || !followReferences || !property.getContext) {
    // This could happen if the property is ReferenceProperty that points to an invalid reference.
    property = unresolvedProperty;
  }
  const currentContext = property.getContext();
  const currentTypeid = getTypeid(property);

  let determinedData = parentData[propertyId];
  // Show a value only if the typeid of the property is primitive
  // Use the PropertyProxy's caret syntax to show the string representation of properties that support it.
  const determinedValue = getPropertyValue(parentData, propertyId, currentContext, currentTypeid, followReferences);
  if (isReferenceProperty(property) && !followReferences) {
    determinedData = undefined;
  }
  // Apply custom child and name getters
  determinedData = props.childGetter!(determinedData, propertyId, parentProperty, currentTypeid, currentContext);
  const name = props.nameGetter!(propertyId, parentProperty, currentTypeid, currentContext);
  const isPropExpandable = isExpandable(determinedData, currentContext, currentTypeid, dataCreation);
  const newId = getShortId(pathPrefix + parentProperty.getAbsolutePath(), propertyId);

  const propertyIdString = String(propertyId);

  const newRow: IInspectorRow = {
    children: undefined,
    context: currentContext,
    data: determinedData,
    id: newId,
    isConstant: property && (property as any)._isConstant,
    isReference: isReferenceProperty(unresolvedProperty),
    name: name === propertyId ? propertyIdString : name,
    parent: parentProperty,
    parentId: parentRowId,
    parentIsConstant,
    propertyId: propertyIdString,
    typeid: currentTypeid,
    value: determinedValue,
  };
  if (isPropExpandable) {
    if (depth !== 0) {
      newRow.children = toTableRows(
        { ...newRow },
        props,
        {
          addDummy,
          ascending,
          depth: depth - 1,
          followReferences,
          parentIsConstant: newRow.isConstant || newRow.parentIsConstant,
        },
        pathPrefix,
      );
    } else if (addDummy) {
      newRow.children = [dummyChild];
    }
  }

  return newRow;
};
/**
 * Construct a table row for an entry in a collection property.
 */

export const collectionChildTableRow = (collectionPropertyProxy: BaseProxifiedProperty,
  propertyId: string,
  parentRowId: string,
  props: IToTableRowsProps,
  options: IPropertyToTableRowOptions,
  pathPrefix: string): IInspectorRow => {
  const collectionProperty = collectionPropertyProxy.getProperty() as ContainerProperty;
  let prop;
  // when we try to access an non-existing element of an array, the 'get' method throws which causes app crash
  try {
    prop = (collectionProperty as ContainerProperty).get(propertyId);
  } catch {
    return createInvalidReference(collectionPropertyProxy, propertyId, parentRowId, props, options, pathPrefix);
  }
  const propertyProxy = (prop && PropertyFactory.instanceOf(prop, "BaseProperty") ?
    PropertyProxy.proxify(prop) : prop) as BaseProxifiedProperty;
  const { depth, addDummy, dataCreation, followReferences, ascending } = options;
  const parentIsConstant = !!options.parentIsConstant;
  const collectionTypeid = getCollectionTypeid(collectionProperty);
  const isReferenceCollection = isReferenceCollectionTypeid(collectionTypeid);
  // Always start with the collection typeid, and fresh variables
  let determinedData;
  let currentTypeid = collectionTypeid;
  let currentContext = "single";
  let property: BaseProperty | BaseProxifiedProperty | undefined = propertyProxy;

  if (!isReferenceCollection || (isReferenceCollection && followReferences)) {
    if (propertyProxy !== undefined && propertyProxy.getProperty &&
      PropertyFactory.instanceOf(propertyProxy.getProperty(), "BaseProperty")) {
      property = propertyProxy.getProperty();
      currentTypeid = getTypeid(property);
      currentContext = property.getContext();
    } else if (isReferenceCollection) {
      // Try to obtain a property
      const { referencedPropertyParent, relativePathFromParent } = PropertyProxy.getParentOfReferencedProperty(
        collectionProperty as ReferenceArrayProperty, propertyId);
      if (referencedPropertyParent && relativePathFromParent) {
        // Introducing this intermediate variable improves type inference in some newer versions of TypeScript.
        const baseProperty = (referencedPropertyParent as ContainerProperty).get(relativePathFromParent)!;
        property = baseProperty;
        if (property) {
          if (PropertyFactory.instanceOf(property, "BaseProperty")) {
            currentTypeid = getTypeid(property);
            currentContext = property.getContext();
          } else {
            currentTypeid = getCollectionTypeid(referencedPropertyParent);
          }
        }
      }
    } else if (isEnumProperty(collectionProperty.get(propertyId)!) && collectionProperty.getContext() === "map") {
      // TODO: Temporary fix as the full typeid of enum maps is currently wrong
      // Introducing this intermediate variable improves type inference in some newer versions of TypeScript.
      const baseProperty = (collectionProperty as MapProperty).get(propertyId)!;
      property = baseProperty;
      currentTypeid = property.getFullTypeid();
      currentContext = property.getContext();
    }
  }

  // In case a set is processed there is no valid key, take the guid instead.
  propertyId = collectionProperty.getContext() === "set" ? (propertyProxy as any).guid : propertyId;
  const determinedValue = getPropertyValue(collectionPropertyProxy, propertyId, currentContext, currentTypeid,
    followReferences);

  if (propertyProxy && (followReferences || !TypeIdHelper.isReferenceTypeId(currentTypeid))) {
    determinedData = propertyProxy;
  }

  // Apply custom child and name getters
  determinedData = props.childGetter!(
    determinedData, propertyId, collectionProperty, currentTypeid, currentContext);
  const name = props.nameGetter!(propertyId, collectionProperty, currentTypeid, currentContext);

  const isPropExpandable = isExpandable(determinedData, currentContext, currentTypeid, dataCreation);
  const children = undefined;
  const newId = getShortId(pathPrefix + collectionProperty.getAbsolutePath(), propertyId);

  const propertyIdString = String(propertyId);

  const newRow: IInspectorRow = {
    children,
    context: currentContext,
    data: determinedData,
    id: newId,
    isConstant: property && (property as any)._isConstant,
    isReference: isReferenceCollection,
    name: name === propertyId ? propertyIdString : name,
    parent: collectionProperty,
    parentId: parentRowId,
    parentIsConstant,
    propertyId: propertyIdString,
    typeid: currentTypeid,
    value: determinedValue,
  };
  if (isPropExpandable) {
    if (addDummy) {
      newRow.children = [dummyChild];
    } else if (depth !== 0) {
      newRow.children = toTableRows({ ...newRow }, props, {
        addDummy,
        ascending,
        depth: depth - 1,
        followReferences,
      }, pathPrefix);
    }
  }

  return newRow;
};

export interface ISanitizer {
  searchFor: RegExp;
  replaceWith: string;
}
export const sanitizePath = (inPath: string, sanitizer: ISanitizer[]) => {
  let outPath = inPath;
  sanitizer.forEach((replaceCase) => {
    outPath = outPath.replace(replaceCase.searchFor, replaceCase.replaceWith);
  });
  return outPath;
};

export const expandAll = (proxyNode: BaseProxifiedProperty) => {
  const expanded: IExpandedMap = {};
  const root = proxyNode.getProperty().getRoot();

  forEachProperty(root, (property) => {
    if (!isPrimitive(property.getFullTypeid())) {
      const newId = getShortId(property.getAbsolutePath());
      expanded[newId] = true;
    }
    return true;
  });

  return expanded;
};

export const fillExpanded = (
  expanded: IExpandedMap,
  innerRows: IInspectorRow[],
  props: IToTableRowsProps,
  toTableRowsOptions?: IToTableRowsOptions,
  pathPrefix: string = "",
) => {
  for (const row of innerRows) {
    if (row.id in expanded) {
      const newPathPrefix = row.parent && row.isReference ?
        pathPrefix + (row.parent.getAbsolutePath() as string) + idSeparator + row.name : pathPrefix;

      if (row.children && row.children[0].context === "d") {
        row.children = toTableRows(
          { ...row },
          props,
          { ...toTableRowsOptions, parentIsConstant: row.isConstant || row.parentIsConstant },
          newPathPrefix,
        );
      }
      fillExpanded(expanded, row.children!, props, toTableRowsOptions, newPathPrefix);
    }
  }
};
const isPropertyProxy = (p: any): p is BaseProxifiedProperty => {
  return p.getProperty && PropertyFactory.instanceOf(p.getProperty(), "BaseProperty");
};
const invalidReference = (parentProxy: BaseProxifiedProperty, id: string | number) => {
  return `Invalid Reference: ${isReferenceMapProperty(parentProxy.getProperty())
    ? (parentProxy as any).get(`${id}*`)
    : parentProxy[`${id}*`]}`;
};
/**
 * Extracts the value from a property and returns it.
 * @param parent - The parent of the property in question.
 * @param id - The id of the child property that we want to extract the value from.
 * @return The property value.
 */

export const getPropertyValue = (parent: ContainerProperty | BaseProxifiedProperty,
  id: string,
  context: string,
  typeid: string,
  followReferences = true): string | number | boolean => {
  let parentProperty;
  let parentProxy;
  if (isPropertyProxy(parent)) {
    parentProxy = parent;
    parentProperty = parentProxy.getProperty();
  } else {
    parentProperty = parent;
    parentProxy = PropertyProxy.proxify(parent);
  }

  let property;
  try {
    property = (parentProperty as ContainerProperty).get(id);
  } catch (e) {
    // Most likely failed due to some Reference mess up
    if (Utils.isReferenceCollectionTypeid(parentProperty.getTypeid()) ||
      Utils.isReferenceProperty(parentProxy.getProperty([id, BaseProperty.PATH_TOKENS.REF]))) {
      return invalidReference(parentProxy, id);
    } else {
      throw (e);
    }
  }

  if (property === undefined || !followReferences) {
    // TODO This could happen if the property is ReferenceProperty that points to an invalid reference.
    property = parentProxy.getProperty([id, BaseProperty.PATH_TOKENS.REF]) as BaseProperty;
  }

  let propertyProxy = (parentProperty.getContext() === "map"
    ? (parentProxy as any).get(id)
    : parentProxy[id]);
  if (parentProperty.getContext() === "set") {
    propertyProxy = PropertyProxy.proxify(property);
  }

  const contextIsSingle = context === "single";
  const parentContextIsSingle = parentProperty.getContext() === "single";
  id = parentProperty.getContext() === "set" ? (propertyProxy as any).guid : id;

  let determinedValue;
  // If the property is a reference and we don't follow them, we store the reference path string instead.
  if (!followReferences && TypeIdHelper.isReferenceTypeId(typeid)) {
    if (parentContextIsSingle || isReferenceArrayProperty(parentProperty)) {
      determinedValue = parentProxy[`${id}*`];
    } else {
      determinedValue = (parentProxy as any).get(`${id}*`);
    }
  } else if (contextIsSingle && propertyProxy !== undefined && isPrimitive(typeid)) {
    try {
      if (parentProxy[`${id}^`] !== undefined) {
        determinedValue = parentProxy[`${id}^`];
      } else if ((parentProxy as any).get(`${id}^`) !== undefined) {
        determinedValue = (parentProxy as any).get(`${id}^`);
      } else {
        determinedValue = parentProxy;
      }
    } catch (error) {
      console.error(error);
    }
  } else if ((propertyProxy === undefined &&
    (isReferenceArrayProperty(parentProperty) || isReferenceMapProperty(parentProperty)) &&
    !parentProperty.isReferenceValid(id as never)
  ) ||
    (contextIsSingle &&
      PropertyFactory.instanceOf(property, "Reference") &&
      !(property as ReferenceProperty).isReferenceValid())) {
    // Probably encountered an invalid Reference.
    determinedValue = invalidReference(parentProxy, id);
  }

  return determinedValue;
};

export const handleReferencePropertyEdit = async (rowData: IInspectorRow, newPath: string) => {
  const parentProp = rowData!.parent!;
  if (Utils.isReferenceArrayProperty(parentProp) || Utils.isReferenceMapProperty(parentProp)) {
    parentProp.setValues({ [rowData.name]: newPath });
    try {
      (parentProp as unknown as ReferenceMapProperty).isReferenceValid(rowData.name);
    } catch (e: any) {
      // if maximum call stack size is exceeded, user probably created cyclic reference
      // we can't delete cyclic references so we need set reference path to some other value
      if (e.message.includes("Maximum call stack size exceeded")) {
        parentProp.setValues({ [rowData.name]: "Could not resolve the reference" });
      }
    }
  } else {
    const unresolvedProperty = (parentProp as ContainerProperty).get(
      [rowData.name, BaseProperty.PATH_TOKENS.REF]) as unknown as ReferenceProperty;
    unresolvedProperty.setValue(newPath);
    try {
      unresolvedProperty.isReferenceValid();
    } catch (e: any) {
      if (e.message.includes("Maximum call stack size exceeded")) {
        unresolvedProperty.setValue("Could not resolve the reference");
      }
    }
  }

  parentProp!.getRoot().getWorkspace()!.commit();
};

export const generateForm = (rowData: IInspectorRow, handleCreateData: any) => {
  if (rowData.parent!.getContext() === "array" && rowData.parent!.isPrimitiveType()) {
    handleCreateData(rowData, "", rowData.parent!.getTypeid(), "single");
    return false;
  }
  return true;
};

// @TODO: Revisit method arguments
export function nameCellRenderer({ rowData, cellData, columnIndex, tableProps,
  searchResult, renderCreationRow, referenceHandler }: ColumnRendererType) {
  const { checkoutInProgress, rowIconRenderer, width, dataGetter, readOnly, classes } = tableProps;
  if (checkoutInProgress) {
    return getCellSkeleton(width);
  }
  if (cellData && dataGetter && rowData.context) { // cell data comes from data getter
    return cellData;
  } else {
    const nameCell = (
      <NameCell
        iconRenderer={rowIconRenderer!}
        rowData={rowData}
        editReferenceHandler={() => {
          referenceHandler!.initialReferenceEdit(rowData);
        }}
        className={determineCellClassName(rowData, columnIndex, classes, searchResult)}
        readOnly={!!readOnly} />
    );
    return rowData.context !== undefined ? nameCell : renderCreationRow(rowData);
  }
}

// @TODO: Revisit method arguments
export function typeCellRenderer({ rowData, tableProps }: { rowData: IInspectorRow; tableProps: any; }) {
  const { checkoutInProgress, width } = tableProps;
  if (checkoutInProgress) {
    return getCellSkeleton(width);
  } else if (!rowData.typeid) {
    return null;
  } else {
    return (<TypeColumn rowData={rowData} />);
  }
}
const renderUneditableCell = (classes, rowData) => (
  <div className={classes.typeIdRow}>
    <div className={classes.typeIdRowLeft}>{rowData.value}</div>
  </div>
);

const renderTooltipedUneditableCell = (message, classes, rowData) => (
  <Tooltip
    enterDelay={500}
    classes={{
      tooltip: classes.tooltip,
    }}
    placement="left"
    title={message}
  >
    {renderUneditableCell(classes, rowData)}
  </Tooltip>
);
/**
 * @param width - width of the table
 * @returns random width which fits half of the table
 */
const getRandomWidth = (width: number) => {
  return Math.random() * width * rowWidthInterval + width * minRowWidth;
};
/**
 * @param width - width of the table
 * @returns custom skeleton fitting the table with specified width
 */
const getCellSkeleton = (width: number) => ThemedSkeleton(<Skeleton width={getRandomWidth(width)} />);
const determineCellClassName = (rowData: IInspectorRow, columnIndex: number,
  classes: any, searchResults: SearchResult) => {
  const { foundMatches = [], matchesMap = {}, currentResult } = searchResults;
  const highlightedResult: IInspectorSearchMatch = (
    currentResult !== -1 && currentResult !== undefined && foundMatches!.length! > 0
      ? foundMatches![currentResult] : { indexOfColumn: -1, rowId: "" });
  return highlightedResult.rowId === rowData.id && highlightedResult.indexOfColumn === columnIndex ?
    classes.currentMatch : (matchesMap![rowData.id] && matchesMap![rowData.id][columnIndex] ?
      classes.match : "");
};

// @TODO: Revisit method arguments
export function valueCellRenderer(
  { rowData, cellData, columnIndex, tableProps, searchResult,
  }: ColumnRendererType) {
  const { classes, checkoutInProgress, followReferences, rowIconRenderer, width, dataGetter, readOnly } = tableProps;
  if (checkoutInProgress) {
    return getCellSkeleton(width);
  }
  if (cellData && dataGetter && rowData.context) { // cell data comes from data getter
    return cellData;
  } else if (isPrimitive(rowData.typeid) && rowData.context === "single") {
    return (
      <EditableValueCell
        className={determineCellClassName(rowData, columnIndex, classes, searchResult)}
        followReferences={followReferences}
        iconRenderer={rowIconRenderer!}
        rowData={rowData}
        readOnly={!!readOnly} />
    );
  } else {
    return rowData.isConstant
      ? renderTooltipedUneditableCell(InspectorMessages.CONSTANT_PROPERTY, classes, rowData)
      : renderUneditableCell(classes, rowData);
  }
}

export const addDataForm = ({ handleCancelCreate, handleCreateData, rowData, options, styleClass }) => (
  <div className={styleClass}>
    <NewDataForm
      onCancelCreate={handleCancelCreate}
      onDataCreate={handleCreateData}
      options={options}
      rowData={rowData}
    />
  </div>
);

export const getDefaultPropertyTableProps = () => ({
  editReferenceHandler: handleReferencePropertyEdit,
  followReferences: true,
  fillExpanded,
  toTableRows,
  expandAll,
  generateForm,
  rowIconRenderer: getDefaultInspectorTableIcons,
  addDataForm,
  editReferenceView: (props: any) => {
    return <EditReferenceView {...props} />;
  },
  columnsRenderers: {
    name: nameCellRenderer,
    value: valueCellRenderer,
    type: typeCellRenderer,
  },
});
