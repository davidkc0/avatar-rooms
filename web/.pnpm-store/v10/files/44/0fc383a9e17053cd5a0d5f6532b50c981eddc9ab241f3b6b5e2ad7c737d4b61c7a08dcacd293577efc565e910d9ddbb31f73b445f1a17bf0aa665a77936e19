// Do not edit.
import { ShaderStore } from "../Engines/shaderStore.js";
import "./ShadersInclude/gaussianSplattingVertexDeclaration.js";
import "./ShadersInclude/gaussianSplattingUboDeclaration.js";
import "./ShadersInclude/gaussianSplatting.js";
const name = "gaussianSplattingDepthVertexShader";
const shader = `#include<__decl__gaussianSplattingVertex>
attribute float splatIndex;uniform vec2 invViewport;uniform vec2 dataTextureSize;uniform vec2 focal;uniform float kernelSize;uniform sampler2D covariancesATexture;uniform sampler2D covariancesBTexture;uniform sampler2D centersTexture;uniform sampler2D colorsTexture;varying vec2 vPosition;varying vec4 vColor;
#include<gaussianSplatting>
void main(void) {Splat splat=readSplat(splatIndex);vec3 covA=splat.covA.xyz;vec3 covB=vec3(splat.covA.w,splat.covB.xy);vec4 worldPosGS=world*vec4(splat.center.xyz,1.0);vPosition=position.xy;vColor=splat.color;gl_Position=gaussianSplatting(position.xy,worldPosGS.xyz,vec2(1.,1.),covA,covB,world,view,projection);}`;
// Sideeffect
if (!ShaderStore.ShadersStore[name]) {
    ShaderStore.ShadersStore[name] = shader;
}
/** @internal */
export const gaussianSplattingDepthVertexShader = { name, shader };
//# sourceMappingURL=gaussianSplattingDepth.vertex.js.map