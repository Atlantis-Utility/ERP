// Consolidated PDF export listing every completed task across all projects.

import type { Project } from "@/lib/mock-projects";
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";
import { buildTasksReportData, TASKS_REPORT_FILE_BASE_NAME } from "./tasks-report";

const MARGIN = 14;

export async function exportTasksReportPdf(tasks: KanbanCard[], projects: Project[]): Promise<void> {
  const [{ default: jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const data = buildTasksReportData(tasks, projects);
  const doc = new jsPDF({ orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = MARGIN;

  // ── Letterhead ──────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(10, 10, 10);
  doc.text("Atlantis Utility", MARGIN, y);
  y += 7;
  doc.setFontSize(12);
  doc.text("Completed Tasks Report", MARGIN, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `Generated ${new Date(data.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
    MARGIN,
    y
  );
  y += 4;
  doc.setDrawColor(230);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
  y += 8;

  // ── Summary ─────────────────────────────────────────────────
  doc.setFontSize(9.5);
  doc.setTextColor(60);
  doc.text(
    `${data.summary.totalCompleted} tasks completed across ${data.summary.projectsTouched} project(s), by ${data.summary.contributors} contributor(s).`,
    MARGIN,
    y
  );
  y += 8;

  // ── Task list ───────────────────────────────────────────────
  if (data.tasks.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Task", "Project", "Assignee(s)", "Priority", "Due Date"]],
      body: data.tasks.map((t) => [t.title, t.projectName, t.assignees.join(", ") || "—", t.priorityLabel, t.dueDate]),
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [10, 10, 10] },
      margin: { left: MARGIN, right: MARGIN },
    });
  } else {
    doc.setFont("helvetica", "italic");
    doc.setTextColor(180);
    doc.text("No completed tasks recorded yet.", MARGIN, y);
  }

  doc.save(`${TASKS_REPORT_FILE_BASE_NAME}.pdf`);
}
