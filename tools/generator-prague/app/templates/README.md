# Welcome to your first Chaincode


Welcome to your first chaincode component.


## Getting Started
You can try the following commands

````
    npm start
       Hosts the component at http://localhost:8080


    npm run build
       Builds the component into bundled js files


    npm deploy
       Publishes the chaincode to https://packages.wu2.prague.office-int.com/#/
````

We suggest you start by typing:
	
    npm start


## Get Coding

The two phases of running a chaincode are the create and the render.

Create sets the initial schema.

Render uses the distributed data types to create an exciting view experience.

````TypeScript
  // Create the component's schema and perform other initialization tasks
  // (only called when document is initially created).
  protected async create() {
    this.root.set("clicks", 0, CounterValueType.Name);
  }

  // Renders your chaincode
  protected async render(host: HTMLDivElement) {
    // Get the distributed Counter
    const counter = await this.root.wait<Counter>("clicks");

    // Create a <span> that displays the current value of 'clicks'.
    const span = document.createElement("span");
    const update = () => {
      span.textContent = counter.value.toString();
    };
    this.root.on("valueChanged", update);
    update();

    // Create a button that increments the value of 'clicks' when pressed.
    const btn = document.createElement("button");
    btn.textContent = "+";
    btn.addEventListener("click", () => {
      counter.increment(1);
    });

    // Add both to the <div> provided by the host:
    host.appendChild(span);
    host.appendChild(btn);
  }

````

## Deploy

To deploy and make your chaincode "Live" you'll have to deploy it to verdaccio, our private NPM repository.

Go to https://packages.wu2.prague.office-int.com

Login with:

    UN: prague
    PW: bohemia

And follow the npm adduser steps

To deploy, use

    npm run deploy


To view your chaincode, you can go to the URL

    https://www.wu2-ppe.prague.office-int.com/loader/stupefied-kilby/prague/{random container name}?chaincode={pkg.name}@{pkg.version};

This link is then shareable and, in an expanding list of components, embeddable!

