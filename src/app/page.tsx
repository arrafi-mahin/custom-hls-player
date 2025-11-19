import PlayerLoader from "./components/PlayerLoader";

export default async function page() {
  const hlsUrl =
    "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.mp4/.m3u8";
  const res = await fetch(`https://taxkoto.com/demo3/public/video-token/30`)
    .then((res) => res.json())
    .then((res) => res.playlist_url);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-900">
      <PlayerLoader src={res} />
    </div>
  );
}
