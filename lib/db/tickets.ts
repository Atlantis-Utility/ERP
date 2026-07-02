import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  addDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

export type TicketStatus   = "open" | "in-progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketSource   = "email" | "phone" | "web" | "manual";

export interface TicketMeta {
  id: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId?: string;
  assigneeName?: string;
  notes?: string;
  updatedAt: string;
}

export interface ManualTicket {
  id: string;
  ticketNumber: number;
  source: TicketSource;
  subject: string;
  description: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId?: string;
  assigneeName?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

const META_COL   = "tickets";
const MANUAL_COL = "manual-tickets";

// ── Email ticket metadata (status/priority/assignee overlay) ─────────────────

export async function upsertTicket(id: string, patch: Partial<Omit<TicketMeta, "id">>): Promise<void> {
  const data = Object.fromEntries(
    Object.entries({ ...patch, id, updatedAt: new Date().toISOString() }).filter(([, v]) => v !== undefined)
  );
  await setDoc(doc(db, META_COL, id), data, { merge: true });
}

export function subscribeAllTicketMeta(cb: (metas: TicketMeta[]) => void): () => void {
  return onSnapshot(
    query(collection(db, META_COL)),
    (snap) => cb(snap.docs.map((d) => d.data() as TicketMeta)),
    (err) => console.error("[tickets]", err)
  );
}

// ── Manual / multi-channel tickets ──────────────────────────────────────────

let _ticketCounter = 0;

async function nextTicketNumber(): Promise<number> {
  // Use a simple counter doc to track the last ticket number
  const counterRef = doc(db, "config", "ticketCounter");
  const { getDoc, updateDoc, increment } = await import("firebase/firestore");
  const snap = await getDoc(counterRef);
  if (!snap.exists()) {
    await setDoc(counterRef, { value: 1 });
    _ticketCounter = 1;
    return 1;
  }
  await updateDoc(counterRef, { value: increment(1) });
  const updated = await getDoc(counterRef);
  return (updated.data()?.value as number) ?? ++_ticketCounter;
}

export async function createManualTicket(
  data: Omit<ManualTicket, "id" | "ticketNumber" | "createdAt" | "updatedAt">
): Promise<string> {
  const ticketNumber = await nextTicketNumber();
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, MANUAL_COL), {
    ...data,
    ticketNumber,
    createdAt: now,
    updatedAt: now,
    _createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function upsertManualTicket(
  id: string,
  patch: Partial<Omit<ManualTicket, "id" | "ticketNumber" | "createdAt">>
): Promise<void> {
  const data = Object.fromEntries(
    Object.entries({ ...patch, updatedAt: new Date().toISOString() }).filter(([, v]) => v !== undefined)
  );
  await setDoc(doc(db, MANUAL_COL, id), data, { merge: true });
}

export function subscribeManualTickets(cb: (tickets: ManualTicket[]) => void): () => void {
  return onSnapshot(
    query(collection(db, MANUAL_COL), orderBy("_createdAt", "desc")),
    (snap) => cb(snap.docs.map((d) => {
      const raw = d.data();
      // Convert Firestore Timestamp to ISO string if needed
      const createdAt = raw.createdAt ?? (raw._createdAt instanceof Timestamp ? raw._createdAt.toDate().toISOString() : new Date().toISOString());
      return { ...raw, id: d.id, createdAt } as ManualTicket;
    })),
    (err) => console.error("[manual-tickets]", err)
  );
}
