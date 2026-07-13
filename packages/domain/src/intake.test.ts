import { describe, expect, it } from "vitest";
import { mapIntakePayload, parseCsv, type IntakeFieldMap } from "./intake";
import { intakeDedupeHash, signIntakePayload, verifyIntakeSignature } from "./webhook";

const FIELD_MAP: IntakeFieldMap = {
  name: ["name", "full_name"],
  email: ["email"],
  phone: ["phone", "tel"],
  country: ["country"],
  investable_range: ["investable_range", "aum"],
  message: ["message"],
};

describe("mapIntakePayload", () => {
  it("maps via alias order and normalizes email casing", () => {
    const mapped = mapIntakePayload(
      { full_name: "Maria Silva", email: "Maria@Example.COM", tel: "+55 11 99999", country: "BR" },
      FIELD_MAP,
    );
    expect(mapped).toEqual({
      name: "Maria Silva",
      email: "maria@example.com",
      phone: "+55 11 99999",
      country: "BR",
      investable_range: null,
      message: null,
    });
  });

  it("ignores empty strings and accepts numbers", () => {
    const mapped = mapIntakePayload({ name: "  ", full_name: "A", aum: 500000 }, FIELD_MAP);
    expect(mapped.name).toBe("A");
    expect(mapped.investable_range).toBe("500000");
  });
});

describe("HMAC signature verification", () => {
  const secret = "test-secret";
  const body = '{"email":"a@b.com","name":"A"}';

  it("accepts a valid signature, with or without the sha256= prefix", () => {
    const sig = signIntakePayload(body, secret);
    expect(verifyIntakeSignature(body, sig, secret)).toBe(true);
    expect(verifyIntakeSignature(body, `sha256=${sig}`, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = signIntakePayload(body, secret);
    expect(verifyIntakeSignature(body + " ", sig, secret)).toBe(false);
  });

  it("rejects a wrong secret, a missing header and malformed hex", () => {
    const sig = signIntakePayload(body, "other-secret");
    expect(verifyIntakeSignature(body, sig, secret)).toBe(false);
    expect(verifyIntakeSignature(body, null, secret)).toBe(false);
    expect(verifyIntakeSignature(body, "not-hex", secret)).toBe(false);
  });
});

describe("intakeDedupeHash", () => {
  it("is stable under key order (idempotent replays)", () => {
    const a = intakeDedupeHash("a@b.com", "2026-07-13", { x: 1, y: { b: 2, a: 1 } });
    const b = intakeDedupeHash("a@b.com", "2026-07-13", { y: { a: 1, b: 2 }, x: 1 });
    expect(a).toBe(b);
  });

  it("changes with email, date or payload", () => {
    const base = intakeDedupeHash("a@b.com", "2026-07-13", { x: 1 });
    expect(intakeDedupeHash("c@d.com", "2026-07-13", { x: 1 })).not.toBe(base);
    expect(intakeDedupeHash("a@b.com", "2026-07-14", { x: 1 })).not.toBe(base);
    expect(intakeDedupeHash("a@b.com", "2026-07-13", { x: 2 })).not.toBe(base);
  });
});

describe("parseCsv", () => {
  it("parses header + records with quoted commas and escaped quotes", () => {
    const rows = parseCsv('name,email,message\n"Silva, Maria",m@x.com,"said ""hi"""\nJoao,j@x.com,ola\n');
    expect(rows).toEqual([
      { name: "Silva, Maria", email: "m@x.com", message: 'said "hi"' },
      { name: "Joao", email: "j@x.com", message: "ola" },
    ]);
  });

  it("returns [] for empty input and skips blank lines", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("a,b\n\n1,2\n\n")).toEqual([{ a: "1", b: "2" }]);
  });
});
