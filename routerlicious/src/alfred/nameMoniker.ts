const monikers = [
    "Megan Bowen",
    "Alex Wilber",
    "Emily Braun",
    "Lee Gu",
    "Delia Dennis",
    "Pradeep Gupta",
    "Pattie Fernandez",
    "Raul Razo",
    "Nestor Wilke",
    "Adele Vance",
    "Douglas Fife",
    "Clarissa Trentini",
    "Dastgir Refai",
    "Betsy Drake",
    "Arif Badakhshi",
];

let index = -1;

export function choose(): string {
    const moniker = monikers[index];
    index = (index + 1) % monikers.length;
    return moniker;
}
