/**
 * Persisted Monaco / textarea appearance (theme, optional custom bg, font size, schemes).
 * Intentionally not named themeStore — keep clear of upstream naming.
 */

export type EditorChromeTheme = 'vs-dark' | 'vs' | 'hc-black'

/** Saved color + font pair (localStorage). */
export interface AppearanceScheme {
  readonly id: string
  readonly background: string
  readonly fontSize: number
}

export interface EditorAppearance {
  readonly theme: EditorChromeTheme
  /** Custom editor background as `#RGB` / `#RRGGBB` / `#RRGGBBAA`; null uses preset theme. */
  readonly customBackground: string | null
  readonly fontSize: number
  readonly schemes: readonly AppearanceScheme[]
}

export type AppearanceListener = () => void

const STORAGE_KEY = 'dsh-workspace-enhanced:editor-appearance'
const SCHEMES_KEY = 'dsh-workspace-enhanced:editor-appearance-schemes'
const FONT_MIN = 11
const FONT_MAX = 24
const FONT_DEFAULT = 13
const SCHEMES_MAX = 12
const CUSTOM_THEME_ID = 'dsh-workspace-enhanced-custom'

const THEMES: readonly EditorChromeTheme[] = ['vs-dark', 'vs', 'hc-black']

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

function clampFont(size: number): number {
  if (!Number.isFinite(size)) return FONT_DEFAULT
  return Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(size)))
}

function parseTheme(raw: unknown): EditorChromeTheme {
  return THEMES.includes(raw as EditorChromeTheme) ? raw as EditorChromeTheme : 'vs-dark'
}

/** Normalize and validate an HTML hex color; returns null when invalid. */
export function normalizeHexColor(raw: string): string | null {
  const trimmed = raw.trim()
  if (!HEX_RE.test(trimmed)) return null
  if (trimmed.length === 4) {
    const r = trimmed[1]!
    const g = trimmed[2]!
    const b = trimmed[3]!
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return trimmed.toLowerCase()
}

/** Color input (`#rrggbb`) value derived from a stored custom color. */
export function hexForColorInput(custom: string | null, theme: EditorChromeTheme): string {
  if (custom !== null) {
    if (custom.length === 9) return custom.slice(0, 7)
    return custom
  }
  if (theme === 'vs') return '#ffffff'
  if (theme === 'hc-black') return '#000000'
  return '#1e1e1e'
}

function parseCustomBackground(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  return normalizeHexColor(raw)
}

function newSchemeId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function parseSchemes(raw: unknown): AppearanceScheme[] {
  if (!Array.isArray(raw)) return []
  const out: AppearanceScheme[] = []
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue
    const row = item as Partial<AppearanceScheme>
    const background = typeof row.background === 'string' ? normalizeHexColor(row.background) : null
    if (background === null) continue
    const fontSize = clampFont(typeof row.fontSize === 'number' ? row.fontSize : FONT_DEFAULT)
    const id = typeof row.id === 'string' && row.id.length > 0 ? row.id : newSchemeId()
    out.push({ id, background, fontSize })
    if (out.length >= SCHEMES_MAX) break
  }
  return out
}

function defaults(): EditorAppearance {
  return { theme: 'vs-dark', customBackground: null, fontSize: FONT_DEFAULT, schemes: [] }
}

function readStoredAppearance(): Omit<EditorAppearance, 'schemes'> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return { theme: 'vs-dark', customBackground: null, fontSize: FONT_DEFAULT }
    }
    const parsed = JSON.parse(raw) as Partial<EditorAppearance>
    return {
      theme: parseTheme(parsed.theme),
      customBackground: parseCustomBackground(parsed.customBackground),
      fontSize: clampFont(typeof parsed.fontSize === 'number' ? parsed.fontSize : FONT_DEFAULT),
    }
  } catch {
    return { theme: 'vs-dark', customBackground: null, fontSize: FONT_DEFAULT }
  }
}

function readStoredSchemes(): AppearanceScheme[] {
  try {
    const raw = window.localStorage.getItem(SCHEMES_KEY)
    if (raw === null) return []
    return parseSchemes(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}

/**
 * Mutable appearance prefs with subscribe semantics for React.
 * `getSnapshot` MUST return a stable reference between mutations.
 */
export class EditorAppearanceStore {
  #theme: EditorChromeTheme = 'vs-dark'
  #customBackground: string | null = null
  #fontSize = FONT_DEFAULT
  #schemes: AppearanceScheme[] = []
  #hydrated = false
  #snapshot: EditorAppearance = defaults()
  readonly #listeners = new Set<AppearanceListener>()

  getSnapshot = (): EditorAppearance => this.#snapshot

  subscribe = (listener: AppearanceListener): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /** Load from localStorage once on the client. */
  hydrate(): void {
    if (this.#hydrated) return
    this.#hydrated = true
    if (typeof window === 'undefined') return
    const next = readStoredAppearance()
    this.#theme = next.theme
    this.#customBackground = next.customBackground
    this.#fontSize = next.fontSize
    this.#schemes = readStoredSchemes()
    this.#refreshSnapshot()
    this.#emit()
  }

  setTheme(theme: EditorChromeTheme): void {
    if (this.#theme === theme && this.#customBackground === null) return
    this.#theme = theme
    this.#customBackground = null
    this.#refreshSnapshot()
    this.#persistAppearance()
    this.#emit()
  }

  /**
   * Set or clear a custom background hex.
   * @returns whether the value was accepted (invalid hex ignored when non-empty).
   */
  setCustomBackground(raw: string | null): boolean {
    if (raw === null || raw.trim() === '') {
      if (this.#customBackground === null) return true
      this.#customBackground = null
      this.#refreshSnapshot()
      this.#persistAppearance()
      this.#emit()
      return true
    }
    const next = normalizeHexColor(raw)
    if (next === null) return false
    if (this.#customBackground === next) return true
    this.#customBackground = next
    this.#refreshSnapshot()
    this.#persistAppearance()
    this.#emit()
    return true
  }

  setFontSize(size: number): void {
    const next = clampFont(size)
    if (this.#fontSize === next) return
    this.#fontSize = next
    this.#refreshSnapshot()
    this.#persistAppearance()
    this.#emit()
  }

  bumpFont(delta: number): void {
    this.setFontSize(this.#fontSize + delta)
  }

  /**
   * Persist current color + font as a named scheme.
   * @param backgroundOverride optional hex (e.g. menu draft) instead of current store color.
   * @returns whether a scheme was written.
   */
  saveScheme(backgroundOverride?: string): boolean {
    const fromOverride =
      backgroundOverride !== undefined ? normalizeHexColor(backgroundOverride) : null
    const background =
      fromOverride
      ?? this.#customBackground
      ?? hexForColorInput(null, this.#theme)
    const fontSize = this.#fontSize
    const existing = this.#schemes.findIndex(
      (s) => s.background === background && s.fontSize === fontSize,
    )
    if (existing >= 0) {
      const hit = this.#schemes[existing]!
      this.#schemes = [hit, ...this.#schemes.filter((_, i) => i !== existing)]
      this.#refreshSnapshot()
      this.#persistSchemes()
      this.#emit()
      return true
    }
    const next: AppearanceScheme = { id: newSchemeId(), background, fontSize }
    this.#schemes = [next, ...this.#schemes].slice(0, SCHEMES_MAX)
    this.#refreshSnapshot()
    this.#persistSchemes()
    this.#emit()
    return true
  }

  /** Apply a saved scheme (color + font). */
  applyScheme(id: string): boolean {
    const scheme = this.#schemes.find((s) => s.id === id)
    if (scheme === undefined) return false
    this.#customBackground = scheme.background
    this.#fontSize = scheme.fontSize
    this.#refreshSnapshot()
    this.#persistAppearance()
    this.#emit()
    return true
  }

  removeScheme(id: string): void {
    const next = this.#schemes.filter((s) => s.id !== id)
    if (next.length === this.#schemes.length) return
    this.#schemes = next
    this.#refreshSnapshot()
    this.#persistSchemes()
    this.#emit()
  }

  #refreshSnapshot(): void {
    this.#snapshot = {
      theme: this.#theme,
      customBackground: this.#customBackground,
      fontSize: this.#fontSize,
      schemes: this.#schemes,
    }
  }

  #persistAppearance(): void {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          theme: this.#theme,
          customBackground: this.#customBackground,
          fontSize: this.#fontSize,
        }),
      )
    } catch {
      // ignore quota / private mode
    }
  }

  #persistSchemes(): void {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(SCHEMES_KEY, JSON.stringify(this.#schemes))
    } catch {
      // ignore quota / private mode
    }
  }

  #emit(): void {
    for (const listener of this.#listeners) listener()
  }
}

export const EDITOR_FONT_MIN = FONT_MIN
export const EDITOR_FONT_MAX = FONT_MAX
export const EDITOR_THEMES = THEMES
export const EDITOR_CUSTOM_THEME_ID = CUSTOM_THEME_ID
export const EDITOR_SCHEMES_MAX = SCHEMES_MAX
