/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  IColumns, IExpandedMap, IInspectorRow,
  IInspectorSearchCallback, IInspectorSearchControls,
  IInspectorSearchMatch,
  IInspectorSearchState, IShowNextResultResult, IToTableRowsOptions, IToTableRowsProps,
}
  from "./InspectorTableTypes";
  // @TODO remove this default behavior when making the table fully generic.
import { fillExpanded as defaultFillExpanded } from "./propertyInspectorUtils";

/**
 * Generates:
 * @type{IShowNextResultResult} object, containing information,
 * required to make desired match visible and where this match is located
 *
 * Parameters:
 * @param data - List of all @type{IInspectorRow} items, which have to be displayed in the table
 * @param currentlyExpanded - List of hashes of nodes, which are currently expanded (for example by user)
 * @param filteredExpanded - List of hashes of nodes, which have to be expanded to make matching elements visible
 * @param allMatches - List of @type{IInspectorSearchMatch} containing information about matching rows
 * @param resultIndex - Index of desired matching item, starting from 0
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
 * @param data - List of all @type{IInspectorRow} items of the dataset
 * @param currentlyExpanded - List of hashes of nodes, which are currently expanded
 * @param matchingElement - @type{IInspectorSearchMatch} object, containing information about match
 * @param rowCounter - (default value 0) aggregation counter, used during recursive process
 */
function findMatchingElementIndexInDataSet(data: IInspectorRow[], currentlyExpanded: IExpandedMap,
  matchingElement: IInspectorSearchMatch, rowCounter = 0): { idx: number; found: boolean; } {
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
 * @param searchExpression - The term to search for.
 * @param data - The data set to search.
 * @param dataGetter - The data getter function that is used to determine cell values.
 * @param columns - An array of columns to search.
 * @param handleUpdate - A callback that will be invoked for every search result, or when the search is completed.
 * @param toTableRowsProps - A subset of the inspector table props that is passed on to the toTableRows method.
 * @param toTableRowsOptions - Options that influence the behaviour of the toTableRows method.
 * @param searchState - An object storing the (intermediate) search results and information on how to proceed in
 * subsequent calls. Users don't need to mind this.
 * @param chunkSize - The size of the chunk (number of rows) to search in each pass.
 * @param recursive - A flag indicating whether the search function has been called recursively by itself.
 * Users don't need to mind this.
 * @param entryPoint - A flag indicating whether this functions was the entry point of a recursive traversal.
 * Users don't need to mind this.
 * @return An object that gives access to the search state and abort handler. While the state object needs to be passed
 * to future search calls, the abort handler is a function that can be used to abort the search process at any time.
 */
export const search = (
  searchExpression: string, data: IInspectorRow[], dataGetter, columns: IColumns[],
  handleUpdate: IInspectorSearchCallback, toTableRowsProps: IToTableRowsProps, toTableRowsOptions: IToTableRowsOptions,
  searchState: IInspectorSearchState = { foundMatches: [], matchesMap: {}, childToParentMap: {} },
  chunkSize = 1000, recursive = false, entryPoint = true, fillExpanded: any = defaultFillExpanded):
   IInspectorSearchControls => {
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
              toTableRowsOptions, searchState, chunkSize, false, true, fillExpanded);
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
      const validGetter = dataGetter && dataGetter({
        column, columnIndex, columns, rowData: item,
        rowIndex: levelState.index,
      });
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
          toTableRowsOptions, searchState, chunkSize, true, false, fillExpanded);
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
      toTableRowsOptions, searchState, chunkSize, false, false, fillExpanded);
  }

  // If we are in the first instance of this function on the stack trace (i.e. all recursively called instances have
  // returned already) and have checked all rows or found a new match, we call the search result update handler.
  if (entryPoint && (searchState.newMatchFound || searchState.levels.length === 0)) {
    updateHandler(handleUpdate, searchState, searchState.levels.length === 0);
  }

  return searchControls
    ? searchControls
    : {
      abortHandler: abortSearch.bind(null, searchState),
      state: searchState,
    };
};
