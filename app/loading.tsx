export default function Loading() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center bg-[#f6f8fb] px-4 dark:bg-[#0d2230]"
      role="status"
      aria-live="polite"
      aria-label="Loading MediTrack"
    >
      <div className="flex flex-col items-center space-y-6">
        {/* Standalone Brand Icon Mark with subtle pulse/fade scale */}
        <div className="relative h-16 w-16 animate-pulse motion-reduce:animate-none">
          <img
            src="/branding/meditrack-icon.png"
            alt="MediTrack Icon"
            className="h-full w-full object-contain"
          />
        </div>

        {/* Minimal loading indicator bar/spinner */}
        <div className="flex items-center space-y-2 flex-col">
          <div className="h-1 w-24 overflow-hidden rounded-full bg-[#e3e9ef] dark:bg-[#1a384e]">
            <div className="h-full w-12 animate-loading-bar rounded-full bg-[#1e7b8c] dark:bg-[#84B3CE] motion-reduce:animate-none" />
          </div>
          <span className="text-[11px] font-semibold tracking-wider uppercase text-[#8b98aa] dark:text-[#a8c4d3]">
            Loading Care Plan
          </span>
        </div>
      </div>
    </main>
  )
}
