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

  // Body (box)
  const body = MeshBuilder.CreateBox('body', { width: 0.8, height: 1.2, depth: 0.4 }, scene);
  body.position = new Vector3(0, 0.6, 0);
  body.parent = root;
  const bodyMaterial = new StandardMaterial('body-mat', scene);
  bodyMaterial.diffuseColor = { r: 0.2, g: 0.4, b: 0.8, a: 1 } as any; // Blue body
  body.material = bodyMaterial;

  // Head (box, slightly larger)
  const head = MeshBuilder.CreateBox('head', { width: 0.6, height: 0.6, depth: 0.6 }, scene);
  head.position = new Vector3(0, 1.5, 0);
  head.parent = root;
  const headMaterial = new StandardMaterial('head-mat', scene);
  
  // Apply video texture to head if available
  if (videoElement) {
    const videoTexture = new VideoTexture('head-video', videoElement, scene);
    headMaterial.diffuseTexture = videoTexture;
  } else {
    // Fallback color
    headMaterial.diffuseColor = { r: 1, g: 0.8, b: 0.6, a: 1 } as any; // Skin tone
  }
  head.material = headMaterial;

  // Arms (cylinders)
  const leftArm = MeshBuilder.CreateCylinder('left-arm', { height: 0.8, diameter: 0.2 }, scene);
  leftArm.position = new Vector3(-0.6, 0.8, 0);
  leftArm.rotation.z = Math.PI / 6;
  leftArm.parent = root;
  leftArm.material = bodyMaterial;

  const rightArm = MeshBuilder.CreateCylinder('right-arm', { height: 0.8, diameter: 0.2 }, scene);
  rightArm.position = new Vector3(0.6, 0.8, 0);
  rightArm.rotation.z = -Math.PI / 6;
  rightArm.parent = root;
  rightArm.material = bodyMaterial;

  // Legs (cylinders)
  const leftLeg = MeshBuilder.CreateCylinder('left-leg', { height: 0.8, diameter: 0.25 }, scene);
  leftLeg.position = new Vector3(-0.25, -0.2, 0);
  leftLeg.parent = root;
  leftLeg.material = bodyMaterial;

  const rightLeg = MeshBuilder.CreateCylinder('right-leg', { height: 0.8, diameter: 0.25 }, scene);
  rightLeg.position = new Vector3(0.25, -0.2, 0);
  rightLeg.parent = root;
  rightLeg.material = bodyMaterial;

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

