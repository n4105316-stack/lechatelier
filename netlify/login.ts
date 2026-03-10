import { Handler } from "@netlify/functions";

let students: any[] = [];

export const handler: Handler = async (event) => {
  const body = JSON.parse(event.body || "{}");

  const { name, className, role } = body;

  if (!name) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Nama wajib diisi" }),
    };
  }

  const user = {
    id: Date.now(),
    name,
    class: className,
    role,
    progress: 0,
  };

  students.push(user);

  return {
    statusCode: 200,
    body: JSON.stringify(user),
  };
};
