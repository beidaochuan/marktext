/* eslint-disable vue/one-component-per-file -- render stubs for the dialog's children */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, onBeforeUnmount, type App } from 'vue'

// Mounts the real export dialog with its form controls replaced by stubs that
// register their latest props, so a spec can read a control's value and drive
// its onChange the way the user would.

interface ControlProps {
  description: string
  bool?: boolean
  value?: unknown
  onChange: (value: unknown) => void
}

const controls = new Map<string, ControlProps>()

const controlStub = (kind: string) =>
  defineComponent({
    props: {
      description: { type: String, default: '' },
      bool: { type: Boolean, default: undefined },
      value: { type: null, default: undefined },
      onChange: { type: Function, required: true }
    },
    setup(props) {
      controls.set(props.description, props as ControlProps)
      onBeforeUnmount(() => controls.delete(props.description))
      return () => h('div', { class: `stub-${kind}`, 'data-description': props.description })
    }
  })

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/i18n', () => ({ t: (key: string) => key }))
vi.mock('@/prefComponents/common/bool/index.vue', () => ({ default: controlStub('bool') }))
vi.mock('@/prefComponents/common/select/index.vue', () => ({ default: controlStub('select') }))
vi.mock('@/prefComponents/common/textBox/index.vue', () => ({ default: controlStub('text') }))
vi.mock('@/prefComponents/common/fontTextBox/index.vue', () => ({ default: controlStub('font') }))
vi.mock('@/prefComponents/common/range/index.vue', () => ({ default: controlStub('range') }))

const { default: ExportSettings } = await import('@/components/exportSettings/index.vue')
const { default: bus } = await import('@/bus')
const { EXPORT_SETTINGS_STORAGE_KEY } = await import('@/components/exportSettings/persistence')

const SHOW_PAGE_NUMBER = 'exportSettings.style.showPageNumber'
const PAGE_NUMBER_FORMAT = 'exportSettings.style.pageNumberFormat'

const ElDialog = defineComponent({
  props: { modelValue: Boolean },
  setup:
    (props, { slots }) =>
      () =>
        props.modelValue ? h('div', slots.default?.()) : null
})
const ElTabs = defineComponent({
  setup:
    (_, { slots }) =>
      () =>
        h('div', slots.default?.())
})
const ElTabPane = defineComponent({
  props: { name: { type: String, default: '' } },
  setup:
    (props, { slots }) =>
      () =>
        h('section', { 'data-pane': props.name }, slots.default?.())
})
const ElInputNumber = defineComponent({ setup: () => () => null })

let app: App | null = null
let host: HTMLElement

const mountDialog = async(): Promise<void> => {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(ExportSettings)
  app.component('ElDialog', ElDialog)
  app.component('ElTabs', ElTabs)
  app.component('ElTabPane', ElTabPane)
  app.component('ElInputNumber', ElInputNumber)
  app.mount(host)
  await nextTick()
}

const unmountDialog = (): void => {
  app?.unmount()
  app = null
  host.remove()
}

const openDialog = async(type: string): Promise<void> => {
  bus.emit('showExportDialog', type)
  await nextTick()
}

const change = async(description: string, value: unknown): Promise<void> => {
  const control = controls.get(description)
  if (!control) throw new Error(`control not rendered: ${description}`)
  control.onChange(value)
  await nextTick()
}

const clickExport = (): Record<string, unknown> => {
  let exported: Record<string, unknown> | undefined
  const onExport = (options: unknown) => {
    exported = options as Record<string, unknown>
  }
  const button = host.querySelector<HTMLButtonElement>('.button-controlls .button-primary')
  if (!button) throw new Error('export button not rendered')
  bus.on('export', onExport)
  button.click()
  bus.off('export', onExport)
  if (!exported) throw new Error('export was not emitted')
  return exported
}

const styleControl = (description: string): Element | null =>
  host.querySelector(`[data-pane="style"] [data-description="${description}"]`)

beforeEach(async() => {
  localStorage.clear()
  controls.clear()
  await mountDialog()
})

afterEach(() => {
  unmountDialog()
})

describe('export dialog: page number option', () => {
  it.each(['pdf', 'print'])('offers the toggle in the Style tab for %s', async(type) => {
    await openDialog(type)
    expect(styleControl(SHOW_PAGE_NUMBER)).not.toBeNull()
    // The format select only appears once page numbers are on.
    expect(styleControl(PAGE_NUMBER_FORMAT)).toBeNull()

    await change(SHOW_PAGE_NUMBER, true)
    expect(styleControl(PAGE_NUMBER_FORMAT)).not.toBeNull()
  })

  it('hides the option for styled HTML export, which has no pages', async() => {
    await openDialog('styledHtml')
    expect(styleControl(SHOW_PAGE_NUMBER)).toBeNull()
  })

  it('passes the chosen format to the export when on', async() => {
    await openDialog('pdf')
    await change(SHOW_PAGE_NUMBER, true)
    expect(clickExport().pageNumber).toBe('numberOfTotal')

    await openDialog('pdf')
    await change(PAGE_NUMBER_FORMAT, 'number')
    expect(clickExport().pageNumber).toBe('number')
  })

  it('omits page numbers from the export when off', async() => {
    await openDialog('pdf')
    expect(clickExport()).not.toHaveProperty('pageNumber')
  })

  it('omits page numbers from a styled HTML export even if left on', async() => {
    await openDialog('pdf')
    await change(SHOW_PAGE_NUMBER, true)
    clickExport()

    await openDialog('styledHtml')
    expect(clickExport()).not.toHaveProperty('pageNumber')
  })

  it('restores the toggle and format after the dialog is recreated', async() => {
    await openDialog('pdf')
    await change(SHOW_PAGE_NUMBER, true)
    await change(PAGE_NUMBER_FORMAT, 'number')
    expect(JSON.parse(localStorage.getItem(EXPORT_SETTINGS_STORAGE_KEY) ?? '{}')).toMatchObject({
      showPageNumber: true,
      pageNumberFormat: 'number'
    })

    unmountDialog()
    controls.clear()
    await mountDialog()
    await openDialog('pdf')

    expect(controls.get(SHOW_PAGE_NUMBER)?.bool).toBe(true)
    expect(controls.get(PAGE_NUMBER_FORMAT)?.value).toBe('number')
    expect(clickExport().pageNumber).toBe('number')
  })
})
