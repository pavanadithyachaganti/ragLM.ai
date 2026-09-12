import { NextResponse } from "next/server";
import { MODELS, PROVIDERS } from "@/lib/catalog";
import { liveProviders, anyKeyPresent } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tells the client which providers are live (have a key server-side) and
// whether the app is running in keyless demo mode. No secrets leave the server.
export function GET() {
  return NextResponse.json({
    providers: liveProviders(),
    providerMeta: PROVIDERS,
    catalog: MODELS,
    demo: !anyKeyPresent(),
  });
}
