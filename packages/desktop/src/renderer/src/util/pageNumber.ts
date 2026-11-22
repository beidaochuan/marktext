import { sanitize, EXPORT_DOMPURIFY_CONFIG } from './dompurify'

export type PageNumberFormat = 'number' | 'numberOfTotal'

export interface PageMarginFooterPart {
  type?: number
  left?: string
  center?: string
  right?: string
}

const PAGE_NUMBER_CONTENT: Record<PageNumberFormat, string> = {
  number: 'counter(page)',
  numberOfTotal: 'counter(page) " / " counter(pages)'
}

const FOOTER_BORDER = '1px solid #1c1c1c'

// Marks the element printService measures to give the margin boxes the footer's
// font; it must be removed before printing because `.page-footer` is fixed and
// would otherwise repeat on every page.
export const PAGE_MARGIN_PROBE_CLASS = 'page-margin-probe'

export const PAGE_MARGIN_PROBE_HTML = `<div class="page-footer ${PAGE_MARGIN_PROBE_CLASS}" aria-hidden="true"><div class="hf-container">&nbsp;</div></div>`

const MARGIN_BOXES = ['bottom-left', 'bottom-center', 'bottom-right'] as const

const toPlainText = (html: string): string => {
  const template = document.createElement('template')
  template.innerHTML = sanitize(html, EXPORT_DOMPURIFY_CONFIG) as string
  return (template.content.textContent ?? '').replace(/\s+/g, ' ').trim()
}

// `<` is escaped so footer text cannot close the surrounding <style> element.
const toCssString = (text: string): string =>
  `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/</g, '\\3C ')}"`

/**
 * CSS that draws the footer and the page number in the bottom @page margin boxes.
 *
 * Fixed or table-footer elements repeat identical content on every page, so a
 * per-page number can only be produced by the page margin boxes. While page
 * numbers are on, the whole footer moves there so the number can share the
 * footer's center cell; footer HTML is reduced to plain text in the process.
 */
export const getPageMarginFooterCss = (
  footer: PageMarginFooterPart | null | undefined,
  format: PageNumberFormat,
  headerFooterStyled?: boolean
): string => {
  const isThreeCells = footer?.type === 2
  const center = toPlainText(footer?.center ?? '')
  const pageNumber = PAGE_NUMBER_CONTENT[format] ?? PAGE_NUMBER_CONTENT.number
  const contents: Record<(typeof MARGIN_BOXES)[number], string> = {
    'bottom-left': isThreeCells ? toCssString(toPlainText(footer?.left ?? '')) : '""',
    'bottom-center': center ? `${toCssString(`${center}  `)} ${pageNumber}` : pageNumber,
    'bottom-right': isThreeCells ? toCssString(toPlainText(footer?.right ?? '')) : '""'
  }
  // Only a styled footer draws its rule; footer-less exports show the number alone.
  const border = footer && headerFooterStyled ? `border-top:${FOOTER_BORDER};` : ''
  const boxes = MARGIN_BOXES.map(
    (box) =>
      `@${box}{content:${contents[box]};vertical-align:top;padding-top:4px;white-space:pre;font-size:12px;color:#1c1c1c;${border}}`
  ).join('')
  return `@media print{@page{${boxes}}}`
}

/**
 * Margin boxes inherit from the page rather than the document body, so copy the
 * font that the HTML footer would have used onto them. Removes the probe.
 */
export const applyPageMarginFont = (container: HTMLElement): void => {
  const probe = container.querySelector<HTMLElement>(`.${PAGE_MARGIN_PROBE_CLASS}`)
  if (!probe) return
  const sample = probe.querySelector<HTMLElement>('.hf-container') ?? probe
  const { fontFamily, fontSize } = getComputedStyle(sample)
  probe.remove()
  if (!fontFamily && !fontSize) return

  const declarations =
    (fontFamily ? `font-family:${fontFamily.replace(/</g, '')};` : '') +
    (fontSize ? `font-size:${fontSize};` : '')
  const style = document.createElement('style')
  style.textContent = `@media print{@page{${MARGIN_BOXES.map((box) => `@${box}{${declarations}}`).join('')}}}`
  container.appendChild(style)
}
