import { Children, cloneElement } from 'react'

/**
 * Strip instrumentation props (x-line-number, data-*, etc.) so R3F/Three.js
 * don't receive them and throw. Use when the build (e.g. Emergent) injects
 * JSX attributes for debugging/error reporting.
 */
export function isInstrumentationProp(key) {
  if (typeof key !== 'string') return false
  if (key.startsWith('data')) return true
  if (key.startsWith('x-')) return true
  if (key.length > 1 && key.startsWith('x') && key[1] === key[1].toUpperCase()) return true
  return false
}

export function cleanProps(props) {
  if (!props || typeof props !== 'object') return props
  const out = {}
  for (const [key, value] of Object.entries(props)) {
    if (!isInstrumentationProp(key)) out[key] = value
  }
  return out
}

/**
 * Recursively strip instrumentation from all R3F children.
 * Wrap any tree that contains R3F primitives (Canvas children, or Card3D internals).
 */
export function CleanR3FChildren({ children }) {
  const mapped = Children.map(children, (child) => {
    if (!child || typeof child !== 'object' || !child.props) return child
    const cleaned = cleanProps(child.props)
    const inner = child.props.children
    const cleanedInner = inner != null ? CleanR3FChildren({ children: inner }) : undefined
    if (cleanedInner === undefined) return cloneElement(child, cleaned)
    const arr = Array.isArray(cleanedInner) ? cleanedInner : [cleanedInner]
    return cloneElement(child, cleaned, ...arr)
  })
  return mapped
}
