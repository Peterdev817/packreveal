import { Suspense, useRef, useState } from 'react'
import { SafeCanvas } from './SafeCanvas'
import { Card3DPreview } from './Card3DPreview'
import './styles.css'

export const CATEGORIES = [
  { id: 'baseball', label: 'Baseball', icon: '⚾' },
  { id: 'football', label: 'Football', icon: '🏈' },
  { id: 'basketball', label: 'Basketball', icon: '🏀' },
  { id: 'pokemon', label: 'Pokemon', icon: '🔴' },
  { id: 'variety', label: 'Variety', icon: '🎁' },
]

export const TIERS = [
  { id: 'bronze', label: 'Bronze', price: 25 },
  { id: 'silver', label: 'Silver', price: 50 },
  { id: 'gold', label: 'Gold', price: 100 },
  { id: 'emerald', label: 'Emerald', price: 200 },
  { id: 'platinum', label: 'Platinum', price: 500 },
  { id: 'diamond', label: 'Diamond', price: 1000 },
]

export function HomePage({
  selectedCategory,
  selectedTier,
  onCategoryChange,
  onTierChange,
  productImageUrl,
  onBuyNowPrepare,
  onBuyNow,
  onAddToCart,
}) {
  const wrapRef = useRef(null)
  const previewRef = useRef(null)
  const [isPurchaseTransitioning, setIsPurchaseTransitioning] = useState(false)
  const [isWrapExpanded, setIsWrapExpanded] = useState(false)
  const [isUiFaded, setIsUiFaded] = useState(false)
  const [isWrapBackgroundFaded, setIsWrapBackgroundFaded] = useState(false)
  const [wrapTransitionStyle, setWrapTransitionStyle] = useState(null)

  const category = CATEGORIES.find((c) => c.id === selectedCategory) || CATEGORIES[0]
  const tier = TIERS.find((t) => t.id === selectedTier) || TIERS[0]
  const packName = `${category.label} ${tier.label} Pack`
  const packPrice = tier.price
  const packValue = Math.round(tier.price * 3) // e.g. "$75 - 1 card per pack" style
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const nextFrame = () =>
    new Promise((resolve) => {
      requestAnimationFrame(() => resolve())
    })

  const handleBuyNowWithTransition = async () => {
    if (isPurchaseTransitioning) return

    setIsPurchaseTransitioning(true)
    await Promise.resolve(onBuyNowPrepare?.())
    previewRef.current?.startPurchaseTransition?.()

    const rect = wrapRef.current?.getBoundingClientRect()
    if (rect) {
      setWrapTransitionStyle({
        '--purchase-start-x': `${rect.left}px`,
        '--purchase-start-y': `${rect.top}px`,
        '--purchase-start-scale-x': `${rect.width / window.innerWidth}`,
        '--purchase-start-scale-y': `${rect.height / window.innerHeight}`,
      })
    }

    // Ensure browser commits the start transform before toggling expanded state.
    await nextFrame()
    await nextFrame()
    setIsWrapExpanded(true)

    await wait(1500)
    setIsUiFaded(true)
    setIsWrapBackgroundFaded(true)

    await wait(500)
    previewRef.current?.startExitTransition?.()

    await wait(800)
    await Promise.resolve(onBuyNow?.())
  }

  return (
    <div className={`home-page ${isUiFaded ? 'purchase-ui-fade' : ''}`}>
      <div className="home-page-matrix-bg" aria-hidden="true" />
      <div className="home-page-content">
        {/* Left: 3D card preview (draggable, same image front and back) */}
        <section className="home-section home-product-display">
          <div
            ref={wrapRef}
            style={wrapTransitionStyle || undefined}
            className={`home-product-image-wrap home-product-preview-3d ${isPurchaseTransitioning ? 'purchase-transition-active' : ''} ${isWrapExpanded ? 'purchase-transition-expanded' : ''} ${isWrapBackgroundFaded ? 'purchase-transition-bg-fade' : ''}`}
          >
            <Suspense fallback={<div className="home-product-preview-fallback">Loading…</div>}>
              <SafeCanvas
                camera={{ position: [0, 0, 6], fov: 45 }}
                style={{
                  width: isPurchaseTransitioning ? '100vw' : '100%',
                  height: isPurchaseTransitioning ? '100vh' : '320px',
                  display: 'block',
                }}
              >
                <Card3DPreview ref={previewRef} cardImageUrl={productImageUrl} />
              </SafeCanvas>
            </Suspense>
          </div>
        </section>

        {/* Middle: Selection controls */}
        <section className="home-section home-selection">
          <div className="home-panel">
            <h2 className="home-panel-title">Pack Category</h2>
            <div className="home-category-grid">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`home-category-btn ${selectedCategory === c.id ? 'selected' : ''}`}
                  onClick={() => onCategoryChange(c.id)}
                  disabled={isPurchaseTransitioning}
                  aria-pressed={selectedCategory === c.id}
                >
                  <span className="home-category-icon">{c.icon}</span>
                  <span className="home-category-label">{c.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="home-panel">
            <h2 className="home-panel-title">Tier Selection</h2>
            <p className="home-panel-subtitle">Select a tier to view current cards and values.</p>
            <div className="home-tier-grid">
              {TIERS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`home-tier-btn ${selectedTier === t.id ? 'selected' : ''}`}
                  onClick={() => onTierChange(t.id)}
                  disabled={isPurchaseTransitioning}
                  aria-pressed={selectedTier === t.id}
                >
                  <span className="home-tier-label">{t.label}</span>
                  <span className="home-tier-price">${t.price}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Right: Purchase details */}
        <section className="home-section home-purchase">
          <div className="home-panel home-purchase-panel">
            <h2 className="home-pack-name">{packName}</h2>
            <p className="home-pack-detail">${packValue} - 1 card per pack</p>
            <div className="home-actions">
              <button
                type="button"
                className="home-btn home-btn-primary"
                onClick={handleBuyNowWithTransition}
                disabled={isPurchaseTransitioning}
              >
                <span className="home-btn-icon">⚡</span>
                Buy Now ${packPrice.toFixed(2)}
              </button>
              <button
                type="button"
                className="home-btn home-btn-secondary"
                onClick={onAddToCart}
                disabled={isPurchaseTransitioning}
              >
                <span className="home-btn-icon">🛒</span>
                Add to Cart
              </button>
            </div>
          </div>
          <div className="home-panel home-value-panel">
            <h2 className="home-panel-title home-panel-title-small">
              <span className="home-panel-title-icon">📊</span>
              PACK VALUE DISTRIBUTION
            </h2>
            <p className="home-panel-subtitle">*Percentages based on initial pack publishing.</p>
          </div>
        </section>
      </div>
    </div>
  )
}
