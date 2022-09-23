<script lang="ts">
    import { TinyliciousClient } from "@fluidframework/tinylicious-client";
    import { SharedSet } from "@fluidframework/set";
    import { onMount } from "svelte";
    let fluidMap: SharedSet;
    const client = new TinyliciousClient();

    const containerSchema = {
        initialObjects: { mySet: SharedSet },
    };
    const getMyMap = async () => {
        let container;
        const containerId = window.location.hash.substring(1);
        if (!containerId) {
            ({ container } = await client.createContainer(containerSchema));
            const mySet = container.initialObjects.mySet as SharedSet;
            mySet.add(Date.now().toString());
            const id = await container.attach();
            window.location.hash = id;
        } else {
            ({ container } = await client.getContainer(
                containerId,
                containerSchema
            ));
        }
        return container.initialObjects.mySet as SharedSet;
    };
    onMount(async () => {
        fluidMap = await getMyMap();
    });
    const addTime = () => {
        if (fluidMap === undefined) return console.log("undefined fluidMap");
        fluidMap.add(Date.now().toString());
    };

</script>

<button on:click={addTime}> click </button>
