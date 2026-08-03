// Multi-section, narrative PDF export for a project completion report.
// Portrait orientation (unlike lib/export.ts's flat landscape table export),
// since this is a document with headings/paragraphs, not a wide data grid.

import type { Project } from "@/lib/mock-projects";
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";
import { buildProjectReportData } from "./project-report";
import { reportFileBaseName } from "./project-report";

const MARGIN = 14;
const MARGIN_BOTTOM = 20;

function withLastAutoTableY(doc: unknown, fallback: number): number {
  const finalY = (doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY;
  return typeof finalY === "number" ? finalY : fallback;
}

export async function exportProjectReportPdf(project: Project, tasks: KanbanCard[] = []): Promise<void> {
  const [{ default: jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const data = buildProjectReportData(project, tasks);
  const doc = new jsPDF({ orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;

  let y = MARGIN;

  function ensureSpace(next: number) {
    if (y + next > pageHeight - MARGIN_BOTTOM) {
      doc.addPage();
      y = MARGIN;
    }
  }

  function heading(text: string, size = 13) {
    ensureSpace(10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(10, 10, 10);
    doc.text(text, MARGIN, y);
    y += size === 13 ? 8 : 6;
    doc.setFont("helvetica", "normal");
  }

  function paragraph(text: string, opts: { italic?: boolean; color?: number } = {}) {
    doc.setFontSize(9.5);
    doc.setFont("helvetica", opts.italic ? "italic" : "normal");
    doc.setTextColor(opts.color ?? 60);
    const lines = doc.splitTextToSize(text, contentWidth) as string[];
    ensureSpace(lines.length * 4.6 + 2);
    doc.text(lines, MARGIN, y);
    y += lines.length * 4.6 + 3;
  }

  // ── Letterhead ──────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(10, 10, 10);
  doc.text("Atlantis Utility", MARGIN, y);
  y += 7;
  doc.setFontSize(12);
  doc.text("Project Completion Report", MARGIN, y);
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

  // ── Project overview ────────────────────────────────────────
  heading(data.project.name, 14);
  if (data.project.description) paragraph(data.project.description);
  paragraph(`Status: ${data.project.statusLabel}   ·   Priority: ${data.project.priorityLabel}   ·   Progress: ${data.progressPercent}%`, { color: 100 });
  y += 2;

  heading("Project Overview", 12);
  autoTable(doc, {
    startY: y,
    body: data.meta.map((m) => [m.label, m.value]),
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 45, textColor: [100, 100, 100] } },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = withLastAutoTableY(doc, y + 20) + 8;

  // ── Phases ───────────────────────────────────────────────────
  heading("Project Timeline", 12);
  for (const phase of data.phases) {
    ensureSpace(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(10, 10, 10);
    doc.text(`${phase.num}. ${phase.label}`, MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 112, 243);
    doc.text(phase.statusLabel, pageWidth - MARGIN, y, { align: "right" });
    y += 5.5;

    if (phase.description) {
      paragraph(phase.description);
    } else {
      paragraph("No notes recorded for this phase.", { italic: true, color: 180 });
    }

    if (phase.attachmentLines.length > 0) {
      for (const line of phase.attachmentLines) {
        const lines = doc.splitTextToSize(`•  ${line}`, contentWidth - 4) as string[];
        ensureSpace(lines.length * 4.4 + 1);
        doc.setFontSize(8.5);
        doc.setTextColor(80);
        doc.text(lines, MARGIN + 2, y);
        y += lines.length * 4.4 + 1;
      }
    }
    y += 3;
  }

  y += 2;

  // ── Completed tasks ─────────────────────────────────────────
  heading("Completed Tasks", 12);
  paragraph(`${data.tasksSummary.completed} of ${data.tasksSummary.total} linked tasks completed`, { color: 100 });
  if (data.completedTasks.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Task", "Assignee(s)", "Priority", "Due Date"]],
      body: data.completedTasks.map((t) => [t.title, t.assignees.join(", ") || "—", t.priorityLabel, t.dueDate]),
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [10, 10, 10] },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = withLastAutoTableY(doc, y + 20) + 8;
  } else {
    paragraph("No completed tasks linked to this project.", { italic: true, color: 180 });
    y += 4;
  }

  // ── Team ─────────────────────────────────────────────────────
  heading("Team", 12);
  autoTable(doc, {
    startY: y,
    head: [["Name", "Role"]],
    body: data.team.map((name, i) => [name, i === 0 ? "Owner" : "Member"]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [10, 10, 10] },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = withLastAutoTableY(doc, y + 20) + 8;

  // ── Client contacts ─────────────────────────────────────────
  heading("Client Contacts", 12);
  if (data.contacts.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Name", "Role", "Email", "Phone"]],
      body: data.contacts.map((c) => [c.name, c.role, c.email, c.phone]),
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [10, 10, 10] },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = withLastAutoTableY(doc, y + 20) + 8;
  } else {
    paragraph("No client contacts recorded.", { italic: true, color: 180 });
    y += 4;
  }

  // ── Sign-off ─────────────────────────────────────────────────
  const signOffHeight = data.signOff.length * 16 + 10;
  ensureSpace(signOffHeight);
  heading("Sign-off", 12);
  for (const row of data.signOff) {
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(`${row.role}:`, MARGIN, y);
    doc.setDrawColor(180);
    doc.line(MARGIN + 32, y, MARGIN + 100, y);
    doc.text("Date:", MARGIN + 110, y);
    doc.line(MARGIN + 122, y, pageWidth - MARGIN, y);
    y += 16;
  }

  doc.save(`${reportFileBaseName(project)}.pdf`);
}
