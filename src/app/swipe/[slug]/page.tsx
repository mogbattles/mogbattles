import { notFound } from "next/navigation";
import { getArenaBySlug } from "@/lib/arenas";
import SwipeArena from "@/components/SwipeArena";
import TrackAndDropdown from "@/components/TrackAndDropdown";

export default async function SwipeArenaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const arena = await getArenaBySlug(slug);

  if (!arena) notFound();

  return (
    <div>
      <TrackAndDropdown slug={slug} />
      <SwipeArena arena={arena} />
    </div>
  );
}
