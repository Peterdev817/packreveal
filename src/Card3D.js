import * as THREE from 'three'
import { useLoader, useFrame } from '@react-three/fiber'
import { GLTFLoaderWithDraco } from './gltfLoaderWithDraco'
import { useRef, useEffect, useMemo, useState } from 'react'
import { CleanR3FChildren } from './r3fInstrumentationStrip'

const textureLoader = new THREE.TextureLoader()
const TOP_IMAGE_RATIO = 0.06

function createCardMaterial(texture) {
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    side: THREE.DoubleSide,
    depthWrite: true,
    depthTest: true,
    toneMapped: false,
    fog: false,
  })
  if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace
  // Two-side mapping based on local normals (model space),
  // using mirrored U on the back side to keep text orientation readable.
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vLocalNormal;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vLocalNormal = normalize(normal);`
      )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 vLocalNormal;`
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec2 uv = vMapUv;
        // Use threshold so border/angled faces don't flip unexpectedly.
        bool isBackSide = (vLocalNormal.z < -0.5);
        if (isBackSide) {
          vec2 uvBack = vec2(1.0 - uv.x, uv.y);
          vec4 sampledDiffuseColor = texture2D(map, uvBack);
          diffuseColor *= sampledDiffuseColor;
        } else {
          vec4 sampledDiffuseColor = texture2D(map, uv);
          diffuseColor *= sampledDiffuseColor;
        }
      #endif`
    )
  }
  return mat
}

// Card3D: display card.glb with pack image on materials; play built-in tear animation when isTearing.
export function Card3D({
  scale = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  cutPixelsFromTop = 20,
  cardHeightPx = 400,
  pokedexHeightPx,
  isTearing = false,
  isSliding = false,
  onAppear,
  onCutPositionUpdate,
  cardRef,
  cardImageUrl = '/card.png',
}) {
  const groupRef = useRef()
  const animationStartedRef = useRef(false)
  const tearStartedRef = useRef(false)
  const [cardTexture, setCardTexture] = useState(null)

  const gltf = useLoader(GLTFLoaderWithDraco, '/card.glb')

  useEffect(() => {
    let cancelled = false
    textureLoader.load(cardImageUrl, (tex) => {
      if (cancelled) return
      tex.colorSpace = THREE.SRGBColorSpace
      setCardTexture(tex)
    })
    return () => {
      cancelled = true
    }
  }, [cardImageUrl])

  // Clone scene so we have our own instance to animate (mixer will drive this clone)
  const sceneClone = useMemo(() => (gltf.scene ? gltf.scene.clone(true) : null), [gltf])

  // Apply card image by replacing only materials (no geometry changes).
  // Upper mesh gets top 20% of image; lower meshes get remaining 80%.
  useEffect(() => {
    if (!sceneClone || !cardTexture) return
    cardTexture.colorSpace = THREE.SRGBColorSpace
    const meshes = []
    sceneClone.traverse((child) => {
      child.visible = true
      if (!child.isMesh || !child.geometry) return
      meshes.push(child)
    })
    if (meshes.length === 0) return

    // Prepare split textures
    const texTop = cardTexture.clone()
    texTop.colorSpace = THREE.SRGBColorSpace
    texTop.offset.set(0, 1 - TOP_IMAGE_RATIO)
    texTop.repeat.set(1, TOP_IMAGE_RATIO)
    texTop.wrapS = texTop.wrapT = THREE.ClampToEdgeWrapping
    texTop.needsUpdate = true
    const texBottom = cardTexture.clone()
    texBottom.colorSpace = THREE.SRGBColorSpace
    texBottom.offset.set(0, 0)
    texBottom.repeat.set(1, 1 - TOP_IMAGE_RATIO)
    texBottom.wrapS = texBottom.wrapT = THREE.ClampToEdgeWrapping
    texBottom.needsUpdate = true

    // Pick upper mesh by local geometry Y center (stable regardless of parent animation scale).
    let upperMesh = null
    let maxCenterY = -Infinity
    meshes.forEach((mesh) => {
      const geo = mesh.geometry
      if (!geo.attributes.uv && geo.attributes.position) {
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
          uvArray[i * 2] = (x - minX) / rangeX
          uvArray[i * 2 + 1] = (y - minY) / rangeY
        }
        geo.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2))
      }
      geo.computeBoundingBox()
      const center = geo.boundingBox.getCenter(new THREE.Vector3())
      if (center.y > maxCenterY) {
        maxCenterY = center.y
        upperMesh = mesh
      }
    })

    const applyMappedMaterials = () => {
      meshes.forEach((mesh) => {
        const tex = mesh === upperMesh ? texTop : texBottom
        mesh.material = createCardMaterial(tex)
        mesh.material.needsUpdate = true
        if (mesh.geometry?.attributes?.uv) mesh.geometry.attributes.uv.needsUpdate = true
        mesh.renderOrder = 0
      })
    }
    // Apply immediately and once more over the next frames to avoid first-frame stale shader/texture state.
    applyMappedMaterials()
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      applyMappedMaterials()
      raf2 = requestAnimationFrame(() => {
        applyMappedMaterials()
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [sceneClone, cardTexture])
  const mixer = useMemo(() => {
    if (!sceneClone) return null
    return new THREE.AnimationMixer(sceneClone)
  }, [sceneClone])

  // Appear animation (scale 0 -> 1 with 360° rotation)
  useEffect(() => {
    if (!groupRef.current || animationStartedRef.current) return
    animationStartedRef.current = true

    groupRef.current.scale.set(0, 0, 0)
    groupRef.current.rotation.y = 0

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const duration = 1500
        const startTime = Date.now()

        const animate = () => {
          if (!groupRef.current) return
          const elapsed = Date.now() - startTime
          const progress = Math.min(elapsed / duration, 1)
          const eased = 1 - Math.pow(1 - progress, 3)
          groupRef.current.scale.setScalar(eased * scale)
          groupRef.current.rotation.y = eased * Math.PI * 2
          if (progress < 1) requestAnimationFrame(animate)
          else onAppear?.()
        }
        requestAnimationFrame(animate)
      })
    })
  }, [onAppear, scale])

  // When isTearing becomes true, play the GLB's built-in tear animation (first clip, or one named "Tear")
  useEffect(() => {
    if (!isTearing || !mixer || !gltf.animations || gltf.animations.length === 0) return
    if (tearStartedRef.current) return
    tearStartedRef.current = true

    const clip =
      gltf.animations.find((a) => a.name && a.name.toLowerCase().includes('tear')) ||
      gltf.animations[0]
    const action = mixer.clipAction(clip)
    action.setLoop(THREE.LoopOnce)
    action.clampWhenFinished = true
    action.timeScale = 2.3
    action.reset().play()
  }, [isTearing, mixer, gltf.animations])

  // Reset tear ref when isTearing goes false (e.g. if component remounts or state resets)
  useEffect(() => {
    if (!isTearing) tearStartedRef.current = false
  }, [isTearing])

  // Slide-out: 4 seconds total — phase1 drop, phase2 quick drop, then fade
  const TOTAL_SLIDE_MS = 4000
  const PHASE1_MS = 2000  // 1s: drop 1/3 poke height
  const PHASE2_MS = 1000  // 1s: quick drop
  const FADE_MS = TOTAL_SLIDE_MS - PHASE1_MS - PHASE2_MS  // 2s fade

  const refSlideUnits = 30
  const pokedexH = pokedexHeightPx != null ? pokedexHeightPx : cardHeightPx
  const pokedexHeightWorld = refSlideUnits * (pokedexH / cardHeightPx)
  const phase1Distance = (1 / 40) * pokedexHeightWorld
  const totalSlideDistance = 1 * pokedexHeightWorld
  const phase2Distance = totalSlideDistance - phase1Distance

  useEffect(() => {
    if (!groupRef.current || !isSliding || !sceneClone) return
    if (!isTearing) return

    const startTime = Date.now()
    const startY = groupRef.current.position.y

    const animate = () => {
      if (!groupRef.current || !sceneClone) return
      const elapsed = Date.now() - startTime

      if (elapsed < PHASE1_MS) {
        // Phase 1 (1s): drop 1/3 of poke image height
        const t = Math.min(elapsed / PHASE1_MS, 1)
        const eased = 1 - Math.pow(1 - t, 2)
        groupRef.current.position.y = startY - eased * phase1Distance
      } else if (elapsed < PHASE1_MS + PHASE2_MS) {
        // Phase 2 (1s): quick drop the rest of the way
        const t = Math.min((elapsed - PHASE1_MS) / PHASE2_MS, 1)
        const progress = t
        groupRef.current.position.y = startY - phase1Distance - progress * phase2Distance
      } else {
        groupRef.current.position.y = startY - totalSlideDistance
        const fadeElapsed = elapsed - PHASE1_MS - PHASE2_MS
        const fadeProgress = Math.min(fadeElapsed / FADE_MS, 1)
        const opacity = 1 - fadeProgress
        sceneClone.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.transparent = true
            child.material.opacity = opacity
          }
        })
      }
      if (elapsed < TOTAL_SLIDE_MS) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [isSliding, isTearing, sceneClone, phase1Distance, phase2Distance, totalSlideDistance])

  // Drive animation mixer every frame
  useFrame((_, delta) => {
    if (mixer) mixer.update(delta)
  })

  if (!sceneClone || !cardTexture) return null

  return (
    <CleanR3FChildren>
      <group ref={groupRef} position={position} rotation={rotation} scale={0}>
        <primitive object={sceneClone} />
      </group>
    </CleanR3FChildren>
  )
}
