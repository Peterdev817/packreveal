import * as THREE from 'three'
import { useLoader, useThree } from '@react-three/fiber'
import { Decal, useTexture } from '@react-three/drei'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { useRef, useEffect, useMemo } from 'react'

// Card3D: project card image onto card.glb using Decal (front + back)
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
  const fullMeshRef = useRef()
  const bottomMeshRef = useRef()
  const topMeshRef = useRef()
  const topGroupRef = useRef()
  const animationStartedRef = useRef(false)
  const tearStartedRef = useRef(false)
  const { camera, size } = useThree()

  const gltf = useLoader(GLTFLoader, '/card.glb')
  const cardTexture = useTexture(cardImageUrl)
  const logoTexture = useTexture('/logo-wrapped.png')

  // Configure textures to use sRGB color space to match CSS image rendering
  useEffect(() => {
    if (cardTexture) cardTexture.colorSpace = THREE.SRGBColorSpace
    if (logoTexture) logoTexture.colorSpace = THREE.SRGBColorSpace
  }, [cardTexture, logoTexture])

  const backLogoTexture = useMemo(() => {
    if (!logoTexture) return null
    const t = logoTexture.clone()
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = logoTexture.wrapT ?? THREE.ClampToEdgeWrapping
    t.repeat.set(-1, 1)
    t.offset.set(1, 0)
    t.colorSpace = THREE.SRGBColorSpace
    t.needsUpdate = true
    return t
  }, [logoTexture])

  // If the decal appears mirrored horizontally, flip U for the back decal map
  // (front stays untouched). This is a common fix for projection basis handedness.
  const backCardTexture = useMemo(() => {
    if (!cardTexture) return null

    const t = cardTexture.clone()
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = cardTexture.wrapT ?? THREE.ClampToEdgeWrapping
    t.repeat.set(-1, 1) // flip U
    t.offset.set(1, 0)
    t.colorSpace = THREE.SRGBColorSpace // Ensure sRGB color space for consistency
    t.needsUpdate = true
    return t
  }, [cardTexture])

  const cardMesh = useMemo(() => {
    let mesh = null
    gltf.scene.traverse((child) => {
      if (child.isMesh && !mesh) mesh = child
    })
    if (!mesh) mesh = gltf.scene.children.find((child) => child.isMesh) || null
    if (!mesh?.isMesh) return null
    if (!mesh.geometry?.attributes?.position) return null
    if (!mesh.geometry?.attributes?.normal) mesh.geometry.computeVertexNormals()
    return mesh
  }, [gltf])

  // Split/cut settings (straight horizontal cut using clipping planes)
  // Cut at 20px from top - convert pixel value to 3D space
  const cut = useMemo(() => {
    if (!cardMesh?.isMesh) return null
    const geo = cardMesh.geometry
    if (!geo?.attributes?.position) return null

    geo.computeBoundingBox()
    const bbox = geo.boundingBox
    if (!bbox) return null

    const size = new THREE.Vector3()
    bbox.getSize(size)
    const minY = bbox.min.y
    const maxY = bbox.max.y
    const h = Math.max(0.0001, maxY - minY)

    // Convert pixel position (20px from top) to 3D coordinate
    // cutPixelsFromTop / cardHeightPx gives the ratio from top
    const ratioFromTop = cutPixelsFromTop / cardHeightPx
    const cutY = maxY - (h * ratioFromTop)

    // Clipping planes for Three.js:
    // Top part: keep everything where y >= cutY (normal pointing down, constant = cutY)
    // Bottom part: keep everything where y <= cutY (normal pointing up, constant = -cutY)
    const topPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), cutY)
    const bottomPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -cutY)

    return { cutY, topPlane, bottomPlane }
  }, [cardMesh, cutPixelsFromTop, cardHeightPx])

  const materials = useMemo(() => {
    if (!cardMesh?.material || !cut) {
      return {
        fullMaterial: null,
        bottomMaterial: null,
        topMaterial: null,
      }
    }

    const cloneWith = (mat, { planes }) => {
      const m = mat.clone()
      m.clippingPlanes = planes || null
      m.clipIntersection = false
      m.clipShadows = true
      m.transparent = true
      m.opacity = 1
      // Helps reduce seam z-fighting at the cut (when both parts render)
      m.polygonOffset = true
      m.polygonOffsetFactor = 1
      m.polygonOffsetUnits = 1
      return m
    }

    const src = cardMesh.material
    if (Array.isArray(src)) {
      return {
        fullMaterial: src.map((m) => cloneWith(m, { planes: null })),
        bottomMaterial: src.map((m) => cloneWith(m, { planes: [cut.bottomPlane] })),
        topMaterial: src.map((m) => cloneWith(m, { planes: [cut.topPlane] })),
      }
    }

    return {
      fullMaterial: cloneWith(src, { planes: null }),
      bottomMaterial: cloneWith(src, { planes: [cut.bottomPlane] }),
      topMaterial: cloneWith(src, { planes: [cut.topPlane] }),
    }
  }, [cardMesh, cut])

  const decalMaterials = useMemo(() => {
    if (!cut || !cardTexture) {
      return {
        fullFront: null,
        fullBack: null,
        bottomFront: null,
        bottomBack: null,
        topFront: null,
        topBack: null,
      }
    }

    const mkDecalMat = ({ map, planes, polygonOffsetFactor }) => {
      // Use MeshBasicMaterial instead of MeshStandardMaterial to make it unlit
      // This ensures the texture appears exactly as it does in the 2D CSS image
      const m = new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        opacity: 1,
        polygonOffset: true,
        polygonOffsetFactor,
        polygonOffsetUnits: 1,
        depthTest: true,
        depthWrite: false,
      })
      m.clippingPlanes = planes || null
      m.clipIntersection = false
      m.clipShadows = true
      return m
    }

    return {
      // Full (no clipping)
      fullFront: mkDecalMat({ map: cardTexture, planes: null, polygonOffsetFactor: -1 }),
      fullBack: mkDecalMat({ map: backCardTexture || cardTexture, planes: null, polygonOffsetFactor: -2 }),
      // Bottom (clip below cut)
      bottomFront: mkDecalMat({ map: cardTexture, planes: [cut.bottomPlane], polygonOffsetFactor: -1 }),
      bottomBack: mkDecalMat({ map: backCardTexture || cardTexture, planes: [cut.bottomPlane], polygonOffsetFactor: -2 }),
      // Top (clip above cut)
      topFront: mkDecalMat({ map: cardTexture, planes: [cut.topPlane], polygonOffsetFactor: -1 }),
      topBack: mkDecalMat({ map: backCardTexture || cardTexture, planes: [cut.topPlane], polygonOffsetFactor: -2 }),
    }
  }, [cut, cardTexture, backCardTexture])

  const logoDecalMaterials = useMemo(() => {
    if (!cut || !logoTexture) {
      return {
        fullFront: null,
        fullBack: null,
        bottomFront: null,
        bottomBack: null,
        topFront: null,
        topBack: null,
      }
    }
    const mkDecalMat = ({ map, planes, polygonOffsetFactor }) => {
      const m = new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        opacity: 1,
        polygonOffset: true,
        polygonOffsetFactor,
        polygonOffsetUnits: 1,
        depthTest: true,
        depthWrite: false,
      })
      m.clippingPlanes = planes || null
      m.clipIntersection = false
      m.clipShadows = true
      return m
    }
    return {
      fullFront: mkDecalMat({ map: logoTexture, planes: null, polygonOffsetFactor: -3 }),
      fullBack: mkDecalMat({ map: backLogoTexture || logoTexture, planes: null, polygonOffsetFactor: -4 }),
      bottomFront: mkDecalMat({ map: logoTexture, planes: [cut.bottomPlane], polygonOffsetFactor: -3 }),
      bottomBack: mkDecalMat({ map: backLogoTexture || logoTexture, planes: [cut.bottomPlane], polygonOffsetFactor: -4 }),
      topFront: mkDecalMat({ map: logoTexture, planes: [cut.topPlane], polygonOffsetFactor: -3 }),
      topBack: mkDecalMat({ map: backLogoTexture || logoTexture, planes: [cut.topPlane], polygonOffsetFactor: -4 }),
    }
  }, [cut, logoTexture, backLogoTexture])

  // Decal placement derived from the model bounds (assumes the card faces +/-Z)
  const decal = useMemo(() => {
    if (!cardMesh?.isMesh) return null

    const geo = cardMesh.geometry
    if (!geo?.attributes?.position) return null

    geo.computeBoundingBox()
    const bbox = geo.boundingBox
    if (!bbox) return null

    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    bbox.getSize(size)
    bbox.getCenter(center)

    const EPS = Math.max(0.001, size.z * 0.02)
    const scaleXY = [size.x * 1.02, size.y * 1.02, 1]

    // Logo decal: preserve aspect ratio so it isn't stretched (card is portrait, logo has its own ratio)
    const logoSizeFactor = 0.56
    const base = Math.min(size.x, size.y) * logoSizeFactor
    let logoScaleXY
    const img = logoTexture?.image
    const logoW = img?.naturalWidth ?? img?.width ?? 1
    const logoH = img?.naturalHeight ?? img?.height ?? 1
    const logoAspect = logoW / logoH
    if (logoAspect >= 1) {
      logoScaleXY = [base, base / logoAspect, 1]
    } else {
      logoScaleXY = [base * logoAspect, base, 1]
    }

    return {
      center,
      size,
      front: {
        position: [center.x, center.y, bbox.max.z + EPS],
        rotation: [0, 0, 0],
        scale: scaleXY,
        normal: [0, 0, 1],
        polygonOffsetFactor: -1,
      },
      back: {
        position: [center.x, center.y, bbox.min.z - EPS],
        rotation: [0, Math.PI, 0],
        scale: scaleXY,
        normal: [0, 0, -1],
        polygonOffsetFactor: -2,
      },
      logoFront: {
        position: [center.x, center.y, bbox.max.z + EPS * 2],
        rotation: [0, 0, 0],
        scale: logoScaleXY,
        normal: [0, 0, 1],
      },
      logoBack: {
        position: [center.x, center.y, bbox.min.z - EPS * 2],
        rotation: [0, Math.PI, 0],
        scale: logoScaleXY,
        normal: [0, 0, -1],
      },
    }
  }, [cardMesh, logoTexture])

  // Calculate and expose cut position in screen coordinates
  useEffect(() => {
    if (!cut || !groupRef.current || !onCutPositionUpdate || !cardMesh) return

    const updateCutPosition = () => {
      if (!groupRef.current || !cut || !cardMesh) return

      // Get the bounding box center X and Z for the cut line
      const geo = cardMesh.geometry
      geo.computeBoundingBox()
      const bbox = geo.boundingBox
      if (!bbox) return

      const centerX = (bbox.min.x + bbox.max.x) / 2
      const centerZ = (bbox.min.z + bbox.max.z) / 2

      // Get the 3D position of the cut line (at center X, cutY, center Z)
      const worldPos = new THREE.Vector3(centerX, cut.cutY, centerZ)
      
      // Apply group transforms to get world position
      groupRef.current.localToWorld(worldPos)
      
      // Project to screen coordinates
      const screenPos = worldPos.project(camera)
      
      // Convert normalized device coordinates to pixel coordinates
      const x = (screenPos.x * 0.5 + 0.5) * size.width
      const y = (screenPos.y * -0.5 + 0.5) * size.height
      
      onCutPositionUpdate({ x, y })
    }

    // Update on mount and when transforms change
    const interval = setInterval(updateCutPosition, 100)
    updateCutPosition()

    return () => clearInterval(interval)
  }, [cut, camera, size, onCutPositionUpdate, groupRef, cardMesh])

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
          if (!groupRef.current) return // Guard against null ref
          
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

  // Reset tear state when isTearing becomes false
  useEffect(() => {
    if (!isTearing) {
      tearStartedRef.current = false
    }
  }, [isTearing])

  // Tear animation: top part shrinks while moving up-right, then falls; bottom part moves down
  useEffect(() => {
    if (!isTearing || tearStartedRef.current) return
    
    // Wait for the split meshes to be rendered
    const startAnimation = () => {
      if (!topGroupRef.current || !bottomMeshRef.current) {
        requestAnimationFrame(startAnimation)
        return
      }
      
      tearStartedRef.current = true
      
      // Reset top group position and scale
      topGroupRef.current.position.set(0, 0, 0)
      topGroupRef.current.scale.setScalar(1)

      const duration = 1000 // 1 second for tear animation
      const start = Date.now()

      // Starting positions
      const topStartY = topGroupRef.current.position.y
      const topStartX = topGroupRef.current.position.x
      const topStartZ = topGroupRef.current.position.z
      const topStartScale = 1

      const animate = () => {
        if (!topGroupRef.current) return // Guard against null ref
        
        const t = Math.min((Date.now() - start) / duration, 1)
        
        // Phase 1 (0-50%): Move up-right WHILE shrinking simultaneously
        // Phase 2 (50-100%): Fall down and disappear
        
        let topY, topX, topZ, topScale, topOpacity
        
        if (t < 0.5) {
          // Phase 1: Move up-right AND shrink at the same time
          const phase1 = t / 0.5
          const eased1 = 1 - Math.pow(1 - phase1, 2)
          topY = topStartY + eased1 * 0.3 // Move up
          topX = topStartX + eased1 * 0.2 // Move right
          topZ = topStartZ + eased1 * 0.1
          topScale = topStartScale * (1 - eased1 * 0.02) // Shrink to 98% while moving
          topOpacity = 1
        } else {
          // Phase 2: Fall down and disappear
          const phase2 = (t - 0.5) / 0.5
          const eased2 = 1 - Math.pow(1 - phase2, 3)
          const maxY = topStartY + 0.3
          const maxX = topStartX + 0.2
          const maxZ = topStartZ + 0.1
          topY = maxY - eased2 * 2.0 // Fall down
          topX = maxX + eased2 * 0.1 // Continue drifting right
          topZ = maxZ - eased2 * 0.2
          topScale = topStartScale * 0.98 // Keep shrunk size
          topOpacity = 1 - eased2 // Fade out as it falls
        }

        // Apply top part transforms
        if (topGroupRef.current) {
          topGroupRef.current.position.set(topX, topY, topZ)
          topGroupRef.current.scale.setScalar(topScale)
        }

        // Apply top part opacity
        const applyOpacity = (mat, opacity) => {
          if (!mat) return
          if (Array.isArray(mat)) mat.forEach((m) => (m.opacity = opacity))
          else mat.opacity = opacity
        }
        applyOpacity(materials.topMaterial, topOpacity)
        applyOpacity(decalMaterials.topFront, topOpacity)
        applyOpacity(decalMaterials.topBack, topOpacity)
        applyOpacity(logoDecalMaterials.topFront, topOpacity)
        applyOpacity(logoDecalMaterials.topBack, topOpacity)

        if (t < 1) requestAnimationFrame(animate)
      }

      requestAnimationFrame(animate)
    }
    
    // Start after a small delay to ensure DOM is ready
    requestAnimationFrame(() => {
      requestAnimationFrame(startAnimation)
    })
  }, [isTearing, materials.topMaterial, decalMaterials.topFront, decalMaterials.topBack, logoDecalMaterials.topFront, logoDecalMaterials.topBack])

  // Slide-out + fade: bottom part moves down and fades out (2 seconds)
  useEffect(() => {
    if (!groupRef.current || !isSliding) return
    if (!isTearing) return // Only slide if we've torn

    const duration = 2000 // 2 seconds
    const startTime = Date.now()
    const startY = groupRef.current.position.y

    const animate = () => {
      if (!groupRef.current) return // Guard against null ref
      
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)

      // Move bottom part down
      groupRef.current.position.y = startY - eased * 20

      // Fade out bottom part
      const opacity = 1 - eased
      const applyOpacity = (mat, op) => {
        if (!mat) return
        if (Array.isArray(mat)) mat.forEach((m) => (m.opacity = op))
        else mat.opacity = op
      }
      applyOpacity(materials.bottomMaterial, opacity)
      applyOpacity(decalMaterials.bottomFront, opacity)
      applyOpacity(decalMaterials.bottomBack, opacity)
      applyOpacity(logoDecalMaterials.bottomFront, opacity)
      applyOpacity(logoDecalMaterials.bottomBack, opacity)

      if (progress < 1) requestAnimationFrame(animate)
    }

    requestAnimationFrame(animate)
  }, [isSliding, isTearing, materials.bottomMaterial, decalMaterials.bottomFront, decalMaterials.bottomBack, logoDecalMaterials.bottomFront, logoDecalMaterials.bottomBack])

  if (!cardMesh) {
    console.warn('card.glb: no mesh found to apply Decal onto.')
    return null
  }
  if (!cardMesh.geometry?.attributes?.position) {
    console.warn('card.glb mesh has no position attribute; Decal cannot be generated.')
    return null
  }
  if (!decal) {
    console.warn('card.glb: could not compute decal placement from bounds.')
    return null
  }

  if (!cut || !materials.fullMaterial || !materials.bottomMaterial || !materials.topMaterial) {
    console.warn('card.glb: could not compute cut planes/materials.')
    return null
  }
  if (!decalMaterials.fullFront || !decalMaterials.fullBack) {
    console.warn('card.glb: could not create decal materials.')
    return null
  }

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={0}>
      {/* Before tear: render a full intact card */}
      {!isTearing && (
        <mesh
          ref={fullMeshRef}
          geometry={cardMesh.geometry}
          material={materials.fullMaterial}
          dispose={null}
        >
          <Decal
            position={decal.front.position}
            rotation={decal.front.rotation}
            scale={decal.front.scale}
            normal={decal.front.normal}
            map={cardTexture}
            material={decalMaterials.fullFront}
          />
          <Decal
            position={decal.back.position}
            rotation={decal.back.rotation}
            scale={decal.back.scale}
            normal={decal.back.normal}
            map={backCardTexture || cardTexture}
            material={decalMaterials.fullBack}
          />
          {decal.logoFront && logoDecalMaterials.fullFront && (
            <Decal
              position={decal.logoFront.position}
              rotation={decal.logoFront.rotation}
              scale={decal.logoFront.scale}
              normal={decal.logoFront.normal}
              map={logoTexture}
              material={logoDecalMaterials.fullFront}
            />
          )}
          {decal.logoBack && logoDecalMaterials.fullBack && (
            <Decal
              position={decal.logoBack.position}
              rotation={decal.logoBack.rotation}
              scale={decal.logoBack.scale}
              normal={decal.logoBack.normal}
              map={backLogoTexture || logoTexture}
              material={logoDecalMaterials.fullBack}
            />
          )}
        </mesh>
      )}

      {/* On tear: swap to bottom + top parts with a straight horizontal cut */}
      {isTearing && (
        <>
          {/* Bottom part (stays in place) */}
          <mesh
            ref={bottomMeshRef}
            geometry={cardMesh.geometry}
            material={materials.bottomMaterial}
            dispose={null}
          >
            <Decal
              position={decal.front.position}
              rotation={decal.front.rotation}
              scale={decal.front.scale}
              normal={decal.front.normal}
              map={cardTexture}
              material={decalMaterials.bottomFront}
            />
            <Decal
              position={decal.back.position}
              rotation={decal.back.rotation}
              scale={decal.back.scale}
              normal={decal.back.normal}
              map={backCardTexture || cardTexture}
              material={decalMaterials.bottomBack}
            />
            {decal.logoFront && logoDecalMaterials.bottomFront && (
              <Decal
                position={decal.logoFront.position}
                rotation={decal.logoFront.rotation}
                scale={decal.logoFront.scale}
                normal={decal.logoFront.normal}
                map={logoTexture}
                material={logoDecalMaterials.bottomFront}
              />
            )}
            {decal.logoBack && logoDecalMaterials.bottomBack && (
              <Decal
                position={decal.logoBack.position}
                rotation={decal.logoBack.rotation}
                scale={decal.logoBack.scale}
                normal={decal.logoBack.normal}
                map={backLogoTexture || logoTexture}
                material={logoDecalMaterials.bottomBack}
              />
            )}
          </mesh>

          <group ref={topGroupRef}>
            <mesh
              ref={topMeshRef}
              geometry={cardMesh.geometry}
              material={materials.topMaterial}
              dispose={null}
            >
              <Decal
                position={decal.front.position}
                rotation={decal.front.rotation}
                scale={decal.front.scale}
                normal={decal.front.normal}
                map={cardTexture}
                material={decalMaterials.topFront}
              />
              <Decal
                position={decal.back.position}
                rotation={decal.back.rotation}
                scale={decal.back.scale}
                normal={decal.back.normal}
                map={backCardTexture || cardTexture}
                material={decalMaterials.topBack}
              />
              {decal.logoFront && logoDecalMaterials.topFront && (
                <Decal
                  position={decal.logoFront.position}
                  rotation={decal.logoFront.rotation}
                  scale={decal.logoFront.scale}
                  normal={decal.logoFront.normal}
                  map={logoTexture}
                  material={logoDecalMaterials.topFront}
                />
              )}
              {decal.logoBack && logoDecalMaterials.topBack && (
                <Decal
                  position={decal.logoBack.position}
                  rotation={decal.logoBack.rotation}
                  scale={decal.logoBack.scale}
                  normal={decal.logoBack.normal}
                  map={backLogoTexture || logoTexture}
                  material={logoDecalMaterials.topBack}
                />
              )}
            </mesh>
          </group>
        </>
      )}
    </group>
  )
}
