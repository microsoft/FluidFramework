/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface ITeam {
  name: string;
  seed: number;
  winner?: boolean;
}

export interface IMatchup {
  // matchNumber: number; // The match number within the RegionRound
  highTeam?: ITeam;
  lowTeam?: ITeam;
}

export function nextGame(curGame: number): { game: number, top: boolean } {
  // const even = curGame % 2 === 0;

  const game = curGame + (32 - Math.ceil(curGame / 2));
  const top = curGame % 2 === 0; // Math.floor(curGame/2) === Math.ceil(curGame / 2);
  return {game, top };
}

export const FullTeamsArray = [
    // East
  {
    name: "Duke",
    seed: 1
  },
  {
    name: "NCC/NDAKST",
    seed: 16
  },
  {
    name: "VCU",
    seed: 8
  },
  {
    name: "UCF",
    seed: 9
  },
  {
    name: "Miss State",
    seed: 5
  },
  {
    name: "Liberty",
    seed: 12
  },
  {
    name: "Va Tech",
    seed: 4
  },
  {
    name: "Saint Louis",
    seed: 13
  },
  {
    name: "Maryland",
    seed: 6
  },
  {
    name: "BELM/TEMP",
    seed: 11
  },
  {
    name: "LSU",
    seed: 3
  },
  {
    name: "Yale",
    seed: 14
  },
  {
    name: "Louisville",
    seed: 7
  },
  {
    name: "Minnesota",
    seed: 10
  },
  {
    name: "Michigan St",
    seed: 2
  },
  {
    name: "Bradley",
    seed: 15
  },
  // West
  {
    name: "Gonzaga",
    seed: 1
  },
  {
    name: "FDU/PView",
    seed: 16
  },
  {
    name: "Syracuse",
    seed: 8
  },
  {
    name: "Baylor",
    seed: 9
  },
  {
    name: "Marquette",
    seed: 5
  },
  {
    name: "Murray St",
    seed: 12
  },
  {
    name: "Florida St",
    seed: 4
  },
  {
    name: "Vermont",
    seed: 13
  },
  {
    name: "Buffalo",
    seed: 6
  },
  {
    name: "Azst/StJohn",
    seed: 11
  },
  {
    name: "Texas Tech",
    seed: 3
  },
  {
    name: "N. Kentucky",
    seed: 14
  },
  {
    name: "Nevada",
    seed: 7
  },
  {
    name: "Florida",
    seed: 10
  },
  {
    name: "Michigan",
    seed: 2
  },
  {
    name: "Montana",
    seed: 15
  },
  // South
  {
    name: "Virginia",
    seed: 1
  },
  {
    name: "G-Webb",
    seed: 16
  },
  {
    name: "Ole Miss",
    seed: 8
  },
  {
    name: "Oklahoma",
    seed: 9
  },
  {
    name: "Wisconsin",
    seed: 5
  },
  {
    name: "Oregon",
    seed: 12
  },
  {
    name: "Kansas St.",
    seed: 4
  },
  {
    name: "UC Irvine",
    seed: 13
  },
  {
    name: "Villanova",
    seed: 6
  },
  {
    name: "Saint Mary's",
    seed: 11
  },
  {
    name: "Purdue",
    seed: 3
  },
  {
    name: "Old Dominion",
    seed: 14
  },
  {
    name: "Cincinnati",
    seed: 7
  },
  {
    name: "Iowa",
    seed: 10
  },
  {
    name: "Tennessee",
    seed: 2
  },
  {
    name: "Colgate",
    seed: 15
  },
  // MidWest
  {
    name: "N. Carolina",
    seed: 1
  },
  {
    name: "Iona",
    seed: 16
  },
  {
    name: "Utah St",
    seed: 8
  },
  {
    name: "Washington",
    seed: 9
  },
  {
    name: "Auburn",
    seed: 5
  },
  {
    name: "N. Mex. St",
    seed: 12
  },
  {
    name: "Kansas",
    seed: 4
  },
  {
    name: "Northeastern",
    seed: 13
  },
  {
    name: "Iowa St.",
    seed: 6
  },
  {
    name: "Ohio St.",
    seed: 11
  },
  {
    name: "Houston",
    seed: 3
  },
  {
    name: "Georgia St.",
    seed: 14
  },
  {
    name: "Wofford",
    seed: 7
  },
  {
    name: "Seton Hall",
    seed: 10
  },
  {
    name: "Kentucky",
    seed: 2
  },
  {
    name: "Abilene Chr.",
    seed: 15
  }
];
