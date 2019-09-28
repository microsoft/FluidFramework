/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap } from "@microsoft/fluid-map";
import * as React from "react";
import { Coordinate, CoordinateString } from "../helpers/coordinate";
import { loadPuzzle, PUZZLE_INDEXES } from "../helpers/puzzles";
import { CellState, SudokuCell } from "../helpers/sudokuCell";

interface ISudokuViewProps {
    puzzle: ISharedMap;
}

export function SudokuView(props: ISudokuViewProps) {
    const [theme, setTheme] = React.useState("default");
    const handleResetButton = (
        e: React.MouseEvent<HTMLButtonElement, MouseEvent>
    ) => {
        props.puzzle.forEach((value: SudokuCell, key: CoordinateString) => {
            if (!value.fixed && value.value !== 0) {
                value.value = 0;
                props.puzzle.set(key, value);
            }
        });
    };

    const loadPuzzle1 = (
        e: React.MouseEvent<HTMLButtonElement, MouseEvent>
    ) => {
        loadPuzzle(0, props.puzzle);
    };

    const loadPuzzle2 = (
        e: React.MouseEvent<HTMLButtonElement, MouseEvent>
    ) => {
        loadPuzzle(1, props.puzzle);
    };

    return (
        <div className={"sudoku " + theme}>
            <div className="sudoku-theme-select">
                <label htmlFor="theme-select"> Select a theme</label>
                <select
                    value={theme}
                    onChange={onSelect}
                    id="theme-select"
                    name="theme"
                >
                    <option value="default">Default Theme</option>
                    <option value="dark-theme">Dark Theme</option>
                    <option value="third">Third Value</option>
                </select>
            </div>
            <div className="sudoku-wrapper">
                <SimpleTable puzzle={props.puzzle} />
                <div className="sudoku-buttons">
                    <span className="sudoku-reset">
                        <button onClick={handleResetButton}>Reset</button>
                    </span>

                    <span className="sudoku-load">
                        Load:
                        <button onClick={loadPuzzle1}>Puzzle 1</button>
                        <button onClick={loadPuzzle2}>Puzzle 2</button>
                    </span>
                </div>
            </div>
        </div>
    );

    function onSelect(e) {
        setTheme(e.target.value);
    }
}

interface ISimpleTableProps {
    puzzle: ISharedMap;
}

function SimpleTable(props: ISimpleTableProps) {
    const renderGridRows = () => {
        const rows = PUZZLE_INDEXES.map(row => {
            const columns = PUZZLE_INDEXES.map(col => {
                const coord = Coordinate.asString(row, col);
                const currentCell = props.puzzle.get<SudokuCell>(coord);
                const state = SudokuCell.getState(currentCell);
                let inputClasses: string;
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

                const disabled = currentCell.fixed === true;
                return (
                    <td
                        className="sudoku-cell"
                        key={coord}
                        style={getCellBorderStyles(coord)}
                    >
                        <input
                            className={inputClasses}
                            type="text"
                            onChange={inputChangeHandlerFactory(
                                dataSetter(props.puzzle)
                            )}
                            value={SudokuCell.getDisplayString(currentCell)}
                            disabled={disabled}
                            data-fluidmapkey={coord}
                        />
                    </td>
                );
            });
            return <tr key={row.toString()}>{columns}</tr>;
        });
        return rows;
    };

    return (
        <table style={{ border: "none", borderSpacing: "4px" }}>
            <tbody>{renderGridRows()}</tbody>
        </table>
    );
}

/**
 * This function accepts an ISharedMap and returns a function that can be called to set SudokuCell data on that map.
 *
 * @param map A SharedMap in which to store SudokuCells.
 * @returns A function that will set SudokuCell data on the provided ISharedMap.
 */
function dataSetter(map: ISharedMap) {
    const setData = (row: number, column: number, value: number) => {
        const toSet = map.get<SudokuCell>(Coordinate.asString(row, column));
        toSet.value = value;
        toSet.isCorrect = value === toSet.correctValue;
        map.set(Coordinate.asString(row, column), toSet);
    };
    return setData;
}

/**
 * This factory creates ChangeEvent handlers for input fields that, when called, will call the dataSetter function
 * provided.
 */
function inputChangeHandlerFactory(
    setData: (r: number, c: number, valueToSet: number) => void
) {
    const handler = (e: React.ChangeEvent<HTMLInputElement>) => {
        let valueToSet = Number(e.target.value);
        valueToSet = Number.isNaN(valueToSet) ? 0 : valueToSet;
        const key = e.target.getAttribute("data-fluidmapkey");
        if (key !== null) {
            const [row, col] = Coordinate.asArrayNumbers(key);
            setData(row, col, valueToSet);
        }
    };
    return handler;
}

/**
 * Returns CSS border properties to use when rendering a cell. This helps give the grid that authentic Sudoku look.
 */
function getCellBorderStyles(coord: CoordinateString): React.CSSProperties {
    const borderStyle = "solid medium";
    const styles: React.CSSProperties = {
        borderTop: "none",
        borderBottom: "none",
        borderLeft: "none",
        borderRight: "none",
    };
    const [row, col] = Coordinate.asArrayNumbers(coord);

    switch (row) {
        case 0:
        case 3:
        case 6:
            styles.borderTop = borderStyle;
            break;
        case 2:
        case 5:
        case 8:
            styles.borderBottom = borderStyle;
            break;
        default: // nothing
    }

    switch (col) {
        case 0:
        case 3:
        case 6:
            styles.borderLeft = borderStyle;
            break;
        case 2:
        case 5:
        case 8:
            styles.borderRight = borderStyle;
            break;
        default: // nothing
    }
    return styles;
}
