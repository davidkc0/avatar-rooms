import {
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  VideoTexture,
  Vector3,
  TransformNode,
} from '@babylonjs/core';

export type SimpleAvatar = {
  root: TransformNode;
  head: Mesh;
  body: Mesh;
  leftArm: Mesh;
  rightArm: Mesh;
  leftLeg: Mesh;
  rightLeg: Mesh;
  headMaterial: StandardMaterial;
};

export function createSimpleAvatar(
  scene: Scene,
  videoElement?: HTMLVideoElement
): SimpleAvatar {
  const root = new TransformNode('avatar-root', scene);

  const bodyMaterial = new StandardMaterial('body-mat', scene);
  bodyMaterial.diffuseColor = { r: 0.2, g: 0.4, b: 0.8, a: 1 } as any; // Blue body

  // Body / legs layout: feet at Y=0 relative to root.

  // Legs (height 0.8, centered at origin means top at 0.4, bottom at -0.4)
  // To put feet at 0, leg center should be 0.4.
  const leftLeg = MeshBuilder.CreateCylinder('left-leg', { height: 0.8, diameter: 0.25 }, scene);
  leftLeg.position = new Vector3(-0.25, 0.4, 0);
  leftLeg.parent = root;
  leftLeg.material = bodyMaterial;

  const rightLeg = MeshBuilder.CreateCylinder('right-leg', { height: 0.8, diameter: 0.25 }, scene);
  rightLeg.position = new Vector3(0.25, 0.4, 0);
  rightLeg.parent = root;
  rightLeg.material = bodyMaterial;

  // Body (height 1.2)
  // Rests on top of legs (Y=0.8). Center of body is 0.8 + 1.2/2 = 1.4
  const body = MeshBuilder.CreateBox('body', { width: 0.8, height: 1.2, depth: 0.4 }, scene);
  body.position = new Vector3(0, 1.4, 0);
  body.parent = root;
  body.material = bodyMaterial;

  // Head (box 0.6)
  // Rests on body (Y = 0.8 + 1.2 = 2.0). Center is 2.0 + 0.6/2 = 2.3
  const head = MeshBuilder.CreateBox('head', { width: 0.6, height: 0.6, depth: 0.6 }, scene);
  head.position = new Vector3(0, 2.3, 0);
  head.parent = root;
  const headMaterial = new StandardMaterial('head-mat', scene);

  // Arms
  // Attached near top of body. Shoulder height approx 1.8
  const leftArm = MeshBuilder.CreateCylinder('left-arm', { height: 0.8, diameter: 0.2 }, scene);
  // Slightly out to the side and forward for a more natural pose, but still touching body
  leftArm.position = new Vector3(-0.5, 1.8, 0.1);
  leftArm.rotation.z = Math.PI / 8;
  leftArm.rotation.x = Math.PI / 16;
  leftArm.parent = root;
  leftArm.material = bodyMaterial;

  const rightArm = MeshBuilder.CreateCylinder('right-arm', { height: 0.8, diameter: 0.2 }, scene);
  rightArm.position = new Vector3(0.5, 1.8, 0.1);
  rightArm.rotation.z = -Math.PI / 8;
  rightArm.rotation.x = Math.PI / 16;
  rightArm.parent = root;
  rightArm.material = bodyMaterial;

  // Apply video texture to head if available
  if (videoElement) {
    const videoTexture = new VideoTexture('head-video', videoElement, scene);
    headMaterial.diffuseTexture = videoTexture;
    headMaterial.emissiveColor = { r: 1, g: 1, b: 1, a: 1 } as any; // brighten video a bit
    head.material = headMaterial;
  } else {
    // Fallback color
    headMaterial.diffuseColor = { r: 1, g: 0.8, b: 0.6, a: 1 } as any; // Skin tone
    head.material = headMaterial;
  }

  return {
    root,
    head,
    body,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    headMaterial,
  };
}




