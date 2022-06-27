/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseProxifiedProperty } from "@fluid-experimental/property-proxy";
import { BaseProperty } from "@fluid-experimental/property-properties";
import { IRepoExpiryGetter, IRepoExpirySetter } from "./CommonTypes";
import { IInspectorSearchState } from "./utils";

export interface IColumns {
  dataGetter?: (params: IDataGetterParameter) => React.ReactNode | null;
  key: string;
  dataKey: string;
  cellRenderer?: any;
  title: string;
  width: number;
  sortable: boolean;
  resizable?: boolean;
}

/**
 * The interface for an entry of the visualization data array.
 */
export interface IInspectorRow {
  context: string;
  data: any;
  children: IInspectorRow[] | undefined;
  id: string;
  isConstant: boolean;
  isReference: boolean;
  name: string;
  typeid: string;
  value: number | string | boolean;
  parent?: BaseProperty;
  parentId: string;
  parentIsConstant: boolean;
  propertyId: string;
}
/**
 * The interface for the cell data getter function parameter
 */
export interface IDataGetterParameter {
  columns: IColumns[];
  column: IColumns;
  columnIndex: number;
  rowData: IInspectorRow;
  rowIndex: number;
}

export interface IDataCreationOptions {
  /**
   * The name that is shown in the table row that allows the creation of new data.
   */
  name: string;
  /**
   * The typeid options that are available for data creation.
   */
  options?: any;
}

export type IInspectorColumnsKeys = "context" | "name" | "type" | "value";

export interface IInspectorTableProps {
  /**
   * The active repository guid. Used as the prefix for the table row ids.
   */
  activeRepositoryGuid?: string;
  /**
   * An array that contains the identifiers of the columns to be visualized.
   */
  columns: IInspectorColumnsKeys[];
  /**
   * A callback to override the child of a row,
   * defaults to the hierarchical child of the property the row visualizes.
   */
  childGetter?: (child: any, name: string, parent: BaseProperty, typeid: string, context: string) => any;
  /**
   * Current Urn
   */
  currentUrn?: string;
  /**
   * Indicates whether the current urn is a v1 branch urn.
   */
  isV1Urn?: boolean;
  /**
   * The raw data to be visualized.
   */
  data?: BaseProxifiedProperty;
  /**
   * A callback function that is called on data creation. If not specified,
   * data creation will be disabled.
   */
  dataCreationHandler?: (rowData: IInspectorRow, name: string, typeid: string, context: string) => Promise<any>;
  /**
   * A callback that is executed to compute the name and the options available for the data creation.
   */
  dataCreationOptionGenerationHandler?: (rowData: IInspectorRow, nameOnly: boolean) => IDataCreationOptions;
  /**
   * A handler to delete (expire) a repository.
   */
  deleteRepo?: (repoUrn: string) => Promise<void>;
  /**
   * A handler to get expiry information of a repository.
   */
  getRepoExpiry?: IRepoExpiryGetter;
  /**
   * Indicates whether the current repository is expired or not.
   */
  expired?: boolean;
  /**
   * A callback to override the name of a row, defaults to the id of the property the row visualizes.
   */
  nameGetter?: (name: string, parent: BaseProperty, typeid: string, context: string) => string;
  /**
   * Indicates if the table is in read only mode
   */
  readOnly?: boolean;
  /**
   * Callback that is invoked to determine the icon.
   */
  rowIconRenderer?: (rowData: IInspectorRow) => React.ReactNode;
  /**
   * Width of the table
   */
  width: number;
  /**
   * Height of the table
   */
  height: number;
  /**
   * The urn of the currently active repository.
   */
  repositoryUrn?: string;
  /**
   * Row height
   */
  rowHeight: number;
  /**
   * Id of the expandable column
   */
  expandColumnKey: string;
  /**
   * Props passes to the search
   */
  searchBoxProps?: any;
  /**
   * A handler to set the expiry policy of a repository.
   */
  setRepoExpiry?: IRepoExpirySetter;
  /**
   * dataGetter in case there is
   */
  dataGetter?: (params: IDataGetterParameter) => React.ReactNode | null;
  /**
   * enable follow references
   */
  followReferences: boolean;
  /**
   * if checkout is in progress
   */
  checkoutInProgress: boolean;
}

export interface IInspectorSearchMatch {
  /**
   * Index of column, containing match
   */
  indexOfColumn: number;

  /**
   * Hash of row, containing match
   */
  rowId: string;
}

export type IInspectorSearchCallback = (foundMatches: IInspectorSearchMatch[], matchesMap: IInspectorSearchMatchMap,
                                        done: boolean, childToParentMap: { [key: string]: string; }) => void;

export type IInspectorSearchAbortHandler = () => void;

export interface IInspectorSearchMatchMap {
  [key: string]: boolean[];
}

export interface IExpandedMap {
  [key: string]: boolean;
}

export interface IInspectorTableState {
  childToParentMap: { [key: string]: string; };
  commitHistoryVisible: boolean;
  currentResult?: number;
  foundMatches: IInspectorSearchMatch[];
  matchesMap: IInspectorSearchMatchMap;
  editReferenceRowData: IInspectorRow | null;
  expanded: IExpandedMap;
  expandedRepoGuid: string | undefined;
  expandedRepoMap: { [key: string]: IExpandedMap; };
  searchAbortHandler?: IInspectorSearchAbortHandler;
  searchExpression: string;
  searchDone: boolean;
  searchInProgress: boolean;
  searchState?: IInspectorSearchState;
  showFormRowID: string;
  sortBy: { [key: string]: string; };
  tableRows: IInspectorRow[];
}
