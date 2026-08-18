import { createFileRoute } from "@tanstack/react-router";
import { IntroOverlay } from "@/components/IntroOverlay";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen w-full bg-[#071d1a]">
      <IntroOverlay />
    </main>
  );
}
