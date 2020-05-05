/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { NgModule, Inject } from "@angular/core";
import { BrowserModule } from "@angular/platform-browser";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { AppRoutingModule } from "./app-routing.module";
import { AppComponent } from "./app.component";
import { DashboardComponent } from "./dashboard/dashboard.component";
import { HeroDetailComponent } from "./hero-detail/hero-detail.component";
import { HeroesComponent } from "./heroes/heroes.component";
import { HeroSearchComponent } from "./hero-search/hero-search.component";
import { MessagesComponent } from "./messages/messages.component";
import { PRAGUE_PATH } from "./tokens";

@NgModule({
    imports: [
        BrowserModule,
        FormsModule,
        AppRoutingModule,
    ],
    declarations: [
        AppComponent,
        DashboardComponent,
        HeroesComponent,
        HeroDetailComponent,
        MessagesComponent,
        HeroSearchComponent,
    ],
    bootstrap: [AppComponent],
})

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AppModule {
    constructor(@Inject(PRAGUE_PATH) path: string, router: Router) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        router.navigate([path ? path : "/dashboard"], { skipLocationChange: !!path });
    }
}
