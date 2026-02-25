/**
 * Composes card.png with category and tier text at positions/styles matching card_old.png.
 * Returns a Promise that resolves to a data URL of the composed image.
 */
const CARD_BASE_URL = '/card.png'

// Vertical position: fraction of card height (0 = top, 1 = bottom). Adjust to move text up/down.
const CATEGORY_Y = 0.22   // category text (e.g. "--- FOOTBALL ---")
const TIER_Y = 0.882     // tier text + panel (e.g. "BRONZE")
const TIER_PANEL_HEIGHT_RATIO = 0.08
const TIER_PANEL_WIDTH_RATIO = 0.92
const CATEGORY_FONT_SIZE_RATIO = 0.065
const TIER_FONT_SIZE_RATIO = 0.058

const COLORS = {
  category: '#1a1a1a',
  tierStroke: '#0a0a0a',
}

// Tier text color by tier id (used when tierId is passed). Fallback for unknown tiers.
const TIER_COLORS = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#d4af37',
  emerald: '#50c878',
  platinum: '#7eb6d4',  // pale blue-grey to distinguish from silver
  diamond: '#b9f2ff',
}

const DEFAULT_TIER_TEXT_COLOR = '#d4af37'

export function composeCardImage(baseImageUrl, categoryLabel, tierLabel, tierId) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const w = img.naturalWidth
        const h = img.naturalHeight
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas 2d not available'))
          return
        }
        ctx.drawImage(img, 0, 0)

        const centerX = w / 2

        // —— Category (e.g. "--- FOOTBALL ---") — upper third, dark grey, sans-serif, with dashes
        const categoryText = (categoryLabel || '').toUpperCase()
        const categoryFontSize = 60
        // const categoryFontSize = Math.max(10, Math.round(h * CATEGORY_FONT_SIZE_RATIO))
        ctx.font = `700 ${categoryFontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = COLORS.category
        const categoryY = h * CATEGORY_Y
        const fullCategory = `${categoryText}`
        ctx.fillText(fullCategory, centerX, categoryY)

        // —— Tier text (e.g. "BRONZE") — color by tier selection, black outline
        const tierText = (tierLabel || '').toUpperCase()
        const tierFontSize = 56
        const tierTextColor = (tierId && TIER_COLORS[tierId]) ? TIER_COLORS[tierId] : DEFAULT_TIER_TEXT_COLOR
        ctx.font = `600 ${tierFontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const tierY = h * TIER_Y
        ctx.strokeStyle = COLORS.tierStroke
        ctx.lineWidth = Math.max(2, tierFontSize / 8)
        ctx.lineJoin = 'round'
        ctx.miterLimit = 2
        ctx.strokeText(tierText, centerX, tierY)
        ctx.fillStyle = tierTextColor
        ctx.fillText(tierText, centerX, tierY)

        resolve(canvas.toDataURL('image/png'))
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('Failed to load card image'))
    img.src = baseImageUrl || CARD_BASE_URL
  })
}
