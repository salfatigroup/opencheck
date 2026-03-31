import { describe, it, expect } from "vitest";
import { SecretMasker } from "../../../src/output/secret-masker.ts";

describe("SecretMasker", () => {
  it("masks a single secret in text", () => {
    const masker = new SecretMasker(["my-password"]);
    expect(masker.mask("login with my-password")).toBe("login with ***");
  });

  it("masks multiple secrets in text", () => {
    const masker = new SecretMasker(["password", "token123"]);
    expect(masker.mask("password and token123")).toBe("*** and ***");
  });

  it("masks all occurrences of a secret", () => {
    const masker = new SecretMasker(["secret"]);
    expect(masker.mask("secret-secret-secret")).toBe("***-***-***");
  });

  it("returns text unchanged when no secrets match", () => {
    const masker = new SecretMasker(["password"]);
    expect(masker.mask("nothing to hide")).toBe("nothing to hide");
  });

  it("handles empty secrets array", () => {
    const masker = new SecretMasker([]);
    expect(masker.mask("nothing changes")).toBe("nothing changes");
    expect(masker.hasSecrets).toBe(false);
  });

  it("reports hasSecrets correctly", () => {
    expect(new SecretMasker(["secret"]).hasSecrets).toBe(true);
    expect(new SecretMasker([]).hasSecrets).toBe(false);
  });

  it("ignores empty strings in secrets list", () => {
    const masker = new SecretMasker(["", "real-secret"]);
    expect(masker.mask("real-secret")).toBe("***");
    expect(masker.mask("hello")).toBe("hello");
  });

  it("escapes regex special characters in secrets", () => {
    const masker = new SecretMasker(["pass.word+123"]);
    expect(masker.mask("use pass.word+123 here")).toBe("use *** here");
  });
});
