"use client";

import { useEffect } from "react";
import ArenaDropdown, { trackArenaView } from "./ArenaDropdown";

export default function TrackAndDropdown({ slug }: { slug: string }) {
  useEffect(() => {
    trackArenaView(slug);
  }, [slug]);

  return <ArenaDropdown currentSlug={slug} />;
}
