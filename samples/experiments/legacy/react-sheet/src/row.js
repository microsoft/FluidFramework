/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React, {PropTypes} from 'react';

import CellComponent from './cell';
import Helpers from './helpers';

class RowComponent extends React.Component {
  constructor(props, context) {
    super(props, context);
  }
    /**
     * React Render method
     * @return {[JSX]} [JSX to render]
     */
    render() {
        let config = this.props.config,
            cells = this.props.cells,
            columns = [],
            key, uid, selected, cellClasses, i;

        if (!config.columns || cells.length === 0) {

            return console.error('Table can\'t be initialized without set number of columsn and no data!'); // eslint-disable-line no-console
        }

        for (i = 0; i < cells.length; i = i + 1) {
            // If a cell is selected, check if it's this one
            selected = Helpers.equalCells(this.props.selected, [this.props.uid, i]);
            cellClasses = (this.props.cellClasses && this.props.cellClasses[i]) ? this.props.cellClasses[i] : '';

            key = 'row_' + this.props.uid + '_cell_' + i;
            uid = [this.props.uid, i];
            columns.push(<CellComponent key={key}
                                       uid={uid}
                                       value={cells[i].toString()}
                                       config={config}
                                       cellClasses={cellClasses}
                                       onCellValueChange={this.props.onCellValueChange}
                                       handleSelectCell={this.props.handleSelectCell}
                                       handleDoubleClickOnCell={this.props.handleDoubleClickOnCell}
                                       handleCellBlur={this.props.handleCellBlur}
                                       spreadsheetId={this.props.spreadsheetId}
                                       selected={selected}
                                       editing={this.props.editing} />
            );
        }

        return <tr>{columns}</tr>;
    }
}

RowComponent.propTypes = {
  config: PropTypes.object,
  editing: PropTypes.bool,
  cells: PropTypes.array,
  selected: PropTypes.array,
  uid: PropTypes.number,
  cellClasses: PropTypes.array,
  spreadsheetId: PropTypes.string,
  onCellValueChange: PropTypes.func,
  handleSelectCell: PropTypes.func,
  handleDoubleClickOnCell: PropTypes.func,
  handleCellBlur: PropTypes.func
};

export default RowComponent;
