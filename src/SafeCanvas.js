import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { CleanR3FChildren } from './r3fInstrumentationStrip'

/** Wrapper that sets gl color output and strips instrumentation from R3F children. */
export function SafeCanvas({ gl, camera, style, children, onCreated }) {
  const handleCreated = (state) => {
    if (state.gl) {
      if (state.gl.outputColorSpace !== undefined) state.gl.outputColorSpace = THREE.SRGBColorSpace
      if (state.gl.toneMapping !== undefined) state.gl.toneMapping = THREE.NoToneMapping
    }
    onCreated?.(state)
  }
  return (
    <Canvas gl={gl} camera={camera} style={style} onCreated={handleCreated}>
      <CleanR3FChildren>{children}</CleanR3FChildren>
    </Canvas>
  )
}
