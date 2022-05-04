# Example Client UI Library

## Design Goals

* Viewport centric UI
* Document level eventing
* Isomorphic rendering

## Component

The core class is the Component. This defines a node in the UI graph and base behavior for the UI.

## Getting started

To get started create a new BrowserContainerHost and then attach a Component to it. The framework will then
manage eventing and rendering for the component and its children.