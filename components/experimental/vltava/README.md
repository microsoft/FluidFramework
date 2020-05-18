# Vltava

![Vltava-Wikipedia](https://en.wikipedia.org/wiki/Vltava#/media/File:Prague_skyline_view.jpg)

**Vltava** is an **experimental** project designed to explore Container and Component creation and loading. This
is a playground for advanced and experimental concepts that may or may not be good but push boundaries on specific
scenarios.

Read into and take from Vltava sparingly.

## Getting Started

If you want to run this component follow the following steps:

1. Run `npm install` from the `FluidFramework` root directory
2. Navigate to this directory
3. Run `npm run start`

## Components

### [Anchor](./src/components/anchor/anchor.ts)

**Anchor** is a simple attempt at a Root Component. Currently the Anchor component is a view proxy to the Vltava component.
Future thoughts are that the Root Component will be be a way to further decouple the default view from the Container
and also offer a surface area API to the Hosting Application.

### [Tabs](./src/components/tabs/tabs.tsx)

**Tabs** works similarly to browser tabs. You can create a new tab which will have an independent Component.
The list of components that Tabs can generate is pulled dynamically from the container registry based on
components that support `IComponentHTMLView`. This allows tabs to be consumable from multiple Containers
without hard coding direct component dependencies like you see in other component examples.

### [Vltava](./src/components/vltava/vltava.tsx)

The Vltava component is a simple component that renders a ribbon and the Tabs component.
