"use client";
import HLSPlayer from "./HLSPlayer";

type Props = {
  src: string;
};

export default function PlayerLoader({ src = "" }: Props) {
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center py-8 px-4 sm:px-8">
      <div className="w-full max-w-6xl">
        <h1 className="text-3xl font-bold text-center mb-2 text-zinc-900 dark:text-zinc-50">
          P2A Academy Video Player
        </h1>
        <p className="text-center mb-8 text-zinc-600 dark:text-zinc-400">
          BSC Preli Math Course
        </p>
        {/* <p className="">{ src}</p> */}
        {src !== "" && (
          <HLSPlayer
            src={src}
            title="BSC Preli Math Course"
            subtitle=""
            xhrSetup={(xhr, url) => {
              // Add custom headers for encrypted video chunk requests
              xhr.setRequestHeader("X-Player", "p2a");
              xhr.setRequestHeader("X-Sicret", "p2a-101-dev-by-fiz");

              // Enhanced settings for encrypted requests
              xhr.timeout = 30000; // 30 second timeout for encrypted requests
              xhr.withCredentials = false; // Adjust if CORS requires credentials

              // Handle timeout for encrypted requests
              xhr.ontimeout = () => {
                console.warn("Request timeout for encrypted chunk:", url);
              };

              // Handle errors for encrypted requests
              xhr.onerror = () => {
                console.error("Network error loading encrypted chunk:", url);
              };
            }}
          />
        )}
      </div>
    </main>
  );
}
