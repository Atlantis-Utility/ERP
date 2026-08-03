// Word (.docx) export mirroring the PDF's sections, built from the same
// shared ProjectReportData so preview/PDF/Word never drift out of sync.

import type { Project } from "@/lib/mock-projects";
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";
import { downloadBlob } from "@/lib/export";
import { buildProjectReportData, reportFileBaseName } from "./project-report";

export async function exportProjectReportDocx(project: Project, tasks: KanbanCard[] = []): Promise<void> {
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
    WidthType, BorderStyle,
  } = await import("docx");

  const data = buildProjectReportData(project, tasks);

  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: data.meta.map(
      (row) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: row.label, bold: true, color: "666666" })] })],
            }),
            new TableCell({
              width: { size: 70, type: WidthType.PERCENTAGE },
              children: [new Paragraph(row.value)],
            }),
          ],
        })
    ),
  });

  const teamTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Name", bold: true })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Role", bold: true })] })] }),
        ],
      }),
      ...data.team.map(
        (name, i) =>
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(name)] }),
              new TableCell({ children: [new Paragraph(i === 0 ? "Owner" : "Member")] }),
            ],
          })
      ),
    ],
  });

  const contactsSection =
    data.contacts.length > 0
      ? [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: ["Name", "Role", "Email", "Phone"].map(
                  (h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })
                ),
              }),
              ...data.contacts.map(
                (c) =>
                  new TableRow({
                    children: [c.name, c.role, c.email, c.phone].map((v) => new TableCell({ children: [new Paragraph(v)] })),
                  })
              ),
            ],
          }),
        ]
      : [new Paragraph({ children: [new TextRun({ text: "No client contacts recorded.", italics: true, color: "999999" })] })];

  const phaseChildren = data.phases.flatMap((phase) => [
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [
        new TextRun({ text: `${phase.num}. ${phase.label}  ` }),
        new TextRun({ text: phase.statusLabel, color: "0070F3", bold: true }),
      ],
    }),
    phase.description
      ? new Paragraph({ text: phase.description, spacing: { after: 100 } })
      : new Paragraph({ children: [new TextRun({ text: "No notes recorded for this phase.", italics: true, color: "999999" })], spacing: { after: 100 } }),
    ...phase.attachmentLines.map((line) => new Paragraph({ text: line, bullet: { level: 0 } })),
  ]);

  const tasksSection =
    data.completedTasks.length > 0
      ? [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: ["Task", "Assignee(s)", "Priority", "Due Date"].map(
                  (h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })
                ),
              }),
              ...data.completedTasks.map(
                (t) =>
                  new TableRow({
                    children: [t.title, t.assignees.join(", ") || "—", t.priorityLabel, t.dueDate].map(
                      (v) => new TableCell({ children: [new Paragraph(v)] })
                    ),
                  })
              ),
            ],
          }),
        ]
      : [new Paragraph({ children: [new TextRun({ text: "No completed tasks linked to this project.", italics: true, color: "999999" })] })];

  const signOffTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: data.signOff.map(
      (row) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({ text: `${row.role}:`, spacing: { before: 300 } }),
                new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "AAAAAA" } }, spacing: { before: 200 } }),
              ],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({ text: "Date:", spacing: { before: 300 } }),
                new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "AAAAAA" } }, spacing: { before: 200 } }),
              ],
            }),
          ],
        })
    ),
  });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: "Atlantis Utility", bold: true, size: 32 })] }),
          new Paragraph({ children: [new TextRun({ text: "Project Completion Report", size: 26 })], spacing: { after: 100 } }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated ${new Date(data.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
                color: "999999",
                size: 18,
              }),
            ],
            spacing: { after: 300 },
          }),

          new Paragraph({ heading: HeadingLevel.HEADING_1, text: data.project.name }),
          ...(data.project.description ? [new Paragraph({ text: data.project.description, spacing: { after: 100 } })] : []),
          new Paragraph({
            children: [
              new TextRun({
                text: `Status: ${data.project.statusLabel}   ·   Priority: ${data.project.priorityLabel}   ·   Progress: ${data.progressPercent}%`,
                color: "666666",
              }),
            ],
            spacing: { after: 200 },
          }),

          new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Project Overview" }),
          metaTable,
          new Paragraph({ text: "", spacing: { after: 200 } }),

          new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Project Timeline" }),
          ...phaseChildren,
          new Paragraph({ text: "", spacing: { after: 100 } }),

          new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Completed Tasks" }),
          new Paragraph({
            children: [
              new TextRun({
                text: `${data.tasksSummary.completed} of ${data.tasksSummary.total} linked tasks completed`,
                color: "666666",
              }),
            ],
            spacing: { after: 100 },
          }),
          ...tasksSection,
          new Paragraph({ text: "", spacing: { after: 200 } }),

          new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Team" }),
          teamTable,
          new Paragraph({ text: "", spacing: { after: 200 } }),

          new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Client Contacts" }),
          ...contactsSection,
          new Paragraph({ text: "", spacing: { after: 200 } }),

          new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Sign-off" }),
          signOffTable,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(`${reportFileBaseName(project)}.docx`, blob);
}
