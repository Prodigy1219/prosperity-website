import * as THREE from 'three';
import manifest from '../data/property-mesh-manifest.json';
import {fetchMeshAsset,validateMesh,meshVertices,boundedBytes} from '../lib/property-mesh.mjs';

// Source triangles, UVs, tint, AO and baked light are preserved from BlueMap.
// Shading follows BlueMap MIT; see THIRD-PARTY-PROPERTY.md. No cube approximation.
const vertexShader=`
attribute vec3 color; varying vec2 texUv; varying vec3 tint; varying float height;
void main(){texUv=uv;tint=color;height=position.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const fragmentShader=`
uniform sampler2D blockTexture; uniform float frames; uniform float frame;
uniform float fromY; uniform float toY; varying vec2 texUv; varying vec3 tint; varying float height;
void main(){if(height<fromY||height>toY)discard;
vec4 c=texture2D(blockTexture,vec2(texUv.x,(texUv.y+frame)/frames));
if(c.a<=0.01)discard;gl_FragColor=vec4(c.rgb*tint,c.a);}`;

export async function loadDetailMesh(property,signal,meshUrls=manifest.properties) {
  const scope=AbortSignal.any([signal,AbortSignal.timeout(30000)]);
  const meta=validateMesh(JSON.parse(new TextDecoder().decode(await fetchMeshAsset(meshUrls[property.id],'json',250000,scope))),property.id);
  const compressed=await fetchMeshAsset(meta.buffer,'mesh',6000000,scope);
  const bytes=await boundedBytes(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')),meta.vertexCount*32);
  const vertices=meshVertices(bytes,meta),resources=[],materials=[];
  const geometry=new THREE.BufferGeometry();resources.push(geometry);
  const interleaved=new THREE.InterleavedBuffer(vertices,8);
  geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(interleaved,3,0));
  geometry.setAttribute('uv',new THREE.InterleavedBufferAttribute(interleaved,2,3));
  geometry.setAttribute('color',new THREE.InterleavedBufferAttribute(interleaved,3,5));
  let closed=false;
  const dispose=()=>{if(!closed){closed=true;resources.forEach(r=>r.dispose());}};
  try {
    // Bounded concurrency; each texture validated and decoded before first render.
    let next=0;
    const worker=async()=>{for(;;){const index=next++;if(index>=meta.groups.length)return;
      const g=meta.groups[index],t=g.texture;
      const png=await fetchMeshAsset(t.url,'png',400000,scope);
      if(scope.aborted)throw Error('Cancelled');
      const image=await createImageBitmap(new Blob([png],{type:'image/png'}));
      if(image.width>512||image.height>8192||image.width*image.height>1048576){image.close();throw Error('Texture dimensions');}
      if(closed||scope.aborted){image.close();throw Error('Cancelled');}
      const texture=new THREE.Texture(image);resources.push(texture,{dispose:()=>image.close()});
      texture.flipY=false;texture.generateMipmaps=t.opaque||t.transparent;texture.magFilter=THREE.NearestFilter;
      texture.minFilter=texture.generateMipmaps?THREE.NearestMipmapLinearFilter:THREE.NearestFilter;texture.needsUpdate=true;
      const material=new THREE.ShaderMaterial({vertexShader,fragmentShader,transparent:t.transparent,depthWrite:true,side:THREE.FrontSide,
        uniforms:{blockTexture:{value:texture},frames:{value:t.frames},frame:{value:t.frame},fromY:{value:0},toY:{value:meta.size[1]}}});
      materials[index]=material;resources.push(material);
    }};
    await Promise.all(Array.from({length:6},worker));
    if(scope.aborted)throw Error('Cancelled');
    meta.groups.forEach((g,i)=>geometry.addGroup(g.start,g.count,i));
    const mesh=new THREE.Mesh(geometry,materials);
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    return {mesh,meta,dispose,
      range(minY,maxY){
        const lo=minY-meta.origin[1],hi=maxY+1-meta.origin[1],box=new THREE.Box3();
        for(let i=0;i<vertices.length;i+=8)if(vertices[i+1]>=lo&&vertices[i+1]<=hi)box.expandByPoint(new THREE.Vector3(vertices[i],vertices[i+1],vertices[i+2]));
        if(box.isEmpty())return null;
        materials.forEach(m=>{m.uniforms.fromY.value=lo;m.uniforms.toY.value=hi;});return box;
      }};
  }catch(error){dispose();throw error;}
}
