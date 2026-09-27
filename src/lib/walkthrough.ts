/**
 * The 3-step first-run walkthrough shown after the goals step of onboarding.
 * Pure data (no React), so tests can pin the slide count, the copy and the
 * icon names without rendering anything.
 */
export interface WalkthroughSlide {
  id: string;
  /** Ionicons glyph name — verified against the shipped glyphmap in tests. */
  icon: string;
  title: string;
  body: string;
}

export const WALKTHROUGH_SLIDES: WalkthroughSlide[] = [
  {
    id: "search",
    icon: "search",
    title: "Search any food",
    body: "Look up foods by name, scan a barcode, or build your own dishes — the database works offline and fills in from the web when you're online.",
  },
  {
    id: "log",
    icon: "restaurant",
    title: "Log your meals",
    body: "Add what you eat to Breakfast, Lunch, Dinner or Snacks. Your day's totals update the moment you log.",
  },
  {
    id: "track",
    icon: "stats-chart",
    title: "Track your goals",
    body: "Rings show today's progress, the Analytics tab reveals your trends, and locked days keep your history honest.",
  },
];
