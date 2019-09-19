/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedCell, SharedCell } from "@microsoft/fluid-cell";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import { SharedString } from "@microsoft/fluid-sequence";
import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import { EmbeddedReactComponentFactory, IComponentReactViewable } from "@microsoft/fluid-aqueduct-react";
import { IComponentHandle, IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { TodoItemName } from "../TodoItem/index";
import { TodoView } from "./TodoView";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../../package.json");
export const TodoName = `${pkg.name as string}-todo`;

/**
 * Todo base component.
 * Visually contains the following:
 * - Title
 * - New todo item entry
 * - List of todo items
 */
export class Todo extends PrimedComponent implements IComponentHTMLVisual, IComponentReactViewable {

  // DDS ids stored as variables to minimize simple string mistakes
  private readonly innerCellIds = "innerCellIds";
  private readonly titleId = "title";
  private readonly sharedStringTitleId = "sharedString-title";

  // tslint:disable:prefer-readonly
  private innerCellIdsMap: ISharedMap;
  private titleTextCell: ISharedCell;
  private titleTextSharedString: SharedString;
  // tslint:enable:prefer-readonly

  public get IComponentHTMLVisual() { return this; }
  public get IComponentReactViewable() { return this; }

  /**
   * Do setup work here
   */
  protected async componentInitializingFirstTime() {
    // create a list for of all inner todo item components
    // we will use this to know what components to load.
    const map = SharedMap.create(this.runtime);
    this.root.set(this.innerCellIds, map.handle);

    // create a cell that we will use for the title
    // we use a cell because we pass it directly to the contentEditable
    const cell = SharedCell.create(this.runtime);
    // Set the default title
    cell.set("My New Todo");
    this.root.set(this.titleId, cell.handle);

    const text = SharedString.create(this.runtime);
    text.insertText(0, "Title");
    this.root.set(this.sharedStringTitleId, text.handle);
  }

  protected async componentHasInitialized() {
    const innerCellIdsMap = this.root.get<IComponentHandle>(this.innerCellIds).get<ISharedMap>();
    const titleTextCell = this.root.get<IComponentHandle>(this.titleId).get<ISharedCell>();
    const titleTextSharedString = this.root.get<IComponentHandle>(this.sharedStringTitleId).get<SharedString>();

    // tslint:disable-next-line: no-console
    console.log("here");
    this.context.on("op", (e) => {
      alert("hello");
      // tslint:disable-next-line: no-console
      console.log(JSON.stringify(e));
    });

    [
      this.innerCellIdsMap,
      this.titleTextCell,
      this.titleTextSharedString,
    ] = await Promise.all([
      innerCellIdsMap,
      titleTextCell,
      titleTextSharedString,
    ]);
  }

  // start IComponentHTMLVisual

  /**
   * Creates a new view for a caller that doesn't directly support React
   */
  public render(div: HTMLElement) {
    // Because we are using React and our caller is not we will use the
    // ReactDOM to render our JSX.Element directly into the provided div.
    // Because we support IComponentReactViewable and createViewElement returns a JSX.Element
    // we can just call that and minimize duplicate code.
    ReactDOM.render(
        this.createJSXElement(),
        div,
    );
  }

  // end IComponentHTMLVisual

  // start IComponentReactViewable

  /**
   * If our caller supports React they can query against the IComponentReactViewable
   * Since this returns a JSX.Element it allows for an easier model.
   */
  public createJSXElement(): JSX.Element {
    // callback that allows for creation of new Todo Items
    const createComponent = async (props?: any) => {
      // create a new ID for our component
      const id = `item${Date.now().toString()}`;

      // create a new todo item
      await this.createAndAttachComponent(id, TodoItemName, props);

      // Store the id of the component in our ids map so we can reference it later
      this.innerCellIdsMap.set(id, "");
    };

    // The factory allows us to create new embedded component without having to pipe the
    // getComponent call throughout the app.
    const factory = new EmbeddedReactComponentFactory(this.getComponent.bind(this));
    return(
      <TodoView
          getComponentView = {(id: string) => factory.create(id)}
          createComponent={createComponent.bind(this)}
          map={this.innerCellIdsMap}
          textSharedString={this.titleTextSharedString}
          textCell={this.titleTextCell}/>
    );
  }

  // end IComponentReactViewable
}
