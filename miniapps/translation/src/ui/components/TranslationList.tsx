import {ChevronDown, Trash2} from "lucide-react"
import {useEffect, useRef, useState} from "react"

import {TranslationEntry} from "../hooks/useTranslations"

import {EmptyState} from "./EmptyState"
import {TranslationItem} from "./TranslationItem"

interface TranslationListProps {
  translations: TranslationEntry[]
  isRecording: boolean
  onToggleRecording: () => void
  onClearTranslations: () => void
  accentColor?: string
  showOriginalText?: boolean
}

export function TranslationList({
  translations,
  onClearTranslations,
  accentColor = "#2089F3",
  showOriginalText = true,
}: TranslationListProps) {
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const handleScroll = () => {
    if (!scrollContainerRef.current) return

    const {scrollTop, scrollHeight, clientHeight} = scrollContainerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50

    setAutoScroll(isAtBottom)
  }

  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [translations, autoScroll])

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      })
    }
  }

  return (
    <div className="h-full w-full flex flex-col relative">
      <div ref={scrollContainerRef} onScroll={handleScroll} className="h-full overflow-y-auto px-6 py-3 space-y-1.5">
        {translations.length === 0 ? (
          <EmptyState />
        ) : (
          translations.map((translation, index) => (
            <TranslationItem
              key={translation.id}
              translation={translation}
              isFirst={index === 0}
              isLast={index === translations.length - 1}
              showOriginalText={showOriginalText}
            />
          ))
        )}
      </div>

      {/* Clear. onClearTranslations was declared in the props but never even
          destructured, so the phone had no way to clear the translation list
          or the lens. */}
      {translations.length > 0 && (
        <button
          type="button"
          onClick={onClearTranslations}
          aria-label="Clear translations"
          className="absolute bottom-6 left-6 px-4 h-12 rounded-full shadow-lg flex items-center gap-2 transition-all z-10 bg-white/90 dark:bg-zinc-800/90 text-gray-900 dark:text-zinc-50 hover:bg-white dark:hover:bg-zinc-700">
          <Trash2 className="w-4 h-4" />
          <span className="text-sm font-medium">Clear</span>
        </button>
      )}

      {!autoScroll && translations.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-6 right-6 w-12 h-12 text-white rounded-full shadow-lg flex items-center justify-center transition-all z-10"
          style={{backgroundColor: accentColor}}>
          <ChevronDown className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}
