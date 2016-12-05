"use strict";

var React = require('react');

var CellComponent = require('./cell');
var Helpers = require('./helpers');

var RowComponent = React.createClass({    
    /**
     * React Render method
     * @return {[JSX]} [JSX to render]
     */
    render: function() {
        var config = this.props.config,
            cells = this.props.cells,
            columns = [],
            key, uid, selected, cellClasses, i;

        if (!config.columns || cells.length === 0) {
            return console.error('Table can\'t be initialized without set number of columsn and no data!');
        }

        for (i = 0; i < cells.length; i = i + 1) {
            // If a cell is selected, check if it's this one
            selected = Helpers.equalCells(this.props.selected, [this.props.uid, i]);
            cellClasses = (this.props.cellClasses && this.props.cellClasses[i]) ? this.props.cellClasses[i] : '';

            key = 'row_' + this.props.uid + '_cell_' + i;
            uid = [this.props.uid, i];
            columns.push(<CellComponent key={key} 
                                       uid={uid}
                                       value={cells[i]}
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
});

module.exports = RowComponent;