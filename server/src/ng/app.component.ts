import { Component } from '@angular/core';

@Component({
    selector: 'my-app',
    templateUrl: 'templates/app.component.html',
    styleUrls: ['stylesheets/app.component.css']
})
export class AppComponent {
    url = "http://localhost:3000/calendar"
}
