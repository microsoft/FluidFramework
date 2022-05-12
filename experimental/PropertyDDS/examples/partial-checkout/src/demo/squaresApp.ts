/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerProperty, PropertyFactory } from "@fluid-experimental/property-properties";

// import { IPropertyTree } from "../dataObject";
import { DataBinder } from "@fluid-experimental/property-binder";
import _ from "lodash";
import { SQUARES_DEMO_SCHEMAS } from "@fluid-experimental/schemas";
import { assert } from "@fluidframework/common-utils";
import { IPropertyTree } from "../dataObject";
import { renderMoveButton } from "../view";
import { SquaresBoard } from "./views/squaresBoard";
import { IPoint2D, Square } from "./views/square";

import { ColoredSquareBinding } from "./bindings/coloredSquareBinding";
import { SquaresBoardBinding } from "./bindings/squaresBoardBinding";

export function moveSquares(propertyNode: any, guid: string) {
    const board = propertyNode.get(guid);
    const squares = board.get("squares");
    return window.setInterval(() => {
        const ids = squares.getIds();
        const id = ids[_.random(ids.length - 1)];
        const square = squares.get(id);
        const position = square.get("position");
        const length = square.getValue("length");
        position.setValues({
            x: _.random(SquaresBoard.WIDTH - length),
            y: _.random(SquaresBoard.HEIGHT - length),
        });
        propertyNode._tree.commit();
    }, 10);
}

export function randomSquaresBoardGenerator(
    propertyNode: any,
    numberOfSquares: number,
    ) {
    const squares: any = {};
    for (let i = 0; i < numberOfSquares; i++) {
        const key = `square ${i}`;
        squares[key] = {
            position: {
                x: _.random(SquaresBoard.WIDTH - Square.DEFAULT_LENGTH),
                y: _.random(SquaresBoard.HEIGHT - Square.DEFAULT_LENGTH),
            },
            color: `#${ Math.floor(Math.random() * 16777215).toString(16) }`,
        };
    }
    propertyNode.insert(PropertyFactory.create("autofluid:squaresBoard-1.0.0", undefined, {
        squares,
    }));
}

export class SquaresApp {
    constructor(public dataBinder: DataBinder, readonly container: HTMLElement, readonly pTree: IPropertyTree) {
        this.dataBinder = dataBinder;
    }

    init() {
        // Define a runtime representation for squaresBoard & square typeids.
        this.dataBinder.defineRepresentation("view", "autofluid:squaresBoard-1.0.0", (property) => {
            const board = new SquaresBoard([], this.container);
            // Rendering move button to move board's squares randomly
            renderMoveButton(
                this.dataBinder.getPropertyTree()!,
                board.wrapper,
                property.getId() as string,
            );
            return board;
        });

        // Note: DataBinder will create the most specialized representation to a given a typeid.
        this.dataBinder.defineRepresentation("view", "autofluid:coloredSquare-1.0.0", (property) => {
            assert(property instanceof ContainerProperty, "Property should always be a ContainerProperty.");

            const values = property.getValues<any>();
            return new Square(values.position, values.color, (pos: IPoint2D) => {
                property.get<ContainerProperty>("position")!.setValues(pos);

                this.dataBinder.requestChangesetPostProcessing(_.debounce(() => {
                    this.dataBinder.getPropertyTree()?.commit();
                }, 20));
            },
                values.length,
            );
        }, {
            destroyer: (rep: Square) => rep.clean(),
        });

        // Registering data bindings to specific typeids.
        this.dataBinder.register("view", "autofluid:squaresBoard-1.0.0", SquaresBoardBinding);
        this.dataBinder.register("view", "autofluid:coloredSquare-1.0.0", ColoredSquareBinding);
    }

    // Registering all schemas used to build the property tree in this demo.
    static registerSchemas() {
        // We register the array of schemas used by this demo using PropertyFactory
        PropertyFactory.register(Object.values(SQUARES_DEMO_SCHEMAS));
    }
}

SquaresApp.registerSchemas();
