
SyncBridge Dev Design doc  [https://microsoft-my.sharepoint.com/:w:/p/nipanwar/EUFYNqj0kuZBsgG5YS23UFkBimGmEurSUxRqY7Teg1BrEw?e=o27D4S](https://microsoft-my.sharepoint.com/:w:/p/nipanwar/EUFYNqj0kuZBsgG5YS23UFkBimGmEurSUxRqY7Teg1BrEw?e=o27D4S)

Remote command execution  [https://microsoft-my.sharepoint.com/:w:/p/raghoshc/EdZzvtREAzJJs24dcK6a9OEBthDGk1CxbPjsa_-FVYG4Gg?e=NCivGW](https://microsoft-my.sharepoint.com/:w:/p/raghoshc/EdZzvtREAzJJs24dcK6a9OEBthDGk1CxbPjsa_-FVYG4Gg?e=NCivGW)

## Technical Design:[](https://office.visualstudio.com/OC/_git/office-bohemia?path=%2Fpackages%2Fsyncbridge&anchor=technical-design%3A)

### SyncBridge[](https://office.visualstudio.com/OC/_git/office-bohemia?path=%2Fpackages%2Fsyncbridge&anchor=syncbridge)

SyncBridge is a DataObject. Any fluid object which wants to have two-way data sync with some external source, loads SyncBridge object and pass the registry type of Connector object which would talk to external service. Please refer to SyncBridge loading in TestComponent implementation.

### Test Components[](https://office.visualstudio.com/OC/_git/office-bohemia?path=%2Fpackages%2Fsyncbridge&anchor=test-components)

To test functional scenarios of Sync bridge, we need a component which is initializing SyncBridge and submitting messages over SyncBridge. We also need a connector which is handling these messages (For ex: PlannerConnector).

We have created a TestComponent and TestConnector inside "test" folder. TestComponent would be invoked by test pipeline to test SyncBridge and TestConnector functionalities.