import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'

let sharedDracoLoader = null

function getDracoLoader() {
  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader()
    // Use CDN so Draco-compressed GLB works without copying decoder files to public
    sharedDracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
  }
  return sharedDracoLoader
}

/**
 * Returns a new GLTFLoader with DRACOLoader set (for Draco-compressed GLB).
 * Use for both preload and R3F useLoader.
 */
export function createGLTFLoader() {
  const loader = new GLTFLoader()
  loader.setDRACOLoader(getDracoLoader())
  return loader
}

/**
 * GLTFLoader subclass that automatically sets DRACOLoader in the constructor.
 * Use with R3F useLoader: useLoader(GLTFLoaderWithDraco, '/card.glb')
 */
export class GLTFLoaderWithDraco extends GLTFLoader {
  constructor() {
    super()
    this.setDRACOLoader(getDracoLoader())
  }
}
