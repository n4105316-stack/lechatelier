import { Handler } from "@netlify/functions";

let students: any[] = [];

export const handler: Handler = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify(students),
  };
};
