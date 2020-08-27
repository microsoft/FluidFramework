/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { Coordinate } from "../helpers/coordinate";
import { loadPuzzle, PUZZLE_INDEXES } from "../helpers/puzzles";
import { CellState, SudokuCell } from "../helpers/sudokuCell";
/**
 * Renders a Sudoku grid and UI for resetting/loading puzzles and changing the theme.
 * @param props - Props for the component
 */
export function SudokuView(props) {
    const [theme, setTheme] = React.useState("default");
    const handleResetButton = (e) => {
        props.puzzle.forEach((value, key) => {
            if (!value.fixed && value.value !== 0) {
                value.value = 0;
                props.puzzle.set(key, value);
            }
        });
    };
    const loadPuzzle1 = (e) => {
        loadPuzzle(0, props.puzzle);
    };
    const loadPuzzle2 = (e) => {
        loadPuzzle(1, props.puzzle);
    };
    return (React.createElement("div", { className: `sudoku ${theme}` },
        React.createElement("div", { className: "sudoku-wrapper" },
            React.createElement(SimpleTable, Object.assign({}, props)),
            React.createElement("div", { className: "sudoku-buttons" },
                React.createElement("span", { className: "sudoku-theme-select" },
                    React.createElement("label", { htmlFor: "theme-select" }, "Theme: "),
                    React.createElement("select", { value: theme, onChange: onThemeChange, id: "theme-select", name: "theme" },
                        React.createElement("option", { "aria-selected": theme === "default", value: "default" },
                            "Default Theme",
                            " "),
                        React.createElement("option", { "aria-selected": theme === "dark-theme", value: "dark-theme" }, "Dark Theme"))),
                React.createElement("span", { className: "sudoku-reset" },
                    React.createElement("button", { onClick: handleResetButton }, "Reset")),
                React.createElement("span", { className: "sudoku-load" },
                    "Load:",
                    React.createElement("button", { onClick: loadPuzzle1 }, "Puzzle 1"),
                    React.createElement("button", { onClick: loadPuzzle2 }, "Puzzle 2"))))));
    function onThemeChange(e) {
        setTheme(e.target.value);
    }
}
function SimpleTable(props) {
    const coordinateDataAttributeName = "cellcoordinate";
    const getCellInputElement = (coord) => document.getElementById(`${props.clientId}-${coord}`);
    const handleInputFocus = (e) => {
        const coord = e.target.dataset[coordinateDataAttributeName];
        if (props.setPresence) {
            if (coord !== undefined) {
                props.setPresence(coord, false);
            }
        }
    };
    const handleInputBlur = (e) => {
        const coord = e.target.dataset[coordinateDataAttributeName];
        if (props.setPresence) {
            if (coord !== undefined) {
                props.setPresence(coord, true);
            }
        }
    };
    const handleKeyDown = (e) => {
        e.preventDefault();
        let keyString = e.key;
        let coord = e.currentTarget.dataset[coordinateDataAttributeName];
        coord = coord === undefined ? "" : coord;
        const cell = props.puzzle.get(coord);
        switch (keyString) {
            case "Backspace":
            case "Delete":
            case "Del":
            case "0":
                keyString = "0";
            // Intentional fall-through
            case "1":
            case "2":
            case "3":
            case "4":
            case "5":
            case "6":
            case "7":
            case "8":
            case "9":
                if (cell.fixed) {
                    return;
                }
                numericInput(keyString, coord);
                return;
            default:
                moveCell(keyString, coord);
                return;
        }
    };
    const numericInput = (keyString, coord) => {
        let valueToSet = Number(keyString);
        valueToSet = Number.isNaN(valueToSet) ? 0 : valueToSet;
        if (valueToSet >= 10 || valueToSet < 0) {
            return;
        }
        if (coord !== undefined) {
            const cellInputElement = getCellInputElement(coord);
            cellInputElement.value = keyString;
            const toSet = props.puzzle.get(coord);
            if (toSet.fixed) {
                return;
            }
            toSet.value = valueToSet;
            toSet.isCorrect = valueToSet === toSet.correctValue;
            props.puzzle.set(coord, toSet);
        }
    };
    const moveCell = (keyString, coordIn) => {
        const coord = coordIn;
        let newCoord = coordIn;
        switch (keyString) {
            case "ArrowDown":
            case "s":
                newCoord = Coordinate.moveDown(coord);
                break;
            case "ArrowUp":
            case "w":
                newCoord = Coordinate.moveUp(coord);
                break;
            case "ArrowLeft":
            case "a":
                newCoord = Coordinate.moveLeft(coord);
                break;
            case "ArrowRight":
            case "d":
                newCoord = Coordinate.moveRight(coord);
                break;
            default:
                newCoord = coord;
        }
        const newCell = getCellInputElement(newCoord);
        newCell.focus();
    };
    const renderGridRows = () => {
        const rows = PUZZLE_INDEXES.map(row => {
            const columns = PUZZLE_INDEXES.map(col => {
                const coord = Coordinate.asString(row, col);
                const currentCell = props.puzzle.get(coord);
                const state = SudokuCell.getState(currentCell);
                let inputClasses;
                switch (state) {
                    case CellState.correct:
                        inputClasses = `sudoku-input correct`;
                        break;
                    case CellState.wrong:
                        inputClasses = `sudoku-input wrong`;
                        break;
                    default:
                        inputClasses = `sudoku-input`;
                }
                if (props.clientPresence) {
                    const cellOwner = props.clientPresence.get(coord);
                    if (cellOwner && cellOwner !== props.clientId) {
                        inputClasses += " presence";
                    }
                }
                // Const disabled = currentCell.fixed === true;
                return (React.createElement("td", { className: "sudoku-cell", key: coord, style: getCellBorderStyles(coord) },
                    React.createElement("input", { id: `${props.clientId}-${coord}`, className: inputClasses, type: "text", readOnly: true, onFocus: handleInputFocus, onBlur: handleInputBlur, onKeyDown: handleKeyDown, value: SudokuCell.getDisplayString(currentCell), max: 1, "data-cellcoordinate": coord })));
            });
            return React.createElement("tr", { key: row.toString() }, columns);
        });
        return rows;
    };
    return (React.createElement("table", { style: { border: "none" } },
        React.createElement("tbody", null, renderGridRows())));
}
/**
 * Returns CSS border properties to use when rendering a cell. This helps give the grid that authentic Sudoku look.
 */
function getCellBorderStyles(coord) {
    const borderStyle = "solid medium";
    const styles = {
        borderTop: "none",
        borderBottom: "none",
        borderLeft: "none",
        borderRight: "none",
        borderColor: "var(--neutralPrimaryAlt)",
    };
    const [row, col] = Coordinate.asArrayNumbers(coord);
    switch (row) {
        case 0:
        case 3:
        case 6:
            styles.borderTop = borderStyle;
            styles.paddingTop = 4;
            break;
        case 2:
        case 5:
        case 8:
            styles.borderBottom = borderStyle;
            styles.paddingBottom = 4;
            break;
        default: // Nothing
    }
    switch (col) {
        case 0:
        case 3:
        case 6:
            styles.borderLeft = borderStyle;
            styles.paddingLeft = 4;
            break;
        case 2:
        case 5:
        case 8:
            styles.borderRight = borderStyle;
            styles.paddingRight = 4;
            break;
        default: // Nothing
    }
    return styles;
}
//# sourceMappingURL=sudokuView.js.map