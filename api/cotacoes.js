// Função serverless da Vercel — rota /api/cotacoes
// Boi gordo e bezerro: Datagro (SP; boi também por estado). Demais produtos: indicadores CEPEA/ESALQ.
// Ambos lidos das páginas públicas da Notícias Agrícolas, que republica esses indicadores.
// Câmbio: Investing.com (bloqueia a Vercel) com reserva no Yahoo Finance.
// Cache de 15 min na borda da Vercel.

const NA = 'https://www.noticiasagricolas.com.br/cotacoes/';

// Indicadores CEPEA/ESALQ (valores já em R$)
//  col     = coluna do preço na tabela (0 = primeira)
//  colVar  = coluna da variação %
//  linha   = (opcional) texto que identifica a linha certa, quando a tabela tem várias
//  conv    = (opcional) conversão de unidade
const CEPEA = [
  { id: 'acucar',  nome: 'Açúcar cristal', praca: 'SP', url: NA + 'sucroenergetico/acucar-cristal-cepea',
    col: 1, colVar: 2, unidade: 'R$/sc 50 kg' },
  { id: 'milho',   nome: 'Milho', praca: 'Campinas', url: NA + 'milho/indicador-cepea-esalq-milho',
    col: 1, colVar: 2, unidade: 'R$/sc 60 kg' },
  { id: 'soja',    nome: 'Soja', praca: 'Paraná', url: NA + 'soja/indicador-cepea-esalq-soja-parana',
    col: 1, colVar: 2, unidade: 'R$/sc 60 kg' },
  { id: 'trigo',   nome: 'Trigo', praca: 'Paraná', url: NA + 'trigo/preco-medio-do-trigo-cepea-esalq',
    linha: /paran[aá]/i, col: 2, colVar: 3, unidade: 'R$/t' },
  // algodão: CEPEA publica em centavos de R$ por libra-peso → mostramos em R$/@ (1 @ = 15 kg = 33,0693 lb)
  { id: 'algodao', nome: 'Algodão', praca: 'pluma', url: NA + 'algodao/algodao-indicador-cepea-esalq-a-prazo',
    col: 1, colVar: 2, unidade: 'R$/@', conv: (c) => (c / 100) * 33.0693,
    orig: (c) => `${fmtBR(c)} ¢R$/lb` },
  // etanol: indicadores semanais
  { id: 'etanol',  nome: 'Etanol hidratado', praca: 'combustível', semanal: true, casas: 4,
    url: NA + 'sucroenergetico/indicador-semanal-etanol-hidratado-cepea-esalq', col: 1, colVar: 2, unidade: 'R$/litro' },
  { id: 'outros',  nome: 'Etanol hidratado outros fins', praca: 'outros fins', semanal: true, casas: 4,
    url: NA + 'sucroenergetico/indicador-semanal-etanol-hidratado-outros-fins-cepea-esalq', col: 1, colVar: 2, unidade: 'R$/litro' },
  { id: 'anidro',  nome: 'Etanol anidro', praca: 'combustível', semanal: true, casas: 4,
    url: NA + 'sucroenergetico/indicador-semanal-etanol-anidro-cepea-esalq', col: 1, colVar: 2, unidade: 'R$/litro' },
];

// reserva do boi caso a Datagro falhe: Indicador do Boi Gordo CEPEA/ESALQ-B3 (SP)
const BOI_CEPEA = { id: 'boi', nome: 'Boi gordo · SP', praca: 'SP', url: NA + 'boi-gordo/boi-gordo-indicador-esalq-bmf',
  col: 1, colVar: 2, unidade: 'R$/@' };

const BOI_UF_URL = NA + 'boi-gordo/indicador-do-boi';

// Bezerro: Datagro · Reposição Nelore Macho · São Paulo (R$/kg)
// tabela: Estado | Desmama | Bezerro | Garrote | Boi Magro  (sem coluna de variação → calculada)
const BEZERRO_URL = NA + 'boi-gordo/reposicao-nelore-macho';

// Contratos futuros da B3 (fechamento do pregão regular) — card rotativo
const B3 = [
  { id: 'boi',    nome: 'Boi gordo',     sigla: 'BGI', url: NA + 'boi-gordo/boi-gordo-b3-prego-regular',        unidade: 'R$/@',         moeda: 'BRL' },
  { id: 'milho',  nome: 'Milho',         sigla: 'CCM', url: NA + 'milho/milho-b3-prego-regular',                unidade: 'R$/sc 60 kg',  moeda: 'BRL' },
  { id: 'soja',   nome: 'Soja',          sigla: 'SJC', url: NA + 'soja/soja-b3-pregao-regular',                 unidade: 'US$/sc 60 kg', moeda: 'USD' },
  { id: 'cafe',   nome: 'Café arábica',  sigla: 'ICF', url: NA + 'cafe/cafe-arabica-4-5-b3-prego-regular',      unidade: 'US$/sc 60 kg', moeda: 'USD' },
  { id: 'etanol', nome: 'Etanol hidratado', sigla: 'ETH', url: NA + 'sucroenergetico/etanol-b3-prego-regular', unidade: 'R$/m³',        moeda: 'BRL' },
];
const MESES = { janeiro:'JAN', fevereiro:'FEV', marco:'MAR', abril:'ABR', maio:'MAI', junho:'JUN', julho:'JUL',
  agosto:'AGO', setembro:'SET', outubro:'OUT', novembro:'NOV', dezembro:'DEZ' };

const INV = 'https://www.investing.com';
const DOLAR = { inv: '/currencies/usd-brl', yahoo: 'BRL=X' };
const EURO  = { inv: '/currencies/eur-brl', yahoo: 'EURBRL=X' };

const ORDEM = ['boi', 'bezerro', 'acucar', 'etanol', 'outros', 'anidro', 'milho', 'soja', 'trigo', 'algodao'];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

// ---------- utilidades ----------
const brNum = (s) => {
  const n = parseFloat(String(s).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const fmtBR = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const limpa = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// Lê uma página de cotação da Notícias Agrícolas:
// cada bloco = "Fechamento: dd/mm/aaaa" + tabela. Devolve do mais recente para o mais antigo.
async function lerNA(url) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`Notícias Agrícolas: HTTP ${r.status}`);
  const html = await r.text();
  const blocos = [];
  const re = /class="fechamento">\s*Fechamento:\s*(\d{2}\/\d{2}\/\d{4})[\s\S]*?<tbody[^>]*>([\s\S]*?)<\/tbody>/g;
  let m;
  while ((m = re.exec(html))) {
    const linhas = [...m[2].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
      .map((t) => [...t[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => limpa(c[1])))
      .filter((cs) => cs.length >= 2);
    blocos.push({ data: m[1], linhas });
  }
  if (!blocos.length) throw new Error('Notícias Agrícolas: tabela não encontrada');
  return blocos;
}

async function indicadorCepea(c) {
  const blocos = await lerNA(c.url);
  const dias = [];
  for (const b of blocos) {
    const ln = c.linha ? b.linhas.find((cs) => cs.some((x) => c.linha.test(x))) : b.linhas[0];
    if (!ln) continue;
    const bruto = brNum(ln[c.col]);
    if (bruto == null) continue;
    dias.push({ data: b.data, ref: ln[0], bruto, preco: c.conv ? c.conv(bruto) : bruto, variacao: brNum(ln[c.colVar]) });
  }
  if (!dias.length) throw new Error('CEPEA: sem valores');
  const u = dias[0];
  const semana = c.semanal ? u.ref.replace(/\/\d{4}$/, '').replace(/\s+/g, '') : null;   // "28-02/10"
  return {
    id: c.id, nome: c.nome, praca: c.praca,
    bolsa: `CEPEA · ${c.semanal ? 'semanal' : c.praca}`,
    unidade: c.unidade, casas: c.casas,
    preco: u.preco, variacao: u.variacao,
    historico: dias.map((d) => d.preco).reverse(),
    dataRef: u.data,                                   // data da publicação/fechamento (dd/mm/aaaa)
    semana,                                            // só nos semanais
    orig: c.orig ? c.orig(u.bruto) : null,
    fonte: 'CEPEA/ESALQ',
  };
}

// ---------- Futuros B3 ----------
async function futuroB3(c) {
  const blocos = await lerNA(c.url);
  const venc = (txt) => {                                   // "Outubro/2026" → "OUT/26"
    const m = semAcento(txt).match(/^([a-z]+)\/(\d{4})$/);
    return m && MESES[m[1]] ? `${MESES[m[1]]}/${m[2].slice(2)}` : null;
  };
  const dias = blocos.map((b) => ({
    data: b.data,
    linhas: b.linhas.map((cs) => ({ venc: venc(cs[0]), preco: brNum(cs[1]), variacao: brNum(cs[2]) }))
      .filter((l) => l.venc && l.preco != null),
  })).filter((d) => d.linhas.length);
  if (!dias.length) throw new Error('B3: sem negócios');
  const hoje = dias[0];
  const frente = hoje.linhas[0].venc;                       // vencimento mais próximo negociado
  return {
    id: c.id, nome: c.nome, sigla: c.sigla, unidade: c.unidade, moeda: c.moeda,
    dataRef: hoje.data,
    vencimentos: hoje.linhas.slice(0, 5),
    historico: dias.map((d) => d.linhas.find((l) => l.venc === frente)?.preco).filter((v) => v != null).reverse(),
    fonte: 'B3',
  };
}

// ---------- Bezerro (Datagro, SP) ----------
async function bezerroSP() {
  const blocos = await lerNA(BEZERRO_URL);
  const dias = [];
  for (const b of blocos) {
    const ln = b.linhas.find((cs) => semAcento(cs[0]) === 'sao paulo');
    const v = ln && brNum(ln[2]);
    if (v != null) dias.push({ data: b.data, preco: v });
  }
  if (!dias.length) throw new Error('Datagro bezerro: SP não encontrado');
  return {
    id: 'bezerro', nome: 'Bezerro', bolsa: 'Datagro · SP', unidade: 'R$/kg',
    preco: dias[0].preco,
    variacao: dias.length > 1 ? (dias[0].preco / dias[1].preco - 1) * 100 : null,
    historico: dias.map((d) => d.preco).reverse(),
    dataRef: dias[0].data, fonte: 'Datagro',
  };
}

// ---------- Boi gordo por estado (Indicador do Boi Datagro) ----------
const UF = {
  'acre':'AC','alagoas':'AL','amapa':'AP','amazonas':'AM','bahia':'BA','ceara':'CE','distrito federal':'DF',
  'espirito santo':'ES','goias':'GO','maranhao':'MA','mato grosso':'MT','mato grosso do sul':'MS',
  'minas gerais':'MG','para':'PA','paraiba':'PB','parana':'PR','pernambuco':'PE','piaui':'PI',
  'rio de janeiro':'RJ','rio grande do norte':'RN','rio grande do sul':'RS','rondonia':'RO','roraima':'RR',
  'santa catarina':'SC','sao paulo':'SP','sergipe':'SE','tocantins':'TO',
};
const semAcento = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function boiPorEstado() {
  const blocos = await lerNA(BOI_UF_URL);
  const dias = [];
  for (const b of blocos) {
    const mapa = {};
    for (const cs of b.linhas) {
      const uf = UF[semAcento(cs[0])];
      if (uf) mapa[uf] = { uf, preco: brNum(cs[1]), variacao: brNum(cs[2]) };
    }
    if (Object.keys(mapa).length) dias.push({ data: b.data, mapa });
  }
  if (!dias.length) throw new Error('Datagro: tabela não encontrada');
  const ult = dias[0];
  const estados = Object.values(ult.mapa).map((e) => ({
    ...e, historico: dias.map((d) => d.mapa[e.uf]?.preco).filter((v) => v != null).reverse(),
  })).sort((a, b) => b.preco - a.preco);
  const ufs = Object.keys(ult.mapa);
  const medias = dias.filter((d) => ufs.every((u) => d.mapa[u]?.preco != null))
    .map((d) => ufs.reduce((a, u) => a + d.mapa[u].preco, 0) / ufs.length);
  return {
    data: ult.data, fonte: 'Datagro', unidade: 'R$/@', estados,
    media: medias[0], mediaVar: medias.length > 1 ? (medias[0] / medias[1] - 1) * 100 : null,
    mediaHist: medias.slice().reverse(), nEstados: estados.length,
  };
}

// ---------- Câmbio ----------
async function investing(path) {
  const r = await fetch(INV + path, { headers: HEADERS });
  if (!r.ok) throw new Error(`Investing ${path}: HTTP ${r.status}`);
  const html = await r.text();
  const n = (s) => { const v = parseFloat(String(s ?? '').replace(/[^\d.,-]/g, '').replace(/,/g, '')); return Number.isFinite(v) ? v : null; };
  const preco = n(html.match(/data-test="instrument-price-last"[^>]*>([^<]+)</)?.[1]);
  if (preco == null) throw new Error(`Investing ${path}: preço não encontrado`);
  const t = html.match(/data-test="instrument-price-change-percent"[^>]*>([\s\S]{0,120}?)<\/span>/)?.[1] || '';
  return { preco, variacao: n(limpa(t.replace(/<!--[\s\S]*?-->/g, '')).match(/[-+]?[\d.,]+/)?.[0]), fonte: 'Investing.com' };
}
async function yahoo(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`;
  const r = await fetch(url, { headers: { 'User-Agent': HEADERS['User-Agent'] } });
  if (!r.ok) throw new Error(`Yahoo ${ticker}: HTTP ${r.status}`);
  const res = (await r.json())?.chart?.result?.[0];
  if (!res) throw new Error(`Yahoo ${ticker}: sem dados`);
  const closes = (res.indicators?.quote?.[0]?.close || []).filter((v) => typeof v === 'number');
  const preco = res.meta?.regularMarketPrice ?? closes.at(-1);
  const ant = closes.length > 1 ? closes.at(-2) : res.meta?.chartPreviousClose;
  return { preco, variacao: ant ? (preco / ant - 1) * 100 : null, fonte: 'Yahoo Finance' };
}
// ---------- Juros e bolsa ----------
// Banco Central (SGS): 432 = Selic meta (% a.a.) · 4389 = CDI anualizado base 252 (% a.a., taxa DI da B3)
async function bcb(serie) {
  const r = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/40?formato=json`,
    { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`BCB ${serie}: HTTP ${r.status}`);
  const lista = await r.json();
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);       // data em Brasília
  const iso = (d) => d.split('/').reverse().join('-');
  const validos = lista.filter((x) => iso(x.data) <= hoje);                         // Selic meta vem com datas futuras
  const u = validos.at(-1);
  if (!u) throw new Error(`BCB ${serie}: sem dados`);
  return { valor: parseFloat(u.valor), dataRef: u.data, fonte: 'Banco Central' };
}
async function ibovespa() {
  const r = await yahoo('^BVSP');
  return { ...r, fonte: 'Yahoo Finance' };
}

async function cambio(m) {
  try { return await investing(m.inv); } catch { return await yahoo(m.yahoo); }
}

// ---------- handler ----------
module.exports = async (req, res) => {
  const [dolar, euro, selic, cdi, ibov, boiEstados, b3, bezerro, ...cepea] = await Promise.all([
    cambio(DOLAR).catch(() => null),
    cambio(EURO).catch(() => null),
    bcb(432).catch(() => null),
    bcb(4389).catch(() => null),
    ibovespa().catch(() => null),
    boiPorEstado().catch((e) => ({ erro: String(e.message || e) })),
    Promise.all(B3.map((c) => futuroB3(c).catch(() => null))).then((l) => l.filter(Boolean)),
    bezerroSP().catch((e) => ({ id: 'bezerro', nome: 'Bezerro', bolsa: 'Datagro · SP', unidade: 'R$/kg', erro: String(e.message || e) })),
    ...CEPEA.map((c) => indicadorCepea(c).catch((e) => ({
      id: c.id, nome: c.nome, bolsa: 'CEPEA/ESALQ', unidade: c.unidade, erro: String(e.message || e),
    }))),
  ]);

  // Boi gordo: Datagro SP (mesma base do ranking); se faltar, CEPEA/ESALQ-B3 SP
  let boi;
  const sp = !boiEstados.erro && boiEstados.estados.find((e) => e.uf === 'SP');
  if (sp) {
    boi = {
      id: 'boi', nome: 'Boi gordo · SP', bolsa: 'Datagro · São Paulo', unidade: 'R$/@',
      preco: sp.preco, variacao: sp.variacao, historico: sp.historico,
      dataRef: boiEstados.data, fonte: 'Datagro',
    };
  } else {
    boi = await indicadorCepea(BOI_CEPEA).catch((e) => ({ id: 'boi', nome: 'Boi gordo', unidade: 'R$/@', erro: String(e.message || e) }));
  }

  const itens = [boi, bezerro, ...cepea]
    .sort((x, y) => (ORDEM.indexOf(x.id) + 1 || 99) - (ORDEM.indexOf(y.id) + 1 || 99));

  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
  res.status(200).json({
    atualizado: Date.now(),
    dolar: dolar && { nome: 'Dólar comercial', ...dolar },
    euro: euro && { nome: 'Euro', ...euro },
    selic, cdi, ibov,
    itens,
    boiEstados,
    b3,
  });
};
