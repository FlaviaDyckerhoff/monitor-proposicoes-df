const fs = require('fs');
const nodemailer = require('nodemailer');

const EMAIL_DESTINO = process.env.EMAIL_DESTINO;
const EMAIL_REMETENTE = process.env.EMAIL_REMETENTE;
const EMAIL_SENHA = process.env.EMAIL_SENHA;
const ARQUIVO_ESTADO = 'estado.json';

// URL base da CLDF — servidor Liferay, retorna HTML estático (sem reCAPTCHA)
const BASE_URL = 'https://www.cl.df.gov.br/pt/web/guest/projetos';

function carregarEstado() {
  if (fs.existsSync(ARQUIVO_ESTADO)) {
    return JSON.parse(fs.readFileSync(ARQUIVO_ESTADO, 'utf8'));
  }
  return { proposicoes_vistas: [], ultima_execucao: '' };
}

function salvarEstado(estado) {
  fs.writeFileSync(ARQUIVO_ESTADO, JSON.stringify(estado, null, 2));
}

async function enviarEmail(novas) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_REMETENTE, pass: EMAIL_SENHA },
  });

  // Agrupa por tipo
  const porTipo = {};
  novas.forEach(p => {
    const tipo = p.tipo || 'OUTROS';
    if (!porTipo[tipo]) porTipo[tipo] = [];
    porTipo[tipo].push(p);
  });

  const linhas = Object.keys(porTipo).sort().map(tipo => {
    const header = `<tr><td colspan="5" style="padding:10px 8px 4px;background:#f0f4f8;font-weight:bold;color:#1a3a5c;font-size:13px;border-top:2px solid #1a3a5c">${tipo} — ${porTipo[tipo].length} proposição(ões)</td></tr>`;
    const rows = porTipo[tipo].map(p =>
      `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee;color:#555;font-size:12px">${p.tipo || '-'}</td>
        <td style="padding:8px;border-bottom:1px solid #eee"><strong>${p.numero || '-'}/${p.ano || '-'}</strong></td>
        <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px">${p.autor || '-'}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;white-space:nowrap">${p.data || '-'}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px">${p.ementa || '-'}</td>
      </tr>`
    ).join('');
    return header + rows;
  }).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto">
      <h2 style="color:#1a3a5c;border-bottom:2px solid #1a3a5c;padding-bottom:8px">
        🏛️ CLDF — ${novas.length} nova(s) proposição(ões)
      </h2>
      <p style="color:#666">Monitoramento automático — ${new Date().toLocaleString('pt-BR')}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#1a3a5c;color:white">
            <th style="padding:10px;text-align:left">Tipo</th>
            <th style="padding:10px;text-align:left">Número/Ano</th>
            <th style="padding:10px;text-align:left">Autor</th>
            <th style="padding:10px;text-align:left">Data</th>
            <th style="padding:10px;text-align:left">Ementa</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
      <p style="margin-top:20px;font-size:12px;color:#999">
        Acesse: <a href="https://www.cl.df.gov.br/pt/web/guest/projetos">cl.df.gov.br/projetos</a>
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Monitor CLDF" <${EMAIL_REMETENTE}>`,
    to: EMAIL_DESTINO,
    subject: `🏛️ CLDF: ${novas.length} nova(s) proposição(ões) — ${new Date().toLocaleDateString('pt-BR')}`,
    html,
  });

  console.log(`✅ Email enviado com ${novas.length} proposições novas.`);
}

// Faz parse de uma lista de <li> da página de resultados
function parseHTML(html) {
  const proposicoes = [];

  // Cada proposição fica dentro de um <li> com link para /proposicao/-/documentos/...
  // Padrão: TIPO NUMERO/ANO + data + autor + ementa
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch;

  while ((liMatch = liRegex.exec(html)) !== null) {
    const bloco = liMatch[1];

    // Só processa blocos que contenham link para /proposicao/
    if (!bloco.includes('/proposicao/-/documentos/')) continue;

    // Extrai código (ex: PL 2257/2026, IND 10130/2026)
    const codigoMatch = bloco.match(/([A-ZÁÉÍÓÚ]{2,10}(?:\s+DE\s+[A-Z]+)?)\s+(\d+)\/(\d{4})/);
    if (!codigoMatch) continue;

    const tipo = codigoMatch[1].trim();
    const numero = codigoMatch[2];
    const ano = codigoMatch[3];

    // Extrai data (dd/mm/aaaa)
    const dataMatch = bloco.match(/(\d{2}\/\d{2}\/\d{4})/);
    const data = dataMatch ? dataMatch[1] : '-';

    // Extrai autor — texto após a data ou dentro de span específico
    // Na estrutura CLDF: Deputado X aparece como texto simples depois do número/tipo
    let autor = '-';
    const autorMatch = bloco.match(/Deputad[oa]\s+[\w\s]+|Poder Executivo|Comissão[^<\n]*/i);
    if (autorMatch) autor = autorMatch[0].replace(/<[^>]+>/g, '').trim().substring(0, 60);

    // Extrai ementa — último bloco de texto significativo
    // Remove todas as tags HTML e pega o texto restante
    const textoLimpo = bloco
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // A ementa costuma ser a parte mais longa do texto
    // Remove partes já extraídas (tipo, número, data)
    let ementa = textoLimpo
      .replace(/Apresentação|Aprovação\/Rejeição|Arquivado|Comissões|Plenário/gi, '')
      .replace(new RegExp(`${tipo}\\s+${numero}/${ano}`, 'g'), '')
      .replace(dataMatch ? dataMatch[0] : '', '')
      .replace(autorMatch ? autorMatch[0] : '', '')
      .trim()
      .replace(/\s+/g, ' ');

    // Pega só os primeiros 200 chars da ementa
    if (ementa.length > 5) ementa = ementa.substring(0, 200);

    const id = `${tipo}-${numero}-${ano}`.replace(/\s/g, '');

    proposicoes.push({ id, tipo, numero, ano, autor, data, ementa });
  }

  return proposicoes;
}

async function buscarProposicoes() {
  const ano = new Date().getFullYear();

  // Busca as proposições mais recentes do ano, ordenadas por data de leitura decrescente
  // delta=100 = 100 por página (máximo disponível na interface)
  const url = `${BASE_URL}?sort=dataLeitura_Number_sortable-&ano=${ano}&delta=100`;

  console.log(`🔍 Buscando proposições de ${ano}...`);
  console.log(`📡 URL: ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MonitorCLDF/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    }
  });

  if (!response.ok) {
    console.error(`❌ Erro HTTP: ${response.status} ${response.statusText}`);
    return [];
  }

  const html = await response.text();
  console.log(`📄 HTML recebido: ${html.length} bytes`);

  const proposicoes = parseHTML(html);
  console.log(`📊 ${proposicoes.length} proposições extraídas`);

  // Log das primeiras 3 para debug
  if (proposicoes.length > 0) {
    console.log('🔎 Amostra:', JSON.stringify(proposicoes.slice(0, 3), null, 2));
  }

  return proposicoes;
}

(async () => {
  console.log('🚀 Iniciando monitor CLDF...');
  console.log(`⏰ ${new Date().toLocaleString('pt-BR')}`);

  const estado = carregarEstado();
  const idsVistos = new Set(estado.proposicoes_vistas);

  const proposicoes = await buscarProposicoes();

  if (proposicoes.length === 0) {
    console.log('⚠️ Nenhuma proposição encontrada. Verifique o log acima.');
    process.exit(0);
  }

  const novas = proposicoes.filter(p => !idsVistos.has(p.id));
  console.log(`🆕 Proposições novas: ${novas.length}`);

  if (novas.length > 0) {
    // Ordena por tipo alfabético, depois por número decrescente
    novas.sort((a, b) => {
      if (a.tipo < b.tipo) return -1;
      if (a.tipo > b.tipo) return 1;
      return (parseInt(b.numero) || 0) - (parseInt(a.numero) || 0);
    });

    await enviarEmail(novas);

    novas.forEach(p => idsVistos.add(p.id));
    estado.proposicoes_vistas = Array.from(idsVistos);
    estado.ultima_execucao = new Date().toISOString();
    salvarEstado(estado);
  } else {
    console.log('✅ Sem novidades. Nada a enviar.');
    estado.ultima_execucao = new Date().toISOString();
    salvarEstado(estado);
  }
})();
