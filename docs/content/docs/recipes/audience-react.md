---
title: Using Audience in Fluid
menuPosition: 6
draft: true
---

In this tutorial, you'll learn about using the Fluid Framework [Audience]({{< relref "audience.md" >}}) with [React](https://reactjs.org/) to create a visual demonstration of users connecting to a container. The audience object holds information related to all users connected to the container. In this example, the Azure Client library will be used to create the container and audience.

To jump ahead into the finished demo, check out the [Audience demo in our FluidExamples repo](https://github.com/microsoft/FluidExamples/tree/main/audience-demo).

The following image shows use ID buttons and a container ID input field. Leaving the container ID field blank and clicking a user ID button will create a new container and join as the selected user. Alternatively, the end-user can input a container ID and choose a user ID to join an existing container as the selected user.

[IMAGE]

The next image shows multiple users connected to a container represented by boxes. The box outlined in blue represents the user who is viewing the client while the boxes outlined in black represents the other connected users. As new users attach to the container with unique ID's, the number of boxes will increase.

[IMAGE]

{{< callout note >}}

This tutorial assumes that you are familiar with the [Fluid Framework Overview]({{< relref "/docs/_index.md" >}}) and that you have completed the [QuickStart]({{< relref "quick-start.md" >}}). You should also be familiar with the basics of [React](https://reactjs.org/), [creating React projects](https://reactjs.org/docs/create-a-new-react-app.html#create-react-app), and [React Hooks](https://reactjs.org/docs/hooks-intro.html).

{{< /callout >}}

## Create the project

1. Open a Command Prompt and navigate to the parent folder where you want to create the project; e.g., `c:\My Fluid Projects`.
1. Run the following command at the prompt. (Note that the CLI is np**x**, not npm. It was installed when you installed Node.js.)

    ```dotnetcli
    npx create-react-app fluid-audience-tutorial
    ```

1. The project is created in a subfolder named `fluid-audience-tutorial`. Navigate to it with the command `cd fluid-audience-tutorial`.

1. The project uses the following Fluid libraries:

    |Library |Description |
    |---|---|
    | `fluid-framework`    |Contains the SharedMap [distributed data structure]({{< relref "dds.md" >}}) that synchronizes data across clients.|
    | `@fluidframework/azure-client`   |Defines the connection to a Fluid service server and defines the starting schema for the [Fluid container][].|
    | `@fluidframework/test-client-utils`   |Defines the `InsecureTokenProvider` needed to create the connection to a Fluid Service.|
    {.table}

    Run the following command to install the libraries.

    ```dotnetcli
    npm install @fluidframework/azure-client @fluidframework/test-client-utils fluid-framework
    ```

## Code the project

### Set up state variables and component view

1. Open the file `\src\App.js` in the code editor. Delete all the default `import` statements. Then delete all the markup from the `return` statement. Then add import statements for components and React hooks. Note that we will be implementing the components in the later steps. The file should look like the following:

```js
  import { useState, useCallback } from "react";
  import { AudienceDisplay } from "./AudienceDisplay";
  import { SelectUser } from "./SelectUser"

  export const App = () => {
    // TODO 1: Define state variables to handle view changes and user input
    return (
    // TODO 2: Return view components
    );
  }
```

1. Replace `TODO 1` with the following code. Note that the values `userId` and `containerId` will come from a `SelectUser` component through the `handleSelectUser` function. The `displayAudience` variable is used to switch between the member list view and the userId selection view. In the case that a user inputs an invalid `audienceId` they will be redirected to the userId selection view by the `handleContainerNotFound` function.

```js
  const [displayAudience, setDisplayAudience] = useState(false);
  const [userId, setUserId] = useState();
  const [containerId, setContainerId] = useState();

  const handleSelectUser = useCallback((userId, containerId) => {
    setDisplayAudience(true)
    setUserId(userId);
    setContainerId(containerId);
  }, [displayAudience, userId, containerId]);

  const handleContainerNotFound = useCallback(() => {
    setDisplayAudience(false)
  }, [setDisplayAudience]);
```

1. Replace `TODO 2` with the following code. As stated above, the `displayAudience` variable will switch between the `AudienceDisplay` component and `SelectUser` component. Also, functions to update the state variables are passed into components as properties.

```js
  (displayAudience) ?
  <AudienceDisplay userId={userId} containerId={containerId} onContainerNotFound={handleContainerNotFound}/> :
  <SelectUser onSelectUser={handleSelectUser}/>
```

### Set up AudienceDisplay component

1. Create and open a file `\src\AudienceDisplay.js` in the code editor. Add the following `import` statements:

```js
  import { useEffect, useState } from "react";
  import { SharedMap } from "fluid-framework";
  import { AzureClient } from "@fluidframework/azure-client";
  import { InsecureTokenProvider } from "@fluidframework/test-client-utils"
```

1. Add the following functional components and helper functions:

```js
  const tryGetAudienceObject = async (userId, userName, containerId) => {
    // TODO 1: Configure the client and container
    // TODO 2: Configure the container
    // TODO 3: Get the container and services from the Fluid service.
    // TODO 4: Return the Audience object.
  }

  export const AudienceDisplay = (props) => {
    //TODO 5: Configure user ID, user name, and state variables
    //TODO 6: Set state variables and set event listener on component mount
    //TODO 7: Return list view
  }

  const AudienceList = (data) => {
    //TODO 8: Append view elements to list array for each member
    //TODO 9: Return list of member elements
  }
```

### Getting container and audience

You can use a helper function to get the Fluid data, from the Audience object, into the view layer (the React state). The tryGetAudienceObject method is called when the view component loads after a user ID is selected. The returned value is assigned to a React state property.

1. Replace `TODO 1` with the following code. Note that the values for `userId` `userName` `containerId` will be passed in from the `App` component. If there is no `containerId`, a new container is created. Before the client can be used, it needs an `AzureClientProps` that will define the type of connection the client will be using. Think of the `serviceConfig` as the properties required to connect to the service. Note that the local mode of Azure Client is used here.

```js
  const userConfig = {
    id: userId,
    name: userName,
    additionalDetails: {
        "email": userName.replace(/\s/g, '') + "@example.com",
        "date": new Date().toLocaleDateString("en-US")
    }
  };

  const serviceConfig = {
    connection: {
        type: "local",
        tokenProvider: new InsecureTokenProvider("" , userConfig),
        endpoint: "http://localhost:7070",
    }
  };

  const client = new AzureClient(serviceConfig);
```

1. Replace `TODO 2` with the following code. Note, before a client can create any containers, it needs a schema that will define the shared objects in this application. Although this example does not require any shared objects to demonstrate the audience object, a schema will still be provided so that the client can create a container.

```js
  const containerSchema = {
      initialObjects: { myMap: SharedMap }
  };
```

1. Replace `TODO 3` with the following code. Note, although the `containerId` is stored on the URL hash, we are getting the value from a parent component since we want the user to manually specify whether they want to join an existing container or create a new one. With this method, we want to wrap the getContainer call in a try catch in the case that the user inputs a container ID which does not exist.

```js
  let container;
  let services;
  if (!containerId) {
      ({ container, services } = await client.createContainer(containerSchema));
      const id = await container.attach();
      location.hash = id;
  } else {
      try {
          ({ container, services } = await client.getContainer(containerId, containerSchema));
      } catch(e) {
          return;
      }
  }
```

1. Replace `TODO 4` with the following code.

```js
  return services.audience;
```

### Getting the audience on component mount

Now that we've defined how to get the Fluid audience, we need to tell React to call `tryGetAudienceObject` when the Audience Display component is mounted.

1. Replace `TODO 5` with the following code. Note that the user ID will come from the parent component as either `user1` `user2` or `random`. If the ID is `random` we use `Math.random()` to generate a random number as the ID. Additionally, a name will be mapped to the user based on their ID as specified in `userNameList`. Lastly, we define the state variables which will store the connected members as well as the current user.

```js
  const userId = props.userId == "random" ? Math.random() : props.userId;
  const userNameList = {
    "user1" : "User One",
    "user2" : "User Two",
    "random" : "Random User"
  };
  const userName = userNameList[props.userId];

  const [fluidMembers, setFluidMembers] = useState();
  const [currentMember, setCurrentMember] = useState();
```

1. Replace `TODO 6` with the following code. This will call the `tryGetAudienceObject` when the component is mounted and set the returned audience members to the state variables. Note that we check if an audience is returned in the case that the user inputs a containerId which does not exist and we need to return them to the userId selection view (`props.onContainerNotFound()` will handle switching the view). Also, it is good practice to deregister event handlers when the React component dismounts by returning `audience.off`.

```js
  useEffect(() => {
    tryGetAudienceObject(userId, userName, props.containerId).then(audience => {
      if(!audience) {
        props.onContainerNotFound();
        alert("error: container id not found.");
        return;
      }

      const updateMembers = () => {
        setFluidMembers(audience.getMembers());
        setCurrentMember(audience.getMyself());
      }

      updateMembers();

      audience.on("membersChanged", updateMembers);

      return () => { audience.off("membersChanged", updateMembers) };
    });
  }, []);
```

1. Replace `TODO 7` with the following code. Note, if the `fluidMembers` or `currentMember` has not been initialized, a blank screen is rendered. The `AudienceList` component will be implemented in the next section.

```js
  if (!fluidMembers || !currentMember) return (<div/>);

  return (
      <div>
        <AudienceList fluidMembers={fluidMembers} currentMember={currentMember}/>
      </div>
  )
```

{{< callout note >}}

Connection transitions can result in short timing windows where `getMyself` returns `undefined`. This is because the current client connection will not have been added to the audience yet, so a matching connection ID cannot be found. To prevent React from rendering a page with no audience members, we add a listener to call `updateMembers` on `membersChanged`. This works since the service audience emits a `membersChanged` event when the container is connected.

{{< /callout >}}

### Create the view

1. Replace `TODO 8` with the following code. Note we are rendering a list component for each member passed from the `AudienceDisplay` component. For each member, we first compare `member.userId` to `currentMember.userId` to check if that member `isSelf`. This way, we can differentiate the client user from the other users and display the component with a different color. We then push the list component to a `list` array. Each component will display member data such as `userId` `userName` and `additionalDetails`.

```js
  const currentMember = data.currentMember;
  const fluidMembers = data.fluidMembers;

  const list = [];
  fluidMembers.forEach((member, key) => {
      const isSelf = (member.userId === currentMember.userId);
      const outlineColor = isSelf ? 'blue' : 'black';

      list.push(
        <div style={{
          padding: '1rem',
          margin: '1rem',
          display: 'flex',
          outline: 'solid',
          flexDirection: 'column',
          maxWidth: '25%',
          outlineColor
        }} key={key}>
          <div style={{fontWeight: 'bold'}}>Name</div>
          <div>
              {member.userName}
          </div>
          <div style={{fontWeight: 'bold'}}>ID</div>
          <div>
              {member.userId}
          </div>
          <div style={{fontWeight: 'bold'}}>Connections</div>
          {
              member.connections.map((data, key) => {
                  return (<div key={key}>{data.id}</div>);
              })
          }
          <div style={{fontWeight: 'bold'}}>Additional Details</div>
          { JSON.stringify(member.additionalDetails, null, '\t') }
        </div>
      );
  });
```

1. Replace `TODO 9` with the following code.

```js
  return (
      <div>
          {list}
      </div>
  );
```

### Setup SelectUser component

1. Create and open a file `\src\SelectUser.js` in the code editor. Add the following `import` statements and functional components:

```js
import { useState } from 'react';

export const SelectUser = (props) => {
  // TODO 1: Define styles and handle user inputs
  return (
  // TODO 2: Return view components
  );
}
```

1. Replace `TODO 1` with the following code. Note that the `onSelectUser` function will update the state variables in the parent `App` component and prompt a view change.

```js
  const selectStyle = {
    marginTop: '2rem',
    marginRight: '2rem',
    width: '150px',
    height: '30px',
  };

  const [containerId, setContainerId] = useState();

  const handleSubmit = (userId) => {
    props.onSelectUser(userId, containerId);
  }

  const handleChange = () => {
    setContainerId(document.getElementById("containerIdInput").value);
  };
```

1. Replace `TODO 2` with the following code.

```js
  <div style={{display: 'flex', flexDirection:'column'}}>
    <div style={{marginBottom: '2rem'}}>
      Enter Container Id:
      <input type="text" id="containerIdInput" onChange={() => handleChange()} style={{marginLeft: '2rem'}}></input>
    </div>
    {
      (containerId) ?
        (<div style={{}}>Select a User to join container ID: {containerId} as the user</div>)
        : (<div style={{}}>Select a User to create a new container and join as the selected user</div>)
    }
    <nav>
      <button type="submit" style={selectStyle} onClick={() => handleSubmit("user1")}>User 1</button>
      <button type="submit" style={selectStyle} onClick={() => handleSubmit("user2")}>User 2</button>
      <button type="submit" style={selectStyle} onClick={() => handleSubmit("random")}>Random User</button>
    </nav>
  </div>
```

## Start the Fluid server and run the application

In the Command Prompt, run the following command to start the Fluid service.

```dotnetcli
npx @fluidframework/azure-local-service@latest
```

Open a new Command Prompt and navigate to the root of the project; for example, `C:/My Fluid Projects/fluid-audience-tutorial`. Start the application server with the following command. The application opens in the browser. This may take a few minutes.

```dotnetcli
npm run start
```

Navigate to `localhost:3000` on a browser tab to view the running application. To create a new container, select a user ID button while leaving the container ID input blank. To simulate a new user joining the container session, open a new browser tab and navigate to `localhost:3000`. This time, input the container ID value which can be found from first browser tab's url proceeding `http://localhost:3000/#`.

{{< callout note >}}

You may need to install an additional dependency to make this demo compatible with Webpack 5. If you receive a compilation error related to a "buffer" or "url" package, please run `npm install -D buffer url` and try again. This will be resolved in a future release of Fluid Framework.

{{< /callout >}}


## Next steps

- Try extending the demo with more key/value pairs in the `additionalDetails` field in `userConfig`.
- Consider integrating audience into a collaborative application which utilizes distributed data structures such as SharedMap or SharedString.
- Learn more about [Audience]({{< relref "audience.md" >}}).

{{< callout tip >}}

When you make changes to the code the project will automatically rebuild and the application server will reload. However, if you make changes to the container schema, they will only take effect if you close and restart the application server. To do this, give focus to the Command Prompt and press Ctrl-C twice. Then run `npm run start` again.

{{< /callout >}}


