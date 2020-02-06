/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";
import { DashboardComponent } from "./dashboard/dashboard.component";
import { HeroDetailComponent } from "./hero-detail/hero-detail.component";
import { HeroesComponent } from "./heroes/heroes.component";

const routes: Routes = [
    { path: "", redirectTo: "/dashboard", pathMatch: "full" },
    { path: "heroes", component: HeroesComponent },
    { path: "dashboard", component: DashboardComponent },
    { path: "detail/:id", component: HeroDetailComponent },
];

@NgModule({
    exports: [RouterModule],
    imports: [RouterModule.forRoot(routes, { initialNavigation: false })],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AppRoutingModule { }
