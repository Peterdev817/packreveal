import * as THREE from 'three'
import { useLoader, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { GLTFLoaderWithDraco } from './gltfLoaderWithDraco'
import { useMemo, useEffect, useRef, useState } from 'react'
import { CleanR3FChildren } from './r3fInstrumentationStrip'

// Perlin 3D noise (from Codrops Noise.js)
const noiseGLSL = `
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
vec4 fade(vec4 t) {return t*t*t*(t*(t*6.0-15.0)+10.0);}

float cnoise(vec4 P){
 vec4 Pi0 = floor(P);
 vec4 Pi1 = Pi0 + 1.0;
 Pi0 = mod(Pi0, 289.0);
 Pi1 = mod(Pi1, 289.0);
 vec4 Pf0 = fract(P);
 vec4 Pf1 = Pf0 - 1.0;
 vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
 vec4 iy = vec4(Pi0.yy, Pi1.yy);
 vec4 iz0 = vec4(Pi0.zzzz);
 vec4 iz1 = vec4(Pi1.zzzz);
 vec4 iw0 = vec4(Pi0.wwww);
 vec4 iw1 = vec4(Pi1.wwww);

 vec4 ixy = permute(permute(ix) + iy);
 vec4 ixy0 = permute(ixy + iz0);
 vec4 ixy1 = permute(ixy + iz1);
 vec4 ixy00 = permute(ixy0 + iw0);
 vec4 ixy01 = permute(ixy0 + iw1);
 vec4 ixy10 = permute(ixy1 + iw0);
 vec4 ixy11 = permute(ixy1 + iw1);

 vec4 gx00 = ixy00 / 7.0;
 vec4 gy00 = floor(gx00) / 7.0;
 vec4 gz00 = floor(gy00) / 6.0;
 gx00 = fract(gx00) - 0.5;
 gy00 = fract(gy00) - 0.5;
 gz00 = fract(gz00) - 0.5;
 vec4 gw00 = vec4(0.75) - abs(gx00) - abs(gy00) - abs(gz00);
 vec4 sw00 = step(gw00, vec4(0.0));
 gx00 -= sw00 * (step(0.0, gx00) - 0.5);
 gy00 -= sw00 * (step(0.0, gy00) - 0.5);

 vec4 gx01 = ixy01 / 7.0;
 vec4 gy01 = floor(gx01) / 7.0;
 vec4 gz01 = floor(gy01) / 6.0;
 gx01 = fract(gx01) - 0.5;
 gy01 = fract(gy01) - 0.5;
 gz01 = fract(gz01) - 0.5;
 vec4 gw01 = vec4(0.75) - abs(gx01) - abs(gy01) - abs(gz01);
 vec4 sw01 = step(gw01, vec4(0.0));
 gx01 -= sw01 * (step(0.0, gx01) - 0.5);
 gy01 -= sw01 * (step(0.0, gy01) - 0.5);

 vec4 gx10 = ixy10 / 7.0;
 vec4 gy10 = floor(gx10) / 7.0;
 vec4 gz10 = floor(gy10) / 6.0;
 gx10 = fract(gx10) - 0.5;
 gy10 = fract(gy10) - 0.5;
 gz10 = fract(gz10) - 0.5;
 vec4 gw10 = vec4(0.75) - abs(gx10) - abs(gy10) - abs(gz10);
 vec4 sw10 = step(gw10, vec4(0.0));
 gx10 -= sw10 * (step(0.0, gx10) - 0.5);
 gy10 -= sw10 * (step(0.0, gy10) - 0.5);

 vec4 gx11 = ixy11 / 7.0;
 vec4 gy11 = floor(gx11) / 7.0;
 vec4 gz11 = floor(gy11) / 6.0;
 gx11 = fract(gx11) - 0.5;
 gy11 = fract(gy11) - 0.5;
 gz11 = fract(gz11) - 0.5;
 vec4 gw11 = vec4(0.75) - abs(gx11) - abs(gy11) - abs(gz11);
 vec4 sw11 = step(gw11, vec4(0.0));
 gx11 -= sw11 * (step(0.0, gx11) - 0.5);
 gy11 -= sw11 * (step(0.0, gy11) - 0.5);

 vec4 g0000 = vec4(gx00.x,gy00.x,gz00.x,gw00.x);
 vec4 g1000 = vec4(gx00.y,gy00.y,gz00.y,gw00.y);
 vec4 g0100 = vec4(gx00.z,gy00.z,gz00.z,gw00.z);
 vec4 g1100 = vec4(gx00.w,gy00.w,gz00.w,gw00.w);
 vec4 g0010 = vec4(gx10.x,gy10.x,gz10.x,gw10.x);
 vec4 g1010 = vec4(gx10.y,gy10.y,gz10.y,gw10.y);
 vec4 g0110 = vec4(gx10.z,gy10.z,gz10.z,gw10.z);
 vec4 g1110 = vec4(gx10.w,gy10.w,gz10.w,gw10.w);
 vec4 g0001 = vec4(gx01.x,gy01.x,gz01.x,gw01.x);
 vec4 g1001 = vec4(gx01.y,gy01.y,gz01.y,gw01.y);
 vec4 g0101 = vec4(gx01.z,gy01.z,gz01.z,gw01.z);
 vec4 g1101 = vec4(gx01.w,gy01.w,gz01.w,gw01.w);
 vec4 g0011 = vec4(gx11.x,gy11.x,gz11.x,gw11.x);
 vec4 g1011 = vec4(gx11.y,gy11.y,gz11.y,gw11.y);
 vec4 g0111 = vec4(gx11.z,gy11.z,gz11.z,gw11.z);
 vec4 g1111 = vec4(gx11.w,gy11.w,gz11.w,gw11.w);

 vec4 norm00 = taylorInvSqrt(vec4(dot(g0000, g0000), dot(g0100, g0100), dot(g1000, g1000), dot(g1100, g1100)));
 g0000 *= norm00.x;
 g0100 *= norm00.y;
 g1000 *= norm00.z;
 g1100 *= norm00.w;

 vec4 norm01 = taylorInvSqrt(vec4(dot(g0001, g0001), dot(g0101, g0101), dot(g1001, g1001), dot(g1101, g1101)));
 g0001 *= norm01.x;
 g0101 *= norm01.y;
 g1001 *= norm01.z;
 g1101 *= norm01.w;

 vec4 norm10 = taylorInvSqrt(vec4(dot(g0010, g0010), dot(g0110, g0110), dot(g1010, g1010), dot(g1110, g1110)));
 g0010 *= norm10.x;
 g0110 *= norm10.y;
 g1010 *= norm10.z;
 g1110 *= norm10.w;

 vec4 norm11 = taylorInvSqrt(vec4(dot(g0011, g0011), dot(g0111, g0111), dot(g1011, g1011), dot(g1111, g1111)));
 g0011 *= norm11.x;
 g0111 *= norm11.y;
 g1011 *= norm11.z;
 g1111 *= norm11.w;

 float n0000 = dot(g0000, Pf0);
 float n1000 = dot(g1000, vec4(Pf1.x, Pf0.yzw));
 float n0100 = dot(g0100, vec4(Pf0.x, Pf1.y, Pf0.zw));
 float n1100 = dot(g1100, vec4(Pf1.xy, Pf0.zw));
 float n0010 = dot(g0010, vec4(Pf0.xy, Pf1.z, Pf0.w));
 float n1010 = dot(g1010, vec4(Pf1.x, Pf0.y, Pf1.z, Pf0.w));
 float n0110 = dot(g0110, vec4(Pf0.x, Pf1.yz, Pf0.w));
 float n1110 = dot(g1110, vec4(Pf1.xyz, Pf0.w));
 float n0001 = dot(g0001, vec4(Pf0.xyz, Pf1.w));
 float n1001 = dot(g1001, vec4(Pf1.x, Pf0.yz, Pf1.w));
 float n0101 = dot(g0101, vec4(Pf0.x, Pf1.y, Pf0.z, Pf1.w));
 float n1101 = dot(g1101, vec4(Pf1.xy, Pf0.z, Pf1.w));
 float n0011 = dot(g0011, vec4(Pf0.xy, Pf1.zw));
 float n1011 = dot(g1011, vec4(Pf1.x, Pf0.y, Pf1.zw));
 float n0111 = dot(g0111, vec4(Pf0.x, Pf1.yzw));
 float n1111 = dot(g1111, Pf1);

 vec4 fade_xyzw = fade(Pf0);
 vec4 n_0w = mix(vec4(n0000, n1000, n0100, n1100), vec4(n0001, n1001, n0101, n1101), fade_xyzw.w);
 vec4 n_1w = mix(vec4(n0010, n1010, n0110, n1110), vec4(n0011, n1011, n0111, n1111), fade_xyzw.w);
 vec4 n_zw = mix(n_0w, n_1w, fade_xyzw.z);
 vec2 n_yzw = mix(n_zw.xy, n_zw.zw, fade_xyzw.y);
 float n_xyzw = mix(n_yzw.x, n_yzw.y, fade_xyzw.x);
 return 2.2 * n_xyzw;
}
`

const textureLoader = new THREE.TextureLoader()
// UV width controls for preview coverage tuning:
// > 1.0 expands image coverage horizontally, < 1.0 narrows it.
const UV_SCALE_X = 0.97
// Keep centered after scaling. (Default formula: (1 - UV_SCALE_X) * 0.5)
const UV_OFFSET_X = (1 - UV_SCALE_X) * 0.5
// UV height controls for preview coverage tuning:
// > 1.0 expands image coverage vertically, < 1.0 narrows it.
const UV_SCALE_Y = 0.99
// Keep centered after scaling. (Default formula: (1 - UV_SCALE_Y) * 0.5)
const UV_OFFSET_Y = (1 - UV_SCALE_Y) * 0.5

export function Card3DPreview({ cardImageUrl = '/card.png' }) {
  const gltf = useLoader(GLTFLoaderWithDraco, '/card_preview.glb')

  const previewMesh = useMemo(() => {
    let firstMesh = null
    gltf.scene?.traverse((child) => {
      if (!firstMesh && child.isMesh && child.geometry) firstMesh = child
    })
    return firstMesh
  }, [gltf])

  const previewGeometry = useMemo(() => {
    if (!previewMesh?.geometry) return null
    const geo = previewMesh.geometry.clone()
    if (!geo.attributes?.position) return null
    if (!geo.attributes?.normal) geo.computeVertexNormals()
    if (!geo.attributes?.uv) {
      geo.computeBoundingBox()
      const bbox = geo.boundingBox
      const pos = geo.attributes.position
      const uvArray = new Float32Array(pos.count * 2)
      const minX = bbox.min.x
      const minY = bbox.min.y
      const rangeX = Math.max(bbox.max.x - minX, 1e-6)
      const rangeY = Math.max(bbox.max.y - minY, 1e-6)
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        const y = pos.getY(i)
        uvArray[i * 2] = ((x - minX) / rangeX) * UV_SCALE_X + UV_OFFSET_X
        uvArray[i * 2 + 1] = ((y - minY) / rangeY) * UV_SCALE_Y + UV_OFFSET_Y
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2))
    }
    return geo
  }, [previewMesh])

  const uniformsRef = useRef({
    u_time: { value: 0 },
    u_prevMap: { value: null },
    u_nextMap: { value: null },
    u_progress: { value: 1 },
    u_width: { value: 0.8 },
    u_scaleX: { value: 50 },
    u_scaleY: { value: 50 },
  })

  const animatingRef = useRef(false)
  const progressRef = useRef(1)
  const [texReady, setTexReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    textureLoader.load(cardImageUrl, (tex) => {
      if (cancelled) return
      tex.colorSpace = THREE.SRGBColorSpace
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping

      const uniforms = uniformsRef.current
      if (!uniforms.u_nextMap.value) {
        uniforms.u_prevMap.value = tex
        uniforms.u_nextMap.value = tex
        uniforms.u_progress.value = 1
        progressRef.current = 1
      } else {
        uniforms.u_prevMap.value = uniforms.u_nextMap.value
        uniforms.u_nextMap.value = tex
        uniforms.u_progress.value = 0
        progressRef.current = 0
        animatingRef.current = true
      }

      setTexReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [cardImageUrl])

  useFrame((_, delta) => {
    const uniforms = uniformsRef.current
    uniforms.u_time.value += delta
    if (animatingRef.current) {
      const d = progressRef.current + delta / 1.0
      const p = d >= 1 ? 1 : d
      progressRef.current = p
      uniforms.u_progress.value = p
      if (p >= 1) animatingRef.current = false
    }
  })

  if (!previewGeometry || !texReady) return null

  return (
    <CleanR3FChildren>
      <mesh geometry={previewGeometry} position={[0, 0, 0]} rotation={[0, 0, 0]} scale={2}>
        <shaderMaterial
          uniforms={uniformsRef.current}
          vertexShader={/* glsl */`
            varying vec2 vUv;
            varying vec3 vLocalNormal;
            void main() {
              vUv = uv;
              vLocalNormal = normalize(normal);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={/* glsl */`
            uniform float u_time;
            uniform sampler2D u_prevMap;
            uniform sampler2D u_nextMap;
            uniform float u_progress;
            uniform float u_width;
            uniform float u_scaleX;
            uniform float u_scaleY;
            varying vec2 vUv;
            varying vec3 vLocalNormal;
            ${noiseGLSL}

            float parabola( float x, float k ) {
              return pow( 4.0 * x * ( 1.0 - x ), k );
            }

            void main() {
              vec2 uv = vUv;
              // Robust side detection in model space for exported double surfaces.
              // Threshold avoids unstable flips on near-edge/side faces.
              bool isBackSide = (vLocalNormal.z < -0.35);
              if (isBackSide) uv.x = 1.0 - uv.x;

              float dt = parabola(u_progress, 1.0);
              float noiseValue = 0.5 * (cnoise(vec4(uv.x * u_scaleX + 0.5 * u_time / 3.0, uv.y * u_scaleY, 0.5 * u_time / 3.0, 0.0)) + 1.0);

              float w = u_width * dt;
              float maskValue = smoothstep(1.0 - w, 1.0, uv.y + mix(-w / 2.0, 1.0 - w / 2.0, u_progress));
              maskValue += maskValue * noiseValue;
              float mask = clamp(maskValue, 0.0, 1.0);

              vec4 col1 = texture2D(u_prevMap, uv);
              vec4 col2 = texture2D(u_nextMap, uv);
              vec3 rgb = mix(col1.rgb, col2.rgb, mask);
              // Compile-safe output conversion (sRGB gamma) for ShaderMaterial.
              vec3 srgb = pow(max(rgb, vec3(0.0)), vec3(1.0 / 2.2));
              gl_FragColor = vec4(srgb, 1.0);
            }
          `}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={4}
        maxDistance={10}
        rotateSpeed={1}
      />
    </CleanR3FChildren>
  )
}
