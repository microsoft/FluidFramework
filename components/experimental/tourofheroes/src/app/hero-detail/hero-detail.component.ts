/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Component, OnInit, Input } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { Location } from "@angular/common";

import { Hero } from "../hero";
import { HeroService } from "../hero.service";

@Component({
    selector: "app-hero-detail",
    templateUrl: "./hero-detail.component.html",
    styleUrls: ["./hero-detail.component.css"],
})
export class HeroDetailComponent implements OnInit {
    @Input() hero: Hero;

    constructor(
        private readonly route: ActivatedRoute,
        private readonly heroService: HeroService,
        private readonly location: Location,
    ) { }

    ngOnInit(): void {
        this.getHero();
    }

    getHero(): void {
        const id = +this.route.snapshot.paramMap.get("id");
        this.heroService.getHero(id)
            .subscribe((hero) => this.hero = hero);
    }

    goBack(): void {
        this.location.back();
    }

    save(): void {
        this.heroService.updateHero(this.hero);
    }
}
