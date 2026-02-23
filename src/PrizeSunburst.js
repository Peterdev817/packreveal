import { useRef, useEffect, useCallback } from 'react'

const RAY_VS = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const RAY_FS = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uFade;
uniform float uRadiusScale;

const float PI = 3.14159265359;
const vec3 GOLD = vec3(1.0, 0.88, 0.35);
const vec3 GOLD_HOT = vec3(1.0, 0.96, 0.65);
const vec3 AMBER = vec3(1.0, 0.75, 0.2);

float rayLayer(float angle, float nRays, float speed, float sharp) {
  float rayAngle = 2.0 * PI / nRays;
  float ray = fract(angle / rayAngle + uTime * speed);
  float peak = exp(-ray * ray * sharp) + exp(-(1.0 - ray) * (1.0 - ray) * sharp);
  return peak;
}

void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float angle = atan(p.y, p.x);

  float rays = 0.0;
  rays += 0.55 * rayLayer(angle, 24.0, 0.54, 90.0);
  rays += 0.65 * rayLayer(angle, 36.0, -0.38, 70.0);
  rays += 0.45 * rayLayer(angle, 48.0, 0.47, 110.0);
  rays += 0.4 * rayLayer(angle, 16.0, -0.24, 55.0);

  float rScaled = r / max(uRadiusScale, 0.5);
  float falloff = 1.0 - smoothstep(0.12, 1.15, rScaled);
  falloff *= 1.0 + 0.25 * sin(uTime * 2.2);
  float centerGlow = exp(-r * r * 2.2) * (0.5 + 0.2 * sin(uTime * 1.8));

  float intensity = (rays * falloff + centerGlow) * uFade;
  vec3 color = mix(GOLD, GOLD_HOT, rays) + AMBER * centerGlow * 0.6;
  gl_FragColor = vec4(color, intensity * 0.94);
}
`

const PARTICLE_VS = `
attribute vec2 aPosition;
attribute float aSize;
attribute float aAlpha;
varying float vAlpha;
void main() {
  vAlpha = aAlpha;
  gl_Position = vec4(aPosition, 0.0, 1.0);
  gl_PointSize = aSize;
}
`

const PARTICLE_FS = `
precision highp float;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float circle = 1.0 - smoothstep(0.0, 0.5, d);
  gl_FragColor = vec4(1.0, 0.92, 0.55, vAlpha * circle);
}
`

const PARTICLE_COUNT = 520
const EMIT_RATE = 1.0
const PARTICLE_LIFETIME = 2.5
const SPIRAL_STRENGTH = 2.2
const SPREAD_SPEED_PC = 0.68
const SPREAD_SPEED_SP = 0.98

function createProgram(gl, vsSource, fsSource) {
  const vs = gl.createShader(gl.VERTEX_SHADER)
  gl.shaderSource(vs, vsSource)
  gl.compileShader(vs)
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(vs))
    gl.deleteShader(vs)
    return null
  }
  const fs = gl.createShader(gl.FRAGMENT_SHADER)
  gl.shaderSource(fs, fsSource)
  gl.compileShader(fs)
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(fs))
    gl.deleteShader(fs)
    gl.deleteShader(vs)
    return null
  }
  const program = gl.createProgram()
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }
  return program
}

function createQuadBuffer(gl) {
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
  return buffer
}

export function PrizeSunburst() {
  const canvasRef = useRef(null)
  const glRef = useRef(null)
  const rayProgramRef = useRef(null)
  const particleProgramRef = useRef(null)
  const particlesRef = useRef([])
  const startTimeRef = useRef(null)
  const toEmitRef = useRef(0)

  const initParticles = useCallback(() => {
    const particles = []
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: 0, y: 0,
        vx: 0, vy: 0,
        life: 0,
        maxLife: PARTICLE_LIFETIME * (0.6 + Math.random() * 0.8),
        size: 3 + Math.random() * 8,
        angle: Math.random() * Math.PI * 2,
        spiral: (Math.random() - 0.5) * 2,
      })
    }
    particlesRef.current = particles
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false })
      || canvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: false })
    if (!gl) return
    glRef.current = gl

    const rayProgram = createProgram(gl, RAY_VS, RAY_FS)
    const particleProgram = createProgram(gl, PARTICLE_VS, PARTICLE_FS)
    if (!rayProgram || !particleProgram) return
    rayProgramRef.current = rayProgram
    particleProgramRef.current = particleProgram

    const quadBuffer = createQuadBuffer(gl)

    const positionLoc = gl.getAttribLocation(rayProgram, 'position')
    const uTimeLoc = gl.getUniformLocation(rayProgram, 'uTime')
    const uFadeLoc = gl.getUniformLocation(rayProgram, 'uFade')
    const uRadiusScaleLoc = gl.getUniformLocation(rayProgram, 'uRadiusScale')

    const aPositionLoc = gl.getAttribLocation(particleProgram, 'aPosition')
    const aSizeLoc = gl.getAttribLocation(particleProgram, 'aSize')
    const aAlphaLoc = gl.getAttribLocation(particleProgram, 'aAlpha')

    initParticles()

    const particleBuffer = gl.createBuffer()
    const particleStride = 4
    const particleData = new Float32Array(PARTICLE_COUNT * particleStride)

    let rafId
    const SP_BREAKPOINT = 600
    const getRadiusScale = () => (window.innerWidth <= SP_BREAKPOINT ? 1.38 : 1.0)
    const getSpreadSpeed = () => (window.innerWidth <= SP_BREAKPOINT ? SPREAD_SPEED_SP : SPREAD_SPEED_PC)

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    window.addEventListener('resize', resize)

    const emitParticle = () => {
      const particles = particlesRef.current
      for (let i = 0; i < particles.length; i++) {
        if (particles[i].life > 0) continue
        const angle = Math.random() * Math.PI * 2
            const speed = 0.08 + Math.random() * 0.12
            particles[i].x = 0
            particles[i].y = 0
            particles[i].vx = Math.cos(angle) * speed
            particles[i].vy = Math.sin(angle) * speed
            particles[i].life = particles[i].maxLife
            particles[i].angle = angle
            particles[i].spiral = (Math.random() - 0.5) * 2
            break
          }
    }

    const tick = (time) => {
      if (!startTimeRef.current) {
        startTimeRef.current = time
        for (let b = 0; b < 80; b++) emitParticle()
      }
      const elapsed = (time - startTimeRef.current) / 1000

      toEmitRef.current += PARTICLE_COUNT / (PARTICLE_LIFETIME / EMIT_RATE) / 60
      while (toEmitRef.current >= 1) {
        emitParticle()
        toEmitRef.current -= 1
      }

      const particles = particlesRef.current
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        if (p.life <= 0) continue
        p.life -= 1/60
        const t = 1 - p.life / p.maxLife
        const spiral = 1 + t * SPIRAL_STRENGTH
        const a = p.angle + t * p.spiral * Math.PI * 2
        const r = t * getSpreadSpeed()
        p.x = Math.cos(a) * r
        p.y = Math.sin(a) * r
      }

      const fadeIn = Math.min(1, elapsed / 0.5)
      const fade = fadeIn * (0.92 + 0.08 * Math.sin(elapsed * 1.2))

      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)

      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

      gl.useProgram(rayProgram)
      gl.uniform1f(uTimeLoc, elapsed)
      gl.uniform1f(uFadeLoc, fade)
      gl.uniform1f(uRadiusScaleLoc, getRadiusScale())
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
      gl.enableVertexAttribArray(positionLoc)
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)
      gl.drawArrays(gl.TRIANGLES, 0, 6)

      let n = 0
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        if (p.life <= 0) continue
        const alpha = (p.life / p.maxLife) * (1 - 0.3 * (1 - p.life / p.maxLife))
        particleData[n * 4 + 0] = p.x
        particleData[n * 4 + 1] = p.y
        particleData[n * 4 + 2] = p.size
        particleData[n * 4 + 3] = alpha
        n++
      }

      if (n > 0) {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
        gl.useProgram(particleProgram)
        gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, particleData.subarray(0, n * 4), gl.DYNAMIC_DRAW)
        gl.enableVertexAttribArray(aPositionLoc)
        gl.vertexAttribPointer(aPositionLoc, 2, gl.FLOAT, false, particleStride * 4, 0)
        gl.enableVertexAttribArray(aSizeLoc)
        gl.vertexAttribPointer(aSizeLoc, 1, gl.FLOAT, false, particleStride * 4, 8)
        gl.enableVertexAttribArray(aAlphaLoc)
        gl.vertexAttribPointer(aAlphaLoc, 1, gl.FLOAT, false, particleStride * 4, 12)
        gl.drawArrays(gl.POINTS, 0, n)
      }

      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(rafId)
      gl.deleteProgram(rayProgram)
      gl.deleteProgram(particleProgram)
      gl.deleteBuffer(quadBuffer)
      gl.deleteBuffer(particleBuffer)
    }
  }, [initParticles])

  return (
    <canvas
      ref={canvasRef}
      className="prize-sunburst-canvas"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
      aria-hidden
    />
  )
}
