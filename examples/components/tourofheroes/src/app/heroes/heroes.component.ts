/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Component, OnInit } from "@angular/core";

import { Hero } from "../hero";
import { HeroService } from "../hero.service";

@Component({
    selector: "app-heroes",
    templateUrl: "./heroes.component.html",
    styleUrls: ["./heroes.component.css"],
})
export class HeroesComponent implements OnInit {
    heroes: Hero[];

    constructor(private readonly heroService: HeroService) { }

    ngOnInit() {
        this.getHeroes();
    }

    getHeroes(): void {
        this.heroService.getHeroes()
            .subscribe((heroes) => this.heroes = heroes);
    }

    add(name: string): void {
        // eslint-disable-next-line no-param-reassign
        name = name.trim();
        if (!name) { return; }
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        this.heroService.addHero({ name } as Hero)
            .subscribe((hero) => {
                this.heroes.push(hero);
            });
    }

    delete(hero: Hero): void {
        this.heroes = this.heroes.filter((h) => h !== hero);
        this.heroService.deleteHero(hero).subscribe();
    }
}
