---
title: Using Fluid with Microsoft Teams
menuPosition: 4
---

This is a tutorial for integrating Fluid-powered real-time collaboration features into a [Microsoft Teams tab application](https://docs.microsoft.com/en-us/microsoftteams/platform/tabs/what-are-tabs). By the end of this tutorial you will be able to integrate any Fluid-powered applications into Microsoft Teams and collaborate with others in real-time.

Concepts you will learn:
1. How to integrate a Fluid client into a Microsoft Teams tab application
2. How to run and connect your Teams application to a Fluid service (Azure Fluid Relay)
3. How to create and get Fluid Containers and pass them to a React component

For an example of how this recipe may be used to build a more complex application, check out the [Teams Fluid Hello World](https://github.com/microsoft/FluidExamples/tree/main/teams-fluid-hello-world) example in our FluidExamples repo.

{{< callout note >}}

This tutorial assumes that you are familiar with the [Fluid Framework Overview]({{< relref "/docs/_index.md" >}}) and that you have completed the [QuickStart]({{< relref "quick-start.md" >}}). You should also be familiar with the basics of [React](https://reactjs.org/), [React Hooks](https://reactjs.org/docs/hooks-intro.html), and [Microsoft Teams Tabs](https://docs.microsoft.com/en-us/microsoftteams/platform/tabs/what-are-tabs).

{{< /callout >}}

## Create the project

1. Open a Command Prompt and navigate to the parent folder where you want to create the project, e.g., `/My Microsoft Teams Projects`.
1. Create a vanilla Teams tab application by running the below command. See [the Microsoft Teams documentation](https://docs.microsoft.com/en-us/microsoftteams/platform/tabs/how-to/create-channel-group-tab?tabs=nodejs) for more information on setting up Teams applications.

    ```dotnetcli
    yo teams
    ```

1. After creating the project, navigate to it with the command `cd <your project name>`.
1. The project will use three Fluid libraries:

    |Library |Description |
    |---|---|
    | `fluid-framework`    |Contains the IFluidContainer and other [distributed data structures]({{< relref "dds.md" >}}) that synchronize data across clients.|
    | `@fluidframework/azure-client`   |Defines the starting schema for the [Fluid container][].|
    | `@fluidframework/test-client-utils` |Defines the `InsecureTokenProvider` needed to create the connection to a Fluid service.|
    {.table}

    Run the following command to install the libraries.

    ```dotnetcli
    npm install @fluidframework/azure-client fluid-framework @fluidframework/test-client-utils
    ```

## Code the project

1. Open the file `/src/client/<your tab name>` in your code editor. Create a new file named `Util.ts`. Then add the following import statements:

    ```ts
    //`Util.ts

    import { IFluidContainer } from "fluid-framework";
    import { AzureClient, AzureClientProps } from "@fluidframework/azure-client";
    import { InsecureTokenProvider } from "@fluidframework/test-client-utils";
    ```

### Defining Fluid functions and parameters

1. Since this app is intended to be used in the context of Microsoft Teams, having all Fluid-related imports, initialization, and functions in one place makes it easier to use in the future. Add the following code below the import statements. The comments will define all the functions and constants needed to interact with the Fluid service and container.

```ts
// TODO 1: Define the parameter key(s).
// TODO 2: Define container schema.
// TODO 3: Define connectionConfig (AzureClientProps).
// TODO 4: Create Azure client.
// TODO 5: Define create container function.
// TODO 6: Define get container function.
```

1. Replace `TODO 1:` with the following code. Note that the constant is being exported because it will be appended to the `contentUrl` in the Microsoft Teams settings and later for parsing the container ID in the content page. It's a common pattern to store important query parameter keys as constants, rather than typing the raw string each time.

```ts
export const containerIdQueryParamKey = "containerId";
```

1. Before the client can create any containers, it needs a `containerSchema` that will define the shared objects used in this application. This example uses a SharedMap as the `initialObjects`, but any shared object can be used. Note also that `map` is the ID of the `SharedMap` object and it must be unique within the container as with any other DDSes. Replace `TODO: 2` with the following code.

```ts
const containerSchema = {
    initialObjects: { map: SharedMap }
};
```

1. Replace `TODO: 3` with the following code. Before the client can be used, it needs an `AzureClientProps` that will define the type of connection the client will be using. Think of the `connectionConfig` as the properties required to connect to the service. Note that local mode of Azure Client is used here. To enable collaboration across all client, please replace it with Fluid Relay Service credentials. See how to [set up the Azure Fluid Relay service](https://docs.microsoft.com/en-us/azure/azure-fluid-relay/how-tos/provision-fluid-azure-portal) for more information.

```ts
const connectionConfig : AzureClientProps =
{
    connection: {
        type: "local",
        tokenProvider: new InsecureTokenProvider("foobar", { id: "user" }),
        endpoint: "http://localhost:7070"
    }
};
```

1. Replace `TODO: 4` with the following code.

```ts
const client = new AzureClient(connectionConfig);
```

1. Replace `TODO: 5` with the following code. Note that since you are creating the container in the configuration page and appending it to the `contentUrl` in Microsoft Teams setting, you just need to return the container ID after attaching the container.

```ts
export async function createContainer() : Promise<string> {
    const { container } = await client.createContainer(containerSchema);
    const containerId = await container.attach();
    return containerId;
};
```

1. Replace `TODO: 6` with the following code. Note that when you fetch the Fluid container you want to return the container itself since your application will need to interact with the container and the DDSes inside it in the content page.

```ts
export async function getContainer(id : string) : Promise<IFluidContainer> {
    const { container } = await client.getContainer(id, containerSchema);
    return container;
};
```

### Creating Fluid container in the configuration page

Open the file `src/client/<your tab name>/<your tab name>Config.tsx` in your code editor. The standard Teams tab application flow goes from configuration to content page. To enable collaboration, persisting the container while loading into the content page is crucial. The best solution to persist the container is to append the container ID onto the `contentUrl` and `websiteUrl`, the URLs of the content page, as a query parameter. Since the save button in the Teams configuration page is the gateway between the configuration page and the content page, it is a great place to create the container and append the container ID in the settings.

1. Add the following import statement.

```ts
import { createContainer, containerIdQueryParamKey } from "./Util";
```

1. Replace the `onSaveHandler` method with the following code. Note that the only lines added here are calling the create container method defined earlier in `Utils.ts` and then appending the returned container ID to the `contentUrl` and `websiteUrl` as a query parameter.

```ts {linenos=inline,hl_lines=[134,136,137]}
const onSaveHandler = async (saveEvent: microsoftTeams.settings.SaveEvent) => {
    const host = "https://" + window.location.host;
    const containerId = await createContainer();
    microsoftTeams.settings.setSettings({
        contentUrl: host + "/<your tab name>/?" + containerIdQueryParamKey + "=" + containerId + "&name={loginHint}&tenant={tid}&group={groupId}&theme={theme}",
        websiteUrl: host + "/<your tab name>/?" + containerIdQueryParamKey + "=" + containerId + "&name={loginHint}&tenant={tid}&group={groupId}&theme={theme}",
        suggestedDisplayName: "<your tab name>",
        removeUrl: host + "/<your tab name>/remove.html?theme={theme}",
        entityId: entityId.current
    });
    saveEvent.notifySuccess();
};
```

Please make sure to replace `<your tab name>` with the actual tab name from your project.

{{< callout warning >}}

Since the content page URL is used to store the container ID, this record will be removed if the Teams tab is deleted.
Additionally, every content page can only support one container ID.

{{< /callout >}}

### Refactor content page to reflect Fluid application

Open the file `src/client/<your tab name>/<your tab name>.tsx` in your code editor. A typical Fluid-powered application consists of a view and a Fluid data structure. Let's just focus on getting/loading the Fluid container and leave all the Fluid related interactions in a React component.

1. Add the following import statements in the content page.

```ts
import { IFluidContainer } from "fluid-framework";
import { getContainer, containerIdQueryParamKey } from "./Util";
```

1. Now remove all the code below the import statements inside the content page and replace it with the following. Make sure to replace `<your tab name>` with the tab name you defined for your project.

```ts
export const <your tab name> = () => {
  // TODO 1: Initialize Microsoft Teams.
  // TODO 2: Initialize inTeams boolean.
  // TODO 3: Define container as a React state.
  // TODO 4: Define a method that gets the Fluid container
  // TODO 5: Get Fluid container on content page startup.
  // TODO 6: Pass the container to the React component as argument.
}
```

1. Replace `TODO 1` with the following code. For the content page to display in Teams, you must include the [Microsoft Teams JavaScript client SDK](https://docs.microsoft.com/javascript/api/overview/msteams-client?view=msteams-client-js-latest&preserve-view=true) and include a call to initialize it after your page loads.

```ts
microsoftTeams.initialize();
```

1. Replace `TODO 2` with the following code. Because the Teams application is just an IFrame injection of a webpage, you need to initialize the `inTeams` boolean constant in order to know if the application is inside Microsoft Teams or not, and if the Teams resources, such as the `contentUrl`, are available.

```ts
const [{ inTeams }] = useTeams();
```

1. Replace `TODO 3` with the following code. Using a React state for the container will provide the ability to dynmically update the container and the data objects inside it.

```ts
const [fluidContainer, setFluidContainer] = useState<IFluidContainer | undefined>(undefined);
```

1. Replace `TODO 4` with the following code. Here you will parse the URL to get the query parameter string, defined by `containerIdQueryParamKey`, and retrieve the container ID. With the container ID, you can now load the container to get the container. Once you have the container, set the `fluidContainer` React state, defined above.

```ts
const getFluidContainer = async (url : URLSearchParams) => {
    const containerId = url.get(containerIdQueryParamKey);
    if (!containerId) {
        throw Error("containerId not found in the URL");
    }
    const container = await getContainer(containerId);
    setFluidContainer(container);
};
```

1. Replace `TODO 5` with the following code. Now that you've defined how to get the Fluid container, you need to tell React to call `getFluidContainer` on load, and then store the result in state based on if the application is inside Teams.
React's [useState hook](https://reactjs.org/docs/hooks-state.html) will provide the storage needed, and [useEffect](https://reactjs.org/docs/hooks-effect.html) will allow you to call `getFluidContainer` on render, passing the returned value into `setFluidContainer`.

By adding `inTeams` in the dependency array at the end of the `useEffect`, the app ensures that this function only gets called on content page load.

```ts
useEffect(() => {
    if (inTeams === true) {
        microsoftTeams.settings.getSettings(async (instanceSettings) => {
            const url = new URL(instanceSettings.contentUrl);
            getFluidContainer(url.searchParams);
        });
        microsoftTeams.appInitialization.notifySuccess();
    }
}, [inTeams]);
```

1. Replace `TODO 6` with the following code. Note here that it's important to ensure that the content page is loaded inside Microsoft Teams and that the Fluid container is defined before passing it into the React component (defined as `FluidComponent` below).

```ts
if (inTeams === false) {
  return (
      <div>This application only works in the context of Microsoft Teams</div>
  );
}

if (fluidContainer !== undefined) {
  return (
      <FluidComponent fluidContainer={fluidContainer} />
  );
}

return (
  <div>Loading FluidComponent...</div>
);
```

### Creating React component for Fluid view and data

Now that you have married the basic creation flow of Teams and Fluid, you can now create your own React component that handles the interactions between the application view and Fluid data. From this point on, the logic and flow behaves just like any other Fluid-powered application. With the basic structure established, you can create any of the [Fluid examples](https://github.com/microsoft/FluidExamples) as a Teams application by changing the `ContainerSchema` and the application view's interaction with the DDSes/data objects on the content page.

## Start the Fluid server and run the application

If you are running your Teams application locally with Azure Client local mode, make sure to run the following command in the Command Prompt to start the Fluid service.

```dotnetcli
npx @fluidframework/azure-local-service@latest
```

To run and start the Teams application, open another terminal and follow the [instructions to run the application server](https://docs.microsoft.com/en-us/microsoftteams/platform/tabs/how-to/create-channel-group-tab?tabs=nodejs#upload-your-application-to-teams).

Now follow the [instructions to upload the application to a Teams Tab](https://docs.microsoft.com/en-us/microsoftteams/platform/tabs/how-to/create-channel-group-tab?tabs=nodejs#upload-your-application-to-teams).

{{< callout warning >}}

Hostnames with `ngrok`'s free tunnels are not preserved. Each run will generate a different URL. This means that anytime a new `ngrok` tunnel is created, the older container will no longer be accessible. For production scenarios, please visit [the section below](#using-azureclient-with-azure-fluid-relay)

{{< /callout >}}

{{< callout note >}}

You may need to install an additional dependency to make this demo compatible with Webpack 5. If you receive a compilation error related to a "buffer" package, please run `npm install -D buffer` and try again. This will be resolved in a future release of Fluid Framework.

{{< /callout >}}

## Next steps

### Using AzureClient with Azure Fluid Relay

Because this is a Teams tab application, collaboration and interaction are the main focuses. Consider replacing the local mode `AzureClientProps` provided above with non-local credentials from your Azure service instance, so others can join in and interact with you in the application! Check out [how to provision your Azure Fluid Relay service](https://docs.microsoft.com/en-us/azure/azure-fluid-relay/how-tos/provision-fluid-azure-portal).

{{< callout note >}}

It is important to hide the credentials you are passing into `AzureClientProps` from being accidentally committed to source control. The Teams project comes with a `.env` file where you can store your credentials as environment variables and the file itself is already included in the `.gitignore`. Refer to the section below if you want to use the environment variables in Teams.

{{< /callout >}}

{{< callout warning >}}

`InsecureTokenProvider` is a convenient way to test the application locally. It will be your respensibility to handle any user authentication and use a [secure token](https://docs.microsoft.com/en-us/azure/azure-fluid-relay/how-tos/connect-fluid-azure-service#token-providers) for any production environment.

{{< /callout >}}

### Setting and getting environment variable

To set a environment variable and retrieve it in Teams, you can take advantage of the built in `.env` file. Set the environment variable in `.env` like below.

```bash
# .env

TENANT_KEY=foobar
```

To pass the contents of the `.env` file to our client-side app, you need to configure them into `webpack.config.js` so that `webpack` provides access to them at runtime. Add the environment variable from `.env` as shown below.

```js
// webpack,config.js

webpack.EnvironmentPlugin({
    PUBLIC_HOSTNAME: undefined,
    TAB_APP_ID: null,
    TAB_APP_URI: null,
    REACT_APP_TENANT_KEY: JSON.stringify(process.env.TENANT_KEY) // Add environment variable here
}),
```

Now, let's access the environment variable in `Util.ts`

```ts
// Util.ts

tokenProvider: new InsecureTokenProvider(JSON.parse(process.env.REACT_APP_TENANT_KEY!), { id: "user" }),
```

{{< callout tip >}}

When you make changes to the code the project will automatically rebuild and the application server will reload. However, if you make changes to the container schema, they will only take effect if you close and restart the application server. To do this, give focus to the Command Prompt and press Ctrl-C twice. Then run `gulp serve` or `gulp ngrok-serve` again.

{{< /callout >}}

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=docs/_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers.md" >}}

<!-- Distributed Data Structures -->

[SharedCounter]: {{< relref "/docs/data-structures/counter.md" >}}
[SharedMap]: {{< relref "/docs/data-structures/map.md" >}}
[SharedSequence]: {{< relref "/docs/data-structures/sequences.md" >}}
[SharedString]: {{< relref "/docs/data-structures/string.md" >}}

<!-- API links -->

[fluid-framework]: {{< relref "/docs/apis/fluid-framework.md" >}}
[@fluidframework/azure-client]: {{< relref "/docs/apis/azure-client.md" >}}
[@fluidframework/tinylicious-client]: {{< relref "/docs/apis/tinylicious-client.md" >}}

[AzureClient]: {{< relref "/docs/apis/azure-client/AzureClient-class.md" >}}
[TinyliciousClient]: {{< relref "/docs/apis/tinylicious-client/TinyliciousClient-class.md" >}}

[FluidContainer]: {{< relref "/docs/apis/fluid-static/fluidcontainer-class.md" >}}
[IFluidContainer]: {{< relref "/docs/apis/fluid-static/ifluidcontainer-interface.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
