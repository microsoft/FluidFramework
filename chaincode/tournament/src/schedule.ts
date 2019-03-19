export interface ITeam {
    name: string;
    seed: number;
    winner?: boolean
}

export interface IMatchup {
    // matchNumber: number; // The match number within the RegionRound
    highTeam?: ITeam;
    lowTeam?: ITeam;
  }
  

export function nextGame(curGame: number): number {
    // const even = curGame % 2 === 0;

    const nextGame = curGame + (32 - Math.ceil(curGame/2));
    return nextGame;
}

export const East_teams = {
    "Duke": {
        name: "Duke",
        seed: 1
    },
    "NCC_NDAKST": {
        name: "NCC/NDAKST",
        seed: 16
    },
    "VCU": {
        name: "VCU",
        seed: 8
    },
    "UCF": {
        name: "UCF",
        seed: 9
    },
    "Miss_State": {
        name: "Miss State",
        seed: 5
    },
    "Liberty": {
        name: "Liberty",
        seed: 12
    },
    "Va_Tech": {
        name: "Va Tech",
        seed: 4
    },
    "Saint_Louis": {
        name: "Saint Louis",
        seed: 13
    },
    "Maryland": {
        name: "Marylyand",
        seed: 6
    },
    "BELM_TEMP": {
        name: "BELM/TEMP",
        seed: 11
    },
    "LSU": {
        name: "LSU",
        seed: 3
    },
    "Yale": {
        name: "Yale",
        seed: 14
    },
    "Louisville": {
        name: "Louisville",
        seed: 7
    },
    "Minnesota": {
        name: "Minnesota",
        seed:10
    },
    "Michigan_St": {
        name: "Michigan St",
        seed: 2
    },
    "Bradley": {
        name: "Bradley",
        seed: 15
    }
}


export const eastTeamsArray = [
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
        name: "Marylyand",
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
        seed:10
    },
    {
        name: "Michigan St",
        seed: 2
    },
    {
        name: "Bradley",
        seed: 15
    }
];


export const FakeTeamsArray = [
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
        name: "Marylyand",
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
        seed:10
    },
    {
        name: "Michigan St",
        seed: 2
    },
    {
        name: "Bradley",
        seed: 15
    },
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
        name: "Marylyand",
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
        seed:10
    },
    {
        name: "Michigan St",
        seed: 2
    },
    {
        name: "Bradley",
        seed: 15
    },
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
        name: "Marylyand",
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
        seed:10
    },
    {
        name: "Michigan St",
        seed: 2
    },
    {
        name: "Bradley",
        seed: 15
    },
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
        name: "Marylyand",
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
        seed:10
    },
    {
        name: "Michigan St",
        seed: 2
    },
    {
        name: "Bradley",
        seed: 15
    }
];
