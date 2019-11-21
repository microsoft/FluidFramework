/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Cela approved list of names
const names = [
    "Elliot Woodward",
    "Miguel Garcia",
    "Robert Tolbert",
    "Henry Brill",
    "Cecil Folk",
    "Isaac Fielder",
    "Erik Nason",
    "Tim Deboer",
    "Mauricio August",
    "Allan Munger",
    "Kevin Sturgis",
    "Carlos Slattery",
    "Johnnie McConnell",
    "Colin Ballinger",
    "Kat Larsson",
    "Katri Ahokas",
    "Carole Poland",
    "Wanda Howard",
    "Amanda Brady",
    "Ashley McCarthy",
    "Lydia Bauer",
    "Robin Counts",
    "Charlotte Walton",
    "Elvia Atkins",
    "Daisy Phillips",
    "Mona Kane",
    "Kristin Patterson",
    "Celeste Burton",
];

export function chooseCelaName(): string {
    // tslint:disable-next-line:insecure-random
    return names[Math.floor(Math.random() * names.length)];
}
