"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import Drawer from "@/components/ui/Drawer";
import FormField, { inputClass, selectClass } from "@/components/ui/FormField";
import DateTimePicker from "@/components/ui/DateTimePicker";
import { useEmployees } from "@/lib/db/employees";
import { getAvatarColor, getInitials } from "@/lib/utils";

export type KanbanColumn = "backlog" | "in-progress" | "review" | "done";
export type KanbanPriority = "high" | "medium" | "low";
export type MeetingPlatform = "zoom" | "meet" | "teams" | "webex" | "in-person";

export interface KanbanCard {
  id: string;
  type: "task" | "meeting" | "project";
  title: string;
  description: string;
  column: KanbanColumn;
  priority: KanbanPriority;
  assignees: string[];
  dueDate: string;
  dueDateTbd?: boolean;
  tags: string[];
  platform?: MeetingPlatform;
  meetingUrl?: string;
  meetingDate?: string;
  meetingTime?: string;
  duration?: number;
  projectId?: string;
  progress?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (card: KanbanCard) => void;
  defaultColumn?: KanbanColumn;
}

const emptyForm = {
  title: "",
  description: "",
  column: "backlog" as KanbanColumn,
  priority: "medium" as KanbanPriority,
  dueDate: "",
  dueDateTbd: false,
  tags: "",
  assignees: [] as string[],
};

type FormErrors = Partial<Record<"title" | "dueDate", string>>;

export default function AddTaskDrawer({ open, onClose, onAdd, defaultColumn }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const employees = useEmployees();

  function set<K extends keyof typeof emptyForm>(field: K, value: typeof emptyForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "title" && errors.title) setErrors((p) => ({ ...p, title: undefined }));
    if ((field === "dueDate" || field === "dueDateTbd") && errors.dueDate) setErrors((p) => ({ ...p, dueDate: undefined }));
  }

  function toggleAssignee(name: string) {
    set(
      "assignees",
      form.assignees.includes(name)
        ? form.assignees.filter((n) => n !== name)
        : [...form.assignees, name]
    );
  }

  function validate(): boolean {
    const errs: FormErrors = {};
    if (!form.title.trim()) errs.title = "Title is required";
    if (!form.dueDateTbd && !form.dueDate) errs.dueDate = "Set a due date or mark as To be decided";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    onAdd({
      id: `t-${Date.now()}`,
      type: "task",
      title: form.title.trim(),
      description: form.description.trim(),
      column: defaultColumn ?? form.column,
      priority: form.priority,
      assignees: form.assignees,
      dueDate: form.dueDateTbd ? "" : form.dueDate,
      dueDateTbd: form.dueDateTbd || undefined,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
    setForm(emptyForm);
    setErrors({});
    onClose();
  }

  function handleClose() {
    setForm(emptyForm);
    setErrors({});
    onClose();
  }

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title="New Task"
      subtitle="Add a task to the board"
      footer={
        <>
          <button
            onClick={handleClose}
            className="border border-[#eaeaea] bg-white text-sm font-medium text-[#444] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="bg-[#0a0a0a] text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-[#333] transition-colors"
          >
            Create Task
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest">Task Details</p>

        <FormField label="Title" required error={errors.title}>
          <input
            className={inputClass}
            placeholder="e.g. Fix authentication bug"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </FormField>

        <FormField label="Description">
          <textarea
            className={`${inputClass} resize-none`}
            rows={3}
            placeholder="Describe what needs to be done..."
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Column">
            <select
              className={selectClass}
              value={defaultColumn ?? form.column}
              disabled={!!defaultColumn}
              onChange={(e) => set("column", e.target.value as KanbanColumn)}
            >
              <option value="backlog">Backlog</option>
              <option value="in-progress">In Progress</option>
              <option value="review">In Review</option>
              <option value="done">Done</option>
            </select>
          </FormField>
          <FormField label="Priority">
            <select
              className={selectClass}
              value={form.priority}
              onChange={(e) => set("priority", e.target.value as KanbanPriority)}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </FormField>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-[#444]">
              Due Date
              {!form.dueDateTbd && <span className="text-[#f31260] ml-0.5">*</span>}
            </span>
            <button
              type="button"
              onClick={() => set("dueDateTbd", !form.dueDateTbd)}
              className="flex items-center gap-1.5 text-[10px] text-[#999] hover:text-[#555] transition-colors select-none"
            >
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                form.dueDateTbd
                  ? "bg-[#0a0a0a] border-[#0a0a0a]"
                  : "border-[#d4d4d4] hover:border-[#999]"
              }`}>
                {form.dueDateTbd && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              To be decided
            </button>
          </div>
          {form.dueDateTbd ? (
            <div className="flex items-center h-9 px-3 rounded-lg border border-dashed border-[#e0e0e0] bg-[#fafafa] text-sm text-[#bbb]">
              Will be set later
            </div>
          ) : (
            <DateTimePicker
              dateOnly
              value={form.dueDate}
              onChange={(v) => set("dueDate", v)}
            />
          )}
          {errors.dueDate && (
            <p className="mt-1 text-[11px] text-[#f31260]">{errors.dueDate}</p>
          )}
        </div>

        <FormField label="Tags" hint="Comma-separated, e.g. Engineering, Bug, Urgent">
          <input
            className={inputClass}
            placeholder="Engineering, Bug, Urgent"
            value={form.tags}
            onChange={(e) => set("tags", e.target.value)}
          />
        </FormField>

        <div className="border-t border-[#f7f7f7] pt-4">
          <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">
            Assign To
            {form.assignees.length > 0 && (
              <span className="ml-2 normal-case font-normal text-[#0070f3]">
                {form.assignees.length} selected
              </span>
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {employees.map((emp) => {
            const selected = form.assignees.includes(emp.name);
            const colors = getAvatarColor(emp.name);
            return (
              <button
                key={emp.id}
                type="button"
                onClick={() => toggleAssignee(emp.name)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                  selected
                    ? "border-[#0070f3] bg-[#e8f2ff]"
                    : "border-[#eaeaea] hover:border-[#ccc] hover:bg-[#fafafa]"
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full ${selected ? "bg-[#0070f3]" : colors.bg} ${
                    selected ? "text-white" : colors.text
                  } flex items-center justify-center shrink-0`}
                >
                  <span className="text-[10px] font-semibold">{getInitials(emp.name)}</span>
                </div>
                <div className="min-w-0">
                  <p
                    className={`text-xs font-medium truncate ${
                      selected ? "text-[#0070f3]" : "text-[#0a0a0a]"
                    }`}
                  >
                    {emp.name}
                  </p>
                  <p className="text-[10px] text-[#999] truncate">{emp.department}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Drawer>
  );
}
