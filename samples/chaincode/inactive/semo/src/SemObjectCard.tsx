/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

//aka.ms/praguedocs

import * as React from "react";
import { Button, Card, Dropdown, Icon, List, Popup, Progress, Table } from "semantic-ui-react";
import {
  removeSemObj,
  deleteSemObjTableRow,
  moveSemObjTableRow,
  deleteSemObjTableColumn,
  moveSemObjTableColumn
} from "./methods";
import { find, keys, times, groupBy, map } from "lodash";

import OnlineEdit from "./OnlineEdit";

const SemValLeaseDurationMs = 12 * 1000; // TODO - connect this with the similar value in OnlineEdit.js

const _userNameColors = {
  DG: "rgba(110,203,216,0.2)",
  DP: "rgba(204,74,49,0.2)",
  KL: "rgba(147,126,227,0.2)",
  JH: "rgba(143,216,139,0.2)"
};
const _getColorStringForUsername = name =>
  name === undefined || name === ""
    ? "rgba(255,255,255,0)"
    : _userNameColors[name] || "rgba(180,120,216,0.2)";

interface SemObjectCardProps {
  sem: any;
  semVals: any[]; // improve this type
  semData: any; // TODO improve
  loading: boolean;
  validate: boolean;
  currentUser: string;
  updateSemValHandler: Function;
  appendSemObjTableRowHandler: Function;
  releaseSemValLeaseHandler: Function;
  appendSemObjTableColumnHandler: Function;
}

class SemObjectCard extends React.Component<SemObjectCardProps> {
  isInputValid: boolean = true;
  _histories: any[] = [];

  state = {
    showHistoryView: false,
    historyPercent: 100
  };

  componentWillMount() {
    this.isInputValid = this.props.validate || this.isInputValid;
    this._histories = [];
  }

  // note that is UNSAFE in react16
  componentWillReceiveProps(nextProps) {
    const { sem } = this.props;

    if (sem.updatedAt !== nextProps.sem.updatedAt) this._histories.push(sem);
  }

  _getSemVarIdForCell = (rowIdx, colIdx) =>
    this.props.sem.tables[0].cellSemValueIds[
      colIdx + rowIdx * this.props.sem.tables[0].columnCount
    ];

  _getSemValForCell = (rowIdx, colIdx) => {
    const semValId = this._getSemVarIdForCell(rowIdx, colIdx);
    return (
      find(this.props.semVals, { _id: semValId }) || {
        value: "",
        _id: semValId
      }
    );
  };

  _getColorStringForCell = (rowIdx, colIdx) =>
    _getColorStringForUsername(this._getSemValForCell(rowIdx, colIdx).lastUpdatedByName);

  renderCellPopupInHistoryView = (rowIdx, colIdx) => {
    const semVal = this._getSemValForCell(rowIdx, colIdx);
    if (!semVal || !semVal.updatedAt) return <span>Never edited</span>;

    return (
      <span>
        Last edited {semVal.friendlyUpdateDate()} by {semVal.lastUpdatedByName}
      </span>
    );
  };

  onRemove = () => {
    const {
      sem: { _id }
    } = this.props;
    removeSemObj.callPromise({ _id }).catch(err => {
      alert("An error occured. Please check the console");
      console.error(err);
    });
  };

  toggleHistoryView = () => {
    this.setState({ showHistoryView: !this.state.showHistoryView, historyPercent: 100 });
  };

  // TODO: Handle a different case that releases leases on enter / blur
  onValChange = (changeObj: any) => {
    // Let's do it for our SemValue
    this.props.updateSemValHandler(
      keys(changeObj)[0], // id of SemValue
      changeObj[keys(changeObj)[0]], // content
      this.props.currentUser, // leaseOwnerName
      new Date(Date.now() + SemValLeaseDurationMs) // leaseEndTime
    );
  };

  onAddColumn = () => {
    this.props.appendSemObjTableColumnHandler()
  };

  onAddRow = () => {
    const {
      sem: { _id }
    } = this.props;

    this.props.appendSemObjTableRowHandler({ _id, tableIdx: 0 });
  };

  onMoveRow = (rowIdx, moveDirection) => {
    const {
      sem: { _id, tables }
    } = this.props;
    const identifyingSemVarId = tables[0].cellSemValueIds[rowIdx * tables[0].columnCount];
    moveSemObjTableRow
      .callPromise({ _id, tableIdx: 0, identifyingSemVarId, moveDirection })
      .catch(err => {
        alert("An error occured. Please check the console");
        console.error(err);
      });
  };

  onMoveColumn = (colIdx, moveDirection) => {
    const {
      sem: { _id, tables }
    } = this.props;
    const identifyingSemVarId = tables[0].cellSemValueIds[colIdx];
    moveSemObjTableColumn
      .callPromise({ _id, tableIdx: 0, identifyingSemVarId, moveDirection })
      .catch(err => {
        alert("An error occured. Please check the console");
        console.error(err);
      });
  };

  onDeleteColumnIdx = colIdx => {
    const {
      sem: { _id, tables }
    } = this.props;
    const identifyingSemVarId = tables[0].cellSemValueIds[colIdx];

    deleteSemObjTableColumn
      .callPromise({ _id, tableIdx: 0, identifyingSemVarId })
      .catch(err => {
        alert("An error occured. Please check the console");
        console.error(err);
      });
  };

  onDeleteRowIdx = rowIdx => {
    const {
      sem: { _id, tables }
    } = this.props;
    const identifyingSemVarId = tables[0].cellSemValueIds[rowIdx * tables[0].columnCount];

    deleteSemObjTableRow.callPromise({ _id, tableIdx: 0, identifyingSemVarId }).catch(err => {
      alert("An error occured. Please check the console");
      console.error(err);
    });
  };

  onFinishEdit = releasedKey => {
    this.props.releaseSemValLeaseHandler(releasedKey);
  };

  oneOnlineEditForSemValId = (
    semValId: any,
    placeholder: string,
    fluid: boolean,
    reservedSpace
  ) => {
    const { showHistoryView } = this.state;
    const semVal: any = this.props.semData[semValId] || {
      content: "",
      _id: semValId
    };

    return (
      //!semVal ? "..." :
      <OnlineEdit
        isDisabled={showHistoryView}
        fluid={fluid}
        reservedSpace={reservedSpace}
        text={semVal.content || ""}
        paramName={semValId}
        leaseOwnerName={semVal.leaseOwnerName}
        leaseEndTime={semVal.leaseEndTime}
        placeholder={placeholder || "..."}
        onChange={this.onValChange}
        onFinishEdit={this.onFinishEdit}
        sendPartialChanges={true}
      />
    );
  };

  _onMousingInHistoryBar = e => {
    if (e.buttons === 1) {
      const w = e.currentTarget.getBoundingClientRect().width;
      this.setState({ historyPercent: Math.floor((100 * e.nativeEvent.offsetX) / w) });
    }
  };

  renderHistoryProgressBar = () => {
    const { historyPercent } = this.state;
    const historyIdx = Math.floor((historyPercent / 100) * this._histories.length);

    return (
      <Progress
        percent={historyPercent}
        size="small"
        onMouseMove={this._onMousingInHistoryBar}
        onMouseDown={this._onMousingInHistoryBar}
      >
        {historyIdx} of {this._histories.length}
      </Progress>
    );
  };

  oneOnlineEditForSemValTableCell = (tableIdx, rowIdx, colIdx) => {
    const table = this.props.sem.tables[tableIdx];
    const cellIdx = table.columnCount * rowIdx + colIdx;
    const semValId = table.cellSemValueIds[cellIdx];
    return this.oneOnlineEditForSemValId(semValId, "...", true, "2em");
  };

  render() {
    const { loading, semVals } = this.props;
    const { showHistoryView, historyPercent } = this.state;
    const historyIdx = Math.floor((historyPercent / 100) * this._histories.length);
    const sem = showHistoryView
      ? this._histories[historyIdx] || this.props.sem
      : this.props.sem;
    const { tables, titleSemVarId, descriptionSemVarId } = sem;

    if (loading) return null;

    const objectOptions = [
      { key: "adr", text: "Append Row", onClick: this.onAddRow },
      { key: "adc", text: "Append Column", onClick: this.onAddColumn },
      { key: "del", text: "Delete Object", onClick: this.onRemove }
    ];

    return (
      <div>
        <Card fluid>
          <Card.Content>
            <Card.Header>
              <Icon
                name="lightning"
                size="small"
                circular
                inverted
                style={{
                  float: "left",
                  marginRight: "10px",
                  marginTop: "8px",
                  opacity: 1
                }}
              />
              {this.oneOnlineEditForSemValId(titleSemVarId, "Title", false, "72px")}
            </Card.Header>
            <Card.Meta>
              {this.oneOnlineEditForSemValId(descriptionSemVarId, "Description", false, "72px")}
            </Card.Meta>
          </Card.Content>
          <Card.Content extra textAlign="right">
            <span style={{ float: "left" }}>
              <a href={`/${sem._id}`}>SemId #{sem._id}</a>
              {" created "}
              {/* {sem.friendlyCreationDate()} */}
            </span>
            <a>
              <Icon onClick={this.toggleHistoryView} name="history" />
            </a>
            <a>
              <Dropdown
                direction="left"
                icon="ellipsis horizontal"
                text="&nbsp;"
                options={objectOptions}
              />
            </a>
            {showHistoryView && (
              <div style={{ marginTop: "12px" }}>
                {this.renderHistoryProgressBar()}
                {semVals.length > 0 && (
                  <span>
                    {map(
                      groupBy(semVals, "lastUpdatedByName"),
                      (s, k) =>
                        k &&
                        k !== "undefined" && (
                          // Span not label because can't overrride <Label> color with css?
                          <span
                            key={k}
                            className="ui label small circular"
                            style={{
                              padding: "2px",
                              marginTop: "0",
                              backgroundColor: `${_getColorStringForUsername(k)}`
                            }}
                            title={s[0].friendlyUpdateDate()}
                          >
                            {k}
                          </span>
                        )
                    )}
                  </span>
                )}
              </div>
            )}
          </Card.Content>

          <Card.Content>
            {/* TODO... for each table */}

            {tables[0].columnCount === 1 && (
              <div>
                <List bulleted>
                  {times(tables[0].rowCount, rowIdx => (
                    <List.Item
                      style={
                        !showHistoryView
                          ? {}
                          : {
                              backgroundColor: this._getColorStringForCell(rowIdx, 0)
                            }
                      }
                      key={`lr-${tables[0].cellSemValueIds[rowIdx * tables[0].columnCount]}`}
                    >
                      {this.oneOnlineEditForSemValTableCell(0, rowIdx, 0)}
                    </List.Item>
                  ))}
                </List>
              </div>
            )}

            {tables[0].columnCount !== 1 && (
              <Table compact celled columns={tables[0].columnCount}>
                <Table.Body>
                  {times(tables[0].rowCount, rowIdx => (
                    <Table.Row key={`row${rowIdx}`}>
                      {times(tables[0].columnCount, colIdx => (
                        <Popup
                          verticalOffset={-11}
                          on="hover"
                          style={{
                            padding: "0.4em"
                          }}
                          mouseEnterDelay={0}
                          hoverable
                          basic
                          position="top left"
                          key={`cell${
                            tables[0].cellSemValueIds[colIdx + rowIdx * tables[0].columnCount]
                          }`}
                          trigger={
                            <Table.Cell
                              style={
                                !showHistoryView
                                  ? {}
                                  : {
                                      backgroundColor: this._getColorStringForCell(
                                        rowIdx,
                                        colIdx
                                      )
                                    }
                              }
                            >
                              {this.oneOnlineEditForSemValTableCell(0, rowIdx, colIdx)}
                            </Table.Cell>
                          }
                          content={
                            showHistoryView ? (
                              this.renderCellPopupInHistoryView(rowIdx, colIdx)
                            ) : (
                              <span>
                                <Icon name="font" />
                                <Dropdown
                                  direction="right"
                                  upward={false}
                                  text="&nbsp;"
                                  options={[
                                    {
                                      key: "txt",
                                      icon: "font",
                                      text: "Column is text"
                                    },
                                    {
                                      key: "num",
                                      icon: "calculator",
                                      text: "Column is numeric"
                                    },
                                    {
                                      key: "vot",
                                      icon: "checkmark box",
                                      text: "Column is vote"
                                    },
                                    {
                                      key: "rea",
                                      icon: "thumbs up",
                                      text: "Column is reactions"
                                    },
                                    {
                                      key: "cla",
                                      icon: "user circle",
                                      text: "Column is claim-for-person"
                                    },
                                    { key: "sp1", text: "" },
                                    {
                                      key: "mru",
                                      text: "Move Row up",
                                      disabled: rowIdx <= 0,
                                      onClick: () => this.onMoveRow(rowIdx, -1)
                                    },
                                    {
                                      key: "mrd",
                                      text: "Move Row down",
                                      disabled: rowIdx >= tables[0].rowCount - 1,
                                      onClick: () => this.onMoveRow(rowIdx, 1)
                                    },
                                    {
                                      key: "der",
                                      text: "Delete this Row",
                                      onClick: () => this.onDeleteRowIdx(rowIdx)
                                    },
                                    { key: "sp2", text: "" },
                                    {
                                      key: "mcl",
                                      text: "Move Column left",
                                      disabled: colIdx <= 0,
                                      onClick: () => this.onMoveColumn(colIdx, -1)
                                    },
                                    {
                                      key: "mcr",
                                      text: "Move Column right",
                                      disabled: colIdx >= tables[0].columnCount - 1,
                                      onClick: () => this.onMoveColumn(colIdx, 1)
                                    },
                                    {
                                      key: "dec",
                                      text: "Delete this Column",
                                      onClick: () => this.onDeleteColumnIdx(colIdx)
                                    }
                                  ]}
                                />
                              </span>
                            )
                          }
                        />
                      ))}
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            )}

            <Button
              basic
              size="small"
              style={{ float: "left", opacity: 0.8 }}
              onClick={this.onAddRow}
            >
              Add {tables[0].columnCount === 1 ? "Line" : "Row"}
            </Button>
            <Button
              basic
              size="small"
              style={{ float: "left", opacity: 0.8 }}
              onClick={this.onAddColumn}
            >
              Add Column
            </Button>
          </Card.Content>
        </Card>
      </div>
    );
  }
}

export default SemObjectCard;
