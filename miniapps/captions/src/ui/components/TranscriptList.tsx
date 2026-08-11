import { ChevronDown, Trash2 } from "lucide-react"
import { useRef, useEffect, useState } from "react"

// eslint-disable-next-line no-restricted-imports
import { Transcript } from "../hooks/useTranscripts"

import { TranscriptItem } from "./TranscriptItem"
import { EmptyState } from "./EmptyState"
// import {Button} from "./ui/button"

interface TranscriptListProps {
  transcripts: Transcript[]
  isRecording: boolean
  onToggleRecording: () => void
  onClearTranscripts: () => void
  accentColor?: string
}

export function TranscriptList({
  transcripts,
  isRecording,
  onToggleRecording,
  onClearTranscripts,
  accentColor = "#6DAEA6",
}: TranscriptListProps) {
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const handleScroll = () => {
    if (!scrollContainerRef.current) return

    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50

    setAutoScroll(isAtBottom)
  }

  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [transcripts, autoScroll])

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
        {transcripts.length === 0 ? (
          (
            <>
              <EmptyState />
            </>
          )
        ) : (
          transcripts.map((transcript, index) => (
            <TranscriptItem
              key={transcript.id}
              transcript={transcript}
              isFirst={index === 0}
              isLast={index === transcripts.length - 1}
            />
          ))
        )}
      </div>

      {/* Clear. onClearTranscripts was already plumbed in from App.tsx but
          nothing ever rendered a control for it, so there was no way to clear
          the transcript — or the lens — from the phone at all. */}
      {transcripts.length > 0 && (
        <button
          type="button"
          onClick={onClearTranscripts}
          aria-label="Clear transcript"
          className="absolute bottom-6 left-6 px-4 h-12 rounded-full shadow-lg flex items-center gap-2 transition-all z-10 bg-white/90 dark:bg-zinc-800/90 text-gray-900 dark:text-zinc-50 hover:bg-white dark:hover:bg-zinc-700">
          <Trash2 className="w-4 h-4" />
          <span className="text-sm font-medium">Clear</span>
        </button>
      )}

      {/* Scroll to bottom FAB */}
      {!autoScroll && transcripts.length > 0 && (
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
