import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@muyajs/core', () => ({
  MarkdownToHtml: class {
    async generateWithHeadings({ extraCSS = '' }: { extraCSS?: string }) {
      return {
        html: `<html><head><style>${extraCSS}</style></head><body><article class="markdown-body"><p>Content</p></article></body></html>`,
        headings: []
      }
    }
  }
}))

vi.mock('@/util/resolveLinkHref', () => ({ resolveLocalLinkHref: (value: string) => value }))

const { exportStyledHTML } = await import('@/util/exportHtml')
const { applyPageMarginFont, getPageMarginFooterCss, PAGE_MARGIN_PROBE_CLASS } =
  await import('@/util/pageNumber')

afterEach(() => {
  document.body.innerHTML = ''
})

describe('getPageMarginFooterCss', () => {
  it('prints the number alone in the bottom center without a footer', () => {
    const css = getPageMarginFooterCss(null, 'numberOfTotal')
    expect(css).toContain('@bottom-center{content:counter(page) " / " counter(pages);')
    expect(css).toContain('@bottom-left{content:"";')
    expect(css).not.toContain('border-top')
  })

  it('puts the three footer cells in the margin and the number after the center text', () => {
    const css = getPageMarginFooterCss(
      { type: 2, left: 'aaaa', center: 'bbbb', right: 'cccc' },
      'number'
    )
    expect(css).toContain('@bottom-left{content:"aaaa";')
    expect(css).toContain('@bottom-center{content:"bbbb  " counter(page);')
    expect(css).toContain('@bottom-right{content:"cccc";')
  })

  it('shows only the center cell for a single-cell footer', () => {
    const css = getPageMarginFooterCss(
      { type: 1, left: 'aaaa', center: 'bbbb', right: 'cccc' },
      'number'
    )
    expect(css).toContain('@bottom-left{content:"";')
    expect(css).toContain('@bottom-right{content:"";')
  })

  it('draws the footer rule only for a styled footer', () => {
    expect(getPageMarginFooterCss({ type: 1, center: 'x' }, 'number', true)).toContain(
      'border-top:1px solid'
    )
    expect(getPageMarginFooterCss({ type: 1, center: 'x' }, 'number', false)).not.toContain(
      'border-top'
    )
  })

  it('reduces footer HTML to text that cannot leave the CSS string or <style>', () => {
    const css = getPageMarginFooterCss(
      { type: 1, center: '<b>a"b\\c</b></style><script>x</script>' },
      'number'
    )
    expect(css).toContain('content:"a\\"b\\\\c  " counter(page)')
    expect(css).not.toContain('<')
  })
})

describe('exportStyledHTML with page numbers', () => {
  it('replaces the fixed HTML footer with margin boxes and a font probe', async() => {
    const html = await exportStyledHTML({} as never, 'Content', {
      footer: { type: 2, left: 'L', center: 'C', right: 'R' },
      pageNumber: 'numberOfTotal'
    })
    const doc = new DOMParser().parseFromString(html, 'text/html')
    expect(doc.querySelector('.page-footer:not(.page-margin-probe)')).toBeNull()
    expect(doc.querySelector('.page-footer-fake')).toBeNull()
    expect(doc.querySelector(`.${PAGE_MARGIN_PROBE_CLASS} .hf-container`)).not.toBeNull()
    expect(html).toContain('@bottom-center{content:"C  " counter(page) " / " counter(pages);')
  })

  it('keeps the HTML footer when page numbers are off', async() => {
    const html = await exportStyledHTML({} as never, 'Content', {
      footer: { type: 1, center: 'C' }
    })
    expect(html).toContain('class="page-footer single"')
    expect(html).not.toContain('counter(page)')
    expect(html).not.toContain(PAGE_MARGIN_PROBE_CLASS)
  })
})

describe('applyPageMarginFont', () => {
  it('copies the footer font onto the margin boxes and removes the probe', () => {
    const container = document.createElement('article')
    container.innerHTML = `<div class="page-footer ${PAGE_MARGIN_PROBE_CLASS}"><div class="hf-container" style="font-family: Foo; font-size: 13px">x</div></div>`
    document.body.appendChild(container)

    applyPageMarginFont(container)

    expect(container.querySelector(`.${PAGE_MARGIN_PROBE_CLASS}`)).toBeNull()
    const style = container.querySelector('style')?.textContent ?? ''
    expect(style).toContain('@bottom-center{font-family:Foo;font-size:13px;}')
  })

  it('does nothing without a probe', () => {
    const container = document.createElement('article')
    applyPageMarginFont(container)
    expect(container.innerHTML).toBe('')
  })
})
