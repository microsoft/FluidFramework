# Devtools

This directory contains a series of libraries that comprise our Fluid Framework developer tools solution, as well as a [Chromium](https://www.chromium.org/Home/)-based browser extension, and an example application demonstrating the developer tooling in action.

## Packages

-   [devtools-core](devtools-core/README.md): Low-level Devtools API powering the overall experience.
    -   This library corresponds to Fluid's lower-level ("1st party") API surface, and is not necessarily intended to be directly used by external customers.
    -   It communicates with consumers (e.g. our `devtools-view`) via message-passing on the Window.
-   [devtools](devtools/README.md): Higher level Devtools API built upon `devtools-core`.
    -   This library is the one we expect our external customers to use.
        It works in terms of our higher-level [Container abstraction](https://fluidframework.com/docs/build/containers/), and is implemented as a thin wrapper around `devtools-core`.
-   [devtools-view](devtools-view/README.md): Visual experience for the Fluid Devtools.
    -   This package contains a simple [React](https://react.dev/)-based view for interacting with the underlying Devtools libraries.
        For now, it is `private` and exists strictly to power our browser extension, though it would not require substantial effort to make it more portable if there was a desire to release it independently in the future.
-   [devtools-browser-extension](devtools-browser-extension/README.md): Browser extension for Chromium-based browsers (for now, Edge and Chrome).
    -   This package is relatively light-weight.
        It implements the necessary scripting logic to ensure the extension's view (`devtools-view`) is able to communicate with the corresponding webpage.

Additionally, we have a sample application intended to help us test the end-to-end developer tooling experience, as well as to serve as an example for developers looking to integrate the developer tools into their own application.
It lives under [devtools-example](devtools-example/README.md).

```mermaid
graph BT;
    devtools-core-->devtools
    devtools-core-->devtools-view
    devtools-core-->devtools-browser-extension
    devtools-view-->devtools-browser-extension
    devtools-->devtools-example
    devtools-view-->devtools-example
```

## Architecture

Since our developer tools suite is designed to enable browser devtools experiences, our architecture is constrained in a few ways.
The most notable of these is that the runtime library aspects must communicate with the consuming views via **message-passing**.

For this reason, and because there has not been a demand (thus far) for a more standard programatic API, the library API surfaces are quite small.
The bulk of the logic is instead dedicated to recording state information and broadcasting it via messages on the Window.

### API Documentation

-   [@fluidframework/devtools-core](https://fluidframework.com/docs/apis/devtools-core)
-   [@fluidframework/devtools](https://fluidframework.com/docs/apis/devtools)
