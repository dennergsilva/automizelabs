// Painel de prospectos — kanban do funil de venda dos sites.
// Node + Express + Postgres (o mesmo que já roda no VPS).
// Env: DATABASE_URL, PAINEL_SENHA, PORT
import express from "express";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const SENHA = process.env.PAINEL_SENHA || "troque-esta-senha";

// Garante a tabela (fonte da verdade do funil)
await pool.query(`
  CREATE TABLE IF NOT EXISTS prospectos (
    id            SERIAL PRIMARY KEY,
    nome          TEXT NOT NULL,
    cidade        TEXT,
    nicho         TEXT DEFAULT 'salao',
    whatsapp      TEXT,
    instagram     TEXT,
    endereco      TEXT,
    nota_google   TEXT,
    preview_url   TEXT,
    slug          TEXT UNIQUE,
    place_id      TEXT,
    status        TEXT DEFAULT 'gerado',
    observacoes   TEXT DEFAULT '',
    criado_em     TIMESTAMPTZ DEFAULT now(),
    atualizado_em TIMESTAMPTZ DEFAULT now()
  );
`);
// Migração: leads descobertos do Maps (sem site ainda) entram com place_id.
// slug fica NULL até gerar o site; place_id deduplica a descoberta.
await pool.query(`ALTER TABLE prospectos ADD COLUMN IF NOT EXISTS place_id TEXT;`);
await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS prospectos_place_id_key ON prospectos(place_id);`);
// Migração (2026-08-27): prospecção por persona (Espanha). O lead chega do
// classificar.mjs + radar-web.mjs já etiquetado; a Tainá confirma a persona no card
// e o preço segue a persona (P1 300 · P2 500 · P3 700, entrada única).
//   persona     P1 | P2 | P3 | P3? (marca de clínica ainda não confirmada)
//   gancho      a 1ª linha verificável da abordagem, em castelhano
//   preco       em euros (entrada única, sem mensalidade)
//   website     site atual (rebranding é ~88% do mercado)
//   flags       achados do radar (medicamento, sin_CS, sin_colegiado…)
//   site_desde  data de registro/1ª captura do domínio (idade do site)
//   motivo      por que o classificador deu essa persona
//   pais        BR | ES | PT — decide DDI, moeda e idioma da mensagem
for (const col of ["persona TEXT", "gancho TEXT", "preco INTEGER", "website TEXT", "flags TEXT", "site_desde TEXT", "motivo TEXT", "pais TEXT DEFAULT 'BR'"]) {
  await pool.query(`ALTER TABLE prospectos ADD COLUMN IF NOT EXISTS ${col};`);
}

const app = express();
// 5 MB: o bulk de descobertos com gancho/motivo por lead passa dos 100 KB padrão (deu 413 em 27/08).
app.use(express.json({ limit: "5mb" }));

// Auth simples por senha (header x-senha). Suficiente p/ uso interno.
const auth = (req, res, next) => {
  if ((req.headers["x-senha"] || "") !== SENHA) return res.status(401).json({ erro: "senha incorreta" });
  next();
};

// Lista
app.get("/api/prospectos", auth, async (_req, res) => {
  const r = await pool.query("SELECT * FROM prospectos ORDER BY atualizado_em DESC");
  res.json(r.rows);
});

// Cria/atualiza (a máquina chama isto ao gerar um site).
// Se vier place_id e o lead já existir (descoberto), PROMOVE ele p/ 'gerado'
// (atualiza no lugar, sem duplicar). Senão, upsert por slug.
app.post("/api/prospectos", auth, async (req, res) => {
  const b = req.body || {};
  if (b.place_id) {
    const up = await pool.query(
      `UPDATE prospectos SET
         nome=$1, cidade=$2, nicho=$3, whatsapp=$4, instagram=$5, endereco=$6,
         nota_google=$7, preview_url=$8, slug=$9, status='gerado', atualizado_em=now()
       WHERE place_id=$10 RETURNING *`,
      [b.nome, b.cidade, b.nicho || "salao", b.whatsapp, b.instagram, b.endereco, b.nota_google, b.preview_url, b.slug, b.place_id]
    );
    if (up.rows[0]) return res.json(up.rows[0]);
  }
  const r = await pool.query(
    `INSERT INTO prospectos (nome,cidade,nicho,whatsapp,instagram,endereco,nota_google,preview_url,slug,place_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (slug) DO UPDATE SET
       nome=EXCLUDED.nome, cidade=EXCLUDED.cidade, nicho=EXCLUDED.nicho,
       whatsapp=EXCLUDED.whatsapp, instagram=EXCLUDED.instagram, endereco=EXCLUDED.endereco,
       nota_google=EXCLUDED.nota_google, preview_url=EXCLUDED.preview_url,
       place_id=COALESCE(EXCLUDED.place_id, prospectos.place_id), atualizado_em=now()
     RETURNING *`,
    [b.nome, b.cidade, b.nicho || "salao", b.whatsapp, b.instagram, b.endereco, b.nota_google, b.preview_url, b.slug, b.place_id || null]
  );
  res.json(r.rows[0]);
});

// Bulk de leads DESCOBERTOS (scrape do Maps / classificar+radar). Upsert por place_id,
// status='descoberto'. Aceita array direto ou { leads: [...] }. Não mexe em quem já
// virou site (gerado etc.). Persona e preço só entram se ainda não existem: uma
// reinserção (radar rodado de novo) não pode apagar a persona que a Tainá confirmou
// na mão. Gancho/flags/site são da máquina e sempre atualizam.
app.post("/api/descobertos", auth, async (req, res) => {
  const leads = Array.isArray(req.body) ? req.body : (req.body?.leads || []);
  let inseridos = 0, atualizados = 0, ignorados = 0;
  for (const b of leads) {
    if (!b.place_id) { ignorados++; continue; }
    const r = await pool.query(
      `INSERT INTO prospectos (nome,cidade,nicho,whatsapp,instagram,endereco,nota_google,place_id,status,
                               persona,gancho,preco,website,flags,site_desde,motivo,pais)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'descoberto',$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (place_id) DO UPDATE SET
         nome=EXCLUDED.nome, cidade=EXCLUDED.cidade, nicho=EXCLUDED.nicho,
         whatsapp=EXCLUDED.whatsapp, instagram=EXCLUDED.instagram, endereco=EXCLUDED.endereco,
         nota_google=EXCLUDED.nota_google,
         persona=COALESCE(prospectos.persona, EXCLUDED.persona),
         preco=COALESCE(prospectos.preco, EXCLUDED.preco),
         gancho=COALESCE(EXCLUDED.gancho, prospectos.gancho),
         website=COALESCE(EXCLUDED.website, prospectos.website),
         flags=COALESCE(EXCLUDED.flags, prospectos.flags),
         site_desde=COALESCE(EXCLUDED.site_desde, prospectos.site_desde),
         motivo=COALESCE(EXCLUDED.motivo, prospectos.motivo),
         pais=COALESCE(EXCLUDED.pais, prospectos.pais),
         atualizado_em=now()
       RETURNING (xmax = 0) AS novo`,
      [b.nome, b.cidade, b.nicho || "salao", b.whatsapp, b.instagram, b.endereco, b.nota_google ?? b.nota, b.place_id,
       b.persona ?? null, b.gancho ?? null, b.preco ?? null, b.website ?? null,
       Array.isArray(b.flags) ? b.flags.join(" ") : (b.flags ?? null), b.site_desde ?? null, b.motivo ?? null, b.pais ?? null]
    );
    r.rows[0].novo ? inseridos++ : atualizados++;
  }
  res.json({ ok: true, inseridos, atualizados, ignorados, total: leads.length });
});

// Atualiza o que se edita no card: status, observações, persona (confirmação do
// "P3?"), preço e gancho (a Tainá corrige o castelhano antes de enviar).
app.patch("/api/prospectos/:id", auth, async (req, res) => {
  const { status, observacoes, persona, preco, gancho } = req.body || {};
  const r = await pool.query(
    `UPDATE prospectos SET
       status = COALESCE($1, status),
       observacoes = COALESCE($2, observacoes),
       persona = COALESCE($3, persona),
       preco = COALESCE($4, preco),
       gancho = COALESCE($5, gancho),
       atualizado_em = now()
     WHERE id = $6 RETURNING *`,
    [status ?? null, observacoes ?? null, persona ?? null, preco ?? null, gancho ?? null, req.params.id]
  );
  res.json(r.rows[0]);
});

// Remove um prospect
app.delete("/api/prospectos/:id", auth, async (req, res) => {
  await pool.query("DELETE FROM prospectos WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

app.use(express.static("public"));
app.listen(process.env.PORT || 3000, () => console.log("painel no ar"));
