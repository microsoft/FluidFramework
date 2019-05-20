import { Component, Document } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { Bracket } from "./bracket";
import { FullTeamsArray, ITeam, IMatchup } from "./schedule";
import { ISharedMap } from "@prague/map";
import { ScheduleComponent } from "@chaincode/schedule";

export class Tournament extends Document {
  /**
   * Create the component's schema and perform other initialization tasks
   * (only called when document is initially created).
   */
  protected async create() {
    const bracket = this.createMap();

    // Set up the initial 32 games
    for (let i = 0; i < 32; i++) {
      const highTeam: ITeam = FullTeamsArray[i];

      const lowTeam: ITeam = FullTeamsArray[i + 1];

      const matchup: IMatchup = {
        // matchNumber: i % 8,
        highTeam,
        lowTeam
      };

      bracket.set<IMatchup>("" + i, matchup);
    }
    for (let i = 32; i < 63; i++) {
      const matchup: IMatchup = {};
      bracket.set<IMatchup>("" + i, matchup);
    }

    this.root.set("TournamentState", bracket);
  }

  protected render(host: HTMLDivElement, bracket: ISharedMap) {
    ReactDOM.render(
      <div>
        <div id={"schedule"} />
        <Bracket bracket={bracket} />
      </div>,
      host
    );
  }

  /**
   *  The component has been loaded. Render the component into the provided div
   * */
  public async opened() {
    const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");

    if (maybeDiv) {
      const scheduleDiv = document.createElement("div");
      const bracketDiv = document.createElement("div");
      maybeDiv.appendChild(scheduleDiv);
      maybeDiv.appendChild(bracketDiv);

      const bracket = await this.root.wait<ISharedMap>("TournamentState");
      this.render(bracketDiv, bracket);

      this.runtime.createAndAttachComponent("schedule", "@chaincode/schedule");
      await this.runtime.openComponent("schedule", true, [
        ["div", Promise.resolve(scheduleDiv)]
      ]);

      this.root.on("op", () => {
        this.render(bracketDiv, bracket);
      });
    } else {
      return;
    }
  }
}

export async function instantiateRuntime(
  context: IContainerContext
): Promise<IRuntime> {
  return Component.instantiateRuntime(context, "@chaincode/tournament", new Map([
    ["@chaincode/tournament", Promise.resolve(Component.createComponentFactory(Tournament))],
    ["@chaincode/schedule", Promise.resolve(Component.createComponentFactory(ScheduleComponent))]
  ]));
}
