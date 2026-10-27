declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ReactElement, Ref } from 'react'

  export function languageForPath(path: string): string | undefined

  export function CodeBlock(props: {
    readonly code: string
    readonly lang?: string
    readonly streaming?: boolean
    readonly className?: string
    readonly contentRef?: Ref<HTMLDivElement>
    readonly lineNumbers?: boolean
    readonly showHeader?: boolean
    readonly copyLabel?: string
    readonly copiedLabel?: string
    readonly toolbarLabels?: {
      readonly codeLabel: string
      readonly wrapLabel: string
      readonly unwrapLabel: string
    }
    readonly wrap?: boolean
  }): ReactElement
}
