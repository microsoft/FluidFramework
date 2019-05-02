export function getInitialCode(): string {
    return (
`class MyApp extends Document {
    // Create the component's schema and perform other initialization tasks
    // (only called when document is initially created).
    async create() {
        this.root.set("clicks", 0, "counter");
    }

    async render(host) {
        // Get the distributed Counter
        const counter = await this.root.wait("clicks");

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
            // TODO: Change the increment value below and hit UPDATE on the right
            counter.increment(1);
        });

        // Add both to the <div> provided by the host:
        host.appendChild(span);
        host.appendChild(btn);
    }
    
    // The component has been loaded. Attempt to get a div from the host. TODO explain this better.
    async opened() {
        // If the host provided a <div>, render the component into that Div
        const maybeDiv = await this.platform.queryInterface("div");
        if (maybeDiv) {
            this.render(maybeDiv);
        } else {
            return;
        }
    }
}

async function instantiateRuntime( context ) {
    return Component.instantiateRuntime(
        context,
        "@chaincode/myapp",
        [["@chaincode/myapp", Promise.resolve(MyApp)]]);
}`);
}


export function randomId(): string {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  
    for (var i = 0; i < 7; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }