/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
/* eslint-disable import/no-internal-modules */
import { FocusZone } from "office-ui-fabric-react/lib/FocusZone";
import { List } from "office-ui-fabric-react/lib/List";
// eslint-disable-next-line import/no-extraneous-dependencies
import { ITheme, getTheme, mergeStyleSets } from "@uifabric/styling";
import { IRectangle } from "office-ui-fabric-react";
/* eslint-enable import/no-internal-modules */

export interface IListGridExampleProps {
    items: any[];
}

interface IListGridExampleClassObject {
    listGridExample: string;
    listGridExampleTile: string;
    listGridExampleSizer: string;
    listGridExamplePadder: string;
    listGridExampleLabel: string;
    listGridExampleImage: string;
}

const theme: ITheme = getTheme();
const { palette, fonts } = theme;

const classNames: IListGridExampleClassObject = mergeStyleSets({
    listGridExample: {
        overflow: "hidden",
        fontSize: 0,
        position: "relative",
    },
    listGridExampleTile: {
        textAlign: "center",
        outline: "none",
        position: "relative",
        float: "left",
        background: palette.neutralLighter,
        selectors: {
            "focus:after": {
                content: "",
                position: "absolute",
                left: 2,
                right: 2,
                top: 2,
                bottom: 2,
                boxSizing: "border-box",
                border: `1px solid ${palette.white}`,
            },
        },
    },
    listGridExampleSizer: {
        paddingBottom: "100%",
    },
    listGridExamplePadder: {
        position: "absolute",
        left: 2,
        top: 2,
        right: 2,
        bottom: 2,
    },
    listGridExampleLabel: {
        background: "rgba(0, 0, 0, 0.3)",
        color: "#FFFFFF",
        position: "absolute",
        padding: 10,
        bottom: 0,
        left: 0,
        width: "100%",
        fontSize: fonts.small.fontSize,
        boxSizing: "border-box",
    },
    listGridExampleImage: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
    },
});

const ROWS_PER_PAGE = 3;
const MAX_ROW_HEIGHT = 250;

export class ListGridExample extends React.Component<IListGridExampleProps> {
    private _columnCount: number;
    private _columnWidth: number;
    private _rowHeight: number;

    public render(): JSX.Element {
        return (
            <FocusZone>
                <List
                    className={classNames.listGridExample}
                    items={this.props.items}
                    getItemCountForPage={this._getItemCountForPage}
                    getPageHeight={this._getPageHeight}
                    renderedWindowsAhead={4}
                    onRenderCell={this._onRenderCell}
                />
            </FocusZone>
        );
    }

    private readonly _getItemCountForPage = (itemIndex: number, surfaceRect: IRectangle): number => {
        if (itemIndex === 0) {
            this._columnCount = Math.ceil(surfaceRect.width / MAX_ROW_HEIGHT);
            this._columnWidth = Math.floor(surfaceRect.width / this._columnCount);
            this._rowHeight = this._columnWidth;
        }

        return this._columnCount * ROWS_PER_PAGE;
    };

    private readonly _getPageHeight = (): number => this._rowHeight * ROWS_PER_PAGE;

    private readonly _onRenderCell = (item: any, index: number | undefined): JSX.Element => (
        <div
            className={classNames.listGridExampleTile}
            data-is-focusable={true}
            style={{
                width: `${100 / this._columnCount}%`,
            }}
        >
            <div className={classNames.listGridExampleSizer}>
                <div className={classNames.listGridExamplePadder}>
                    <img src={item.thumbnail} className={classNames.listGridExampleImage} />
                    <span className={classNames.listGridExampleLabel}>{`item ${index}`}</span>
                </div>
            </div>
        </div>
    );
}
