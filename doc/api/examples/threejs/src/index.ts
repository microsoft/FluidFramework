import { load } from "@prague/routerlicious/dist/api";
import * as socketStorage from "@prague/routerlicious/dist/socket-storage";
import * as jwt from "jsonwebtoken";
import * as THREE from "three";

// For local development
// const routerlicious = "http://localhost:3000";
// const historian = "http://localhost:3001";
// const tenantId = "prague";
// const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";
const routerlicious = "https://alfred.wu2.prague.office-int.com";
const historian = "https://historian.wu2.prague.office-int.com";
const tenantId = "gallant-hugle";
const secret = "03302d4ebfb6f44b662d00313aff5a46";

const documentId = "test-threejs-0507-1";

socketStorage.registerAsDefault(routerlicious, historian, tenantId);

async function run(id: string): Promise<void> {
    const token = jwt.sign(
        {
            documentId,
            permission: "read:write", // use "read:write" for now
            tenantId,
            user: {
                id: "test",
            },
        },
        secret);

    // Load in the latest and connect to the document
    const collabDoc = await load(id, { blockUpdateMarkers: true, token });

    const rootView = await collabDoc.getRoot().getView();
    console.log("Keys");
    console.log(rootView.keys());

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    const pointLight = new THREE.PointLight( 0xff0000, 1, 100 );
    pointLight.position.set(2, 2, 0);
    scene.add(pointLight);

    const sphereSize = 2;
    const pointLightHelper = new THREE.PointLightHelper(pointLight, sphereSize);
    scene.add(pointLightHelper);

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);

    document.body.appendChild(renderer.domElement);

    function animate() {
        cube.rotation.x += 0.1;
        cube.rotation.y += 0.1;

        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }

    animate();
}

run(documentId).catch((error) => {
    console.error(error);
});
