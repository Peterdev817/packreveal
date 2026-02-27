import * as THREE from 'three'

/**
 * Partitions geometry faces by normal (front = +Z, back = -Z) and returns
 * geometry with groups + [frontMaterial, backMaterial] so the back shows the
 * same image correctly (mirrored in U so it doesn't look reversed).
 */
export function applyTextureFrontBack(geometry, texture) {
  const geo = geometry.clone()
  // Preserve morph targets (needed for tear animation on upper mesh)
  if (geometry.morphAttributes && Object.keys(geometry.morphAttributes).length > 0) {
    geo.morphAttributes = {}
    geo.morphTargetsRelative = geometry.morphTargetsRelative
    for (const key of Object.keys(geometry.morphAttributes)) {
      const arr = geometry.morphAttributes[key]
      geo.morphAttributes[key] = Array.isArray(arr) ? arr.map((a) => a.clone()) : arr.clone()
    }
  }
  if (geometry.morphTargetsRelative !== undefined) geo.morphTargetsRelative = geometry.morphTargetsRelative
  if (!geo.attributes.normal) geo.computeVertexNormals()

  const index = geo.index
  const pos = geo.attributes.position
  const normal = geo.attributes.normal
  if (!pos || !normal) return { geometry: geo, materials: null }

  const frontIndices = []
  const backIndices = []
  const vA = new THREE.Vector3()
  const vB = new THREE.Vector3()
  const vC = new THREE.Vector3()
  const normalVec = new THREE.Vector3()

  const triCount = index ? index.count / 3 : pos.count / 3
  for (let i = 0; i < triCount; i++) {
    const i0 = index ? index.getX(i * 3) : i * 3
    const i1 = index ? index.getX(i * 3 + 1) : i * 3 + 1
    const i2 = index ? index.getX(i * 3 + 2) : i * 3 + 2
    vA.fromBufferAttribute(normal, i0)
    vB.fromBufferAttribute(normal, i1)
    vC.fromBufferAttribute(normal, i2)
    normalVec.copy(vA).add(vB).add(vC).normalize()
    const isFront = normalVec.z > 0
    if (isFront) {
      frontIndices.push(i0, i1, i2)
    } else {
      backIndices.push(i0, i1, i2)
    }
  }

  // If one side has no faces, keep original geometry and single material (keeps upper mesh visible for tear)
  if (frontIndices.length === 0 || backIndices.length === 0) {
    return { geometry, materials: null }
  }

  const newIndex = new Uint32Array(frontIndices.length + backIndices.length)
  newIndex.set(frontIndices, 0)
  newIndex.set(backIndices, frontIndices.length)
  geo.setIndex(new THREE.BufferAttribute(newIndex, 1))
  geo.groups = [
    { start: 0, count: frontIndices.length, materialIndex: 0 },
    { start: frontIndices.length, count: backIndices.length, materialIndex: 1 },
  ]

  const texBack = texture.clone()
  texBack.colorSpace = texture.colorSpace
  texBack.offset.x = 1
  texBack.repeat.x = -1

  const matOpts = {
    color: 0xffffff,
    depthWrite: true,
    depthTest: true,
    toneMapped: false,
    fog: false,
    transparent: true,
  }
  const frontMat = new THREE.MeshBasicMaterial({
    ...matOpts,
    map: texture,
    side: THREE.FrontSide,
  })
  if (frontMat.map) frontMat.map.colorSpace = THREE.SRGBColorSpace
  const backMat = new THREE.MeshBasicMaterial({
    ...matOpts,
    map: texBack,
    side: THREE.BackSide,
  })
  if (backMat.map) backMat.map.colorSpace = THREE.SRGBColorSpace

  return { geometry: geo, materials: [frontMat, backMat] }
}
