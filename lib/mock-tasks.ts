// All runtime task/card data lives in Firestore (kanban_cards collection).
// Use lib/db/tasks.ts to read/write.
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";

export const INITIAL_TASK_CARDS: KanbanCard[] = [];
