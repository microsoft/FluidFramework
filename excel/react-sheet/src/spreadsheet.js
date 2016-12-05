"use strict";

var React = require('react');
var ReactDOM = require('react-dom');
var $ = require('jquery');

var RowComponent = require('./row');
var Dispatcher = require('./dispatcher');
var Helpers = require('./helpers');

var SpreadsheetComponent = React.createClass({
    spreadsheetId: null,

    /**
     * React 'getInitialState' method
     */
    getInitialState: function() {
        var initialData = this.props.initialData || {};

        if (!initialData.rows) {
            initialData.rows = [];

            for (var i = 0; i < this.props.config.rows; i = i + 1) {
                initialData.rows[i] = [];
                for (var ci = 0; ci < this.props.config.columns; ci = ci + 1) {
                    initialData.rows[i][ci] = '';
                }
            }
        }

        return {
            data: initialData,
            selected: null,
            lastBlurred: null,
            selectedElement: null,
            editing: false
        };
    },

    /**
     * React 'componentDidMount' method
     */
    componentDidMount: function () {
        this.bindKeyboard();

        $('body').on('focus', 'input', function (e) {
            $(this)
                .one('mouseup', function () {
                    $(this).select();
                    return false;
                })
                .select();
        });
    },

    /**
     * React Render method
     * @return {[JSX]} [JSX to render]
     */
    render: function() {
        var data = this.state.data,
            config = this.props.config,
            _cellClasses = this.props.cellClasses,
            rows = [], key, i, cellClasses;

        this.spreadsheetId = this.props.spreadsheetId || Helpers.makeSpreadsheetId();

        // Sanity checks
        if (!data.rows && !config.rows) {
            return console.error('Table Component: Number of colums not defined in both data and config!');
        }

        // Create Rows
        for (i = 0; i < data.rows.length; i = i + 1) {
            key = 'row_' + i;
            cellClasses = (_cellClasses && _cellClasses.rows && _cellClasses.rows[i]) ? _cellClasses.rows[i] : null;

            rows.push(<RowComponent cells={data.rows[i]}
                                    cellClasses={cellClasses}
                                    uid={i}
                                    key={key}
                                    config={config}
                                    selected={this.state.selected}
                                    editing={this.state.editing}
                                    handleSelectCell={this.handleSelectCell}
                                    handleDoubleClickOnCell={this.handleDoubleClickOnCell}
                                    handleCellBlur={this.handleCellBlur}
                                    onCellValueChange={this.handleCellValueChange}
                                    spreadsheetId={this.spreadsheetId}
                                    className="cellComponent" />);
        }

        return (
            <table tabIndex="0" data-spreasheet-id={this.spreadsheetId}>
                <tbody>
                    {rows}
                </tbody>
            </table>
        );
    },

    /**
     * Binds the various keyboard events dispatched to table functions
     */
    bindKeyboard: function () {
        Dispatcher.setupKeyboardShortcuts($(ReactDOM.findDOMNode(this))[0], this.spreadsheetId);

        Dispatcher.subscribe('up_keyup', data => {
            this.navigateTable('up', data);
        }, this.spreadsheetId);
        Dispatcher.subscribe('down_keyup', data => {
            this.navigateTable('down', data);
        }, this.spreadsheetId);
        Dispatcher.subscribe('left_keyup', data => {
            this.navigateTable('left', data);
        }, this.spreadsheetId);
        Dispatcher.subscribe('right_keyup', data => {
            this.navigateTable('right', data);
        }, this.spreadsheetId);
        Dispatcher.subscribe('tab_keyup', data => {
            this.navigateTable('right', data, null, true);
        }, this.spreadsheetId);

        // Prevent brower's from jumping to URL bar
        Dispatcher.subscribe('tab_keydown', data => {
            if ($(document.activeElement) && $(document.activeElement)[0].tagName === 'INPUT') {
                if (data.preventDefault) {
                    data.preventDefault();
                } else {
                    // Oh, old IE, you 💩
                    data.returnValue = false;
                }
            }
        }, this.spreadsheetId);

        Dispatcher.subscribe('remove_keydown', data => {
            if (!$(data.target).is('input, textarea')) {
                if (data.preventDefault) {
                    data.preventDefault();
                } else {
                    // Oh, old IE, you 💩
                    data.returnValue = false;
                }
            }
        }, this.spreadsheetId);

        Dispatcher.subscribe('enter_keyup', () => {
            if (this.state.selectedElement) {
                this.setState({editing: !this.state.editing});
            }
            $(ReactDOM.findDOMNode(this)).first().focus();
        }, this.spreadsheetId);

        // Go into edit mode when the user starts typing on a field
        Dispatcher.subscribe('letter_keydown', () => {
            if (!this.state.editing && this.state.selectedElement) {
                Dispatcher.publish('editStarted', this.state.selectedElement, this.spreadsheetId);
                this.setState({editing: true});
            }
        }, this.spreadsheetId);

        // Delete on backspace and delete
        Dispatcher.subscribe('remove_keyup', () => {
            if (this.state.selected && !Helpers.equalCells(this.state.selected, this.state.lastBlurred)) {
                this.handleCellValueChange(this.state.selected, '');
            }
        }, this.spreadsheetId);
    },

    /**
     * Navigates the table and moves selection
     * @param  {string} direction                               [Direction ('up' || 'down' || 'left' || 'right')]
     * @param  {Array: [number: row, number: cell]} originCell  [Origin Cell]
     * @param  {boolean} inEdit                                 [Currently editing]
     */
    navigateTable: function (direction, data, originCell, inEdit) {
        // Only traverse the table if the user isn't editing a cell,
        // unless override is given
        if (!inEdit && this.state.editing) {
            return false;
        }

        // Use the curently active cell if one isn't passed
        if (!originCell) {
            originCell = this.state.selectedElement;
        }

        // Prevent default
        if (data.preventDefault) {
            data.preventDefault();
        } else {
            // Oh, old IE, you 💩
            data.returnValue = false;
        }

        var $origin = $(originCell),
            cellIndex = $origin.index(),
            target;

        if (direction === 'up') {
            target = $origin.closest('tr').prev().children().eq(cellIndex).find('span');
        } else if (direction === 'down') {
            target = $origin.closest('tr').next().children().eq(cellIndex).find('span');
        } else if (direction === 'left') {
            target = $origin.closest('td').prev().find('span');
        } else if (direction === 'right') {
            target = $origin.closest('td').next().find('span');
        }

        if (target.length > 0) {
            target.click();
        } else {
            this.extendTable(direction, originCell);
        }
    },

    /**
     * Extends the table with an additional row/column, if permitted by config
     * @param  {string} direction [Direction ('up' || 'down' || 'left' || 'right')]
     */
    extendTable: function (direction) {
        var config = this.props.config,
            data = this.state.data,
            newRow, i;

        if (direction === 'down' && config.canAddRow) {
            newRow = [];

            for (i = 0; i < this.state.data.rows[0].length; i = i + 1) {
                newRow[i] = '';
            }

            data.rows.push(newRow);
            Dispatcher.publish('rowCreated', data.rows.length, this.spreadsheetId);
            return this.setState({data: data});
        }

        if (direction === 'right' && config.canAddColumn) {
            for (i = 0; i < data.rows.length; i = i + 1) {
                data.rows[i].push('');
            }

            Dispatcher.publish('columnCreated', data.rows[0].length, this.spreadsheetId);
            return this.setState({data: data});
        }

    },

    /**
     * Callback for 'selectCell', updating the selected Cell
     * @param  {Array: [number: row, number: cell]} cell [Selected Cell]
     * @param  {object} cellElement [Selected Cell Element]
     */
    handleSelectCell: function (cell, cellElement) {
        Dispatcher.publish('cellSelected', cell, this.spreadsheetId);
        $(ReactDOM.findDOMNode(this)).first().focus();

        this.setState({
            selected: cell,
            selectedElement: cellElement
        });
    },

    /**
     * Callback for 'cellValueChange', updating the cell data
     * @param  {Array: [number: row, number: cell]} cell [Selected Cell]
     * @param  {object} newValue                         [Value to set]
     */
    handleCellValueChange: function (cell, newValue) {
        var data = this.state.data,
            row = cell[0],
            column = cell[1],
            oldValue = data.rows[row][column];

        Dispatcher.publish('cellValueChanged', [cell, newValue, oldValue], this.spreadsheetId);

        data.rows[row][column] = newValue;
        this.setState({
            data: data
        });

        Dispatcher.publish('dataChanged', data, this.spreadsheetId);
    },

    /**
     * Callback for 'doubleClickonCell', enabling 'edit' mode
     */
    handleDoubleClickOnCell: function () {
        this.setState({
            editing: true
        });
    },

    /**
     * Callback for 'cellBlur'
     */
    handleCellBlur: function (cell) {
        if (this.state.editing) {
            Dispatcher.publish('editStopped', this.state.selectedElement);
        }

        this.setState({
            editing: false,
            lastBlurred: cell
        });
    }
});

module.exports = SpreadsheetComponent;
