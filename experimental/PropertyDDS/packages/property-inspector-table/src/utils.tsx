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
  ReferenceProperty,
  Workspace,
} from "@fluid-experimental/property-properties";
import { BaseProxifiedProperty, PropertyProxy } from "@fluid-experimental/property-proxy";

import memoize from "memoize-one";
import { HashCalculator } from "./HashCalculator";
import { IColumns, IExpandedMap, IInspectorRow, IInspectorSearchAbortHandler, IInspectorSearchCallback,
  IInspectorSearchMatch, IInspectorSearchMatchMap, IInspectorTableProps } from "./InspectorTableTypes";
import { Utils } from "./typeUtils";
const { isEnumProperty, isEnumArrayProperty, isInt64Property, isReferenceProperty,
  isUint64Property, isCollectionProperty, isReferenceArrayProperty, isReferenceCollectionTypeid,
  isReferenceMapProperty } = Utils;

const idSeparator = "/";
interface IShowNextResultResult {
  /**
   * New rows needed to expand to show next results
   */
  expandedRows: IExpandedMap;
  /**
   * row index of the next result. This value is used to automatically scroll in the table
   */
  rowIdx: number;
  /**
   * Next result column index
   */
  columnIdx: number;
}

/**
 * Generates:
 * @type{IShowNextResultResult} object, containing information,
 * required to make desired match visible and where this match is located
 *
 * Parameters:
 * @data List of all @type{IInspectorRow} items, which have to be displayed in the table
 * @param currentlyExpanded List of hashes of nodes, which are currently expanded (for example by user)
 * @param filteredExpanded List of hashes of nodes, which have to be expanded to make matching elements visible
 * @param allMatches List of @type{IInspectorSearchMatch} containing information about matching rows
 * @param resultIndex Index of desired matching item, starting from 0
 */
export const showNextResult = (
  data: IInspectorRow[], currentlyExpanded: IExpandedMap, allMatches: IInspectorSearchMatch[],
  resultIndex: number, childToParentMap: { [key: string]: string; }): IShowNextResultResult => {
  const desiredDataItem = allMatches[resultIndex];
  // sanity check
  if (!desiredDataItem) {
    return { expandedRows: currentlyExpanded, rowIdx: -1, columnIdx: -1 };
  }

  // iterate through all the parents until root is reached
  let toBeExpandedNode = childToParentMap[desiredDataItem.rowId];
  while (toBeExpandedNode) {
    if (!(toBeExpandedNode in currentlyExpanded)) {
      currentlyExpanded[toBeExpandedNode] = true;
    }
    toBeExpandedNode = childToParentMap[toBeExpandedNode];
  }
  const rowInfo = findMatchingElementIndexInDataSet(data, currentlyExpanded, desiredDataItem);

  return { expandedRows: currentlyExpanded, rowIdx: rowInfo.idx, columnIdx: desiredDataItem.indexOfColumn };
};

/**
 * Recursive function to find index of matching element in data set
 *
 * Generates:
 * Object, containing information about row, containing matching element:
 * - index of the row
 * - flag whether the element was found
 *
 * Parameters:
 * @param data List of all @type{IInspectorRow} items of the dataset
 * @param currentlyExpanded List of hashes of nodes, which are currently expanded
 * @param matchingElement @type{IInspectorSearchMatch} object, containing information about match
 * @param rowCounter (default value 0) aggregation counter, used during recursive process
 */
function findMatchingElementIndexInDataSet(data: IInspectorRow[], currentlyExpanded: IExpandedMap,
                                           matchingElement: IInspectorSearchMatch, rowCounter = 0):
                                           { idx: number; found: boolean; } {
  for (const row of data) {
    if (row.id === matchingElement.rowId) {
      return { idx: rowCounter, found: true };
    }
    rowCounter++;
    // If current row is expanded - search recursively among its children
    if (row.id in currentlyExpanded) {
      const res = findMatchingElementIndexInDataSet(row.children!, currentlyExpanded, matchingElement, rowCounter);
      if (res.found) {
        return res;
      } else {
        rowCounter = res.idx;
      }
    }
  }
  return { idx: rowCounter, found: false };
}

interface ISearchLevelState {
  data?: IInspectorRow[];
  index: number;
}

export interface IInspectorSearchState {
  abort?: boolean;
  newMatchFound?: boolean;
  updateScheduled?: number;
  chunkSize?: number;
  expression?: string;
  foundMatches: IInspectorSearchMatch[];
  levels?: ISearchLevelState[];
  matchesMap: IInspectorSearchMatchMap;
  scheduled?: number;
  childToParentMap: { [key: string]: string; };
}

export interface IInspectorSearchControls {
  abortHandler: IInspectorSearchAbortHandler;
  state: IInspectorSearchState;
}

const abortSearch = (searchState: IInspectorSearchState) => {
  if (searchState.scheduled !== undefined || searchState.updateScheduled !== undefined) {
    clearTimeout(searchState.scheduled);
    clearTimeout(searchState.updateScheduled);
  }
  searchState.abort = true;
};

const updateHandler = (callback: IInspectorSearchCallback, searchState: IInspectorSearchState, done: boolean) => {
  searchState.newMatchFound = false;
  searchState.updateScheduled = window.setTimeout(() => {
    callback(searchState.foundMatches, searchState.matchesMap, done, searchState.childToParentMap);
  }, 0);
};

/**
 * This search function will recursively traverse the table rows provided as `data` in chunks of the given size.
 * After processing `chunksSize` amount of rows, it will return control to the main thread and queue a follow-up run if
 * necessary, until the whole data set has been searched through. Incomplete table rows will be filled on the fly. In
 * order to avoid infinite search, the function will not follow references.
 * @param searchExpression The term to search for.
 * @param data The data set to search.
 * @param dataGetter The data getter function that is used to determine cell values.
 * @param columns An array of columns to search.
 * @param handleUpdate A callback that will be invoked for every search result, or when the search is completed.
 * @param toTableRowsProps A subset of the inspector table props that is passed on to the toTableRows method.
 * @param toTableRowsOptions Options that influence the behaviour of the toTableRows method.
 * @param searchState An object storing the (intermediate) search results and information on how to proceed in
 *  subsequent calls. Users don't need to mind this.
 * @param chunkSize The size of the chunk (number of rows) to search in each pass.
 * @param recursive A flag indicating whether the search function has been called recursively by itself. Users don't
 *  need to mind this.
 * @param entryPoint A flag indicating whether this functions was the entry point of a recursive traversal. Users don't
 *  need to mind this.
 * @return An object that gives access to the search state and abort handler. While the state object needs to be passed
 *  to future search calls, the abort handler is a function that can be used to abort the search process at any time.
 */
export const search = (
  searchExpression: string, data: IInspectorRow[], dataGetter, columns: IColumns[],
  handleUpdate: IInspectorSearchCallback, toTableRowsProps: IToTableRowsProps, toTableRowsOptions: IToTableRowsOptions,
  searchState: IInspectorSearchState = { foundMatches: [], matchesMap: {}, childToParentMap: {} },
  chunkSize = 1000, recursive = false, entryPoint = true): IInspectorSearchControls => {
  // Check if search should be aborted.
  if (searchState.abort) {
    return {
      abortHandler: () => { /* noop */ },
      state: searchState,
    };
  }

  let searchControls: IInspectorSearchControls | undefined;

  // Prepare the search state object when calling this method for the first time.
  if (searchState.expression === undefined) {
    searchState.expression = searchExpression.toLowerCase();
  }
  if (searchState.scheduled !== undefined) {
    searchState.scheduled = undefined;
  }
  if (!searchState.levels) {
    searchState.levels = [{ data, index: 0 }];
  }
  if (searchState.chunkSize === undefined) {
    searchState.chunkSize = chunkSize;
  }
  const levelState = searchState.levels[searchState.levels.length - 1];
  const rows = levelState.data || data;

  // Iterate over all rows in a depth first traversal.
  let item: IInspectorRow;
  for (; levelState.index < rows.length; ++levelState.index) {
    // Check if we need to interrupt at the end of a chunk.
    if (searchState.chunkSize === 0 || searchState.newMatchFound) {
      // Schedule next iteration. We would like to do it only if nothing was found.
      if (searchState.chunkSize === 0 && !searchState.newMatchFound) {
        if (searchState.scheduled === undefined) {
          searchState.scheduled = window.setTimeout(() => {
            searchState.chunkSize = chunkSize;
            search(searchExpression, rows, dataGetter, columns, handleUpdate, toTableRowsProps,
              toTableRowsOptions, searchState, chunkSize, false, true);
          }, 10);
        }
      }
      if (entryPoint && searchState.newMatchFound) {
        updateHandler(handleUpdate, searchState, false);
      }

      return {
        abortHandler: abortSearch.bind(null, searchState),
        state: searchState,
      };
    }

    item = rows[levelState.index];
    searchState.childToParentMap[item.id] = item.parentId;
    // Skip data creation row.
    if (item.context === undefined) {
      continue;
    }

    // Search current row and store the result in the search state.
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
      // TODO: Not sure if we pass the correct row index to the data getter. I think it should be the overall index in
      // the table. That's at least what the base table seems to pass to it.
      const column = columns[columnIndex];
      const validGetter = dataGetter && dataGetter({ column, columnIndex, columns, rowData: item,
        rowIndex: levelState.index });
      const cell = validGetter || item[column.dataKey];
      if ((cell !== undefined ? String(cell).toLowerCase() : "").includes(searchState.expression!)) {
        if (!searchState.matchesMap[item.id]) {
          searchState.matchesMap[item.id] = [];
        }
        if (!searchState.matchesMap[item.id][columnIndex]) {
          searchState.foundMatches.push({ rowId: item.id, indexOfColumn: columnIndex });
          searchState.matchesMap[item.id][columnIndex] = true;
          searchState.newMatchFound = true;
          break;
        }
      }
    }
    if (searchState.newMatchFound) {
      if (entryPoint) {
        updateHandler(handleUpdate, searchState, false);
      }
      return {
        abortHandler: abortSearch.bind(null, searchState),
        state: searchState,
      };
    }

    // Recursively search through children.
    --searchState.chunkSize;
    if (item.children && !item.isReference) {
      if (item.children[0].context === "d") {
        fillExpanded({ [item.id]: true }, [item], toTableRowsProps, toTableRowsOptions);
      }

      if (item.children.length > 0) {
        searchState.levels.push({ data: item.children, index: 0 });
        searchControls = search(searchExpression, item.children, dataGetter, columns, handleUpdate, toTableRowsProps,
          toTableRowsOptions, searchState, chunkSize, true, false);
        if (searchState.newMatchFound || (searchState.chunkSize === 0 && searchState.scheduled !== undefined)) {
          if (entryPoint && searchState.newMatchFound) {
            updateHandler(handleUpdate, searchState, false);
          }
          return searchControls;
        }
      }
    }
  }

  // We are done with this level.
  searchState.levels.pop();
  if (!recursive && searchState.levels.length > 0) {
    // Walk up the hierarchy and continue in the parent.
    const parent = searchState.levels[searchState.levels.length - 1];
    ++parent.index;
    searchControls = search(searchExpression, parent.data!, dataGetter, columns, handleUpdate, toTableRowsProps,
      toTableRowsOptions, searchState, chunkSize, false, false);
  }

  // If we are in the first instance of this function on the stack trace (i.e. all recursively called instances have
  // returned already) and have checked all rows or found a new match, we call the search result update handler.
  if (entryPoint && (searchState.newMatchFound || searchState.levels.length === 0)) {
    updateHandler(handleUpdate, searchState, searchState.levels.length === 0);
  }

  return searchControls
    ? searchControls
    : { abortHandler: abortSearch.bind(null, searchState),
        state: searchState,
      };
};

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
    const unresolvedProperty =
      parentProp.get([rowData.propertyId, BaseProperty.PATH_TOKENS.REF]) as unknown as ReferenceProperty;
    path = unresolvedProperty.getValue() as string;
  }

  return path;
};

const getShortId = (parentPath: string, childId: string | undefined = undefined): string => {
  const sanitizer = [
    { searchFor: /[.[]/g, replaceWith: idSeparator },
    { searchFor: /]/g, replaceWith: "" },
    { searchFor: /\/\/+/g, replaceWith: idSeparator },
  ];
  const absolutePath =
    childId !== undefined ?
      parentPath + idSeparator + childId :
      parentPath;
  const hash = new HashCalculator();
  hash.pushString(sanitizePath(absolutePath, sanitizer));
  return hash.getHash();
};

/**
 * Checks if a row is expandable.
 * @param data The data of the current row.
 * @param context The specified context of the row. Will only be used if data is primitive.
 * @param typeid The specified typeid of the row.
 * @param dataCreation Indicates if data creation is enabled
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
    id: `${ id }/Add`,
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

interface IToTableRowsOptions {
  depth: number;
  addDummy: boolean;
  followReferences: boolean;
  ascending: boolean;
  parentIsConstant?: boolean;
}

interface IPropertyToTableRowOptions extends Partial<IToTableRowsOptions> {
  depth: number;
  dataCreation: boolean;
}

export const dummyChild = {
  children: undefined,
  context: "d",
  data: "d",
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

type IToTableRowsProps = Pick<IInspectorTableProps, "dataCreationHandler" | "dataCreationOptionGenerationHandler" |
  "childGetter" | "nameGetter" | "readOnly">;
export const toTableRows = (
  {
    data,
    id = "",
  }: IInspectorRow,
  props: IToTableRowsProps,
  options: Partial<IToTableRowsOptions> = {},
  pathPrefix: string = "",
): IInspectorRow[] => {
  const { ascending, parentIsConstant } = { ...OPTION_DEFAULTS, ...options };
  const dataCreation = (props.readOnly !== true) && !parentIsConstant &&
    !!props.dataCreationHandler && !!props.dataCreationOptionGenerationHandler;
  const subRows: IInspectorRow[] = [];

  const parentProperty = data.getProperty();
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
          parentIsConstant: newRow.isConstant || newRow.parentIsConstant },
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
      const { referencedPropertyParent, relativePathFromParent } =
        PropertyProxy.getParentOfReferencedProperty(collectionProperty as ReferenceArrayProperty, propertyId);
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

export const expandAll = (workspace: Workspace) => {
  const expanded: IExpandedMap = {};
  const root = (workspace as any).root;

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
          pathPrefix + row.parent.getAbsolutePath() + idSeparator + row.name : pathPrefix;

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
  return `Invalid Reference: ${
    isReferenceMapProperty(parentProxy.getProperty())
      ? (parentProxy as any).get(`${ id }*`)
      : parentProxy[`${ id }*`]}`;
};

/**
 * Extracts the value from a property and returns it.
 * @param parent The parent of the property in question.
 * @param id The id of the child property that we want to extract the value from.
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
      determinedValue = parentProxy[`${ id }*`];
    } else {
      determinedValue = (parentProxy as any).get(`${ id }*`);
    }
  } else if (contextIsSingle && propertyProxy !== undefined && isPrimitive(typeid)) {
    try {
      if (parentProxy[`${ id }^`] !== undefined) {
        determinedValue = parentProxy[`${ id }^`];
      } else if ((parentProxy as any).get(`${ id }^`) !== undefined) {
        determinedValue = (parentProxy as any).get(`${ id }^`);
      } else {
        determinedValue = parentProxy;
      }
    } catch (error) {
      console.error(error);
    }
  } else if (
    (propertyProxy === undefined &&
    (isReferenceArrayProperty(parentProperty) || isReferenceMapProperty(parentProperty)) &&
    !parentProperty.isReferenceValid(id as never)
    ) ||
    (contextIsSingle &&
    PropertyFactory.instanceOf(property, "Reference") &&
    !(property as ReferenceProperty).isReferenceValid())
  ) {
    // Probably encountered an invalid Reference.
    determinedValue = invalidReference(parentProxy, id);
  }

  return determinedValue;
};
