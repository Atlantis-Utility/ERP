// Consolidated Word export listing every completed task across all projects.

import type { Project } from "@/lib/mock-projects";
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";
import { downloadBlob } from "@/lib/export";
import { buildTasksReportData, TASKS_REPORT_FILE_BASE_NAME } from "./tasks-report";

export async function exportTasksReportDocx(tasks: KanbanCard[], projects: Project[]): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = await import("docx");

  const data = buildTasksReportData(tasks, projects);

  const taskTableRows =
    data.tasks.length > 0
      ? [
          new TableRow({
            tableHeader: true,
            children: ["Task", "Project", "Assignee(s)", "Priority", "Due Date"].map(
              (h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })
            ),
          }),
          ...data.tasks.map(
            (t) =>
              new TableRow({
                children: [t.title, t.projectName, t.assignees.join(", ") || "—", t.priorityLabel, t.dueDate].map(
                  (v) => new TableCell({ children: [new Paragraph(v)] })
                ),
              })
          ),
        ]
      : [];

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: "Atlantis Utility", bold: true, size: 32 })] }),
          new Paragraph({ children: [new TextRun({ text: "Completed Tasks Report", size: 26 })], spacing: { after: 100 } }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated ${new Date(data.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
                color: "999999",
                size: 18,
              }),
            ],
            spacing: { after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun({
                text: `${data.summary.totalCompleted} tasks completed across ${data.summary.projectsTouched} project(s), by ${data.summary.contributors} contributor(s).`,
                color: "666666",
              }),
            ],
            spacing: { after: 200 },
          }),

          new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Completed Tasks" }),
          ...(data.tasks.length > 0
            ? [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: taskTableRows })]
            : [new Paragraph({ children: [new TextRun({ text: "No completed tasks recorded yet.", italics: true, color: "999999" })] })]),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(`${TASKS_REPORT_FILE_BASE_NAME}.docx`, blob);
}
