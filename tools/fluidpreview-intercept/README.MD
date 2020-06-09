# @microsoft/fluidpreview-intercept



This package contains tooling to allow developers to easily inject their Fluid Component into Bohemia.

This allows them to easily see their code running in a production environment, to test out rendering and nested functionality appropriately.



There are two parts to the package:



1) chrome-extension

This is a chrome extension package that listen to requests fired by the Bohemia production site (https://fluidpreview.office.net). Specifically, it redirects getclientsidewebparts requests made to sharepoint APIs to our local express server.



2) reroute-server

(NOTE: Only needed if your package was generated using yo-fluid with Fluid Framework version lower than v0.19.0)

This is an npm package containing a lightweight express server. It will be run from the new Fluid component's package directory. It receives the redirected getclientsidewebparts call and returns a manifest file generated from details found in the new component's package.json. It then redirects Bohemia's main.bundle.js call to fetch the component to where the component itself is currently running at locally. At this point, Bohemia will load the component like any other.



## Setup

WARNING: Ensure your component is on the same minor version of the Fluid Framework as Fluid Preview. Otherwise, you will face errors due to breaking changes between versions.

1) Make sure your root .npmrc contains the following line:

@microsoft:registry=https://offnet.pkgs.visualstudio.com/officenet/_packaging/fluid/npm/registry/

@microsoft:always-auth=true

Alternatively, you can also install the package from the fluidpreview-intercept/reroute-server package if you do not have access to the feed.



2) Open Google Chrome, navigate to Settings -> Extensions

    a) Enable the "Developer mode" toggle on the top right corner of the page

    b) Click on "Load unpacked", navigate to the fluidpreview-intercept/chrome-extension folder in this package, click on Select Folder to load in the extension.

    c) Observe the discolored Fluid waterdrop icon on the top right Extension bar to indicate that your extension was installed.


NOTE: This step only needs to be run once for all of your components as it is just loading the Fluid intercept extension to your browser. The next two to be run from your component directory, and will need to be run again when loading a different component from its respective directory.


3a) At this point, if you are running Fluid Framework v ^0.19.0, you can simply run your component locally using:


npm run start


Skip to step 5 now


3b) Run the following commands in your new Fluid component's package directory:

npm i -g @microsoft/fluidpreview-intercept-reroute-server

fluidpreview-intercept-reroute-server



4) On another terminal window, start your Fluid component locally as per normal:

npm run start

NOTE: Ensure it is running on localhost:8080/*



5) Open Bohemia (https://fluidpreview.office.net) and load a new/existing document. You should see the Fluid waterdrop icon on the top right turn blue. when you navigate to this domain.



6) Click on the + button on the left side of the document editor. You should see your new Fluid component there for you to select.

WARNING: It is best to add local components to new documents that will not be used later to avoid corrupting them, as your local components will not be available when other users remotely load that document.

