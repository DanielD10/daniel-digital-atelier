import { describe, expect, it } from "vitest";
import { checkPublicHost, hostIsPrivate, ident, scrub } from "./warehouse";

/**
 * The warehouse path takes other people's database credentials and
 * opens outbound connections on their say-so. Every guard around that
 * is asserted here, because these are the failures that end a company
 * rather than annoy a user, and they are all one careless edit away.
 */

describe("private address refusal", () => {
  // A public endpoint that dials anything it is told to is a port
  // scanner for whatever network it happens to run in.
  const mustBlock = [
    ["localhost", "postgresql://u:p@localhost:5432/db"],
    ["loopback", "postgresql://u:p@127.0.0.1:5432/db"],
    ["loopback range", "postgresql://u:p@127.9.9.9:5432/db"],
    ["private 10/8", "postgresql://u:p@10.0.0.5:5432/db"],
    ["private 192.168/16", "postgresql://u:p@192.168.1.1:5432/db"],
    ["private 172.16/12 low", "postgresql://u:p@172.16.0.1:5432/db"],
    ["private 172.16/12 high", "postgresql://u:p@172.31.255.254:5432/db"],
    ["cloud metadata", "postgresql://u:p@169.254.169.254:5432/db"],
    ["ipv6 loopback", "postgresql://u:p@[::1]:5432/db"],
    ["ipv6 unique-local", "postgresql://u:p@[fd00::1]:5432/db"],
    ["ipv6 link-local", "postgresql://u:p@[fe80::1]:5432/db"],
    [".internal", "postgresql://u:p@db.internal:5432/db"],
    [".local", "postgresql://u:p@nas.local:5432/db"],
    ["this network", "postgresql://u:p@0.0.0.0:5432/db"],
    ["unparseable", "not a url at all"],
  ] as const;

  for (const [label, dsn] of mustBlock) {
    it(`refuses ${label}`, () => {
      expect(checkPublicHost(dsn)).not.toBeNull();
    });
  }

  const mustAllow = [
    ["supabase", "postgresql://u:p@db.abcdef.supabase.co:5432/postgres"],
    ["neon", "postgresql://u:p@ep-cool-1.us-east-2.aws.neon.tech/neondb"],
    ["rds", "postgresql://u:p@x.abc.us-east-1.rds.amazonaws.com:5432/prod"],
    ["public ip", "postgresql://u:p@203.0.113.10:5432/db"],
    // The boundaries either side of each private range.
    ["just past 172.31", "postgresql://u:p@172.32.0.1:5432/db"],
    ["just past 10/8", "postgresql://u:p@11.0.0.1:5432/db"],
    ["not 169.254", "postgresql://u:p@169.253.0.1:5432/db"],
  ] as const;

  for (const [label, dsn] of mustAllow) {
    it(`allows ${label}`, () => {
      expect(checkPublicHost(dsn)).toBeNull();
    });
  }

  it("is not fooled by case or brackets", () => {
    expect(hostIsPrivate("LOCALHOST")).toBe(true);
    expect(hostIsPrivate("[::1]")).toBe(true);
  });
});

describe("credential scrubbing", () => {
  /*
   * A driver error quotes the thing that failed, which is sometimes
   * the whole connection string. Echoed into an HTTP response, that is
   * a password in a browser history and in the platform's request log.
   */
  it("removes the keyword form", () => {
    expect(scrub("could not connect: password=hunter2 host=x")).not.toContain("hunter2");
  });

  it("removes the authority form, which the keyword pattern misses", () => {
    const out = scrub("FATAL: auth failed for postgresql://nexus_ro:s3cret@db.example.com:5432/p");
    expect(out).not.toContain("s3cret");
    expect(out).toContain("db.example.com"); // the useful part survives
  });

  it("handles an encoded password", () => {
    expect(scrub("postgres://admin:p%40ss%21word@db.example.com/prod timed out")).not.toContain("p%40ss");
  });

  it("leaves an ordinary message alone", () => {
    const msg = "relation \"orders\" does not exist";
    expect(scrub(msg)).toBe(msg);
  });
});

describe("identifier quoting", () => {
  /*
   * Table and column names cannot be bound as parameters, so they are
   * quoted. The guarantee is that whatever arrives comes back as ONE
   * identifier and can never close the quote and start a statement.
   */
  it("wraps in double quotes", () => {
    expect(ident("orders")).toBe('"orders"');
  });

  it("neutralises an embedded quote by doubling it", () => {
    const out = ident('region"; drop table orders; --');
    expect(out.startsWith('"')).toBe(true);
    expect(out.endsWith('"')).toBe(true);
    // Every inner quote is doubled, so nothing terminates the literal early.
    const inner = out.slice(1, -1);
    expect(inner.replace(/""/g, "")).not.toContain('"');
  });

  it("does not let a semicolon escape the identifier", () => {
    const out = ident("a; delete from x");
    expect(out).toBe('"a; delete from x"');
  });

  it("survives a backslash, which does not escape in a quoted identifier", () => {
    expect(ident('a\\"b')).toBe('"a\\""b"');
  });
});
