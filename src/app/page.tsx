import PlayerLoader from "@/components/PlayerLoader";
import { notFound } from "next/navigation";

// Force dynamic rendering to prevent static generation issues
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Props = {
  searchParams: Promise<any>;
};
export default async function page({ searchParams }: Props) {
  const { playlist } = await searchParams;
  console.log(playlist);
  let playlistUrl = "";

  try {
    const res = await fetch(
      `https://fetcher.p2a.academy/api/v1/video-token/${playlist}`,
      {
        cache: "no-store", // Prevent caching in production
        headers: {
          "Cache-Control": "no-cache",
        },
      }
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch token: ${res.statusText}`);
    }

    const data = await res.json();
    console.log(data);
    playlistUrl = data.playlist_url || "";
  } catch (error) {
    console.error("Error fetching video token:", error);
    notFound();
    // Return empty string - PlayerLoader will handle it
  }

  return (
    <div className="flex min-h-screen items-center justify-center ">
      <PlayerLoader src={playlistUrl} />
    </div>
  );
}
