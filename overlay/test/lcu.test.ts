import { describe, it, expect } from "vitest";
import { parseLockfile, parseArgs } from "../src/main/lcu/connector.js";

describe("parseLockfile", () => {
  it("parses name:pid:port:password:protocol", () => {
    expect(parseLockfile("LeagueClient:12345:54321:abcTOKEN:https")).toEqual({
      port: 54321,
      token: "abcTOKEN",
    });
  });
  it("returns null on malformed", () => {
    expect(parseLockfile("garbage")).toBeNull();
  });
});

describe("parseArgs", () => {
  it("extracts port and token from process args", () => {
    const cmd =
      '"LeagueClientUx.exe" --app-port=63215 --remoting-auth-token=Xy-9_abc --other';
    expect(parseArgs(cmd)).toEqual({ port: 63215, token: "Xy-9_abc" });
  });
  it("returns null when args missing", () => {
    expect(parseArgs("LeagueClientUx --foo")).toBeNull();
  });
});
