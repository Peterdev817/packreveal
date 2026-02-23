import { useRef, useEffect, useState, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import './styles.css'
import { HomePage } from './HomePage'
import { Card3D } from './Card3D'
import { PrizeSunburst } from './PrizeSunburst'
import { GrailVaultsCard } from './GrailVaultsCard'

const CARD_APPEARANCE_START_BEFORE_END = 1.4
const CARD_APPEARANCE_DURATION = 1.4

// Map category + tier to pack image; use card.png as fallback for packs without a dedicated image
// Naming convention: pack-{category}-{tier}.webp (e.g. pack-football-bronze.webp)
const PACK_IMAGES = {
  'basketball-bronze': '/pack-basketball-bronze.webp',
  'football-bronze': '/pack-football-bronze.webp',
  'pokemon-bronze': '/pack-pokemon-bronze.webp',
  'variety-bronze': '/pack-variety-bronze.webp',
}

function getProductImageUrl(category, tier) {
  const key = `${category}-${tier}`
  return PACK_IMAGES[key] ?? '/card.png'
}

export const App = () => {
  const [showHomePage, setShowHomePage] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('baseball')
  const [selectedTier, setSelectedTier] = useState('bronze')
  const [selectedCardImageUrl, setSelectedCardImageUrl] = useState('/card.png')

  const productImageUrl = getProductImageUrl(selectedCategory, selectedTier)

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
  const [cardRotationComplete, setCardRotationComplete] = useState(false)
  const [cardImageVisible, setCardImageVisible] = useState(false)
  const [cardImageBlurRemoved, setCardImageBlurRemoved] = useState(false)
  const [hide3DCard, setHide3DCard] = useState(false)
  const [showSunburst, setShowSunburst] = useState(false)
  const [videoDuration, setVideoDuration] = useState(0)
  const [videoCurrentTime, setVideoCurrentTime] = useState(0)
  const [assetsReady, setAssetsReady] = useState(false)
  const topPartRef = useRef(null)
  const bottomPartRef = useRef(null)

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
        const loader = new GLTFLoader()
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


  // Callback when 3D card rotation completes
  const handleCardAppeared = () => {
    setCardRotationComplete(true)
    
    // Start fading out 3D card and fading in 2D card simultaneously for seamless transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Start both transitions at the same time
        // Card image starts visible with 5px blur, then blur is removed
        setCardImageVisible(true)
        setHide3DCard(true)
        
        // Remove blur after a tiny delay so it transitions from 5px to 0px smoothly
        requestAnimationFrame(() => {
          setCardImageBlurRemoved(true)
        })
      })
    })
  }

  // Appearing animation is now handled by Card3D component

  // Handle tear trigger (for 2D card image)
  const handleTear = () => {
    if (isTearing) return
    
    setIsTearing(true)
    const container = containerRef.current
    const topPart = topPartRef.current

    if (!container || !topPart) return

    // Start tearing animation for top part
    topPart.classList.add('tearing')
    
    // Change z-index to drop behind card at 50% of animation (500ms) when scaling starts
    setTimeout(() => {
      topPart.style.zIndex = '0'
    }, 500)

    // After 1 second from circle press, rotate the Pokemon image
    setTimeout(() => {
      setHasIntroSpinPlayed(true)
    }, 1500)

    // After tear animation finishes (1 second), slide the whole card down and fade in Pokédex
    setTimeout(() => {
      setIsSliding(true)
    }, 1000)
  }

  const handlePokedexClick = () => {
    setIsPokedexFlipped(prev => !prev)
  }

  const handlePokedexMouseMove = (event) => {
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
    setPokedexTilt({ rotX: 0, rotY: 0 })
  }

  // Set Poke image initial state (opacity 1, scale 0.6) when card image becomes visible
  useEffect(() => {
    if (!cardImageVisible || !pokedexRef.current || !pokedexInnerRef.current) return
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
  }, [cardImageVisible, isPokedexFlipped, pokedexTilt])

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
      
      const duration = 1500 // 1.5 seconds
      
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
  const cutLineY = cutPixelsFromTop
  const topHeight = cardHeight * 0.05 // 5% top part (20px out of 400px)
  const bottomHeight = cardHeight * 0.95 // 95% bottom part

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
              opacity: cardImageVisible ? 1 : 0, // Set to 1 when card image is visible
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

      {/* 3D Card Model - shown until rotation completes, fades out smoothly as 2D card fades in */}
      {showCard && (
        <div 
          className="outer-card"
          style={{ 
            zIndex: hide3DCard ? 1 : 2, // Move behind 2D card when fading out
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: hide3DCard ? 0 : 1,
            transition: hide3DCard ? 'opacity 0.4s ease-in-out' : 'none',
            pointerEvents: hide3DCard ? 'none' : 'auto',
            visibility: hide3DCard ? 'hidden' : 'visible',
          }}
        >
          <Canvas
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
                scale={1.5}
                position={[0, 0, 0]}
                rotation={[0, 0, 0]}
                cutPixelsFromTop={cutPixelsFromTop}
                cardHeightPx={cardHeight}
                isTearing={false}
                isSliding={false}
                onAppear={handleCardAppeared}
                onCutPositionUpdate={setCutScreenPosition}
                cardImageUrl={cardImageUrl}
              />
            </Suspense>
          </Canvas>
        </div>
      )}

      {/* 2D Card Image - always rendered when showCard is true, fades in smoothly when rotation completes */}
      {showCard && (
        <div 
          className={`outer-card ${isSliding ? 'slide-out' : ''}`} 
          style={{ 
            zIndex: hide3DCard ? 2 : 1, // Behind 3D card until it fades out, then on top
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            transformStyle: 'preserve-3d',
            perspective: '1400px',
            opacity: cardImageVisible ? 1 : 0,
            filter: cardImageVisible ? (cardImageBlurRemoved ? 'blur(0px)' : 'blur(5px)') : 'blur(0px)',
            transition: 'none',
            pointerEvents: cardImageVisible ? 'auto' : 'none',
          }}
        >
          <div 
            className="card-3d-wrapper"
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              transformStyle: 'preserve-3d',
              transform: 'scale(0.6)',
              transformOrigin: 'center center',
            }}
          >
            {/* Front face - entire card */}
            <div
              className="card-face card-face-front"
              style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
              }}
            >
              {/* Centered logo overlay */}
              <div className="card-logo-overlay" aria-hidden="true">
                <img src="/logo-wrapped.png" alt="" />
              </div>
              {/* Bottom part (95%) */}
              <div
                ref={bottomPartRef}
                className="card-part card-bottom"
                style={{
                  position: 'absolute',
                  top: `${cardHeight - bottomHeight}px`,
                  left: 0,
                  width: `${cardWidth}px`,
                  height: `${bottomHeight}px`,
                  backgroundImage: `url(${cardImageUrl})`,
                  backgroundSize: `${cardWidth}px ${cardHeight}px`,
                  backgroundPosition: `0 ${-topHeight}px`,
                }}
              />
              
              {/* Top part (5%) - positioned above bottom part with tear effect */}
              <div
                ref={topPartRef}
                className="card-part-wrapper"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: `${cardWidth}px`,
                  height: `${topHeight}px`,
                  perspective: '1000px',
                }}
              >
                <div className="card-part-inner">
                  {/* Front side (original image) */}
                  <div
                    className="card-part card-top card-front"
                    style={{
                      width: `${cardWidth}px`,
                      height: `${topHeight}px`,
                      backgroundImage: `url(${cardImageUrl})`,
                      backgroundSize: `${cardWidth}px ${cardHeight}px`,
                      backgroundPosition: '0 0',
                    }}
                  />
                  {/* Back side (metallic foil) */}
                  <div
                    className="card-part card-top card-back"
                    style={{
                      width: `${cardWidth}px`,
                      height: `${topHeight}px`,
                    }}
                  />
                </div>
              </div>

              {/* Sparkling circle on logo (center of card) - only show after rotation completes */}
              {cardRotationComplete && !isTearing && (
                <div
                  className="tear-trigger"
                  onClick={handleTear}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    cursor: 'pointer',
                    zIndex: 10,
                  }}
                >
                  <div className="sparkle-circle"></div>
                </div>
              )}
            </div>

            {/* Back face - same card image */}
            <div
              className="card-face card-face-back"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${cardWidth}px`,
                height: `${cardHeight}px`,
                backgroundImage: `url(${cardImageUrl})`,
                backgroundSize: `${cardWidth}px ${cardHeight}px`,
                backgroundPosition: 'center center',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                borderRadius: '12px',
                transform: 'rotateY(180deg)',
              }}
            >
              <div className="card-logo-overlay" aria-hidden="true">
                <img src="/logo-wrapped.png" alt="" />
              </div>
            </div>
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
