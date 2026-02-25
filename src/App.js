import { useRef, useEffect, useState, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import * as THREE from 'three'
import { createGLTFLoader } from './gltfLoaderWithDraco'
import './styles.css'
import { HomePage } from './HomePage'
import { CATEGORIES, TIERS } from './HomePage'
import { Card3D } from './Card3D'
import { composeCardImage } from './composeCardImage'
import { PrizeSunburst } from './PrizeSunburst'
import { GrailVaultsCard } from './GrailVaultsCard'
import { CleanR3FChildren } from './r3fInstrumentationStrip'

// Wrapper that passes only known props to Canvas and strips instrumentation from children.
function SafeCanvas({ gl, camera, style, children, onCreated }) {
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

const CARD_APPEARANCE_START_BEFORE_END = 1.4
const CARD_APPEARANCE_DURATION = 1.4

const CARD_BASE = '/card.png'

export const App = () => {
  const [showHomePage, setShowHomePage] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('baseball')
  const [selectedTier, setSelectedTier] = useState('bronze')
  const [composedCardUrl, setComposedCardUrl] = useState(null)
  const [selectedCardImageUrl, setSelectedCardImageUrl] = useState(CARD_BASE)

  const categoryLabel = CATEGORIES.find((c) => c.id === selectedCategory)?.label ?? selectedCategory
  const tierLabel = TIERS.find((t) => t.id === selectedTier)?.label ?? selectedTier

  useEffect(() => {
    let cancelled = false
    composeCardImage(CARD_BASE, categoryLabel, tierLabel, selectedTier).then((url) => {
      if (!cancelled) setComposedCardUrl(url)
    }).catch(() => {
      if (!cancelled) setComposedCardUrl(CARD_BASE)
    })
    return () => { cancelled = true }
  }, [selectedCategory, selectedTier])

  const productImageUrl = composedCardUrl || CARD_BASE

  const handleBuyNow = () => {
    setSelectedCardImageUrl(productImageUrl)
    setShowHomePage(false)
  }

  const handleAddToCart = () => {
    // Placeholder
  }

  return (
    <div className="animation-container">
      {showHomePage ? (
        <HomePage
          selectedCategory={selectedCategory}
          selectedTier={selectedTier}
          onCategoryChange={setSelectedCategory}
          onTierChange={setSelectedTier}
          productImageUrl={productImageUrl}
          onBuyNow={handleBuyNow}
          onAddToCart={handleAddToCart}
        />
      ) : (
        <CardAnimation cardImageUrl={selectedCardImageUrl} />
      )}
    </div>
  )
}

function CardAnimation({ cardImageUrl = '/card.png' }) {
  const containerRef = useRef(null)
  const pokedexRef = useRef(null)
  const videoRef = useRef(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [isTearing, setIsTearing] = useState(false)
  const [isSliding, setIsSliding] = useState(false)
  const [showPokedex, setShowPokedex] = useState(true) // Always render, but control opacity
  const [isPokedexFlipped, setIsPokedexFlipped] = useState(false)
  const [pokedexTilt, setPokedexTilt] = useState({ rotX: 0, rotY: 0 })
  const [hasIntroSpinPlayed, setHasIntroSpinPlayed] = useState(false)
  const [showCard, setShowCard] = useState(false)
  const [videoStarted, setVideoStarted] = useState(false)
  const [cutScreenPosition, setCutScreenPosition] = useState({ x: 0, y: 0 })
  const pokedexAppearStartedRef = useRef(false)
  const pokedexInnerRef = useRef(null)
  const pokedexInitializedRef = useRef(false)
  const pokedexAnimationCompleteRef = useRef(false)
  const pokedexClickAnimatingRef = useRef(false)
  const [cardRotationComplete, setCardRotationComplete] = useState(false)
  const [showSunburst, setShowSunburst] = useState(false)
  const [videoDuration, setVideoDuration] = useState(0)
  const [videoCurrentTime, setVideoCurrentTime] = useState(0)
  const [assetsReady, setAssetsReady] = useState(false)
  const [cardSlideComplete, setCardSlideComplete] = useState(false)

  // 1.5s after clicking the circle (tear starts), hide .outer-card so Pokédex can receive click/hover
  const OUTER_CARD_HIDE_DELAY_MS = 3000
  useEffect(() => {
    if (!isTearing) return
    const t = setTimeout(() => setCardSlideComplete(true), OUTER_CARD_HIDE_DELAY_MS)
    return () => clearTimeout(t)
  }, [isTearing])

  // Preload critical assets (card image + model); optional images must not block start on live server (404-safe)
  useEffect(() => {
    let cancelled = false
    const loadImage = (src) =>
      new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = src
      })
    const loadImageOptional = (src) =>
      loadImage(src).catch(() => null)
    const loadGlb = (src) =>
      new Promise((resolve, reject) => {
        const loader = createGLTFLoader()
        loader.load(src, (gltf) => resolve(gltf), undefined, reject)
      })
    const critical = [
      loadImage(cardImageUrl),
      loadGlb('/card.glb'),
    ]
    Promise.all(critical)
      .then(([cardImg]) => {
        if (cancelled) return
        if (cardImg) {
          setImageSize({ width: cardImg.naturalWidth, height: cardImg.naturalHeight })
          setImageLoaded(true)
        }
        setAssetsReady(true)
      })
      .catch((err) => {
        if (!cancelled) console.error('Asset preload failed (critical):', err)
      })
    // Optional: preload in background so they’re cached if present (won’t block or fail app)
    const optional = ['/logo-wrapped.png', '/grail-vaults.png', '/poke1.webp', '/poke2.webp']
    optional.forEach((src) => loadImageOptional(src).catch(() => {}))
    return () => {
      cancelled = true
    }
  }, [cardImageUrl])

  // Grail card: visible in last CARD_APPEARANCE_DURATION seconds of video, descent progress 0→1
  const grailCardVisible =
    videoDuration > 0 &&
    videoCurrentTime >= videoDuration - CARD_APPEARANCE_START_BEFORE_END
  const grailCardProgress = !grailCardVisible
    ? 0
    : Math.min(
        1,
        (videoCurrentTime -
          (videoDuration - CARD_APPEARANCE_START_BEFORE_END)) /
          CARD_APPEARANCE_DURATION
      )

  // Handle video time update - most reliable way to detect playback
  const handleVideoTimeUpdate = () => {
    const video = videoRef.current
    if (!video) return
    setVideoCurrentTime(video.currentTime)

    // If video is playing and we haven't started the timer yet
    if (video.currentTime > 0 && !videoStarted) {
      setVideoStarted(true)
      // Show card 1 second after video starts playing
      setTimeout(() => {
        setShowCard(true)
      }, 1000)
    }
  }

  const handleVideoLoadedMetadata = () => {
    const video = videoRef.current
    if (video && Number.isFinite(video.duration)) setVideoDuration(video.duration)
  }

  // Start video playback only after all assets have finished loading
  useEffect(() => {
    if (!assetsReady) return
    const video = videoRef.current
    if (!video) return

    video.muted = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    video.playbackRate = 1.2

    const playVideo = () => {
      video.play().catch((error) => {
        console.warn('Video autoplay failed:', error)
        const handleUserInteraction = () => {
          video.play().then(() => {
            document.removeEventListener('click', handleUserInteraction, true)
            document.removeEventListener('touchstart', handleUserInteraction, true)
            document.removeEventListener('mousedown', handleUserInteraction, true)
            window.removeEventListener('focus', handleUserInteraction)
          }).catch(() => {})
        }
        document.addEventListener('click', handleUserInteraction, true)
        document.addEventListener('touchstart', handleUserInteraction, true)
        document.addEventListener('mousedown', handleUserInteraction, true)
        window.addEventListener('focus', handleUserInteraction)
      })
    }

    if (video.readyState >= 2) {
      playVideo()
    } else {
      video.addEventListener('canplay', playVideo, { once: true })
      video.addEventListener('loadeddata', playVideo, { once: true })
    }

    const fallbackTimer = setTimeout(() => {
      if (!videoStarted && video.currentTime > 0) {
        setVideoStarted(true)
        setTimeout(() => setShowCard(true), 1000)
      }
    }, 1000)

    if (Number.isFinite(video.duration)) setVideoDuration(video.duration)
    const onMeta = () => {
      if (Number.isFinite(video.duration)) setVideoDuration(video.duration)
    }
    video.addEventListener('loadedmetadata', onMeta)

    return () => {
      clearTimeout(fallbackTimer)
      video.removeEventListener('loadedmetadata', onMeta)
    }
  }, [assetsReady, videoStarted])

  // Smooth Grail card progress when in the end window (sync with video time)
  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoDuration) return
    let rafId
    const tick = () => {
      const t = video.currentTime
      const inCardWindow =
        t >= videoDuration - CARD_APPEARANCE_START_BEFORE_END
      if (inCardWindow) setVideoCurrentTime(t)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [videoDuration])


  // Callback when 3D card rotation completes — show circle to trigger 3D tear (no 2D card)
  const handleCardAppeared = () => {
    setCardRotationComplete(true)
  }

  // Handle tear trigger: start 3D card tear animation (Blender/model animation in Card3D)
  const handleTear = () => {
    if (isTearing) return
    setIsTearing(true)

    // After 1.5s from circle press, rotate the Pokemon image
    setTimeout(() => {
      setHasIntroSpinPlayed(true)
    }, 1500)

    // After 3D tear animation (1s), slide the card down and reveal Pokédex
    setTimeout(() => {
      setIsSliding(true)
    }, 1000)
  }

  const POKEDEX_FLIP_DURATION_MS = 500
  const handlePokedexClick = () => {
    pokedexClickAnimatingRef.current = true
    setIsPokedexFlipped(prev => !prev)
    setTimeout(() => {
      pokedexClickAnimatingRef.current = false
    }, POKEDEX_FLIP_DURATION_MS)
  }

  const handlePokedexMouseMove = (event) => {
    if (pokedexClickAnimatingRef.current) return
    const node = pokedexRef.current
    if (!node) return

    const rect = node.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - 0.5 // -0.5 (left) to 0.5 (right)
    const y = (event.clientY - rect.top) / rect.height - 0.5 // -0.5 (top) to 0.5 (bottom)

    const MAX_ROT_X = 24 // deg – stronger tilt toward top / bottom
    const MAX_ROT_Y = 24 // deg – stronger tilt toward left / right

    // Top edge toward viewer when mouse near top: positive rotateX
    const rotX = -y * MAX_ROT_X
    // Left edge toward viewer when mouse near left: negative rotateY
    const rotY = x * MAX_ROT_Y

    setPokedexTilt({ rotX, rotY })
  }

  const handlePokedexMouseLeave = () => {
    if (pokedexClickAnimatingRef.current) return
    setPokedexTilt({ rotX: 0, rotY: 0 })
  }

  // Set Poke image initial state (opacity 1, scale 0.6) when rotation complete and circle is shown
  useEffect(() => {
    if (!cardRotationComplete || !pokedexRef.current || !pokedexInnerRef.current) return
    if (pokedexInitializedRef.current) return // Only run once
    
    pokedexInitializedRef.current = true
    const pokedexElement = pokedexRef.current
    const pokedexInnerElement = pokedexInnerRef.current
    
    // Set initial state: opacity 1, scale 0.6
    pokedexElement.style.opacity = '1'
    pokedexElement.style.transform = 'scale(0.6)'
    pokedexElement.style.transformOrigin = 'center center'
    pokedexElement.style.transition = 'none'
    
    // Set initial rotation state on inner element
    const pokedexBaseRotationY = isPokedexFlipped ? 180 : 0
    const initialTransform = `rotateY(${pokedexBaseRotationY + pokedexTilt.rotY}deg) rotateX(${pokedexTilt.rotX}deg)`
    pokedexInnerElement.style.transform = initialTransform
    pokedexInnerElement.style.transition = 'none'
  }, [cardRotationComplete, isPokedexFlipped, pokedexTilt])

  // Pokédex animation: rotate and enlarge 3 seconds after tear effect begins
  useEffect(() => {
    if (!isTearing || pokedexAppearStartedRef.current) return
    if (!pokedexRef.current || !pokedexInnerRef.current) return
    
    pokedexAppearStartedRef.current = true
    
    // Wait 1.5 seconds after tear begins
    const tearDelay = 1500
    const animationTimeout = setTimeout(() => {
      const pokedexElement = pokedexRef.current
      const pokedexInnerElement = pokedexInnerRef.current
      if (!pokedexElement || !pokedexInnerElement) return
      
      const duration = 1000 // 1 second
      
      // Calculate initial rotation (current pokedexTransform without the 360°)
      const pokedexBaseRotationY = isPokedexFlipped ? 180 : 0
      const initialRotY = pokedexBaseRotationY + pokedexTilt.rotY
      const initialTransform = `rotateY(${initialRotY}deg) rotateX(${pokedexTilt.rotX}deg)`
      
      // Ensure initial state is set (scale 0.6 to match initial state)
      pokedexElement.style.opacity = '1'
      pokedexElement.style.transform = 'scale(0.6)'
      pokedexElement.style.transformOrigin = 'center center'
      pokedexElement.style.transition = 'none'
      pokedexInnerElement.style.transform = initialTransform
      pokedexInnerElement.style.transition = 'none'
      
      // Small delay to ensure initial state is applied
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Start animation: scale 0.6 to 1 on outer element
          pokedexElement.style.transition = `transform ${duration}ms ease-out`
          pokedexElement.style.transform = 'scale(1)'
          
          // Rotate 360° on inner element (add 360 to current Y rotation)
          const finalRotY = initialRotY + 360
          const finalTransform = `rotateY(${finalRotY}deg) rotateX(${pokedexTilt.rotX}deg)`
          pokedexInnerElement.style.transition = `transform ${duration}ms ease-out`
          pokedexInnerElement.style.transform = finalTransform
          
          // After animation completes, clear transitions, ensure scale stays at 1, then play sunburst behind PokéCard
          setTimeout(() => {
            if (pokedexElement && pokedexInnerElement) {
              // Clear inline transitions to use CSS transitions for interactions
              pokedexElement.style.transition = ''
              pokedexInnerElement.style.transition = ''
              // Ensure scale stays at 1 after animation
              pokedexElement.style.transform = 'scale(1)'
              // Mark animation as complete so we can update transform based on tilt without resetting rotation
              pokedexAnimationCompleteRef.current = true
              // Immediately play sunburst animation behind the PokéCard
              setShowSunburst(true)
            }
          }, duration)
        })
      })
    }, tearDelay)
    
    return () => {
      clearTimeout(animationTimeout)
    }
  }, [isTearing, isPokedexFlipped, pokedexTilt])
  
  // Reset animation state when tear is not active (only if animation hasn't completed)
  useEffect(() => {
    if (!isTearing && pokedexRef.current && pokedexInnerRef.current && !pokedexAppearStartedRef.current) {
      pokedexRef.current.style.opacity = '1'
      pokedexRef.current.style.transform = 'scale(0.6)'
      pokedexRef.current.style.transition = 'none'
      // Calculate transform inline to avoid dependency on pokedexTransform
      const baseRotY = isPokedexFlipped ? 180 : 0
      const transform = `rotateY(${baseRotY + pokedexTilt.rotY}deg) rotateX(${pokedexTilt.rotX}deg)`
      pokedexInnerRef.current.style.transform = transform
      pokedexInnerRef.current.style.transition = '' // Clear to use CSS transition
    }
  }, [isTearing, isPokedexFlipped, pokedexTilt])


  const aspectRatio =
    imageSize.width > 0 && imageSize.height > 0
      ? imageSize.width / imageSize.height
      : 1
  const cardHeight = 400 // Base height in pixels
  const cardWidth = cardHeight * aspectRatio
  // Tear cut line: 20px down from the top
  const cutPixelsFromTop = 20

  // Make the Pokédex slightly smaller than the original card (about 20px narrower)
  const pokedexWidth = cardWidth - 20
  const pokedexScale = pokedexWidth / cardWidth
  const pokedexHeight = cardHeight * pokedexScale

  const pokedexBaseRotationY = isPokedexFlipped ? 180 : 0
  // After animation completes, add 360° to the base rotation to maintain the final state
  const baseRotY = pokedexAnimationCompleteRef.current 
    ? pokedexBaseRotationY + 360 + pokedexTilt.rotY
    : pokedexBaseRotationY + pokedexTilt.rotY
  const pokedexTransform = `rotateY(${baseRotY}deg) rotateX(${pokedexTilt.rotX}deg)`

  return (
    <>
      {/* Fullscreen video */}
      <video
        ref={videoRef}
        className="intro-video"
        src="/video.mp4"
        muted
        playsInline
        preload="auto"
        loop={false}
        onTimeUpdate={handleVideoTimeUpdate}
        onLoadedMetadata={handleVideoLoadedMetadata}
        onPlay={() => {
          const video = videoRef.current
          if (video) video.playbackRate = 1.2
          if (!videoStarted) {
            setVideoStarted(true)
            setTimeout(() => setShowCard(true), 1000)
          }
        }}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          objectFit: 'cover',
          zIndex: showCard ? 0 : 10,
        }}
      />

      {/* Grail Vaults card - mounted from the start so image is in DOM; visibility controlled by props */}
      <div
        className="grail-card-fixed-layer"
        style={{ pointerEvents: 'none', zIndex: 18 }}
        aria-hidden="true"
      >
        <GrailVaultsCard
          visible={grailCardVisible}
          descentProgress={grailCardProgress}
          appearanceDuration={CARD_APPEARANCE_DURATION}
        />
      </div>

      {imageLoaded && (
        <>

      {/* Sunburst - plays behind PokéCard immediately after 360° rotation completes */}
      {showSunburst && (
        <div
          className="sunburst-wrapper"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 15,
            pointerEvents: 'none',
          }}
        >
          <PrizeSunburst />
        </div>
      )}

      {/* Card container - appears 2 seconds after video starts */}
      {showCard && (
        <div ref={containerRef} className="card-container" style={{ width: `${cardWidth}px`, height: `${cardHeight}px`, zIndex: 20 }}>
      {/* Inner Pokédex (poke1 / poke2) - inside the card, animates in as card slides away */}
      <div
        className={`pokedex-wrapper ${isSliding ? 'fade-in' : ''}`}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${cardWidth}px`,
          height: `${cardHeight}px`,
          zIndex: 1, // Behind the card initially
          opacity: 1, // Wrapper always visible, opacity controlled by pokedex-3d element
        }}
      >
          <div
            className={`pokedex-3d ${isPokedexFlipped ? 'flipped' : ''}`}
            onClick={handlePokedexClick}
            onMouseMove={handlePokedexMouseMove}
            onMouseLeave={handlePokedexMouseLeave}
            ref={pokedexRef}
            style={{
              width: `${pokedexWidth}px`,
              height: `${pokedexHeight}px`,
              opacity: cardRotationComplete ? 1 : 0, // Visible when circle is shown (rotation complete)
            }}
          >
            <div
              className="pokedex-inner"
              ref={pokedexInnerRef}
              style={{
                transform: pokedexTransform,
              }}
            >
              <div
                className="pokedex-face pokedex-front"
                style={{
                  backgroundImage: 'url(/poke1.webp)',
                  backgroundSize: `${pokedexWidth}px ${pokedexHeight}px`,
                  backgroundPosition: 'center center',
                }}
              />
              <div
                className="pokedex-face pokedex-back"
                style={{
                  backgroundImage: 'url(/poke2.webp)',
                  backgroundSize: `${pokedexWidth}px ${pokedexHeight}px`,
                  backgroundPosition: 'center center',
                }}
              />
            </div>
          </div>
        </div>

      {/* 3D Card Model - stays visible; tear is done by 3D model. Hidden (display: none) after slide so Pokédex gets click/hover. */}
      {showCard && (
        <div 
          className="outer-card"
          style={{ 
            zIndex: 2,
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            display: cardSlideComplete ? 'none' : undefined,
          }}
        >
          <SafeCanvas
            gl={{ localClippingEnabled: true }}
            camera={{
              position: [0, 0, 5],
              fov: 50,
              near: 0.1,
              far: 100,
            }}
            style={{ width: '100%', height: '100%', background: 'transparent' }}
          >
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} />
            <directionalLight position={[-10, 10, 5]} intensity={0.5} />
            <Environment preset="sunset" />
            
            <Suspense fallback={null}>
              <Card3D
                scale={1.8}
                position={[0, 0, 0]}
                rotation={[0, 0, 0]}
                cutPixelsFromTop={cutPixelsFromTop}
                cardHeightPx={cardHeight}
                isTearing={isTearing}
                isSliding={isSliding}
                onAppear={handleCardAppeared}
                onCutPositionUpdate={setCutScreenPosition}
                cardImageUrl={cardImageUrl}
              />
            </Suspense>
          </SafeCanvas>
        </div>
      )}

      {/* Clickable circle overlay on 3D card - triggers 3D tear when rotation complete */}
      {showCard && cardRotationComplete && !isTearing && (
        <div
          className="tear-trigger-overlay"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto',
          }}
        >
          <div
            className="tear-trigger"
            onClick={handleTear}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              cursor: 'pointer',
            }}
          >
            <div className="sparkle-circle"></div>
          </div>
        </div>
      )}
      </div>
      )}
        </>
      )}
    </>
  )
}
