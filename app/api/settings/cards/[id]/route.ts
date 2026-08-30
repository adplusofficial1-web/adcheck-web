import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { isValidUuid } from "@/lib/validation";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const business = await getCurrentBusiness();
    if (!business) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    if (!isValidUuid(params.id)) {
      return NextResponse.json({ error: "ไม่พบบัตรนี้" }, { status: 404 });
    }

    const [card] = await sql`
      SELECT id FROM payment_methods WHERE id = ${params.id} AND business_id = ${business.id}
    `;
    if (!card) {
      return NextResponse.json({ error: "ไม่พบบัตรนี้" }, { status: 404 });
    }

    const expMonth = body.exp_month !== undefined ? Number(body.exp_month) : undefined;
    const expYear = body.exp_year !== undefined ? Number(body.exp_year) : undefined;
    if (expMonth !== undefined && (!Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12)) {
      return NextResponse.json({ error: "เดือนหมดอายุไม่ถูกต้อง" }, { status: 400 });
    }
    if (expYear !== undefined && (!Number.isInteger(expYear) || expYear < new Date().getUTCFullYear())) {
      return NextResponse.json({ error: "ปีหมดอายุไม่ถูกต้อง" }, { status: 400 });
    }

    if (body.is_default === true) {
      // Only one default card per business — clear the others first.
      await sql`UPDATE payment_methods SET is_default = false WHERE business_id = ${business.id}`;
    }

    const [updated] = await sql`
      UPDATE payment_methods
      SET
        exp_month = COALESCE(${expMonth ?? null}, exp_month),
        exp_year = COALESCE(${expYear ?? null}, exp_year),
        is_default = CASE WHEN ${body.is_default === true} THEN true ELSE is_default END
      WHERE id = ${params.id}
      RETURNING id, brand, last4, exp_month, exp_year, is_default
    `;

    return NextResponse.json({ card: updated });
  } catch (e: any) {
    console.error(`PATCH /api/settings/cards/${params.id} failed:`, e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const business = await getCurrentBusiness();
    if (!business) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    if (!isValidUuid(params.id)) {
      return NextResponse.json({ error: "ไม่พบบัตรนี้" }, { status: 404 });
    }

    const [card] = await sql`
      SELECT id, is_default FROM payment_methods WHERE id = ${params.id} AND business_id = ${business.id}
    `;
    if (!card) {
      return NextResponse.json({ error: "ไม่พบบัตรนี้" }, { status: 404 });
    }

    await sql`DELETE FROM payment_methods WHERE id = ${params.id}`;

    // If the deleted card was the default and other cards remain, promote the
    // next one (oldest first) so there's always a default when possible.
    if (card.is_default) {
      const remaining = await sql`
        SELECT id FROM payment_methods WHERE business_id = ${business.id} ORDER BY created_at ASC LIMIT 1
      `;
      if (remaining[0]) {
        await sql`UPDATE payment_methods SET is_default = true WHERE id = ${remaining[0].id}`;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(`DELETE /api/settings/cards/${params.id} failed:`, e);
    return NextResponse.json({ error: "ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
