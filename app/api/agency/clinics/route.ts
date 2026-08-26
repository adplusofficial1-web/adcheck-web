import { NextResponse } from "next/server";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { addChildClinic } from "@/lib/agency";

// Adds a new clinic under the signed-in business's network (see
// lib/agency.ts:addChildClinic — no separate agency signup, any account
// can start adding clinics from /agency/dashboard). The clinic has no
// login of its own; the agency manages its billing/uploads/info directly.
export async function POST(req: Request) {
  const body = await req.json();
  const name: string = typeof body.name === "string" ? body.name.trim() : "";
  const email: string | undefined = typeof body.email === "string" ? body.email.trim() : undefined;

  if (!name) {
    return NextResponse.json({ error: "กรุณากรอกชื่อคลินิก" }, { status: 400 });
  }

  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const clinic = await addChildClinic(business.id, name, email || null);
  return NextResponse.json({ clinic });
}
