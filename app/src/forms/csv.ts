import { getFileUrl } from "@/walrus/client";
import type { FormSchema, SubmissionPayload, SubmissionValue } from "./types";

export interface CsvSubmission {
  payload: SubmissionPayload;
  walrusBlobId: string;
}

export function exportCsv(schema: FormSchema, submissions: CsvSubmission[]): string {
  const headers = ["submission_id", "submitted_at", ...schema.fields.map((f) => f.label)];
  const lines = [headers.map(csvCell).join(",")];

  for (const { payload: sub, walrusBlobId } of submissions) {
    const row: string[] = [
      "",
      new Date(sub.submittedAt).toISOString(),
      ...schema.fields.map((f) => valueToCell(sub.values[f.id], walrusBlobId)),
    ];
    lines.push(row.map(csvCell).join(","));
  }

  return lines.join("\n");
}

function valueToCell(v: SubmissionValue | undefined, walrusBlobId: string): string {
  if (!v) return "";
  switch (v.type) {
    case "text":
    case "url":
    case "dropdown":
      return v.value;
    case "checkbox":
      return v.value.join("; ");
    case "stars":
      return String(v.value);
    case "file":
      return getFileUrl(v.blobId, walrusBlobId);
    case "file_pending":
      return v.file.name;
  }
}

function csvCell(s: string): string {
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
