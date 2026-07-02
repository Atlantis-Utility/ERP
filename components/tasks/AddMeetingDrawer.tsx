"use client";

import { useState } from "react";
import Drawer from "@/components/ui/Drawer";
import FormField, { inputClass, selectClass } from "@/components/ui/FormField";
import { useEmployees } from "@/lib/db/employees";
import { getAvatarColor, getInitials } from "@/lib/utils";
import type { KanbanCard, KanbanColumn, MeetingPlatform } from "./AddTaskDrawer";

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (card: KanbanCard) => void;
}

const PLATFORMS: { value: MeetingPlatform; label: string; color: string }[] = [
  { value: "zoom", label: "Zoom", color: "#2D8CFF" },
  { value: "meet", label: "Google Meet", color: "#34A853" },
  { value: "teams", label: "Microsoft Teams", color: "#6264A7" },
  { value: "webex", label: "Cisco Webex", color: "#00BEF3" },
  { value: "in-person", label: "In Person", color: "#f5a524" },
];

const PLATFORM_LETTERS: Record<MeetingPlatform, string> = {
  zoom: "Z",
  meet: "G",
  teams: "T",
  webex: "W",
  "in-person": "📍",
};

const DURATIONS = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
];

const emptyForm = {
  title: "",
  description: "",
  platform: "zoom" as MeetingPlatform,
  meetingUrl: "",
  meetingDate: "",
  meetingTime: "",
  duration: 60,
  column: "in-progress" as KanbanColumn,
  attendees: [] as string[],
  tags: "",
};

type FormErrors = Partial<Record<"title" | "meetingDate" | "meetingTime", string>>;

export default function AddMeetingDrawer({ open, onClose, onAdd }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const employees = useEmployees();

  function set<K extends keyof typeof emptyForm>(field: K, value: typeof emptyForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "title" && errors.title) setErrors((p) => ({ ...p, title: undefined }));
    if (field === "meetingDate" && errors.meetingDate)
      setErrors((p) => ({ ...p, meetingDate: undefined }));
    if (field === "meetingTime" && errors.meetingTime)
      setErrors((p) => ({ ...p, meetingTime: undefined }));
  }

  function toggleAttendee(name: string) {
    set(
      "attendees",
      form.attendees.includes(name)
        ? form.attendees.filter((n) => n !== name)
        : [...form.attendees, name]
    );
  }

  function validate(): boolean {
    const errs: FormErrors = {};
    if (!form.title.trim()) errs.title = "Meeting title is required";
    if (!form.meetingDate) errs.meetingDate = "Date is required";
    if (!form.meetingTime) errs.meetingTime = "Time is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    onAdd({
      id: `m-${Date.now()}`,
      type: "meeting",
      title: form.title.trim(),
      description: form.description.trim(),
      column: form.column,
      priority: "medium",
      assignees: form.attendees,
      dueDate: form.meetingDate,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      platform: form.platform,
      meetingUrl: form.meetingUrl.trim() || undefined,
      meetingDate: form.meetingDate,
      meetingTime: form.meetingTime,
      duration: form.duration,
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
      title="Schedule Meeting"
      subtitle="Set up a new meeting with your team"
      width="lg"
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
            Schedule Meeting
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest">Meeting Details</p>

        <FormField label="Meeting Title" required error={errors.title}>
          <input
            className={inputClass}
            placeholder="e.g. Q3 Planning Session"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </FormField>

        <FormField label="Agenda / Description">
          <textarea
            className={`${inputClass} resize-none`}
            rows={3}
            placeholder="What will be discussed in this meeting?"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </FormField>

        {/* Platform picker */}
        <div>
          <p className="text-xs font-medium text-[#444] mb-2">Platform</p>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => set("platform", p.value)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                  form.platform === p.value
                    ? "border-[#0070f3] bg-[#e8f2ff] text-[#0070f3]"
                    : "border-[#eaeaea] text-[#666] hover:border-[#ccc]"
                }`}
              >
                <span
                  className="w-4 h-4 rounded text-white text-[9px] font-bold flex items-center justify-center shrink-0"
                  style={{ backgroundColor: p.color }}
                >
                  {PLATFORM_LETTERS[p.value]}
                </span>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {form.platform !== "in-person" && (
          <FormField label="Meeting Link" hint="Paste your Zoom / Meet / Teams invite link">
            <input
              className={inputClass}
              type="url"
              placeholder="https://..."
              value={form.meetingUrl}
              onChange={(e) => set("meetingUrl", e.target.value)}
            />
          </FormField>
        )}

        <div className="grid grid-cols-3 gap-4">
          <FormField label="Date" required error={errors.meetingDate}>
            <input
              className={inputClass}
              type="date"
              value={form.meetingDate}
              onChange={(e) => set("meetingDate", e.target.value)}
            />
          </FormField>
          <FormField label="Time" required error={errors.meetingTime}>
            <input
              className={inputClass}
              type="time"
              value={form.meetingTime}
              onChange={(e) => set("meetingTime", e.target.value)}
            />
          </FormField>
          <FormField label="Duration">
            <select
              className={selectClass}
              value={form.duration}
              onChange={(e) => set("duration", Number(e.target.value))}
            >
              {DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Add to Column">
            <select
              className={selectClass}
              value={form.column}
              onChange={(e) => set("column", e.target.value as KanbanColumn)}
            >
              <option value="backlog">Backlog</option>
              <option value="in-progress">In Progress</option>
              <option value="review">In Review</option>
              <option value="done">Done</option>
            </select>
          </FormField>
          <FormField label="Tags" hint="Comma-separated">
            <input
              className={inputClass}
              placeholder="Planning, Q3, All-hands"
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
            />
          </FormField>
        </div>

        <div className="border-t border-[#f7f7f7] pt-4">
          <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">
            Attendees
            {form.attendees.length > 0 && (
              <span className="ml-2 normal-case font-normal text-[#0070f3]">
                {form.attendees.length} selected
              </span>
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {employees.map((emp) => {
            const selected = form.attendees.includes(emp.name);
            const colors = getAvatarColor(emp.name);
            return (
              <button
                key={emp.id}
                type="button"
                onClick={() => toggleAttendee(emp.name)}
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
