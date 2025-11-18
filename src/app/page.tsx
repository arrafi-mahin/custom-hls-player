'use client';
import HLSPlayer from './components/HLSPlayer';

export default function Home() {
  const hlsUrl = 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.mp4/.m3u8';

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-900">
      <main className="flex min-h-screen w-full flex-col items-center justify-center py-8 px-4 sm:px-8">
        <div className="w-full max-w-6xl">
          <h1 className="text-3xl font-bold text-center mb-2 text-zinc-900 dark:text-zinc-50">
            HLS Video Player
          </h1>
          <p className="text-center mb-8 text-zinc-600 dark:text-zinc-400">
            Tears of Steel - Demo HLS Stream
          </p>
          <HLSPlayer 
            src={hlsUrl}
            title="Tears of Steel"
            subtitle="A short science fiction film"
            // xhrSetup={(xhr, url) => {
            //   // Add custom headers for video chunk requests
            //   xhr.setRequestHeader('X-Player', 'p2a');
            //   xhr.setRequestHeader('X-Sicret', 'p2a-101-dev-by-fiz');
            // }}
          />
        </div>
      </main>
    </div>
  );
}
