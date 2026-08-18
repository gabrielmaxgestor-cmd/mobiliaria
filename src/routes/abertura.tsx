import { createFileRoute } from "@tanstack/react-router";
import { IntroOverlay } from "@/components/IntroOverlay";

export const Route = createFileRoute("/abertura")({
  component: Abertura,
});

function Abertura() {
  return (
    <main className="min-h-screen w-full bg-[#071d1a]">
      <IntroOverlay />
    </main>
  );
}
