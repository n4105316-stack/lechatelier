import { Handler } from "@netlify/functions";

let students: any[] = [];

export const handler: Handler = async (event) => {
  const body = JSON.parse(event.body || "{}");

  const { studentId, progress } = body;

  const student = students.find((s) => s.id === studentId);

  if (student) {
    student.progress = progress;
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true }),
  };
};
