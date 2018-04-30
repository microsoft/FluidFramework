import { load } from "@prague/routerlicious/dist/api";
import * as socketStorage from "@prague/routerlicious/dist/socket-storage";
import * as THREE from "three";

// const routerlicious = "http://localhost:3000";
// const historian = "http://localhost:3001";
const routerlicious = "https://alfred.wu2-ppe.prague.office-int.com";
const historian = "https://historian.wu2-ppe.prague.office-int.com";
const owner = "prague";
const repository = "prague";

socketStorage.registerAsDefault(routerlicious, historian, owner, repository);

async function run(id: string): Promise<void> {
    // Load in the latest and connect to the document
    const collabDoc = await load(id, { blockUpdateMarkers: true });

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

const documentId = "test-threejs-0429";
run(documentId).catch((error) => {
    console.error(error);
});
