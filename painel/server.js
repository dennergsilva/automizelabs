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
    status        TEXT DEFAULT 'gerado',
    observacoes   TEXT DEFAULT '',
    criado_em     TIMESTAMPTZ DEFAULT now(),
    atualizado_em TIMESTAMPTZ DEFAULT now()
  );
`);

const app = express();
app.use(express.json());

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

// Cria (a máquina chama isto ao gerar um site). Upsert por slug.
app.post("/api/prospectos", auth, async (req, res) => {
  const b = req.body || {};
  const r = await pool.query(
    `INSERT INTO prospectos (nome,cidade,nicho,whatsapp,instagram,endereco,nota_google,preview_url,slug)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (slug) DO UPDATE SET preview_url=EXCLUDED.preview_url, atualizado_em=now()
     RETURNING *`,
    [b.nome, b.cidade, b.nicho || "salao", b.whatsapp, b.instagram, b.endereco, b.nota_google, b.preview_url, b.slug]
  );
  res.json(r.rows[0]);
});

// Atualiza status / observações
app.patch("/api/prospectos/:id", auth, async (req, res) => {
  const { status, observacoes } = req.body || {};
  const r = await pool.query(
    `UPDATE prospectos SET
       status = COALESCE($1, status),
       observacoes = COALESCE($2, observacoes),
       atualizado_em = now()
     WHERE id = $3 RETURNING *`,
    [status ?? null, observacoes ?? null, req.params.id]
  );
  res.json(r.rows[0]);
});

app.use(express.static("public"));
app.listen(process.env.PORT || 3000, () => console.log("painel no ar"));
