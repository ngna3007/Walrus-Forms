import type { FormSchema, SubmissionPayload, SubmissionValue } from "./types";

export function exportCsv(schema: FormSchema, submissions: SubmissionPayload[]): string {
  const headers = ["submission_id", "submitted_at", ...schema.fields.map((f) => f.label)];
  const lines = [headers.map(csvCell).join(",")];

  for (const sub of submissions) {
    const row: string[] = [
      "",
      new Date(sub.submittedAt).toISOString(),
      ...schema.fields.map((f) => valueToCell(sub.values[f.id])),
    ];
    lines.push(row.map(csvCell).join(","));
  }

  return lines.join("\n");
}

function valueToCell(v: SubmissionValue | undefined): string {
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
      return v.blobId;
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
