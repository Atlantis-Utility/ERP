import { NextResponse } from "next/server";

export function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("outlook_refresh");
  res.cookies.delete("outlook_connected");
  return res;
}
