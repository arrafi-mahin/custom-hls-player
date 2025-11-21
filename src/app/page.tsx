import PlayerLoader from "@/components/PlayerLoader";

// Force dynamic rendering to prevent static generation issues
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function page() {
  let playlistUrl = "";

  try {
    const res = await fetch(`https://toycitybd.com/video-token/30`, {
      cache: "no-store", // Prevent caching in production
      headers: {
        "Cache-Control": "no-cache",
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch token: ${res.statusText}`);
    }

    const data = await res.json();
    playlistUrl = data.playlist_url || "";
  } catch (error) {
    console.error("Error fetching video token:", error);
    // Return empty string - PlayerLoader will handle it
  }

  return (
    <div className="flex min-h-screen items-center justify-center ">
      <PlayerLoader src={playlistUrl} />
    </div>
  );
}
