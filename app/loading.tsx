export default function Loading() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-screen flex-col items-center justify-center bg-[#edf5f2] px-4 dark:bg-[#14241f]"
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
            <div className="h-full w-12 animate-loading-bar rounded-full bg-[#155b48] dark:bg-[#9de6ca] motion-reduce:animate-none" />
          </div>
          <span role="status" className="text-[11px] font-semibold tracking-wider uppercase text-copy-muted dark:text-[#b4d0c5]">
            Loading Care Plan
          </span>
        </div>
      </div>
    </main>
  )
}
