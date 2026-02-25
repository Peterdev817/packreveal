import * as THREE from 'three'
import { useLoader, useFrame } from '@react-three/fiber'
import { GLTFLoaderWithDraco } from './gltfLoaderWithDraco'
import { useRef, useEffect, useMemo, useState } from 'react'
import { CleanR3FChildren } from './r3fInstrumentationStrip'

const textureLoader = new THREE.TextureLoader()

// Card3D: display card.glb with pack image on materials; play built-in tear animation when isTearing.
export function Card3D({
  scale = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  cutPixelsFromTop = 20,
  cardHeightPx = 400,
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

  // Apply pack image: top 5% of image to the upper mesh, remaining 95% to the lower mesh (split model)
  const TOP_IMAGE_RATIO = 0.05
  useEffect(() => {
    if (!sceneClone || !cardTexture) return
    cardTexture.colorSpace = THREE.SRGBColorSpace
    const meshes = []
    sceneClone.traverse((child) => {
      if (child.isMesh && child.geometry) meshes.push(child)
    })
    if (meshes.length === 0) return
    meshes.forEach((mesh) => {
      const geo = mesh.geometry
      geo.deleteAttribute('color')
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
    })
    if (meshes.length === 1) {
      const mat = new THREE.MeshBasicMaterial({
        map: cardTexture,
        color: 0xffffff,
        side: THREE.DoubleSide,
        depthWrite: true,
        depthTest: true,
        toneMapped: false,
        fog: false,
      })
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace
      meshes[0].material = mat
      return
    }
    meshes.sort((a, b) => {
      a.geometry.computeBoundingBox()
      b.geometry.computeBoundingBox()
      const ca = a.geometry.boundingBox.getCenter(new THREE.Vector3())
      const cb = b.geometry.boundingBox.getCenter(new THREE.Vector3())
      return cb.y - ca.y
    })
    const topMesh = meshes[0]
    const bottomMesh = meshes[1]
    const texTop = cardTexture.clone()
    texTop.colorSpace = THREE.SRGBColorSpace
    texTop.offset.set(0, 1 - TOP_IMAGE_RATIO)
    texTop.repeat.set(1, TOP_IMAGE_RATIO)
    texTop.wrapS = texTop.wrapT = THREE.ClampToEdgeWrapping
    const texBottom = cardTexture.clone()
    texBottom.colorSpace = THREE.SRGBColorSpace
    texBottom.offset.set(0, 0)
    texBottom.repeat.set(1, 1 - TOP_IMAGE_RATIO)
    texBottom.wrapS = texBottom.wrapT = THREE.ClampToEdgeWrapping
    topMesh.material = new THREE.MeshBasicMaterial({
      map: texTop,
      color: 0xffffff,
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true,
      toneMapped: false,
      fog: false,
    })
    bottomMesh.material = new THREE.MeshBasicMaterial({
      map: texBottom,
      color: 0xffffff,
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true,
      toneMapped: false,
      fog: false,
    })
    if (meshes.length > 2) {
      for (let i = 2; i < meshes.length; i++) {
        const tex = cardTexture.clone()
        tex.colorSpace = THREE.SRGBColorSpace
        tex.offset.set(0, 0)
        tex.repeat.set(1, 1 - TOP_IMAGE_RATIO)
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
        meshes[i].material = new THREE.MeshBasicMaterial({
          map: tex,
          color: 0xffffff,
          side: THREE.DoubleSide,
          depthWrite: true,
          depthTest: true,
          toneMapped: false,
          fog: false,
        })
      }
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

  // Slide-out: move whole card down off the bottom of the screen (no fade/mask)
  const SLIDE_DISTANCE = 30
  const SLIDE_DURATION = 4000
  useEffect(() => {
    if (!groupRef.current || !isSliding) return
    if (!isTearing) return

    const duration = SLIDE_DURATION
    const startTime = Date.now()
    const startY = groupRef.current.position.y

    const animate = () => {
      if (!groupRef.current) return
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      groupRef.current.position.y = startY - eased * SLIDE_DISTANCE
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [isSliding, isTearing, sceneClone])

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
