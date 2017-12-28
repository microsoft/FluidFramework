import * as THREE from "three";

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
