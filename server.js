"use strict";

const express = require("express");
const { DatabaseSync } = require("node:sqlite");
const { randomBytes, scryptSync, timingSafeEqual, createHash } = require("node:crypto");
const path = require("node:path");
const http = require("node:http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const db = new DatabaseSync(path.join(__dirname, "cardoso.db"));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

app.disable("x-powered-by");
app.use(express.json({ limit: "40kb" }));

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

// TABELAS
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    image TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS neighborhoods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    fee INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tracking_token TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    fulfillment TEXT NOT NULL,
    neighborhood TEXT,
    address TEXT,
    payment_method TEXT NOT NULL,
    change_for INTEGER,
    note TEXT NOT NULL DEFAULT '',
    subtotal INTEGER NOT NULL,
    delivery_fee INTEGER NOT NULL,
    total INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    unit_price INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    extras_json TEXT NOT NULL DEFAULT '[]',
    observation TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(order_id) REFERENCES orders(id)
  );
`);

// MIGRAÇÃO DO BANCO ANTIGO
function addColumnIfMissing(table, column, definition) {
  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((x) => x.name);

  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumnIfMissing("products", "image", "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("orders", "change_for", "INTEGER");
addColumnIfMissing("order_items", "extras_json", "TEXT NOT NULL DEFAULT '[]'");
addColumnIfMissing("order_items", "observation", "TEXT NOT NULL DEFAULT ''");

// FOTOS ILUSTRATIVAS
const burger =
  "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=520&q=80&fit=crop";
const bacon =
  "https://images.unsplash.com/photo-1553979459-d2229ba7433a?w=520&q=80&fit=crop";
const hotdog =
  "https://images.unsplash.com/photo-1612392061787-2d078b3e90a8?w=520&q=80&fit=crop";
const drink =
  "https://images.unsplash.com/photo-1554866585-cd94860890b7?w=520&q=80&fit=crop";
const sandwich =
  "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=520&q=80&fit=crop";

// PRODUTOS
const seed = [
  [
    "Hambúrguer",
    16,
    "Lanches",
    "Pão, purê, carne, alface, tomate e milho.",
    burger,
  ],
  [
    "X-Burguer",
    17,
    "Lanches",
    "Pão, purê, carne, queijo, presunto, batata palha e milho.",
    burger,
  ],
  [
    "X-Salada",
    18,
    "Lanches",
    "Pão, purê, carne, queijo, presunto, batata palha, milho, alface e tomate.",
    burger,
  ],
  [
    "X-Egg",
    21,
    "Lanches",
    "Pão, purê, carne, ovo, queijo, presunto, batata palha, milho, alface e tomate.",
    burger,
  ],
  [
    "X-Egg Bacon",
    26,
    "Lanches",
    "Pão, purê, carne, ovo, bacon, queijo, presunto, batata palha, milho, alface e tomate.",
    bacon,
  ],
  [
    "X-Calabresa",
    22,
    "Lanches",
    "Pão, purê, carne, calabresa, queijo, presunto, batata palha, milho, alface e tomate.",
    burger,
  ],
  [
    "X-Frango",
    23,
    "Lanches",
    "Pão, purê, carne, frango, queijo, presunto, batata palha, milho, alface e tomate.",
    sandwich,
  ],
  [
    "X-Frango Egg",
    25,
    "Lanches",
    "Pão, purê, carne, frango, ovo, queijo, presunto, batata palha, milho, alface e tomate.",
    sandwich,
  ],
  [
    "X-Frango Calabresa",
    26,
    "Lanches",
    "Pão, purê, carne, frango, calabresa, queijo, presunto, batata palha, milho, alface e tomate.",
    sandwich,
  ],
  [
    "X-Frango Bacon",
    27,
    "Lanches",
    "Pão, purê, carne, frango, bacon, queijo, presunto, batata palha, milho, alface e tomate.",
    bacon,
  ],
  [
    "X-Bacon",
    24,
    "Lanches",
    "Pão, purê, carne, bacon, queijo, presunto, batata palha, milho, alface e tomate.",
    bacon,
  ],
  [
    "X-Calbacon",
    27,
    "Lanches",
    "Pão, purê, carne, calabresa, bacon, queijo, presunto, batata palha, milho, alface e tomate.",
    bacon,
  ],
  [
    "X-Tudo",
    32,
    "Lanches",
    "Pão, purê, carne, frango, salsicha, ovo, calabresa, bacon, queijo, presunto, batata palha, milho, alface e tomate.",
    bacon,
  ],
  [
    "Hot-Dog",
    16,
    "Hot-Dog",
    "Pão, purê, 2 salsichas, queijo, presunto, batata palha, milho, alface e tomate.",
    hotdog,
  ],
  [
    "Misto",
    16,
    "Mistos e Kids",
    "Pão, purê, 2 queijos, 2 presuntos, batata palha.",
    sandwich,
  ],
  [
    "Kids",
    14,
    "Mistos e Kids",
    "Pão, purê, maionese temperada, carne, batata palha.",
    burger,
  ],
  ["Guaraná Antarctica 2L", 13, "Bebidas", "Garrafa de 2 litros.", drink],
  ["Guaraná Antarctica 600ml", 8, "Bebidas", "Garrafa de 600ml.", drink],
  ["Coca-Cola 2L", 15, "Bebidas", "Garrafa de 2 litros.", drink],
  ["Coca-Cola lata", 6, "Bebidas", "Lata.", drink],

  ...[
    "Carne",
    "Salsicha",
    "Ovo",
    "Presunto",
    "Queijo",
    "Cebola roxa",
    "Catupiry",
    "Cheddar",
    "Bacon",
    "Calabresa",
    "Frango",
  ].map((name, i) => [
    name + (i === 5 ? "" : " extra"),
    i >= 8 ? 5 : 3,
    "Adicionais",
    "Adicional para um lanche.",
    "",
  ]),
];

// TAXAS POR BAIRRO
const groups = [
  [4, ["Nova Lorena"]],
  [5, ["Centro", "Cabelinha", "Vila Brito", "Vila Nunes", "Vila Geny"]],
  [
    6,
    [
      "Bairro da Cruz",
      "Santa Edwiges",
      "Vila Passos",
      "Olaria",
      "JD Margarida",
      "Santo Antônio",
      "Vila Rica",
      "Industrial",
      "Vila Hepacaré",
      "Cecap Baixa",
      "São Roque",
      "Vila Cida",
      "Vila Rosa",
      "Village das Palmeiras",
    ],
  ],
  [
    7,
    [
      "Cecap Alta",
      "Aterrado",
      "Parque Mondesir",
      "Vila Zélia",
      "Parque Rodovia",
      "Horto Florestal",
    ],
  ],
  [
    8,
    [
      "Nassif",
      "Campo dos Ypês",
      "Vila Comerciários 1",
      "Vila Comerciários 2",
      "Jardim Primavera",
      "Ponte Nova",
      "Novo Horizonte",
    ],
  ],
];

// CADASTRO INICIAL
const putProduct = db.prepare(`
  INSERT OR IGNORE INTO products
  (id,name,price,category,description,image)
  VALUES(?,?,?,?,?,?)
`);

seed.forEach((p, i) => {
  putProduct.run(i + 1, p[0], p[1] * 100, p[2], p[3], p[4]);
});

const setPhoto = db.prepare(`
  UPDATE products SET image = ?
  WHERE id = ? AND (image = '' OR image IS NULL)
`);

seed.forEach((p, i) => setPhoto.run(p[4], i + 1));

// CORRIGIR CATEGORIAS ANTIGAS
db.prepare(
  `
  UPDATE products
  SET category = 'Lanches', active = 1
  WHERE id BETWEEN 1 AND 13
  AND name IN (
    'Hambúrguer','X-Burguer','X-Salada','X-Egg',
    'X-Egg Bacon','X-Calabresa','X-Frango',
    'X-Frango Egg','X-Frango Calabresa',
    'X-Frango Bacon','X-Bacon','X-Calbacon','X-Tudo'
  )
`,
).run();

db.prepare(
  `
  UPDATE products
  SET category = 'Lanches'
  WHERE category IN ('Hambúrguer','Hamburguer','Hambúrgueres')
`,
).run();

// RESTAURAR ADICIONAIS
db.prepare(
  `
  UPDATE products SET category = 'Adicionais', active = 1
  WHERE id BETWEEN 21 AND 31
  AND name IN (
    'Carne extra','Salsicha extra','Ovo extra',
    'Presunto extra','Queijo extra','Cebola roxa',
    'Catupiry extra','Cheddar extra','Bacon extra',
    'Calabresa extra','Frango extra'
  )
`,
).run();

// ESCONDER PRODUTOS REMOVIDOS SEM APAGAR HISTÓRICO
db.prepare(
  `
  UPDATE products SET active = 0
  WHERE category IN ('Hot-Dog','Mistos e Kids','Outros')
  OR name IN ('Hot-Dog','Misto','Kids')
`,
).run();

const putFee = db.prepare(`
  INSERT OR IGNORE INTO neighborhoods(name,fee)
  VALUES(?,?)
`);

groups.forEach(([fee, names]) => {
  names.forEach((name) => putFee.run(name, fee * 100));
});

// Estado operacional persistente: não altera pedidos existentes.
db.exec(`CREATE TABLE IF NOT EXISTS store_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
db.prepare("INSERT OR IGNORE INTO store_settings(key,value) VALUES('open','1')").run();
const storeOpen = () => db.prepare("SELECT value FROM store_settings WHERE key='open'").get()?.value === '1';
const storeState = () => ({open:storeOpen()});
function ownerOnly(req,res,next){if(req.staff.role!=='owner')return res.status(403).json({error:'Acesso exclusivo do proprietário.'});next();}

// CONSULTAR CATÁLOGO
app.get("/api/catalog", (req, res) => {
  const products = db
    .prepare(
      `
    SELECT id,name,price,category,description,image
    FROM products
    WHERE active = 1
    ORDER BY id
  `,
    )
    .all()
    .map((p) => ({
      ...p,
      price: p.price / 100,
    }));

  const neighborhoods = db
    .prepare(
      `
    SELECT name, fee / 100.0 AS fee
    FROM neighborhoods
    ORDER BY name
  `,
    )
    .all();

  res.json({
    products,
    neighborhoods,
    pixEnabled: false,
    store: storeState(),
  });
});

// Acesso restrito da equipe. Senhas vêm de variáveis de ambiente, nunca do app.
db.exec(`
CREATE TABLE IF NOT EXISTS staff_users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL UNIQUE,role TEXT NOT NULL,password_hash TEXT NOT NULL,salt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS staff_sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES staff_users(id));
`);
function seedStaff(username,role,password){
 if(db.prepare('SELECT id FROM staff_users WHERE username=?').get(username))return;
 if(!password || password.length<12){console.warn('Configure uma senha de pelo menos 12 caracteres para '+username);return;}
 const salt=randomBytes(16).toString('hex');const hash=scryptSync(password,salt,64).toString('hex');
 db.prepare('INSERT INTO staff_users(username,role,password_hash,salt) VALUES(?,?,?,?)').run(username,role,hash,salt);
}
const devPassword = process.env.NODE_ENV === 'production' ? undefined : 'elisangela123';
seedStaff('dono','owner',process.env.CARDOSO_OWNER_PASSWORD || devPassword);
seedStaff('cozinha','staff',process.env.CARDOSO_STAFF_PASSWORD || devPassword);
const hashToken=t=>createHash('sha256').update(t).digest('hex');
function staffFromToken(t){
 if(typeof t!=='string'||!/^[a-f0-9]{64}$/.test(t))return null;
 return db.prepare(`SELECT u.id,u.username,u.role FROM staff_sessions s JOIN staff_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).get(hashToken(t),Date.now())||null;
}
function mustBeStaff(req,res,next){const token=(req.get('authorization')||'').replace(/^Bearer\s+/i,'');req.staff=staffFromToken(token);if(!req.staff)return res.status(401).json({error:'Sessão inválida. Entre novamente.'});next();}
const attempts=new Map();
app.post('/api/staff/login',(req,res)=>{
 const key=req.ip, now=Date.now();let a=attempts.get(key)||{count:0,until:now+900000};if(now>a.until)a={count:0,until:now+900000};
 if(a.count>=10)return res.status(429).json({error:'Muitas tentativas. Tente novamente mais tarde.'});
 const username=String(req.body?.username||'').trim().toLowerCase();const password=String(req.body?.password||'');
 const u=db.prepare('SELECT * FROM staff_users WHERE username=?').get(username);
 const expected=u?Buffer.from(u.password_hash,'hex'):Buffer.alloc(64);
 const got=scryptSync(password.slice(0,256),u?.salt||'dummy-salt',64);
 if(!u||!timingSafeEqual(got,expected)){a.count++;attempts.set(key,a);return res.status(401).json({error:'Usuário ou senha incorretos.'});}
 attempts.delete(key);const token=randomBytes(32).toString('hex');
 db.prepare('INSERT INTO staff_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hashToken(token),u.id,now+7*86400000);
 res.json({token,role:u.role,username:u.username});
});
app.post('/api/staff/logout',mustBeStaff,(req,res)=>{const t=req.get('authorization').replace(/^Bearer\s+/i,'');db.prepare('DELETE FROM staff_sessions WHERE token_hash=?').run(hashToken(t));res.json({ok:true});});
// Numero sequencial por dia de Brasilia, preservando o ID global do banco.
const dailyNumberSql = `(SELECT COUNT(*) FROM orders earlier WHERE date(earlier.created_at,'-3 hours') = date(orders.created_at,'-3 hours') AND earlier.id <= orders.id)`;
function orderDetail(id){const o=db.prepare(`SELECT id AS orderId, ${dailyNumberSql} AS dailyNumber, customer_name AS customerName,phone,fulfillment,neighborhood,address,payment_method AS paymentMethod, change_for/100.0 AS changeFor,total/100.0 AS total,status,created_at AS createdAt FROM orders WHERE id=?`).get(id);if(!o)return null;
 o.items=db.prepare('SELECT product_name AS name,quantity,unit_price/100.0 AS unitPrice,extras_json AS extrasJson,observation FROM order_items WHERE order_id=?').all(id).map(x=>({...x,extras:JSON.parse(x.extrasJson||'[]').map(e=>({...e,price:e.price/100})),extrasJson:undefined}));return o;}
// Administração da loja e dos produtos — somente proprietário autenticado.
app.get('/api/staff/store',mustBeStaff,ownerOnly,(req,res)=>res.json(storeState()));
app.patch('/api/staff/store',mustBeStaff,ownerOnly,(req,res)=>{
 if(typeof req.body?.open!=='boolean')return res.status(400).json({error:'Informe open como verdadeiro ou falso.'});
 db.prepare("UPDATE store_settings SET value=? WHERE key='open'").run(req.body.open?'1':'0');
 io.emit('store:updated',storeState());res.json(storeState());
});
app.get('/api/staff/products',mustBeStaff,ownerOnly,(req,res)=>{
 res.json({products:db.prepare('SELECT id,name,price/100.0 AS price,category,description,active FROM products ORDER BY id').all()});
});
app.patch('/api/staff/products/:id',mustBeStaff,ownerOnly,(req,res)=>{
 const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Produto inválido.'});
 const current=db.prepare('SELECT * FROM products WHERE id=?').get(id);
 if(!current)return res.status(404).json({error:'Produto não encontrado.'});
 const {name,description,price,active}=req.body||{};
 if(name!==undefined&&(typeof name!=='string'||name.trim().length<2||name.length>120))return res.status(400).json({error:'Nome inválido.'});
 if(description!==undefined&&(typeof description!=='string'||description.length>500))return res.status(400).json({error:'Descrição inválida.'});
 if(price!==undefined&&(!Number.isFinite(price)||price<0||price>10000))return res.status(400).json({error:'Preço inválido.'});
 if(active!==undefined&&typeof active!=='boolean')return res.status(400).json({error:'Disponibilidade inválida.'});
 db.prepare('UPDATE products SET name=?,description=?,price=?,active=? WHERE id=?').run(name===undefined?current.name:name.trim(),description===undefined?current.description:description,price===undefined?current.price:Math.round(price*100),active===undefined?current.active:(active?1:0),id);
 io.emit('catalog:updated');res.json({ok:true});
});
app.get('/api/staff/orders',mustBeStaff,(req,res)=>{
 const ids=db.prepare('SELECT id FROM orders ORDER BY id DESC').all();res.json({orders:ids.map(x=>orderDetail(x.id))});
});
app.get('/api/staff/summary',mustBeStaff,(req,res)=>{
 if(req.staff.role!=='owner')return res.status(403).json({error:'Acesso exclusivo do dono.'});
 const summary=db.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(CASE WHEN status!='cancelado' THEN total ELSE 0 END),0)/100.0 AS grossRevenue FROM orders WHERE date(created_at,'-3 hours')=date('now','-3 hours')`).get();
 res.json({...summary, note:'Faturamento bruto dos pedidos não cancelados; não representa pagamentos confirmados.'});
});
// Relatório do proprietário: valores são pedidos registrados, não comprovantes de pagamento.
app.get('/api/staff/reports', mustBeStaff, (req, res) => {
  if (req.staff.role !== 'owner') return res.status(403).json({error:'Acesso exclusivo do dono.'});
  const period = req.query.period === 'month' ? 'month' : 'day';
  const date = String(req.query.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + 'T12:00:00Z')))
    return res.status(400).json({error:'Data inválida. Use AAAA-MM-DD.'});
  const where = period === 'month'
    ? "substr(date(created_at,'-3 hours'),1,7)=substr(?,1,7)"
    : "date(created_at,'-3 hours')=?";
  const totals = db.prepare(`SELECT COUNT(*) AS orders,
    SUM(CASE WHEN status='cancelado' THEN 1 ELSE 0 END) AS cancelled,
    COALESCE(SUM(CASE WHEN status!='cancelado' THEN total ELSE 0 END),0)/100.0 AS gross
    FROM orders WHERE ${where}`).get(date);
  const payments = db.prepare(`SELECT payment_method AS method,COUNT(*) AS orders,
    COALESCE(SUM(total),0)/100.0 AS gross
    FROM orders WHERE ${where} AND status!='cancelado'
    GROUP BY payment_method ORDER BY gross DESC`).all(date);
  const products = db.prepare(`SELECT oi.product_name AS name,SUM(oi.quantity) AS quantity,
    COALESCE(SUM(oi.quantity * oi.unit_price),0)/100.0 AS gross
    FROM order_items oi JOIN orders o ON o.id=oi.order_id
    WHERE ${where.replaceAll('created_at','o.created_at')} AND o.status!='cancelado'
    GROUP BY oi.product_name ORDER BY quantity DESC LIMIT 10`).all(date);
  res.json({period,date,totals,payments,products,
    note:'Valores brutos de pedidos não cancelados; pagamentos não conciliados.'});
});
const statuses=new Set(['recebido','confirmado','preparando','pronto','saiu_entrega','entregue','cancelado']);
app.patch('/api/staff/orders/:id/status',mustBeStaff,(req,res)=>{
 const id=Number(req.params.id),status=req.body?.status;
 if(!Number.isSafeInteger(id)||!statuses.has(status))return res.status(400).json({error:'Status inválido.'});
 const current=db.prepare('SELECT tracking_token,status,fulfillment FROM orders WHERE id=?').get(id);
 if(!current)return res.status(404).json({error:'Pedido não encontrado.'});
 if(current.status==='entregue'||current.status==='cancelado')return res.status(409).json({error:'Pedido finalizado.'});
 if(status==='entregue' && (current.fulfillment!=='pickup' || current.status!=='pronto'))return res.status(403).json({error:'Entrega em domicilio somente pode ser confirmada pelo cliente.'});
 if(status==='saiu_entrega'&&current.fulfillment!=='delivery')return res.status(400).json({error:'Pedidos para retirada não saem para entrega.'});
 db.prepare('UPDATE orders SET status=? WHERE id=?').run(status,id);
 const order=orderDetail(id);io.to('staff').emit('staff:order-updated',{orderId:id});
 io.to('tracking:'+current.tracking_token).emit('order-updated',{orderId:id,status});res.json({order});
});


// RECEBER PEDIDO
const productStmt = db.prepare(`
  SELECT id,name,price,category
  FROM products WHERE id = ? AND active = 1
`);

app.post("/api/orders", (req, res) => {
  try {
    if(!storeOpen()) return res.status(409).json({error:"A loja está fechada. Volte durante o horário de atendimento."});
    const d = req.body || {};
    const name = String(d.customerName || "").trim();
    const phone = String(d.phone || "").replace(/\D/g, "");
    const fulfillment = d.fulfillment;
    const street = String(d.address || "").trim();
    const note = String(d.note || "").trim();
    const payment = d.paymentMethod;

    if (
      name.length < 3 ||
      name.length > 100 ||
      phone.length < 10 ||
      phone.length > 11
    ) {
      return res.status(400).json({
        error: "Informe nome e WhatsApp válidos.",
      });
    }

    if (!["delivery", "pickup"].includes(fulfillment)) {
      return res.status(400).json({
        error: "Tipo de entrega inválido.",
      });
    }

    if (!["cartao_entrega", "dinheiro"].includes(payment)) {
      return res.status(400).json({
        error: "Pagamento indisponível. Pix online será ativado depois.",
      });
    }

    if (
      street.length > 250 ||
      note.length > 400 ||
      (fulfillment === "delivery" && street.length < 5)
    ) {
      return res.status(400).json({
        error: "Confira seu endereço.",
      });
    }

    if (!Array.isArray(d.items) || d.items.length < 1 || d.items.length > 40) {
      return res.status(400).json({
        error: "Carrinho inválido.",
      });
    }

    let deliveryFee = 0;
    let district = "";

    if (fulfillment === "delivery") {
      const found = db
        .prepare(
          `
        SELECT name,fee FROM neighborhoods
      `,
        )
        .all()
        .find((x) => norm(x.name) === norm(d.neighborhood));

      if (!found) {
        return res.status(400).json({
          error: "Bairro não atendido.",
        });
      }

      deliveryFee = found.fee;
      district = found.name;
    }

    const entries = [];
    let subtotal = 0;

    for (const item of d.items) {
      if (
        !Number.isSafeInteger(item.productId) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 30
      ) {
        return res.status(400).json({
          error: "Quantidade inválida.",
        });
      }

      const base = productStmt.get(item.productId);

      if (!base || base.category === "Adicionais") {
        return res.status(400).json({
          error: "Produto indisponível.",
        });
      }

      const ids = item.extraIds || [];

      if (
        !Array.isArray(ids) ||
        ids.length > 11 ||
        new Set(ids).size !== ids.length
      ) {
        return res.status(400).json({
          error: "Adicionais inválidos.",
        });
      }

      const selectedExtras = [];
      let unit = base.price;

      for (const id of ids) {
        if (!Number.isSafeInteger(id)) {
          return res.status(400).json({
            error: "Adicional inválido.",
          });
        }

        const extra = productStmt.get(id);

        if (
          !extra ||
          extra.category !== "Adicionais" ||
          !["Lanches", "Pão com linguiça"].includes(base.category)
        ) {
          return res.status(400).json({
            error: "Adicional indisponível.",
          });
        }

        selectedExtras.push({
          id: extra.id,
          name: extra.name,
          price: extra.price,
        });

        unit += extra.price;
      }

      const observation = String(item.observation || "").trim();

      if (observation.length > 250) {
        return res.status(400).json({
          error: "Observação muito longa.",
        });
      }

      subtotal += unit * item.quantity;

      entries.push({
        base,
        extras: selectedExtras,
        quantity: item.quantity,
        observation,
        unit,
      });
    }

    if (subtotal <= 0 || subtotal > 50000000) {
      return res.status(400).json({
        error: "Valor inválido.",
      });
    }

    const total = subtotal + deliveryFee;

    const changeFor =
      d.changeFor == null || d.changeFor === ""
        ? null
        : Math.round(Number(d.changeFor) * 100);

    if (
      changeFor !== null &&
      (!Number.isSafeInteger(changeFor) ||
        changeFor < total ||
        payment !== "dinheiro")
    ) {
      return res.status(400).json({
        error: "Valor para troco inválido.",
      });
    }

    const token = randomBytes(24).toString("hex");
    let orderId;

    db.exec("BEGIN IMMEDIATE");

    try {
      const result = db
        .prepare(
          `
        INSERT INTO orders(
          tracking_token,customer_name,phone,
          fulfillment,neighborhood,address,
          payment_method,change_for,note,
          subtotal,delivery_fee,total,status
        )
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'recebido')
      `,
        )
        .run(
          token,
          name,
          phone,
          fulfillment,
          district,
          fulfillment === "delivery" ? street : "",
          payment,
          changeFor,
          note,
          subtotal,
          deliveryFee,
          total,
        );

      orderId = Number(result.lastInsertRowid);

      const insertItem = db.prepare(`
        INSERT INTO order_items(
          order_id,product_id,product_name,
          unit_price,quantity,extras_json,observation
        )
        VALUES(?,?,?,?,?,?,?)
      `);

      entries.forEach((item) => {
        insertItem.run(
          orderId,
          item.base.id,
          item.base.name,
          item.unit,
          item.quantity,
          JSON.stringify(item.extras),
          item.observation,
        );
      });

      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    console.log("Novo pedido #" + orderId);
    io.to("staff").emit("staff:new-order", { orderId });

    res.status(201).json({
      orderId,
      trackingToken: token,
      status: "recebido",
      total: total / 100,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Erro ao registrar pedido.",
    });
  }
});

// ACOMPANHAR PEDIDO
app.get("/api/track/:token", (req, res) => {
  if (!/^[a-f0-9]{48}$/.test(req.params.token)) {
    return res.status(404).json({
      error: "Pedido não encontrado.",
    });
  }

  const order = db
    .prepare(
      `
    SELECT id AS orderId,
           (SELECT COUNT(*) FROM orders earlier WHERE date(earlier.created_at,'-3 hours')=date(orders.created_at,'-3 hours') AND earlier.id <= orders.id) AS dailyNumber,
           status,
           total/100.0 AS total,
           fulfillment,substr(replace(replace(replace(replace(phone, '-', ''), '(', ''), ')', ''), ' ', ''), -4) AS phoneLast4,created_at AS createdAt
    FROM orders
    WHERE tracking_token = ?
  `,
    )
    .get(req.params.token);

  if (!order) {
    return res.status(404).json({
      error: "Pedido não encontrado.",
    });
  }

  res.json(order);
});

// CANCELAMENTO PELO CLIENTE: permitido antes do preparo.
// O token privado identifica o pedido; nunca aceitar apenas final do telefone.
app.post("/api/track/:token/cancel", (req, res) => {
  const token = String(req.params.token || "");
  if (!/^[a-f0-9]{48}$/.test(token)) return res.status(404).json({ error: "Pedido não encontrado." });
  try {
    const result = db.prepare(`UPDATE orders SET status = 'cancelado'
      WHERE tracking_token = ? AND status IN ('recebido', 'confirmado')`).run(token);
    if (result.changes !== 1) {
      const current = db.prepare('SELECT status FROM orders WHERE tracking_token = ?').get(token);
      if (!current) return res.status(404).json({ error: "Pedido não encontrado." });
      if (current.status === 'cancelado') return res.json({ ok: true, status: 'cancelado', alreadyCancelled: true });
      return res.status(409).json({ error: "O pedido já está em preparo ou finalizado. Entre em contato com a equipe para solicitar o cancelamento.", status: current.status });
    }
    const order = db.prepare('SELECT id FROM orders WHERE tracking_token = ?').get(token);
    io.to('staff').emit('staff:order-updated', { orderId: order.id });
    io.to('tracking:' + token).emit('order-updated', { orderId: order.id, status: 'cancelado' });
    return res.json({ ok: true, orderId: order.id, status: 'cancelado' });
  } catch (error) {
    console.error('Erro ao cancelar pedido:', error);
    return res.status(500).json({ error: 'Não foi possível cancelar o pedido.' });
  }
});

// CONFIRMAÇÃO DE RECEBIMENTO EXCLUSIVA DO CLIENTE
// O código privado de acompanhamento funciona como credencial do pedido.
app.post("/api/track/:token/confirm-delivery", (req, res) => {
  const token = String(req.params.token || "");
  if (!/^[a-f0-9]{48}$/.test(token)) {
    return res.status(404).json({ error: "Pedido não encontrado." });
  }
  try {
    const result = db.prepare(`
      UPDATE orders SET status = 'entregue'
      WHERE tracking_token = ?
        AND fulfillment = 'delivery'
        AND status = 'saiu_entrega'
    `).run(token);
    if (result.changes !== 1) {
      const order = db.prepare('SELECT status FROM orders WHERE tracking_token = ?').get(token);
      if (!order) return res.status(404).json({ error: "Pedido não encontrado." });
      if (order.status === 'entregue') return res.json({ ok: true, status: 'entregue', alreadyConfirmed: true });
      return res.status(409).json({ error: "O pedido ainda não está aguardando confirmação de entrega.", status: order.status });
    }
    const order = db.prepare('SELECT id FROM orders WHERE tracking_token = ?').get(token);
    io.to('staff').emit('staff:order-updated', { orderId: order.id });
    io.to('tracking:' + token).emit('order-updated', { orderId: order.id, status: 'entregue' });
    return res.json({ ok: true, orderId: order.id, status: 'entregue', message: 'Recebimento confirmado!' });
  } catch (error) {
    console.error('Erro ao confirmar entrega:', error);
    return res.status(500).json({ error: 'Não foi possível confirmar a entrega.' });
  }
});

// SOCKET.IO
io.on("connection", (socket) => {
  const person = staffFromToken(socket.handshake.auth?.token);
  if (person) socket.join("staff");
  socket.on("join-tracking", (token) => {
    if (typeof token !== "string" || !/^[a-f0-9]{48}$/.test(token)) return;

    const order = db
      .prepare(
        `
      SELECT id FROM orders WHERE tracking_token = ?
    `,
      )
      .get(token);

    if (order) socket.join("tracking:" + token);
  });
});

// ARQUIVOS PÚBLICOS
// Não permite acessar cardoso.db pelo navegador.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

for (const file of ["style.css", "script.js", "logo.png"]) {
  app.get("/" + file, (req, res) => {
    res.sendFile(path.join(__dirname, file), (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });
}

app.use((req, res) => {
  res.status(404).json({
    error: "Página não encontrada.",
  });
});

server.listen(PORT, () => {
  console.log("================================");
  console.log(" CARDOSO BURGUER HOUSE");
  console.log("================================");
  console.log(" Site: http://localhost:" + PORT);
  console.log(" Banco SQLite: cardoso.db");
  console.log(" Servidor iniciado!");
  console.log("================================");
});
