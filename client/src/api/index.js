/*
  The whole UI talks to the server only through this file.

  Step 1: a mock that stored data in the browser.
  Step 2 (now): the real REST client for the Node + MongoDB backend in /server.
*/
export * from "./httpApi";
