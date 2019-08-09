/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  PrimedComponent,
} from "@prague/aqueduct";
import {
  IComponentReactViewable
} from "@prague/aqueduct-react";
import {
  IComponentContext,
  IComponentRuntime,
} from "@prague/runtime-definitions";

import { SharedCell } from "@prague/cell";
import { SharedMap } from "@prague/map";
import { SharedObjectSequence } from "@prague/sequence";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { BadgeView } from "./BadgeView";

import { SharedColors } from '@uifabric/fluent-theme/lib/fluent/FluentColors';
import { IIconProps } from 'office-ui-fabric-react/lib/Icon';
import { IComponentHTMLVisual } from "@prague/component-core-interfaces";

export interface IBadgeType {
  key: string;
  text: string;
  iconProps: IIconProps;
}

export interface IHistory<T> {
  value: T;
  timestamp: Date;
}

export class Badge extends PrimedComponent implements IComponentHTMLVisual, IComponentReactViewable {
  public get IComponentHTMLVisual() { return this; }
  public get IComponentHTMLRender() { return this; }
  public get IComponentReactViewable() { return this; }

  private readonly currentId: string = "value";
  private readonly historyId: string = "history";
  private readonly optionsId: string = "options";

  private readonly defaultOptions: IBadgeType[] = [
    {
      key: "drafting",
      text: "Drafting",
      iconProps: {
        iconName: 'Edit',
        style: {
          color: SharedColors.cyanBlue10
        }
      },
    },
    {
      key: "reviewing",
      text: "Reviewing",
      iconProps: {
        iconName: 'Chat',
        style: {
          color: SharedColors.orange20
        }
      }
    },
    {
      key: "complete",
      text: "Complete",
      iconProps: {
        iconName: 'Completed',
        style: {
          color: SharedColors.green10
        }
      },
    },
    {
      key: "archived",
      text: "Archived",
      iconProps: {
        iconName: 'Archive',
        style: {
          color: SharedColors.magenta10
        }
      },
    }
  ];

  /**
   * This is only called once the first time your component is created. Anything that happens in create will happen
   * before any other user will see the component.
   */
  protected async componentInitializingFirstTime() {
    // Calling super.componentInitializingFirstTime() creates a root SharedMap that you can work off.
    await super.componentInitializingFirstTime();

    // create a cell to represent the Badge's current state
    const current = SharedCell.create(this.runtime);
    current.set(this.defaultOptions[0]);
    this.root.set(this.currentId, current);

    // create a map to represent the options for the Badge
    const options = SharedMap.create(this.runtime);
    this.defaultOptions.forEach(v => options.set(v.key, v));
    this.root.set(this.optionsId, options);

    // create a sequence to store the badge's history
    const history = SharedObjectSequence.create<IHistory<IBadgeType>>(this.runtime);
    history.insert(0, [{
      value: current.get(),
      timestamp: new Date()
    }]);
    this.root.set(this.historyId, history);
  }

  /**
   * Static load function that allows us to make async calls while creating our object.
   * This becomes the standard practice for creating components in the new world.
   * Using a static allows us to have async calls in class creation that you can't have in a constructor
   */
  public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<Badge> {
    const badge = new Badge(runtime, context);
    await badge.initialize();

    return badge;
  }

  public render(div: HTMLElement) {
    ReactDOM.render(
      this.createJSXElement(),
      div,
    );
  }

  public remove() {
    throw new Error("Not Implemented");
  }

  public createJSXElement(): JSX.Element {
    const currentCell = this.root.get<SharedCell>(this.currentId);
    const optionsMap = this.root.get<SharedMap>(this.optionsId);
    const historySequence = this.root.get<SharedObjectSequence<IHistory<IBadgeType>>>(this.historyId);

    return (
      <div>
        <BadgeView
          currentCell={currentCell}
          optionsMap={optionsMap}
          historySequence={historySequence} />
      </div>
    )
  }
}