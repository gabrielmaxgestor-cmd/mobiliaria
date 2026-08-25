import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/abertura")({
  component: Abertura,
});

function Abertura() {
  useEffect(() => {
    window.location.replace("/home.html");
  }, []);

  return null;
}

