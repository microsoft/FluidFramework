/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// eslint-disable-next-line import/no-unassigned-import
import "@hig/fonts/build/ArtifaktElement.css";
import Button from "@material-ui/core/Button";
import { createStyles, Theme, withStyles } from "@material-ui/core/styles";
import Skeleton from "react-loading-skeleton";

import classNames from "classnames";
import debounce from "lodash.debounce";
import React, { createRef } from "react";
import BaseTable, { SortOrder } from "react-base-table";
import { ModalConsumer } from "./ModalManager";
// eslint-disable-next-line import/no-unassigned-import
import "react-base-table/styles.css";
import { InspectorMessages, minRows } from "./constants";
import { computeIconSize, Empty } from "./Empty";
import { ExpiryModal } from "./ExpiryModal";
import { InspectorTableFooter } from "./InspectorTableFooter";
import { InspectorTableHeader } from "./InspectorTableHeader";
import {
  IColumns, IDataGetterParameter, IInspectorSearchCallback,
  IInspectorSearchMatch, IInspectorSearchMatchMap, IInspectorTableProps,
  IInspectorTableState, SearchResult,
  IToTableRowsOptions, IInspectorSearchControls, IRowData,
} from "./InspectorTableTypes";
import { search, showNextResult } from "./utils";
import { getReferenceValue, getDefaultPropertyTableProps } from "./propertyInspectorUtils";
import { ThemedSkeleton as themedSkeleton } from "./ThemedSkeleton";
import { NewDataRow } from "./NewDataRow";

// @TODO Figure out why SortOrder is not resolved as value after updating the table version
enum TableSortOrder {
  ASC = "asc",
  DSC = "dsc",
}

/**
 * @TODOs - Refactoring WIP
 * The idea is to decouple inspector app from property-dds and allow initially viewing
 * and eventually editing other sources of data in form ES6 proxy.
 *
 * Currently we try to make the table configurable without disrupting much the API, by allowing client to pass
 * props to handle the different business logic such as (data creation, expand all, reference handling).
 */
const defaultSort = { key: "name", order: TableSortOrder.ASC } as { key: React.Key; order: SortOrder; };

const styles = (theme: Theme) => createStyles({
  currentMatch: {
    backgroundColor: "rgba(250,162,27,0.5)",
    display: "flex",
    width: "100%",
  },
  dataForm: {
    height: "100%",
    width: "100%",
  },
  dataFormContainer: {
    alignItems: "center",
    display: "flex",
    flexGrow: 1,
    height: "100%",
  },
  editReference: {
    flexBasis: "60%",
    marginBottom: theme.spacing(1),
    maxWidth: "600px",
    zIndex: 200,
  },
  evenRow: {
    backgroundColor: "#FFFFFF",
    color: "#3c3c3c",
  },
  expiredNotice: {
    display: "flex",
    flexDirection: "column",
  },
  expiryButton: {
    alignSelf: "center",
    marginTop: "16px",
  },
  header: {
    "background-color": "#FFFFFF",
    "color": "#3c3c3c",
    "font-size": "12px",
    "font-weight": "700",
    "text-transform": "none",
  },
  isConstFlag: {
    color: "#3C3C3C",
    display: "flex",
    fontFamily: "ArtifaktElement, Helvetica, Arial",
    fontSize: "11px",
    fontStyle: "normal",
    fontWeight: "normal",
    justifyContent: "flex-end",
    lineHeight: "20px",
    marginLeft: "auto",
    marginRight: "5px",
    minWidth: "97.5px",
  },
  match: {
    backgroundColor: "rgba(250,162,27,0.2)",
    display: "flex",
    width: "100%",
  },
  oddRow: {
    backgroundColor: "#F9F9F9",
    color: "#3c3c3c",
  },
  root: {
    "font-family": "ArtifaktElement, Helvetica, Arial",
    "font-size": "14px",
  },
  row: {
    "&:hover, &.NameCell__hovered": {
      backgroundColor: "rgb(243,243,243)",
    },
    "border": "0",
  },
  searchBoxContainer: {
    height: "70%",
    marginLeft: "auto",
    marginRight: "auto",
    width: "50%",
  },
  skeletonLoading: {
    paddingRight: "15px",
  },
  table: {
    boxShadow: "none",
  },
  tooltip: {
    backgroundColor: "black",
  },
  typeIdRow: {
    display: "flex",
    flexBasis: "100%",
    flexWrap: "nowrap",
    height: "100%",
    justifyContent: "space-between",
    minWidth: 0,
  },
  typeIdRowLeft: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

/**
 * @param width - width of the table
 * @returns random width which fits half of the table
 */
const getRandomRowsNum = () => {
  return Math.floor(Math.random() * minRows + minRows);
};

/**
 * The default implementation for the InspectorTable `childGetter` callback.
 * @param child - The hierarchical child of the property the row represents.
 * @returns The passed in child.
 */
export const defaultInspectorTableChildGetter = (child: any): any => child;

/**
 * The default implementation for the InspectorTable `nameGetter` callback.
 * @param name - The id of the property the row represents.
 * @returns The passed in id.
 */
export const defaultInspectorTableNameGetter = (name: string): any => name;

/**
 * The default implementation of the `dataGetter` callback for the Inspector table
 * @param params - function handle
 */
export const defaultInspectorTableDataGetter = (params: IDataGetterParameter): React.ReactNode | null => null;

/**
 * A component for inspecting the workspace data. It supports displaying the name, context, typeid and value of
 * the data. How many columns and in which order these are shown is configurable by the user via the 'column' prop.
 * @hidden
 */
class InspectorTable<
  T extends IRowData<T> = IRowData,
  ITableProps = IInspectorTableProps<IRowData<T>>,
  > extends React.Component<ITableProps & IInspectorTableProps<IRowData<T>>, IInspectorTableState> {
  public static defaultProps: Partial<IInspectorTableProps> = {
    childGetter: defaultInspectorTableChildGetter,
    expandColumnKey: "name",
    nameGetter: defaultInspectorTableNameGetter,
    rowHeight: 32,
    // @TODO We keep this for now for backward compatibility, this should be removed,
    // when the API is finalized and the table is decoupled completely from the table.
    ...getDefaultPropertyTableProps(),
  };

  public static getDerivedStateFromProps<T>(
    props: IInspectorTableProps,
    state: IInspectorTableState<T>,
  ): Partial<IInspectorTableState<T>> {
    let newState: Partial<IInspectorTableState<T>> = {};
    if (props.checkoutInProgress) {
      newState = { editReferenceRowData: null };
    }
    if (props.activeRepositoryGuid !== state.expandedRepoGuid) {
      return {
        ...newState,
        expanded: props.activeRepositoryGuid && props.activeRepositoryGuid in state.expandedRepoMap ?
          { ...state.expandedRepoMap[props.activeRepositoryGuid] } : {},
        expandedRepoGuid: props.activeRepositoryGuid,
        expandedRepoMap: state.expandedRepoGuid ?
          { ...state.expandedRepoMap, [state.expandedRepoGuid]: { ...state.expanded } } : { ...state.expandedRepoMap },
      };
    }
    return newState;
  }

  private readonly dataCreation: boolean;
  private readonly columns: any;
  private readonly debouncedSearchChange: (searchExpression: string) => void;
  private readonly table;
  private toTableRowOptions: IToTableRowsOptions;
  public state: IInspectorTableState;

  public constructor(props: Readonly<IInspectorTableProps<T>>) {
    super(props as any);
    this.table = createRef<BaseTable>();

    this.state = {
      childToParentMap: {},
      commitHistoryVisible: false,
      currentResult: -1,
      editReferenceRowData: null,
      expanded: {},
      expandedRepoGuid: "",
      expandedRepoMap: {},
      foundMatches: [],
      matchesMap: {},
      searchDone: false,
      searchExpression: "",
      searchInProgress: false,
      showFormRowID: "0",
      sortBy: defaultSort,
      tableRows: [],
    };

    const { followReferences, dataCreationHandler, dataCreationOptionGenerationHandler } = props;
    this.dataCreation = !!dataCreationHandler && !!dataCreationOptionGenerationHandler;
    this.columns = this.generateColumns(props.width);
    this.toTableRowOptions = {
      addDummy: true, ascending: defaultSort.order === TableSortOrder.ASC,
      depth: 0, followReferences,
    };

    this.debouncedSearchChange = debounce((searchExpression: string) => {
      const newState: Partial<IInspectorTableState> = {
        childToParentMap: {}, currentResult: undefined, foundMatches: [], matchesMap: {},
        searchAbortHandler: undefined, searchDone: false, searchInProgress: false, searchState: undefined,
      };

      // If a search process was running already, stop it.
      if (this.state.searchAbortHandler) {
        this.state.searchAbortHandler();
      }

      if (searchExpression.length > 0) {
        // Trigger a new search process.
        const searchControls = this.startSearch(searchExpression, this.updateSearchState, false);
        newState.searchAbortHandler = searchControls ? searchControls.abortHandler : undefined;
        newState.searchState = searchControls ? searchControls.state : undefined;
        newState.currentResult = -1;
        newState.searchInProgress = true;
        newState.searchDone = false;
      }

      // Set the initial state for a fresh search.
      this.setState({ ...this.state, ...newState });
    }, 250);
  }

  public componentDidMount() {
    const { data, fillExpanded } = this.props;
    const { expanded } = this.state;
    if (data) {
      const updatedTableRows = this.props.toTableRows!({ data, id: "" }, this.props, this.toTableRowOptions);
      fillExpanded(expanded, updatedTableRows, this.props, this.toTableRowOptions);
      this.setState({ tableRows: updatedTableRows });
    }
  }

  public componentDidUpdate(prevProps: ITableProps, prevState: IInspectorTableState) {
    const { data, checkoutInProgress, followReferences } = this.props;
    const { currentResult, expanded, tableRows, searchExpression, sortBy } = this.state;
    let { foundMatches, childToParentMap } = this.state;
    this.toTableRowOptions.followReferences = followReferences;
    const newState = {} as Pick<IInspectorTableState, "currentResult" | "expanded" | "foundMatches" | "matchesMap" |
      "searchAbortHandler" | "searchDone" | "searchInProgress" | "searchState" | "tableRows" | "childToParentMap">;

    // Cancel all search activity and clear the search field when checking out a new repo.
    if (checkoutInProgress && searchExpression && searchExpression.length > 0) {
      this.handleOnClear();
    }

    // We need to keep search data up to date with the current data.
    // TODO: We cannot check if props.data changed, which is why we check props in general.
    // This has the undesired side effect that we also restart search when the browser window is resized, for example.
    if ((prevProps !== this.props || prevState.sortBy.order !== sortBy.order) && !checkoutInProgress) {
      if (data) {
        const updatedTableRows = this.props.toTableRows!({ data, id: "" }, this.props,
          this.toTableRowOptions);
        this.props.fillExpanded(expanded, updatedTableRows, this.props, this.toTableRowOptions);
        // We need to update the table rows directly, because they might be used in the search call below.
        // Treating table rows as a mutable state property is fine, since it is purely derived from props anyway, and
        // we also update it directly in other places already.

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.state.tableRows = updatedTableRows;
        // We still need to add it to the new state to trigger a re-render of the table.
        newState.tableRows = updatedTableRows;
      }

      if (searchExpression.length > 0) {
        // If a search process was running already, stop it.
        if (this.state.searchAbortHandler) {
          this.state.searchAbortHandler();
        }

        // Trigger the new search and update the state.
        const searchControls = this.startSearch(searchExpression, this.updateSearchState, false);
        newState.searchAbortHandler = searchControls ? searchControls.abortHandler : undefined;
        newState.searchState = searchControls ? searchControls.state : undefined;
        newState.searchDone = false;
        newState.searchInProgress = true;
        newState.currentResult = -1;
        newState.foundMatches = [];
        newState.matchesMap = {};
        newState.childToParentMap = {};

        foundMatches = [];
        childToParentMap = {};
      }
    }

    // Scroll the table to the current search result.
    // TODO: As above, we should check for changes in props.data rather than just props.
    let scrollingRequired = false;
    let toExpand;
    if (searchExpression.length > 0 && foundMatches.length > 0 && !checkoutInProgress &&
      prevState.currentResult !== currentResult) {
      // need to update expanded according to the new currentResult
      toExpand = showNextResult(tableRows, expanded, foundMatches, currentResult!, childToParentMap);
      newState.expanded = toExpand.expandedRows;
      scrollingRequired = true;
    }

    // Update the state if necessary, and also scroll and/or force update the base table when required.
    if (Object.keys(newState).length > 0) {
      this.setState(newState, () => {
        if (scrollingRequired) {
          (this.table.current as any).scrollToRow(toExpand.rowIdx);
        }
      });
    }
  }

  public render() {
    const {
      childGetter,
      classes,
      columns,
      currentUrn,
      data,
      deleteRepo,
      expired,
      followReferences,
      getRepoExpiry,
      height,
      isV1Urn,
      nameGetter,
      repositoryUrn,
      rowIconRenderer,
      searchBoxProps,
      setRepoExpiry,
      width,
      activeRepositoryGuid,
      ...restProps } = this.props;

    const {
      searchExpression,
      expanded,
      sortBy,
      currentResult,
      foundMatches,
      searchInProgress,
      editReferenceRowData,
    } = this.state;

    let rows = this.state.tableRows;

    let expandedKeys: string[] = [];
    let emptyDescription: string;
    if (data !== undefined) {
      expandedKeys = Object.keys(expanded);
      emptyDescription = InspectorMessages.EMPTY_WORKSPACE;
    } else {
      rows = [];
      emptyDescription = InspectorMessages.NO_DATA;
    }
    // Set up the animation data in case we are currently checking out
    const circleSkeleton = (
      <div className={this.props.classes.skeletonLoading}>
        <Skeleton circle={true} height={14} width={14} />
      </div>
    );
    const skeletonExpandIcon = ({ ...rest }) =>
      Object.keys(rest).length === 0 ? null : themedSkeleton(circleSkeleton);
    const components = this.props.checkoutInProgress ? { ExpandIcon: skeletonExpandIcon } : {};
    const fakeRows = Array.from(Array(getRandomRowsNum()), (x, i) => ({ id: i.toString() }));
    const rowsData = this.props.checkoutInProgress ? fakeRows : rows;
    const getHeader = ({ cells, headerIndex }) => {
      if (headerIndex === 1) {
        return cells;
      }
      return (
        <InspectorTableHeader
          searchBoxProps={{
            currentResult,
            onChange: this.handleSearchExpressionChange,
            onClear: this.handleOnClear,
            onNext: this.handleCurrentResultChange,
            onPrevious: this.handleCurrentResultChange,
            searchExpression,
            searchInProgress,
            totalResults: foundMatches.length,
            ...searchBoxProps,
          }}
        />
      );
    };

    const getEmptyPanel = (repoIsExpired: boolean = false) => {
      const modalEnabled = !!repositoryUrn && !!currentUrn && !isV1Urn;
      if (repoIsExpired) {
        return (
          <Empty
            description={
              <div className={classes.expiredNotice}>
                <span>
                  Expired repositories are destroyed after 30 days.<br />
                  Until they get destroyed, expired repositories can be restored.
                  {
                    !modalEnabled &&
                    <span>
                      <br /><br />Undeleting expired repositories is only possible with v2 urns.<br />
                      Please change your v1 urn ({this.props.currentUrn}) into a v2 urn manually and reload.
                    </span>
                  }
                </span>
                <ModalConsumer>
                  {({ showModal, hideModal }) => (
                    <Button
                      className={classes.expiryButton}
                      color="primary"
                      disabled={!modalEnabled}
                      variant="contained"
                      onClick={
                        () => {
                          const modalProps = {
                            deleteRepo: deleteRepo!,
                            getRepoExpiry: getRepoExpiry!,
                            isV1Urn: isV1Urn!,
                            onClosed: hideModal,
                            repositoryUrn: repositoryUrn!,
                            setRepoExpiry: setRepoExpiry!,
                          };
                          showModal(ExpiryModal, modalProps);
                        }
                      }
                    >
                      Manage Repository Expiry
                    </Button>
                  )}
                </ModalConsumer>
              </div>}
            iconId={"expired"}
            iconSize={computeIconSize(width)}
            message={"This repository is expired"}
          />
        );
      } else {
        return (
          <Empty
            description={emptyDescription}
            iconId={"no-data"}
            iconSize={computeIconSize(width)}
            message={"There is no data to show"}
          />
        );
      }
    };

    const rowEventHandlers = {
      onClick: ({ rowKey, rowData }) => {
        if (rowData.isNewDataRow && this.state.showFormRowID === "0") {
          this.setState({ showFormRowID: rowKey });
        }
      },
    };

    return (
      <div className={classes.root}>
        <BaseTable<T>
          ref={this.table}
          data={rowsData}
          width={width}
          className={classes.table}
          headerHeight={[36, 36]}
          headerClassName={classes.header}
          headerRenderer={getHeader}
          rowClassName={({ rowIndex }) => classNames(classes.row,
            (rowIndex % 2 === 0) ? classes.evenRow : classes.oddRow)}
          gridStyle={{ outline: "none" }}
          onRowExpand={this.handleRowExpanded}
          expandedRowKeys={expandedKeys}
          height={height}
          {...restProps}
          columns={this.columns}
          onColumnSort={this.onColumnSort}
          sortBy={sortBy}
          footerHeight={32}
          footerRenderer={this.footerRenderer}
          emptyRenderer={getEmptyPanel(!!expired)}
          components={components}
          rowEventHandlers={rowEventHandlers}
        />
        {
          editReferenceRowData && this.props.editReferenceView &&
          <div style={{ position: "relative", width }}>
              {this.props.editReferenceView({
                getReferenceValue,
                onCancel: this.handleCancelEditReference,
                onSubmit: this.handleEditReference,
                editReferenceRowData,
              })}
            </div>
        }
      </div>
    );
  }

  private readonly generateColumns = (width: number) => {
    const columns: IColumns[] = [];
    width = width / this.props.columns.length;
    for (const currentId of this.props.columns) {
      const newColumn: IColumns = {
        dataGetter: this.props.dataGetter,
        dataKey: currentId,
        key: currentId,
        resizable: true,
        sortable: currentId === "name",
        title: currentId[0].toUpperCase() + currentId.slice(1), // Capitalize title
        width,
      };
      if (this.props.columnsRenderers !== undefined && this.props.columnsRenderers[currentId] !== undefined) {
        newColumn.cellRenderer = (args: any) => {
          const {
            foundMatches,
            currentResult,
            matchesMap,
          } = this.state;

          const searchResult: SearchResult = {
            foundMatches,
            currentResult,
            matchesMap,
          };

          return this.props.columnsRenderers![currentId]({
            ...args, tableProps: this.props,
            referenceHandler: {
              initialReferenceEdit: this.handleInitialEditReference,
              cancelReferenceEdit: this.handleCancelEditReference,
            },
            searchResult, renderCreationRow: this.renderCreationRow,
          });
        };
      }
      columns.push(newColumn);
    }
    return columns;
  };

  // @TODO turn it private when refactoring editing workflow
  private readonly handleCreateData = async (rowData: T, name: string, type: string, context: string) => {
    if (this.dataCreation) {
      await this.props.dataCreationHandler!(rowData, name, type, context);
      this.setState({ showFormRowID: "0" });
    }
  };

  private readonly handleCancelCreate = () => {
    this.setState({ showFormRowID: "0" });
  };

  private readonly renderCreationRow = (rowData: T) => {
    const { dataCreationOptionGenerationHandler, generateForm, classes } = this.props;
    const result = dataCreationOptionGenerationHandler!(rowData, true);
    const { showFormRowID } = this.state;

    return (
      <div className={classes.dataFormContainer}>
        {
          showFormRowID !== "0" && rowData.isNewDataRow && showFormRowID === rowData.id ?
            generateForm.call(this, rowData, this.handleCreateData) &&
            this.props.addDataForm({
              handleCancelCreate: this.handleCancelCreate,
              handleCreateData: this.handleCreateData,
              options: this.props.dataCreationOptionGenerationHandler!(rowData, false).options,
              rowData,
              styleClass: classes.dataForm,
            }) :
            (rowData.isNewDataRow = true) && (
              <NewDataRow
                dataType={result.name}
              />
            )
        }
      </div>
    );
  };

  private readonly handleInitialEditReference = (rowData: T) => {
    this.setState({ editReferenceRowData: rowData });
  };

  private readonly handleCancelEditReference = () => {
    this.setState({ editReferenceRowData: null });
  };

  private readonly handleEditReference = async (newPath: string) => {
    const rowData = this.state.editReferenceRowData!;
    return this.props.editReferenceHandler!(rowData, newPath).finally(() => {
      this.removeIdFromExpanded(rowData.id);
      this.handleCancelEditReference();
    });
  };

  private readonly handleOnClear = () => {
    if (this.state.searchAbortHandler) {
      this.state.searchAbortHandler();
    }
    this.setState({
      currentResult: undefined, foundMatches: [], matchesMap: {}, searchAbortHandler: undefined,
      searchDone: false, searchExpression: "", searchInProgress: false, searchState: undefined,
    });
  };

  private readonly handleCurrentResultChange = (newResult: number) => {
    if (this.state.currentResult !== undefined &&
      this.state.currentResult < newResult &&
      this.state.currentResult === this.state.foundMatches.length - 1 &&
      !this.state.searchDone) {
      this.continueSearchOnDemand();
    } else if (this.state.searchDone && this.state.currentResult === this.state.foundMatches.length - 1) {
      this.setState({ currentResult: 0 });
    } else {
      this.setState({ currentResult: newResult });
    }
  };

  private readonly continueSearchOnDemand = () => {
    const newState: Pick<IInspectorTableState, "searchAbortHandler" | "searchInProgress" | "searchState"> = {
      searchInProgress: true,
    };
    const { searchExpression } = this.state;
    const searchControls = this.startSearch(searchExpression, this.updateSearchState);
    if (searchControls) {
      newState.searchAbortHandler = searchControls.abortHandler;
      newState.searchState = searchControls.state;
      this.setState(newState);
    }
  };

  private readonly startSearch = (
    searchExpression: string,
    callback: IInspectorSearchCallback,
    keepMatches = true,
  ): IInspectorSearchControls | undefined => {
    const { data, fillExpanded } = this.props;
    const { searchState, tableRows } = this.state;
    const currentWorkspace = data;
    if (currentWorkspace) {
      const searchControls = search(searchExpression, tableRows, this.props.dataGetter,
        this.columns, callback, this.props,
        this.toTableRowOptions,
        keepMatches ? searchState : undefined, undefined, undefined, undefined, fillExpanded);
      return searchControls;
    } else {
      return undefined;
    }
  };

  private readonly handleSearchExpressionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const searchExpression = event.target.value;
    this.debouncedSearchChange(searchExpression);
    this.setState({ searchExpression });
  };

  private readonly footerRenderer = () => {
    return (
      <InspectorTableFooter
        handleCollapseAll={this.handleCollapseAll}
        handleExpandAll={this.handleExpandAll}
        parentProps={this.props}
      />
    );
  };

  private readonly removeIdFromExpanded = (id: string) => {
    const newExpanded = { ...this.state.expanded };
    delete newExpanded[id];
    this.setState({ expanded: newExpanded });
  };

  // @TODO: Add tests.
  private readonly traverseTree = (item: IRowData, func: (item: IRowData) => any) => {
    if (item) {
      func(item);
      const tableRows = item.children;
      if (tableRows) {
        tableRows.forEach((row) => {
          this.traverseTree(row, func);
        });
      }
    }
  };

  // @TODO: Add tests.
  private readonly handleExpandAll = ({ data }) => {
    if (data) {
      const output = this.props.expandAll(data);

      const tableRows = this.state.tableRows;
      tableRows.forEach((item) => {
        this.traverseTree(item, (item) => {
          if (item.children && !item.isReference) {
            if (item.children[0].context === "d") {
              this.props.fillExpanded({ [item.id]: true }, [item], this.props, this.toTableRowOptions);
            }
          }
        });
      });

      this.setState({
        expanded: output,
      });
    }
  };

  private readonly handleCollapseAll = () => {
    this.setState({ expanded: {} });
  };

  /**
   * Maps the expanded row to either the filteredExpanded list or the whole dataset expanded list. This
   * allows the user to come back to the state before performing the filtering
   */

  private readonly handleRowExpanded = ({ expanded: newExpandedFlag, rowData }: { expanded: boolean; rowData: T; }) => {
    const newExpanded = { ...this.state.expanded };
    const idInExpanded = rowData.id in newExpanded;
    if (newExpandedFlag && !idInExpanded) {
      newExpanded[rowData.id] = true;
      if (rowData.children && rowData.children![0].id === "d") {
        this.props.fillExpanded(newExpanded, this.state.tableRows, this.props, this.toTableRowOptions);
      }
    } else if (!newExpandedFlag && idInExpanded) {
      delete newExpanded[rowData.id];
    }
    this.setState({ expanded: newExpanded });
  };
  private readonly onColumnSort = (sortBy) => {
    this.setState({
      sortBy,
    });
  };

  private readonly updateSearchState = (foundMatches: IInspectorSearchMatch[], matchesMap: IInspectorSearchMatchMap,
    done: boolean, childToParentMap: { [key: string]: string; }) => {
    const newState = {} as Pick<IInspectorTableState, "currentResult" | "foundMatches" | "matchesMap" |
      "searchInProgress" | "searchAbortHandler" | "searchExpression" | "childToParentMap" | "searchDone" |
      "searchState">;

    newState.searchInProgress = false;
    if ((this.state.currentResult === -1 || this.state.currentResult === undefined) && foundMatches.length > 0) {
      newState.currentResult = 0;
    }
    if (this.state.foundMatches.length < foundMatches.length) {
      newState.foundMatches = foundMatches.slice();
      newState.matchesMap = { ...matchesMap };
      newState.childToParentMap = { ...childToParentMap };
      newState.currentResult = foundMatches.length - 1;
    } else if (done && foundMatches.length > 0) {
      newState.currentResult = 0;
    }
    if (done) {
      newState.searchAbortHandler = undefined;
      newState.searchDone = true;
      newState.searchState = undefined;
    }
    this.setState(newState);
  };
}

const StyledInspectorTable = withStyles(styles, { name: "InspectorTable" })(InspectorTable as any);
export { StyledInspectorTable as InspectorTable };
