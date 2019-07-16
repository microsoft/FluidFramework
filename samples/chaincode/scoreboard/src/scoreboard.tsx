/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RootComponent as ComponentWithMap } from '@prague/aqueduct';
import { IComponentHTMLOptions, IComponentHTMLVisual } from '@prague/container-definitions';
import { CounterValueType } from '@prague/map';
import { IComponentContext, IComponentRuntime } from '@prague/runtime-definitions';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { FactoryBase } from './factoryBase';
import { TeamScore } from './teamScore';
import { WinnerText } from './winnerText';

export class Scoreboard extends ComponentWithMap implements IComponentHTMLVisual {
  public static supportedInterfaces = [
    'IComponentLoadable', // via ISharedComponent, which is implemented by RootComponent
    'IComponentHTMLVisual',
    'IComponentHTMLRender'
  ];

  /**
  * Setup the distributed data structures; called once when the component is created (NOT initialized)
  */
  protected async create() {
    await super.create();
    this.root.set('Hardcoders', 0, CounterValueType.Name);
    this.root.set('Chaincoders', 0, CounterValueType.Name);
  }

  /**
  * Static load function that allows us to make async calls while creating our object.
  * This becomes the standard practice for creating components in the new world.
  * Using a static allows us to have async calls in class creation that you can't have in a constructor
  */
  public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<Scoreboard> {
    const comp = new Scoreboard(runtime, context, Scoreboard.supportedInterfaces);
    await comp.initialize();

    return comp;
  }

  render(hostingElement: HTMLElement, options?: IComponentHTMLOptions): void {
    ReactDOM.render(
      <div className="container">
        <section className="hero is-info">
          <div className="hero-body">
            <div className="container">
              <h1 className="title">
                Scoreboard
              </h1>
              <h2 className="subtitle">
                Hardcoders vs. Chaincoders
              </h2>
            </div>
          </div>
        </section>
        <div className="columns is-mobile is-gapless">
          <div className="column">
            <TeamScore name="Hardcoders" counter={this.root.get('Hardcoders')} colorClass="has-background-warning" />
          </div>
          <div className="column">
            <TeamScore name="Chaincoders" counter={this.root.get('Chaincoders')} colorClass="has-background-grey-light" />
          </div>
        </div>
        <div>
          <WinnerText map={this.root} />
        </div>
      </div>,
      hostingElement);
  }
}

export class ScoreboardComponentFactory extends FactoryBase {
  constructor() {
    super("Scoreboard", Scoreboard.load);
    let reg = new Map([["Scoreboard", Promise.resolve(this)]]);
    this.initializeRegistry(reg);
  }
}

export const fluidExport = new ScoreboardComponentFactory();
