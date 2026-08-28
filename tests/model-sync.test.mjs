// Tests fuer die reine Logik von tools/model-sync.mjs.
// Kein Netz, kein Dateisystem, kein Key. Aufruf: node --test
//
// Geprueft wird genau das, was im Ernstfall Schaden anrichtet: die
// Katalog-Validierung (fail-closed), die Generationsauswahl, die Denyliste,
// die Eigentumsgrenze (was darf entfernt werden) und die Sidecar-Fortschreibung.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DENYLIST,
  assertAllowedBaseUrl,
  compareVersions,
  family,
  nextManaged,
  normalizeCatalog,
  planSync,
  selectCurrentGeneration,
} from "../tools/model-sync.mjs";

// --- Basis-URL: der Key darf nie an einen fremden Host ---------------------

test("assertAllowedBaseUrl akzeptiert den offiziellen Endpunkt", () => {
  assert.equal(
    assertAllowedBaseUrl("https://opencode.ai/zen/go/v1"),
    "https://opencode.ai/zen/go/v1",
  );
});

for (const [name, value] of [
  ["fremder Host", "https://evil.example.com/v1"],
  ["kein HTTPS", "http://opencode.ai/zen/go/v1"],
  ["Subdomain-Trick", "https://opencode.ai.evil.example.com/v1"],
  ["Praefix-Trick", "https://notopencode.ai/v1"],
  ["keine URL", "opencode.ai"],
  ["leer", ""],
]) {
  test(`assertAllowedBaseUrl lehnt ab: ${name}`, () => {
    assert.throws(() => assertAllowedBaseUrl(value));
  });
}

// --- Katalog-Validierung: fail-closed -------------------------------------

test("normalizeCatalog akzeptiert eine saubere Liste", () => {
  const r = normalizeCatalog({ data: [{ id: "glm-5.2" }, { id: "minimax-m3" }] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ids, ["glm-5.2", "minimax-m3"]);
});

test("normalizeCatalog trimmt und entdoppelt IDs", () => {
  const r = normalizeCatalog({ data: [{ id: " glm-5.2 " }, { id: "glm-5.2" }, "minimax-m3"] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ids, ["glm-5.2", "minimax-m3"]);
});

test("normalizeCatalog verwirft kaputte Eintraege, behaelt gute", () => {
  const r = normalizeCatalog({ data: [{ id: "" }, { id: null }, 42, null, { id: "glm-5.2" }] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ids, ["glm-5.2"]);
  assert.equal(r.dropped, 4);
});

for (const [name, payload] of [
  ["null", null],
  ["Array statt Objekt", []],
  ["String", "nope"],
  ["data fehlt", { models: [] }],
  ["data ist kein Array", { data: { id: "x" } }],
  ["leere Liste", { data: [] }],
  ["nur unbrauchbare Eintraege", { data: [{ id: "" }, null, 7] }],
]) {
  test(`normalizeCatalog bricht ab: ${name}`, () => {
    const r = normalizeCatalog(payload);
    assert.equal(r.ok, false, `${name} haette abgelehnt werden muessen`);
    assert.ok(r.error);
  });
}

// --- Familien- und Versionsvergleich --------------------------------------

test("family maskiert Version und Ausbaustufe aus", () => {
  assert.equal(family("mimo-v2-pro"), family("mimo-v2.5-pro"));
  assert.equal(family("glm-5"), family("glm-5.3"));
  assert.notEqual(family("glm-5"), family("minimax-m3"));
});

test("compareVersions vergleicht mehrstellig korrekt", () => {
  assert.ok(compareVersions("glm-5.10", "glm-5.9") > 0, "5.10 ist neuer als 5.9");
  assert.ok(compareVersions("glm-5.2", "glm-5.3") < 0);
  assert.equal(compareVersions("glm-5.2", "glm-5.2"), 0);
});

test("selectCurrentGeneration behaelt nur die aktuelle Generation", () => {
  const { wanted, supersededBy } = selectCurrentGeneration(["glm-5", "glm-5.2", "glm-5.3", "minimax-m3"]);
  assert.deepEqual([...wanted].sort(), ["glm-5.3", "minimax-m3"]);
  assert.equal(supersededBy.get("glm-5"), "glm-5.3");
  assert.equal(supersededBy.get("glm-5.2"), "glm-5.3");
});

test("selectCurrentGeneration haelt Ausbaustufen derselben Generation nebeneinander", () => {
  const { wanted } = selectCurrentGeneration(["mimo-v2.5", "mimo-v2.5-pro", "mimo-v2-pro"]);
  assert.ok(wanted.has("mimo-v2.5"));
  assert.ok(wanted.has("mimo-v2.5-pro"));
  assert.ok(!wanted.has("mimo-v2-pro"), "aeltere Generation faellt weg");
});

test("selectCurrentGeneration ueberspringt Preview- und Auslaufkennzeichen", () => {
  const { wanted } = selectCurrentGeneration(["hy3", "hy3-preview", "foo-beta", "bar-deprecated"]);
  assert.deepEqual([...wanted], ["hy3"]);
});

// --- Plan: Aufnahme --------------------------------------------------------

const base = {
  upstreamIds: ["glm-5.3", "minimax-m3"],
  existingModels: [],
  managed: new Set(),
  routedIds: new Set(),
  nativeSlugs: new Set(),
  denylist: new Set(),
  providerIds: ["opencode-go", "opencode-go-messages"],
};

test("planSync nimmt neue Modelle auf", () => {
  const p = planSync({ ...base });
  assert.deepEqual(p.toAdd.map((a) => a.id).sort(), ["glm-5.3", "minimax-m3"]);
});

test("planSync ueberspringt Denylist-Treffer bei der Neuaufnahme", () => {
  const p = planSync({ ...base, denylist: new Set(["glm-5.3"]) });
  assert.deepEqual(p.toAdd.map((a) => a.id), ["minimax-m3"]);
  assert.deepEqual(p.skipped.filter((s) => s.reason === "denylisted").map((s) => s.id), ["glm-5.3"]);
});

test("planSync ueberspringt Kollision mit einem nativen Modell", () => {
  const p = planSync({ ...base, nativeSlugs: new Set(["glm-5.3"]) });
  assert.deepEqual(p.skipped.filter((s) => s.reason === "native_collision").map((s) => s.id), ["glm-5.3"]);
  assert.ok(!p.toAdd.some((a) => a.id === "glm-5.3"));
});

test("planSync nimmt nichts auf, was schon geroutet gelistet ist", () => {
  const p = planSync({ ...base, routedIds: new Set(["glm-5.3", "minimax-m3"]) });
  assert.deepEqual(p.toAdd, []);
});

test("planSync ueberspringt ungeklaertes Protokoll mit stabilem Reason-Code", () => {
  const p = planSync({
    ...base,
    blockReasonFor: (id) => (id === "minimax-m3" ? "protocol not verified" : undefined),
  });
  assert.deepEqual(p.toAdd.map((a) => a.id), ["glm-5.3"]);
  const blocked = p.skipped.filter((s) => s.reason === "blocked_unverified_protocol");
  assert.deepEqual(blocked.map((s) => s.id), ["minimax-m3"]);
  assert.match(blocked[0].detail, /not verified/);
});

test("planSync faengt einen werfenden Protokoll-Resolver ab, statt abzustuerzen", () => {
  const p = planSync({
    ...base,
    providerIdFor: (id) => {
      if (id === "minimax-m3") throw new Error("cannot be added safely");
      return "opencode-go";
    },
  });
  assert.deepEqual(p.toAdd.map((a) => a.id), ["glm-5.3"]);
  assert.equal(p.skipped.find((s) => s.id === "minimax-m3").reason, "blocked_unverified_protocol");
});

test("planSync uebernimmt die Provider-ID aus der Kuration", () => {
  const p = planSync({
    ...base,
    upstreamIds: ["kimi-k4"],
    providerIdFor: () => "opencode-go-messages",
  });
  assert.deepEqual(p.toAdd, [{ id: "kimi-k4", providerId: "opencode-go-messages" }]);
});

// --- Plan: Eigentumsgrenze beim Entfernen ---------------------------------

const managedEntry = { slug: "opencode-go/glm-5", provider: "opencode-go", upstreamModel: "glm-5" };
const handEntry = { slug: "opencode-go/handkuriert", provider: "opencode-go", upstreamModel: "handkuriert" };

test("planSync entfernt nur selbst angelegte, abgeloeste Eintraege", () => {
  const p = planSync({
    ...base,
    upstreamIds: ["glm-5", "glm-5.3"],
    existingModels: [managedEntry],
    managed: new Set(["opencode-go/glm-5"]),
  });
  assert.deepEqual(p.toRemove, [{ slug: "opencode-go/glm-5", reason: "superseded" }]);
  assert.deepEqual(p.conflicts, []);
});

test("planSync fasst handkuratierte Eintraege NIE an, sondern meldet sie", () => {
  const p = planSync({
    ...base,
    upstreamIds: ["glm-5.3"],
    existingModels: [handEntry],
    managed: new Set(),
  });
  assert.deepEqual(p.toRemove, []);
  assert.deepEqual(p.conflicts, [{ slug: "opencode-go/handkuriert", reason: "gone_upstream" }]);
});

test("planSync entfernt verwaltete Denylist-Treffer, meldet unverwaltete nur", () => {
  const verwaltet = { slug: "opencode-go/kimi-k3", provider: "opencode-go", upstreamModel: "kimi-k3" };
  const fremd = { slug: "opencode-go/kimi-k3", provider: "opencode-go", upstreamModel: "kimi-k3" };

  const a = planSync({
    ...base,
    upstreamIds: ["kimi-k3", "glm-5.3"],
    existingModels: [verwaltet],
    managed: new Set(["opencode-go/kimi-k3"]),
    denylist: new Set(["kimi-k3"]),
  });
  assert.deepEqual(a.toRemove, [{ slug: "opencode-go/kimi-k3", reason: "denylisted" }]);

  const b = planSync({
    ...base,
    upstreamIds: ["kimi-k3", "glm-5.3"],
    existingModels: [fremd],
    managed: new Set(),
    denylist: new Set(["kimi-k3"]),
  });
  assert.deepEqual(b.toRemove, []);
  assert.deepEqual(b.conflicts, [{ slug: "opencode-go/kimi-k3", reason: "denylisted" }]);
});

test("planSync ignoriert fremde Provider vollstaendig", () => {
  const fremd = { slug: "openrouter/glm-5.2:free", provider: "openrouter", upstreamModel: "glm-5.2:free" };
  const p = planSync({ ...base, existingModels: [fremd], managed: new Set(["openrouter/glm-5.2:free"]) });
  assert.deepEqual(p.toRemove, []);
  assert.deepEqual(p.conflicts, []);
});

test("planSync erkennt Eintraege der Messages-Variante als zur Familie gehoerig", () => {
  const messages = {
    slug: "opencode-go-messages/kimi-k4",
    provider: "opencode-go-messages",
    upstreamModel: "kimi-k4",
  };
  const p = planSync({
    ...base,
    upstreamIds: ["glm-5.3", "minimax-m3"],
    existingModels: [messages],
    managed: new Set(["opencode-go-messages/kimi-k4"]),
  });
  assert.deepEqual(p.toRemove, [{ slug: "opencode-go-messages/kimi-k4", reason: "gone_upstream" }]);
});

// --- Sidecar ---------------------------------------------------------------

test("nextManaged nimmt auf, entfernt und sortiert stabil", () => {
  const r = nextManaged({
    managed: new Set(["opencode-go/alt", "opencode-go/bleibt"]),
    added: ["opencode-go/neu"],
    removed: ["opencode-go/alt"],
  });
  assert.deepEqual(r, ["opencode-go/bleibt", "opencode-go/neu"]);
});

test("nextManaged ist idempotent", () => {
  const once = nextManaged({ managed: new Set(["a"]), added: ["b"], removed: [] });
  const twice = nextManaged({ managed: new Set(once), added: ["b"], removed: [] });
  assert.deepEqual(once, twice);
});

// --- Voreinstellung --------------------------------------------------------

test("kimi-k3 steht per Vorgabe auf der Denyliste", () => {
  assert.ok(DENYLIST.has("kimi-k3"));
});
