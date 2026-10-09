# Kikos Ranch · Painel de Cotações

Tela de cotações de commodities do agro, pronta para a Vercel.

## Estrutura
- `index.html` — a tela (cores da marca no topo do `<style>`, bloco `:root`)
- `logo.svg` — logo provisória; **substitua pelo arquivo oficial com o mesmo nome** (ou troque `logo.svg` por `logo.png` no `index.html`)
- `api/cotacoes.js` — função da Vercel que busca os preços e converte para R$

## Publicar
1. Crie um repositório no GitHub e suba estes arquivos.
2. Na Vercel: **Add New → Project → Import** o repositório. Framework: *Other*. Sem build.
3. Deploy. A tela fica em `https://seu-projeto.vercel.app`.

Ou pela linha de comando: `npx vercel --prod` dentro desta pasta.

## Opções na URL
- `?tv=1` — modo TV (tela cheia, fontes maiores, faixa rolando)
- `?destaque=soja` — muda o card de destaque (`boi`, `bezerro`, `acucar`, `milho`, `soja`, `trigo`, `algodao`)

Ordem dos cards: lista `ORDEM` em `api/cotacoes.js`. Logo: troque `logo.svg` (aparece ao lado do nome).

## Fontes
- **Boi gordo (SP e por estado):** Indicador do Boi Datagro.
- **Bezerro:** Datagro, reposição Nelore macho, São Paulo (R$/kg).
- **Açúcar cristal (SP), milho (Campinas), soja (Paraná), trigo (Paraná), algodão em pluma:** indicadores diários CEPEA/ESALQ.
- **Etanol hidratado, hidratado outros fins e anidro:** indicadores semanais CEPEA/ESALQ.
- Todos lidos das páginas públicas da Notícias Agrícolas, que republica esses indicadores. Cada card mostra a data da última atualização.
- **Câmbio:** Investing.com, com reserva no Yahoo Finance.
- Atualização a cada 15 min (as fontes publicam 1x por dia, ou 1x por semana no etanol).

Para trocar praça ou produto, edite a lista `CEPEA` em `api/cotacoes.js`.
