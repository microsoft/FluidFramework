# Publishing Instructions

This document is a work in progress, and will be filled in over time.
For now, the following blurbs are intended to be copy-pasted into the appropriate locations in the relevant extension management pages.

## Description

The Fluid Framework Developer Tools extension for the open-source Fluid Framework platform. It enables developers to gain a deeper understanding of Fluid state in their application, offering insights into Container and Audience states, data visualization, and a live telemetry view with more functionality coming soon.
To get started, ensure that your Fluid application has integrated the developer tools library, and is configured to initialize them as a part of application startup. For more information, see here: https://aka.ms/fluiddevtool.
From there, simply launch your application and open the "Fluid Framework Devtools" tab in the browser’s devtools pane.

The left navigation panel shows all the containers in your application. Selecting a container will show the details on the right panel.
Right panel shows the container state, current client ID and buttons to disconnect and close the selected container. Below that, the "Data", "Audience" and "States" tabs show more information.
The "Data" tab allows you to look at the Container data in hierarchical structure including data types and values.
The "Audience" tab allows you to view the users currently in the container, their client ID and permissions scopes. You also get a historical view of all users joining/leaving the container.
The "States" tab shows a log of container state changes (connect, attach, disconnect)
Selecting "Telemetry"/"Events" in the left navigation shows a running log of framework events including details of the events.

Fluid Framework is a collection of client libraries for distributing and synchronizing shared states and makes it simple for developers to build real-time multiuser collaborative experiences. To learn more, visit https://aka.ms/fluid.

## Notes for certification / review

This extension works in conjunction with an application-side library, which requires explicit integration by the application.
An example application that is already set up with Fluid Framework Developer Tools integration can be found here: https://github.com/microsoft/FluidFramework/tree/main/azure/packages/external-controller.
